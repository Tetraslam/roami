import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Roami - Your Roadtrip Companion',
  description: 'A cozy AI-powered roadtrip assistant that makes your journey more enjoyable.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-neutral-900 text-neutral-50 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
