export interface Agent {
  id: string;
  name: string;
  type: 'autonomous' | 'reactive' | 'collaborative';
  status: 'active' | 'dormant' | 'terminated';
  memoryCapacity: number;
  currentMemoryUsage: number;
  economicBalance: number;
  createdAt: Date;
  lastActive: Date;
  owner: string;
  capabilities: string[];
  interactions: number;
  reputation: number;
}

export interface Memory {
  id: string;
  agentId: string;
  type: 'experience' | 'knowledge' | 'interaction' | 'emotion';
  content: string;
  importance: number;
  timestamp: Date;
  associatedAgents: string[];
  tags: string[];
  encrypted: boolean;
}

export interface EconomicTransaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  type: 'memory_trade' | 'service_payment' | 'reputation_reward' | 'creation_cost';
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  gasUsed?: number;
  transactionHash?: string;
}

export interface AgentCreationData {
  name: string;
  type: 'autonomous' | 'reactive' | 'collaborative';
  initialMemoryCapacity: number;
  capabilities: string[];
  economicBudget: number;
  personality?: {
    traits: string[];
    goals: string[];
    preferences: Record<string, any>;
  };
}

export interface User {
  address: string;
  balance: number;
  agentsOwned: number;
  totalInteractions: number;
  reputation: number;
  joinedAt: Date;
}

export interface NetworkStats {
  totalAgents: number;
  activeAgents: number;
  totalMemories: number;
  totalTransactions: number;
  totalValueLocked: number;
  averageAgentLifespan: number;
}

export interface ChartData {
  timestamp: Date;
  value: number;
  label: string;
}

export interface WebSocketMessage {
  type: 'agent_created' | 'agent_updated' | 'memory_created' | 'transaction' | 'network_stats';
  data: any;
  timestamp: Date;
}