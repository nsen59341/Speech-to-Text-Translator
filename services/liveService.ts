
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
      // Initialize fresh AI instance for the connection
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Ensure audio contexts are active
      await this.inputAudioContext.resume();
      await this.outputAudioContext.resume();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const systemInstruction = `You are a world-class real-time voice translator. 
      Your task: 
      1. Transcribe the user's speech accurately.
      2. IMMEDIATELY translate it into ${targetLanguage}.
      3. Output ONLY the translation clearly. 
      Do not add extra commentary. Respond naturally but prioritize the translation.`;

      this.sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            callbacks.onStatusChange('LISTENING');
            this.startStreaming();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Process model's audio output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && this.outputAudioContext) {
              this.playAudio(base64Audio);
            }

            // Process transcription feedback
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

            // Handle turn completion
            if (message.serverContent?.turnComplete) {
              callbacks.onTranscription(this.currentInput, 'input', true);
              callbacks.onTranscription(this.currentOutput, 'output', true);
              this.currentInput = '';
              this.currentOutput = '';
            }

            // Handle interruptions
            if (message.serverContent?.interrupted) {
              this.stopAllAudio();
            }
          },
          onerror: (e) => {
            console.error('Live API Error:', e);
            callbacks.onError('Network or API error occurred. Please verify your connection.');
          },
          onclose: (e) => {
            console.debug('Live session closed:', e);
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
      console.error('Connection setup failed:', err);
      callbacks.onError('Could not initialize audio or reach the AI service.');
    }
  }

  private startStreaming() {
    if (!this.inputAudioContext || !this.mediaStream || !this.sessionPromise) return;

    const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = this.createPcmBlob(inputData);
      
      // Ensure session is resolved before sending data
      this.sessionPromise?.then((session) => {
        try {
          session.sendRealtimeInput({ media: pcmBlob });
        } catch (err) {
          console.debug('Failed to send realtime input:', err);
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
      // Standard PCM conversion
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
      console.error('Audio playback error:', err);
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
    });
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
    this.sessionPromise = null;
    this.inputAudioContext = null;
    this.outputAudioContext = null;
  }
}

export const liveService = new LiveService();
