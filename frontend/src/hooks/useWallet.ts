import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';

interface WalletState {
  isConnected: boolean;
  address: string | null;
  balance: string | null;
  chainId: number | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
}

interface UseWalletReturn extends WalletState {
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchNetwork: (chainId: number) => Promise<void>;
  signMessage: (message: string) => Promise<string>;
  sendTransaction: (to: string, value: string, data?: string) => Promise<string>;
  isLoading: boolean;
  error: string | null;
}

const AETERNA_CHAIN_ID = 31337; // Local development chain
const SUPPORTED_CHAINS = [1, 5, 31337]; // Ethereum Mainnet, Goerli, Local

export const useWallet = (): UseWalletReturn => {
  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: false,
    address: null,
    balance: null,
    chainId: null,
    provider: null,
    signer: null,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectWallet = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!window.ethereum) {
        throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found. Please connect your wallet.');
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = accounts[0];
      const balance = await provider.getBalance(address);
      const network = await provider.getNetwork();

      setWalletState({
        isConnected: true,
        address,
        balance: ethers.formatEther(balance),
        chainId: Number(network.chainId),
        provider,
        signer,
      });

      toast.success('Wallet connected successfully!');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to connect wallet';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWalletState({
      isConnected: false,
      address: null,
      balance: null,
      chainId: null,
      provider: null,
      signer: null,
    });
    setError(null);
    toast.success('Wallet disconnected');
  }, []);

  const switchNetwork = useCallback(async (targetChainId: number) => {
    try {
      setIsLoading(true);
      setError(null);

      if (!window.ethereum) {
        throw new Error('MetaMask is not installed');
      }

      const chainIdHex = `0x${targetChainId.toString(16)}`;

      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });

      // Update chain ID in state
      setWalletState(prev => ({
        ...prev,
        chainId: targetChainId,
      }));

      toast.success('Network switched successfully!');
    } catch (err: any) {
      // Chain not added to MetaMask
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${targetChainId.toString(16)}`,
              chainName: targetChainId === 31337 ? 'AETERNA Local' : 'Unknown Network',
              rpcUrls: [targetChainId === 31337 ? 'http://localhost:8545' : ''],
              nativeCurrency: {
                name: 'ETH',
                symbol: 'ETH',
                decimals: 18,
              },
            }],
          });
          toast.success('Network added and switched successfully!');
        } catch (addError: any) {
          setError(addError.message || 'Failed to add network');
          toast.error('Failed to add network');
        }
      } else {
        const errorMessage = err.message || 'Failed to switch network';
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    try {
      if (!walletState.signer) {
        throw new Error('Wallet not connected');
      }

      const signature = await walletState.signer.signMessage(message);
      return signature;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to sign message';
      setError(errorMessage);
      toast.error(errorMessage);
      throw err;
    }
  }, [walletState.signer]);

  const sendTransaction = useCallback(async (
    to: string,
    value: string,
    data?: string
  ): Promise<string> => {
    try {
      if (!walletState.signer) {
        throw new Error('Wallet not connected');
      }

      const tx = await walletState.signer.sendTransaction({
        to,
        value: ethers.parseEther(value),
        data: data || '0x',
      });

      await tx.wait();
      toast.success('Transaction sent successfully!');
      return tx.hash;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to send transaction';
      setError(errorMessage);
      toast.error(errorMessage);
      throw err;
    }
  }, [walletState.signer]);

  // Set up event listeners for account and network changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else if (accounts[0] !== walletState.address) {
        connectWallet();
      }
    };

    const handleChainChanged = (chainId: string) => {
      const newChainId = parseInt(chainId, 16);
      setWalletState(prev => ({
        ...prev,
        chainId: newChainId,
      }));
    };

    const handleDisconnect = () => {
      disconnectWallet();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
    window.ethereum.on('disconnect', handleDisconnect);

    // Cleanup
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
        window.ethereum.removeListener('disconnect', handleDisconnect);
      }
    };
  }, [walletState.address, connectWallet, disconnectWallet]);

  // Check if already connected on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({
            method: 'eth_accounts',
          });
          if (accounts.length > 0) {
            await connectWallet();
          }
        } catch (err) {
          console.error('Failed to check existing connection:', err);
        }
      }
    };

    checkConnection();
  }, [connectWallet]);

  return {
    ...walletState,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    signMessage,
    sendTransaction,
    isLoading,
    error,
  };
};

// Type declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}