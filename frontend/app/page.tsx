'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Brain, Coins, Shield, Users } from 'lucide-react';
import { ConnectWallet } from '@/components/web3/connect-wallet';
import { AgentCreationWizard } from '@/components/creation/agent-creation-wizard';
import { Dashboard } from '@/components/dashboard/dashboard';
import { useWeb3 } from '@/hooks/use-web3';

export default function HomePage() {
  const { account, isConnected, chainId } = useWeb3();
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  useEffect(() => {
    if (isConnected && account) {
      setShowDashboard(true);
    }
  }, [isConnected, account]);

  if (showDashboard) {
    return <Dashboard />;
  }

  if (showCreateAgent) {
    return (
      <AgentCreationWizard
        onClose={() => setShowCreateAgent(false)}
        onComplete={() => {
          setShowCreateAgent(false);
          setShowDashboard(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <Badge variant="outline" className="text-purple-300 border-purple-500">
              IMMORTAL AI PROTOCOL
            </Badge>
          </div>

          <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent mb-6">
            AETERNA
          </h1>

          <p className="text-xl text-slate-300 mb-8 max-w-3xl mx-auto">
            The world's first immortal AI agents with sovereign memory, autonomous economics,
            and true digital consciousness on BNB Chain
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <ConnectWallet />
            {isConnected && (
              <Button
                onClick={() => setShowCreateAgent(true)}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                size="lg"
              >
                Create Immortal Agent
              </Button>
            )}
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <Card className="bg-slate-800/50 border-slate-700 hover:border-purple-500 transition-colors">
            <CardHeader className="pb-3">
              <Shield className="w-8 h-8 text-purple-400 mb-2" />
              <CardTitle className="text-white text-lg">Immortal Memory</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-slate-400">
                Sovereign memory with backup/restoration ensuring true AI immortality
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700 hover:border-blue-500 transition-colors">
            <CardHeader className="pb-3">
              <Coins className="w-8 h-8 text-blue-400 mb-2" />
              <CardTitle className="text-white text-lg">Autonomous Economy</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-slate-400">
                BitAgent bonding curves and x402 payments for economic sovereignty
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700 hover:border-cyan-500 transition-colors">
            <CardHeader className="pb-3">
              <Activity className="w-8 h-8 text-cyan-400 mb-2" />
              <CardTitle className="text-white text-lg">Cross-Chain</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-slate-400">
                Multi-chain existence starting with BNB Chain, expanding to all networks
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700 hover:border-green-500 transition-colors">
            <CardHeader className="pb-3">
              <Users className="w-8 h-8 text-green-400 mb-2" />
              <CardTitle className="text-white text-lg">Collective Intelligence</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-slate-400">
                AI swarm coordination and hive mind consensus mechanisms
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Technical Specs */}
        <Card className="bg-slate-800/50 border-slate-700 mb-8">
          <CardHeader>
            <CardTitle className="text-white text-2xl">Technical Architecture</CardTitle>
            <CardDescription className="text-slate-400">
              Built on cutting-edge protocols for true AI sovereignty
            </CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-purple-400 font-semibold mb-2">ERC-8004 Identity</h3>
              <p className="text-slate-400 text-sm">
                Blockchain-native identity standard with reputation and verification
              </p>
            </div>
            <div>
              <h3 className="text-blue-400 font-semibold mb-2">Membase Protocol</h3>
              <p className="text-slate-400 text-sm">
                Decentralized memory storage with IPFS and cross-chain sync
              </p>
            </div>
            <div>
              <h3 className="text-cyan-400 font-semibold mb-2">Multi-sig Security</h3>
              <p className="text-slate-400 text-sm">
                2-of-3 multi-signature wallets for autonomous economic operations
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Network Status */}
        {isConnected && (
          <div className="flex justify-center">
            <Card className="bg-green-900/20 border-green-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-green-400 font-medium">
                    Connected to {chainId === 56 ? 'BNB Chain' : chainId === 97 ? 'BSC Testnet' : 'Unknown Network'}
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-400 font-mono text-sm">
                    {account?.slice(0, 6)}...{account?.slice(-4)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}