'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Activity,
  Brain,
  Coins,
  Shield,
  Users,
  TrendingUp,
  Database,
  Zap,
  Settings,
  Play,
  Pause,
  RefreshCw,
  Eye,
  Trash2,
  Plus
} from 'lucide-react';
import { useWeb3 } from '@/hooks/use-web3';

interface Agent {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'paused' | 'stopped';
  autonomyLevel: number;
  reputation: number;
  totalEarnings: string;
  tasksCompleted: number;
  memoryUsage: number;
  lastActive: string;
  avatar?: string;
}

interface DashboardStats {
  totalAgents: number;
  activeAgents: number;
  totalEarnings: string;
  totalTasks: number;
  memoryUsed: string;
  reputationAvg: number;
}

export function Dashboard() {
  const { account, chainId } = useWeb3();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalAgents: 0,
    activeAgents: 0,
    totalEarnings: '0',
    totalTasks: 0,
    memoryUsed: '0',
    reputationAvg: 0
  });
  const [loading, setLoading] = useState(true);

  // Mock data - replace with actual API calls
  useEffect(() => {
    const mockAgents: Agent[] = [
      {
        id: 'agent-1',
        name: 'Alpha Research Bot',
        type: 'researcher',
        status: 'active',
        autonomyLevel: 85,
        reputation: 95,
        totalEarnings: '2.4',
        tasksCompleted: 156,
        memoryUsage: 75,
        lastActive: '2 minutes ago'
      },
      {
        id: 'agent-2',
        name: 'Beta Trading Agent',
        type: 'trader',
        status: 'active',
        autonomyLevel: 90,
        reputation: 88,
        totalEarnings: '5.7',
        tasksCompleted: 89,
        memoryUsage: 60,
        lastActive: '5 minutes ago'
      },
      {
        id: 'agent-3',
        name: 'Gamma Creator',
        type: 'creator',
        status: 'paused',
        autonomyLevel: 70,
        reputation: 92,
        totalEarnings: '1.8',
        tasksCompleted: 234,
        memoryUsage: 45,
        lastActive: '1 hour ago'
      }
    ];

    setAgents(mockAgents);

    const totalEarnings = mockAgents.reduce((sum, agent) => sum + parseFloat(agent.totalEarnings), 0);
    const activeAgents = mockAgents.filter(agent => agent.status === 'active').length;
    const totalTasks = mockAgents.reduce((sum, agent) => sum + agent.tasksCompleted, 0);
    const avgReputation = mockAgents.reduce((sum, agent) => sum + agent.reputation, 0) / mockAgents.length;

    setStats({
      totalAgents: mockAgents.length,
      activeAgents,
      totalEarnings: totalEarnings.toFixed(2),
      totalTasks,
      memoryUsed: '3.2GB',
      reputationAvg: Math.round(avgReputation)
    });

    setLoading(false);
  }, []);

  const getAgentTypeIcon = (type: string) => {
    switch (type) {
      case 'researcher': return '🔍';
      case 'trader': return '💰';
      case 'creator': return '🎨';
      case 'assistant': return '🤖';
      case 'validator': return '✅';
      default: return '🤖';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'stopped': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const handleAgentAction = (agentId: string, action: 'start' | 'pause' | 'stop' | 'delete') => {
    setAgents(agents.map(agent => {
      if (agent.id === agentId) {
        if (action === 'delete') {
          return null;
        }
        return {
          ...agent,
          status: action === 'start' ? 'active' : action === 'pause' ? 'paused' : 'stopped'
        };
      }
      return agent;
    }).filter(Boolean) as Agent[]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4" />
          <p className="text-slate-300">Loading your immortal agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Agent Dashboard</h1>
            <p className="text-slate-400">
              Manage your immortal AI agents • Connected: {account?.slice(0, 6)}...{account?.slice(-4)}
            </p>
          </div>
          <Button
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 mt-4 sm:mt-0"
            onClick={() => router.push('/create')}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Agent
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-slate-400 text-sm">Total Agents</p>
                  <p className="text-2xl font-bold text-white">{stats.totalAgents}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-slate-400 text-sm">Active</p>
                  <p className="text-2xl font-bold text-white">{stats.activeAgents}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-slate-400 text-sm">Earnings</p>
                  <p className="text-2xl font-bold text-white">{stats.totalEarnings} BNB</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                <div>
                  <p className="text-slate-400 text-sm">Tasks</p>
                  <p className="text-2xl font-bold text-white">{stats.totalTasks}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-400" />
                <div>
                  <p className="text-slate-400 text-sm">Memory</p>
                  <p className="text-2xl font-bold text-white">{stats.memoryUsed}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange-400" />
                <div>
                  <p className="text-slate-400 text-sm">Reputation</p>
                  <p className="text-2xl font-bold text-white">{stats.reputationAvg}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="agents" className="space-y-6">
          <TabsList className="bg-slate-800 border-slate-700">
            <TabsTrigger value="agents" className="data-[state=active]:bg-purple-600">
              My Agents
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-purple-600">
              Analytics
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-purple-600">
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Agents Tab */}
          <TabsContent value="agents" className="space-y-6">
            <div className="grid gap-6">
              {agents.map((agent) => (
                <Card key={agent.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Agent Info */}
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <Avatar className="w-12 h-12">
                            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-600">
                              {getAgentTypeIcon(agent.type)}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ${getStatusColor(agent.status)}`} />
                        </div>

                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold text-white">{agent.name}</h3>
                            <Badge variant="outline" className="text-xs">
                              {agent.type}
                            </Badge>
                          </div>
                          <p className="text-slate-400 text-sm">
                            {agent.tasksCompleted} tasks • Last active {agent.lastActive}
                          </p>
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:min-w-96">
                        <div className="text-center">
                          <p className="text-slate-400 text-xs mb-1">Autonomy</p>
                          <div className="flex items-center gap-1">
                            <Progress value={agent.autonomyLevel} className="h-2 flex-1" />
                            <span className="text-white text-xs w-8">{agent.autonomyLevel}%</span>
                          </div>
                        </div>

                        <div className="text-center">
                          <p className="text-slate-400 text-xs mb-1">Reputation</p>
                          <p className="text-green-400 font-semibold">{agent.reputation}%</p>
                        </div>

                        <div className="text-center">
                          <p className="text-slate-400 text-xs mb-1">Earnings</p>
                          <p className="text-yellow-400 font-semibold">{agent.totalEarnings} BNB</p>
                        </div>

                        <div className="text-center">
                          <p className="text-slate-400 text-xs mb-1">Memory</p>
                          <div className="flex items-center gap-1">
                            <Progress value={agent.memoryUsage} className="h-2 flex-1" />
                            <span className="text-white text-xs w-8">{agent.memoryUsage}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAgentAction(agent.id, agent.status === 'active' ? 'pause' : 'start')}
                          className="border-slate-600 hover:border-slate-500"
                        >
                          {agent.status === 'active' ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-600 hover:border-slate-500"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-600 hover:border-slate-500"
                        >
                          <Settings className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAgentAction(agent.id, 'delete')}
                          className="border-red-600 hover:border-red-500 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {agents.length === 0 && (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-12 text-center">
                    <Brain className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">No Agents Yet</h3>
                    <p className="text-slate-400 mb-6">
                      Create your first immortal AI agent to get started
                    </p>
                    <Button
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                      onClick={() => router.push('/create')}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Agent
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Performance Analytics</CardTitle>
                <CardDescription className="text-slate-400">
                  Track your agents' performance and earnings over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <TrendingUp className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <p>Analytics dashboard coming soon</p>
                    <p className="text-sm">Real-time performance metrics and charts</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Dashboard Settings</CardTitle>
                <CardDescription className="text-slate-400">
                  Configure your dashboard preferences and global agent settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <Settings className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                    <p>Settings panel coming soon</p>
                    <p className="text-sm">Global configuration and preferences</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}