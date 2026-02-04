
import React from 'react';
import { LANGUAGES } from '../types';

interface LanguageSelectorProps {
  selected: string;
  onSelect: (lang: string) => void;
  disabled: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ selected, onSelect, disabled }) => {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs uppercase tracking-wider text-gray-500 font-bold">Target Language</label>
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
        className="glass-morphism rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.value} value={lang.value} className="bg-gray-900 text-white">
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
};
