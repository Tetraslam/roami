'use client';

import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/firebase/auth';
import { FirebaseErrorBoundary } from '@/components/FirebaseErrorBoundary';

const inter = Inter({ subsets: ['latin'] });

export function ClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseErrorBoundary>
      <AuthProvider>
        <div className={inter.className}>
          {children}
        </div>
      </AuthProvider>
    </FirebaseErrorBoundary>
  );
} 