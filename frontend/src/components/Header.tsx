'use client';

import * as React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-neutral-800/80 backdrop-blur-sm border-b border-neutral-700 px-4 flex items-center justify-between z-10">
      <h1 className="text-2xl font-bold text-primary-300">Roami</h1>
    </header>
  );
}; 