
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
      // Accessing API_KEY via process.env as required
      const apiKey = process.env.API_KEY;
      
      if (!apiKey) {
        const msg = 'API Key is missing from environment variables (process.env.API_KEY).';
        console.error(msg);
        callbacks.onError(msg);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await this.inputAudioContext.resume();
      await this.outputAudioContext.resume();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const systemInstruction = `You are a real-time translator. 
      Target Language: ${targetLanguage}.
      Rules:
      1. Transcribe accurately.
      2. Translate immediately.
      3. Output ONLY the translation. No preamble.`;

      this.sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            callbacks.onStatusChange('LISTENING');
            this.startStreaming();
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) this.playAudio(base64Audio);

            if (message.serverContent?.inputTranscription) {
              this.currentInput += message.serverContent.inputTranscription.text;
              callbacks.onTranscription(this.currentInput, 'input', false);
            }
            if (message.serverContent?.outputTranscription) {
              this.currentOutput += message.serverContent.outputTranscription.text;
              callbacks.onTranscription(this.currentOutput, 'output', false);
            }

            if (message.serverContent?.turnComplete) {
              callbacks.onTranscription(this.currentInput, 'input', true);
              callbacks.onTranscription(this.currentOutput, 'output', true);
              this.currentInput = '';
              this.currentOutput = '';
            }

            if (message.serverContent?.interrupted) this.stopAllAudio();
          },
          onerror: (e) => {
            console.error('Connection Error:', e);
            callbacks.onError('Connection to Gemini failed.');
            this.disconnect();
          },
          onclose: () => callbacks.onStatusChange('IDLE'),
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
    } catch (err) {
      console.error('Setup Error:', err);
      callbacks.onError('Microphone access denied or audio error.');
    }
  }

  private startStreaming() {
    if (!this.inputAudioContext || !this.mediaStream || !this.sessionPromise) return;
    const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    this.scriptProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = this.createPcmBlob(inputData);
      this.sessionPromise?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
    };
    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.inputAudioContext.destination);
  }

  private createPcmBlob(data: Float32Array): Blob {
    const int16 = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) int16[i] = data[i] * 32767;
    return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }

  private async playAudio(base64: string) {
    if (!this.outputAudioContext) return;
    this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
    const audioBuffer = await decodeAudioData(decode(base64), this.outputAudioContext, 24000, 1);
    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputAudioContext.destination);
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  private stopAllAudio() {
    this.sources.forEach(s => { try { s.stop(); } catch {} });
    this.sources.clear();
    this.nextStartTime = 0;
  }

  disconnect() {
    this.stopAllAudio();
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.scriptProcessor?.disconnect();
    this.sessionPromise?.then(s => s.close());
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
    this.sessionPromise = null;
  }
}

export const liveService = new LiveService();
