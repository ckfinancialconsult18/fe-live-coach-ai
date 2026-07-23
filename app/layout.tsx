import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SentryInit } from '@/components/SentryInit';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'FE Live Coach AI', template: '%s | FE Live Coach AI' },
  description: 'Live AI coaching for Final Expense insurance agents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full dark`}>
      <body className="h-full antialiased">
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
