import './globals.css';
import { Inter, Fraunces } from 'next/font/google';
import Providers from '@/components/Providers';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-serif',
  style: ['normal', 'italic'],
});

export const metadata = {
  title: 'NOTEAI — AI meeting notes',
  description: 'Real-time transcription, summaries, action items, and searchable notes.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <body className="h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
