import './globals.css';
import { Inter } from 'next/font/google';
import Providers from '@/components/Providers';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'NOTEAI — AI meeting notes',
  description: 'Real-time transcription, summaries, action items, and searchable notes.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
