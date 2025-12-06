'use client';

import { useState, useEffect, createContext, useContext } from 'react';

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

export function useWeb3(): Web3ContextType {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Check if wallet is already connected on page load
  useEffect(() => {
    checkConnection();

    // Listen for account changes
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  const checkConnection = async () => {
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          const chainId = await window.ethereum.request({ method: 'eth_chainId' });
          setChainId(parseInt(chainId, 16));
        }
      } catch (error) {
        console.error('Error checking wallet connection:', error);
      }
    }
  };

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length > 0) {
      setAccount(accounts[0]);
    } else {
      setAccount(null);
      setChainId(null);
    }
  };

  const handleChainChanged = (chainId: string) => {
    setChainId(parseInt(chainId, 16));
  };

  const connectWallet = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask is not installed');
    }

    setIsConnecting(true);
    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (accounts.length > 0) {
        setAccount(accounts[0]);

        // Get chain ID
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainId, 16));
      }
    } catch (error: any) {
      if (error.code === 4001) {
        throw new Error('User rejected the request');
      } else {
        throw new Error('Failed to connect wallet');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    setAccount(null);
    setChainId(null);

    // Clear any stored connection state
    localStorage.removeItem('walletconnect');
    localStorage.removeItem('WEB3_CONNECT_CACHED_PROVIDER');
  };

  const switchNetwork = async (targetChainId: number) => {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask is not installed');
    }

    const chainIdHex = `0x${targetChainId.toString(16)}`;

    try {
      // Try to switch to the network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch (switchError: any) {
      // If the network doesn't exist, add it
      if (switchError.code === 4902) {
        try {
          let networkParams;

          if (targetChainId === 56) {
            // BSC Mainnet
            networkParams = {
              chainId: chainIdHex,
              chainName: 'BNB Smart Chain',
              nativeCurrency: {
                name: 'BNB',
                symbol: 'BNB',
                decimals: 18,
              },
              rpcUrls: ['https://bsc-dataseed.binance.org/'],
              blockExplorerUrls: ['https://bscscan.com'],
            };
          } else if (targetChainId === 97) {
            // BSC Testnet
            networkParams = {
              chainId: chainIdHex,
              chainName: 'BSC Testnet',
              nativeCurrency: {
                name: 'BNB',
                symbol: 'tBNB',
                decimals: 18,
              },
              rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
              blockExplorerUrls: ['https://testnet.bscscan.com'],
            };
          } else {
            throw new Error('Unsupported network');
          }

          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [networkParams],
          });
        } catch (addError) {
          throw new Error('Failed to add network');
        }
      } else {
        throw new Error('Failed to switch network');
      }
    }
  };

  return {
    account,
    isConnected: !!account,
    chainId,
    isConnecting,
    connectWallet,
    disconnectWallet,
    switchNetwork
  };
}

// Extend window interface for TypeScript
declare global {
  interface Window {
    ethereum?: any;
  }
}