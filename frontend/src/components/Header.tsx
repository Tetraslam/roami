'use client';

import * as React from 'react';
import { useAuth } from '@/lib/firebase/auth';

export const Header: React.FC = () => {
  const { user, profile, signOut } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-neutral-800/80 backdrop-blur-sm border-b border-neutral-700 px-4 flex items-center justify-between z-10">
      <h1 className="text-2xl font-bold text-primary-300">Roami</h1>
      
      {user && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {profile?.photoURL && (
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                className="w-8 h-8 rounded-full"
              />
            )}
            <span className="text-sm text-neutral-300 hidden sm:inline">
              {profile?.displayName}
            </span>
          </div>
          <button
            onClick={signOut}
            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </header>
  );
}; 