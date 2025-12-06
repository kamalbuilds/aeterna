'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, LogOut, AlertCircle, CheckCircle } from 'lucide-react';
import { useWeb3 } from '@/hooks/use-web3';
import { toast } from 'sonner';

export function ConnectWallet() {
  const {
    account,
    isConnected,
    chainId,
    isConnecting,
    connectWallet,
    disconnectWallet,
    switchNetwork
  } = useWeb3();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleConnect = async () => {
    try {
      await connectWallet();
      toast.success('Wallet connected successfully!');
    } catch (error) {
      toast.error('Failed to connect wallet');
      console.error('Wallet connection error:', error);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectWallet();
      setIsDropdownOpen(false);
      toast.success('Wallet disconnected');
    } catch (error) {
      toast.error('Failed to disconnect wallet');
    }
  };

  const handleSwitchToBSC = async () => {
    try {
      await switchNetwork(56); // BSC Mainnet
      toast.success('Switched to BNB Chain');
    } catch (error) {
      toast.error('Failed to switch network');
    }
  };

  const handleSwitchToTestnet = async () => {
    try {
      await switchNetwork(97); // BSC Testnet
      toast.success('Switched to BSC Testnet');
    } catch (error) {
      toast.error('Failed to switch network');
    }
  };

  const getNetworkName = (chainId: number) => {
    switch (chainId) {
      case 56: return 'BNB Chain';
      case 97: return 'BSC Testnet';
      case 1: return 'Ethereum';
      default: return 'Unknown Network';
    }
  };

  const getNetworkStatus = (chainId: number) => {
    const isCorrectNetwork = chainId === 56 || chainId === 97;
    return {
      isCorrect: isCorrectNetwork,
      color: isCorrectNetwork ? 'text-green-400' : 'text-yellow-400',
      icon: isCorrectNetwork ? CheckCircle : AlertCircle
    };
  };

  if (!isConnected) {
    return (
      <Button
        onClick={handleConnect}
        disabled={isConnecting}
        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
        size="lg"
      >
        {isConnecting ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
            Connecting...
          </>
        ) : (
          <>
            <Wallet className="w-4 h-4 mr-2" />
            Connect Wallet
          </>
        )}
      </Button>
    );
  }

  const networkStatus = getNetworkStatus(chainId || 0);

  return (
    <div className="relative">
      <Button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        variant="outline"
        className="border-slate-600 bg-slate-800/50 text-white hover:bg-slate-700 min-w-48"
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="font-mono text-sm">
              {account?.slice(0, 6)}...{account?.slice(-4)}
            </span>
          </div>
          <networkStatus.icon className={`w-4 h-4 ${networkStatus.color}`} />
        </div>
      </Button>

      {isDropdownOpen && (
        <Card className="absolute top-full mt-2 right-0 w-80 bg-slate-800 border-slate-700 shadow-xl z-50">
          <CardContent className="p-4 space-y-4">
            {/* Account Info */}
            <div>
              <p className="text-slate-400 text-sm mb-1">Connected Account</p>
              <div className="flex items-center justify-between">
                <span className="font-mono text-white text-sm">{account || ''}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (account) {
                      navigator.clipboard.writeText(account);
                      toast.success('Address copied to clipboard');
                    }
                  }}
                  className="text-slate-400 hover:text-white h-6 px-2"
                >
                  Copy
                </Button>
              </div>
            </div>

            {/* Network Info */}
            <div>
              <p className="text-slate-400 text-sm mb-2">Network</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <networkStatus.icon className={`w-4 h-4 ${networkStatus.color}`} />
                  <span className="text-white text-sm">{getNetworkName(chainId || 0)}</span>
                </div>
                <Badge
                  variant={networkStatus.isCorrect ? "default" : "destructive"}
                  className="text-xs"
                >
                  {networkStatus.isCorrect ? 'Supported' : 'Unsupported'}
                </Badge>
              </div>

              {!networkStatus.isCorrect && (
                <div className="mt-3 space-y-2">
                  <p className="text-yellow-400 text-xs">
                    Switch to a supported network to use AETERNA
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSwitchToBSC}
                      className="flex-1 text-xs border-slate-600 hover:border-slate-500"
                    >
                      BNB Chain
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSwitchToTestnet}
                      className="flex-1 text-xs border-slate-600 hover:border-slate-500"
                    >
                      BSC Testnet
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="border-t border-slate-700 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (account) {
                      window.open(`https://bscscan.com/address/${account}`, '_blank');
                    }
                  }}
                  className="text-xs border-slate-600 hover:border-slate-500"
                >
                  View on BscScan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDisconnect}
                  className="text-xs border-red-600 hover:border-red-500 text-red-400 hover:text-red-300"
                >
                  <LogOut className="w-3 h-3 mr-1" />
                  Disconnect
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backdrop */}
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </div>
  );
}