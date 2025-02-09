import './globals.css';
import type { Metadata } from 'next';
import { ClientWrapper } from '@/components/ClientWrapper';

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
      <body className="bg-neutral-900 text-neutral-50 min-h-screen antialiased">
        <ClientWrapper>{children}</ClientWrapper>
      </body>
    </html>
  );
}
