'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useWeb3 } from '@/hooks/use-web3';

interface Web3ContextType {
  account: string | null;
  isConnected: boolean;
  chainId: number | null;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  switchNetwork: (chainId: number) => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  const web3 = useWeb3();

  return (
    <Web3Context.Provider value={web3}>
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3Context() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error('useWeb3Context must be used within a Web3Provider');
  }
  return context;
}