
import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-[#0a0a0a]">
      <div className="w-full max-w-4xl flex flex-col h-[90vh]">
        <header className="mb-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            LinguistLive AI
          </h1>
          <p className="mt-2 text-gray-400 font-light">
            Instant Voice Transcription & Translation
          </p>
        </header>
        {children}
      </div>
    </div>
  );
};
