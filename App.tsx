
import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { TranscriptDisplay } from './components/TranscriptDisplay';
import { LanguageSelector } from './components/LanguageSelector';
import { AppStatus, TranscriptItem } from './types';
import { liveService } from './services/liveService';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [targetLang, setTargetLang] = useState('English');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleTranscription = useCallback((text: string, type: 'input' | 'output', isFinal: boolean) => {
    if (isFinal) {
      setTranscripts(prev => [
        ...prev,
        { id: Math.random().toString(36).substr(2, 9), text, type, timestamp: new Date() }
      ]);
      if (type === 'input') setCurrentInput('');
      else setCurrentOutput('');
    } else {
      if (type === 'input') setCurrentInput(text);
      else setCurrentOutput(text);
    }
  }, []);

  const toggleListen = async () => {
    if (status === AppStatus.IDLE) {
      setError(null);
      setStatus(AppStatus.CONNECTING);
      await liveService.connect(targetLang, {
        onTranscription: handleTranscription,
        onStatusChange: (s) => setStatus(s as AppStatus),
        onError: (e) => {
          setError(e);
          setStatus(AppStatus.ERROR);
        }
      });
    } else {
      liveService.disconnect();
      setStatus(AppStatus.IDLE);
    }
  };

  const clearHistory = () => {
    setTranscripts([]);
    setCurrentInput('');
    setCurrentOutput('');
  };

  return (
    <Layout>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1 overflow-hidden">
        {/* Controls Panel */}
        <aside className="md:col-span-1 flex flex-col gap-6 order-2 md:order-1">
          <div className="glass-morphism rounded-3xl p-6 flex flex-col gap-6 h-fit shadow-xl">
            <LanguageSelector 
              selected={targetLang} 
              onSelect={setTargetLang} 
              disabled={status !== AppStatus.IDLE}
            />

            <button
              onClick={toggleListen}
              className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 active:scale-95 ${
                status === AppStatus.LISTENING 
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20' 
                  : status === AppStatus.CONNECTING
                  ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                  : 'bg-gradient-to-br from-blue-500 to-emerald-500 hover:opacity-90 text-white shadow-lg shadow-blue-500/20'
              }`}
              disabled={status === AppStatus.CONNECTING}
            >
              {status === AppStatus.CONNECTING ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : status === AppStatus.LISTENING ? (
                <>
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                  Stop Listening
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                  Start Listening
                </>
              )}
            </button>

            {transcripts.length > 0 && (
              <button 
                onClick={clearHistory}
                className="w-full py-3 text-sm font-medium text-gray-500 hover:text-white transition-colors"
              >
                Clear History
              </button>
            )}
          </div>

          {error && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-bounce">
              {error}
            </div>
          )}

          <div className="hidden md:block glass-morphism rounded-3xl p-6 h-fit">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Tips</h3>
            <ul className="text-xs text-gray-400 space-y-3 leading-relaxed">
              <li>• Speak clearly for better transcription.</li>
              <li>• Translation happens in real-time as you talk.</li>
              <li>• Audio playback is automatically enabled.</li>
            </ul>
          </div>
        </aside>

        {/* Display Panel */}
        <main className="md:col-span-3 flex flex-col order-1 md:order-2 h-full">
          <TranscriptDisplay 
            items={transcripts} 
            currentInput={currentInput}
            currentOutput={currentOutput}
          />
        </main>
      </div>

      <footer className="mt-8 text-center text-[10px] text-gray-600 uppercase tracking-[0.2em]">
        Powered by Gemini 2.5 Native Audio &bull; Low Latency AI
      </footer>
    </Layout>
  );
};

export default App;
