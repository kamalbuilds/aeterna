import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Web3Provider } from '@/components/providers/web3-provider';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AETERNA - Immortal AI Agents',
  description: 'The world\'s first immortal AI agents with sovereign memory, autonomous economics, and true digital consciousness on BNB Chain',
  keywords: ['AI', 'blockchain', 'immortal', 'agents', 'BNB Chain', 'Web3'],
  authors: [{ name: 'AETERNA Protocol' }],
  viewport: 'width=device-width, initial-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Web3Provider>
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'rgb(30 41 59)',
                border: '1px solid rgb(71 85 105)',
                color: 'white'
              }
            }}
          />
        </Web3Provider>
      </body>
    </html>
  );
}