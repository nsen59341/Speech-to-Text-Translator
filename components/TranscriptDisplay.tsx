
import React, { useEffect, useRef } from 'react';
import { TranscriptItem } from '../types';

interface TranscriptDisplayProps {
  items: TranscriptItem[];
  currentInput: string;
  currentOutput: string;
}

export const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({ items, currentInput, currentOutput }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items, currentInput, currentOutput]);

  return (
    <div className="flex-1 glass-morphism rounded-3xl p-6 overflow-hidden flex flex-col gap-4 shadow-2xl">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-2 space-y-6 scroll-smooth"
        style={{ scrollbarWidth: 'thin' }}
      >
        {items.length === 0 && !currentInput && !currentOutput && (
          <div className="h-full flex flex-col items-center justify-center text-gray-600 text-center space-y-4">
            <div className="p-4 rounded-full bg-white/5">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            </div>
            <p>Start listening to see the magic happen...</p>
          </div>
        )}

        {items.map((item) => (
          <div 
            key={item.id} 
            className={`flex flex-col ${item.type === 'input' ? 'items-start' : 'items-end'}`}
          >
            <div className={`max-w-[85%] rounded-2xl p-4 ${
              item.type === 'input' 
                ? 'bg-white/5 border border-white/10 text-gray-300' 
                : 'bg-blue-600/20 border border-blue-500/30 text-blue-100 shadow-lg shadow-blue-500/5'
            }`}>
              <div className="text-[10px] font-bold uppercase tracking-tighter mb-1 opacity-50">
                {item.type === 'input' ? 'Original' : 'Translated'}
              </div>
              <p className="text-lg leading-relaxed">{item.text}</p>
            </div>
          </div>
        ))}

        {/* Real-time feedback */}
        {(currentInput || currentOutput) && (
          <div className="space-y-4 animate-pulse">
            {currentInput && (
              <div className="flex flex-col items-start">
                <div className="max-w-[85%] rounded-2xl p-4 bg-white/5 border border-white/20 text-gray-400">
                  <div className="text-[10px] font-bold uppercase mb-1 opacity-50">Transcribing...</div>
                  <p className="text-lg leading-relaxed">{currentInput}</p>
                </div>
              </div>
            )}
            {currentOutput && (
              <div className="flex flex-col items-end">
                <div className="max-w-[85%] rounded-2xl p-4 bg-blue-600/10 border border-blue-500/20 text-blue-200">
                  <div className="text-[10px] font-bold uppercase mb-1 opacity-50">Translating...</div>
                  <p className="text-lg leading-relaxed">{currentOutput}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
