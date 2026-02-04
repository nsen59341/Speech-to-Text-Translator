
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { encode, decode, decodeAudioData } from '../utils/audioUtils';

export interface LiveCallbacks {
  onTranscription: (text: string, type: 'input' | 'output', isFinal: boolean) => void;
  onStatusChange: (status: string) => void;
  onError: (error: string) => void;
}

export class LiveService {
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private currentInput = '';
  private currentOutput = '';

  constructor() {}

  async connect(targetLanguage: string, callbacks: LiveCallbacks) {
    try {
      // Robustly check for the API key in different environments
      const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) || (window as any).process?.env?.API_KEY || '';
      
      if (!apiKey) {
        console.error('API_KEY is not defined in environment variables.');
        callbacks.onError('API Key missing. Please set API_KEY in your environment settings.');
        callbacks.onStatusChange('ERROR');
        return;
      }

      // Create a fresh instance for every connection attempt
      const ai = new GoogleGenAI({ apiKey });
      
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Mandatory: AudioContext must be resumed via user gesture (handled by the caller calling connect)
      await this.inputAudioContext.resume();
      await this.outputAudioContext.resume();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const systemInstruction = `You are a world-class real-time voice translator. 
      Your task: 
      1. Transcribe the user's speech accurately.
      2. IMMEDIATELY translate it into ${targetLanguage}.
      3. Output ONLY the translation clearly and succinctly. 
      Do not add preamble like "The translation is..." or "Sure...". Just speak the translation.`;

      this.sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log('Live session connected');
            callbacks.onStatusChange('LISTENING');
            this.startStreaming();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Process model's audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && this.outputAudioContext) {
              this.playAudio(base64Audio);
            }

            // Handle Transcriptions
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              this.currentInput += text;
              callbacks.onTranscription(this.currentInput, 'input', false);
            }
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              this.currentOutput += text;
              callbacks.onTranscription(this.currentOutput, 'output', false);
            }

            // Completion of a "turn"
            if (message.serverContent?.turnComplete) {
              if (this.currentInput) callbacks.onTranscription(this.currentInput, 'input', true);
              if (this.currentOutput) callbacks.onTranscription(this.currentOutput, 'output', true);
              this.currentInput = '';
              this.currentOutput = '';
            }

            // Interruption handling
            if (message.serverContent?.interrupted) {
              this.stopAllAudio();
            }
          },
          onerror: (e) => {
            console.error('Live API WebSocket Error:', e);
            callbacks.onError('Network connection failed. Please check your internet or API key permissions.');
            this.disconnect();
          },
          onclose: (e) => {
            console.log('Live session closed:', e);
            callbacks.onStatusChange('IDLE');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        }
      });

      return this.sessionPromise;
    } catch (err) {
      console.error('Connection failed during setup:', err);
      callbacks.onError('Audio initialization failed. Please ensure microphone access is granted.');
      callbacks.onStatusChange('IDLE');
    }
  }

  private startStreaming() {
    if (!this.inputAudioContext || !this.mediaStream || !this.sessionPromise) return;

    const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = this.createPcmBlob(inputData);
      
      // Use the session promise to avoid race conditions
      this.sessionPromise?.then((session) => {
        try {
          session.sendRealtimeInput({ media: pcmBlob });
        } catch (err) {
          // Ignore errors if the session is closing
        }
      });
    };

    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.inputAudioContext.destination);
  }

  private createPcmBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
    }
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  }

  private async playAudio(base64: string) {
    if (!this.outputAudioContext) return;

    try {
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      const audioBuffer = await decodeAudioData(decode(base64), this.outputAudioContext, 24000, 1);
      
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);
      
      source.addEventListener('ended', () => {
        this.sources.delete(source);
      });
      
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.sources.add(source);
    } catch (err) {
      console.error('Audio chunk playback failed:', err);
    }
  }

  private stopAllAudio() {
    for (const source of this.sources.values()) {
      try { source.stop(); } catch(e) {}
    }
    this.sources.clear();
    this.nextStartTime = 0;
  }

  disconnect() {
    this.stopAllAudio();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    this.sessionPromise?.then(session => {
      try { session.close(); } catch(e) {}
    }).catch(() => {});
    
    this.inputAudioContext?.close().catch(() => {});
    this.outputAudioContext?.close().catch(() => {});
    
    this.sessionPromise = null;
    this.inputAudioContext = null;
    this.outputAudioContext = null;
  }
}

export const liveService = new LiveService();
