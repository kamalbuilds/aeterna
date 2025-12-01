import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Agent, Memory, EconomicTransaction, NetworkStats } from '../types';

interface AgentStore {
  // State
  agents: Agent[];
  selectedAgent: Agent | null;
  memories: Memory[];
  transactions: EconomicTransaction[];
  networkStats: NetworkStats | null;
  loading: boolean;
  error: string | null;

  // Actions
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  deleteAgent: (id: string) => void;
  setSelectedAgent: (agent: Agent | null) => void;

  setMemories: (memories: Memory[]) => void;
  addMemory: (memory: Memory) => void;
  updateMemory: (id: string, updates: Partial<Memory>) => void;

  setTransactions: (transactions: EconomicTransaction[]) => void;
  addTransaction: (transaction: EconomicTransaction) => void;
  updateTransaction: (id: string, updates: Partial<EconomicTransaction>) => void;

  setNetworkStats: (stats: NetworkStats) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Computed getters
  getAgentsByOwner: (owner: string) => Agent[];
  getMemoriesByAgent: (agentId: string) => Memory[];
  getTransactionsByAgent: (agentId: string) => EconomicTransaction[];
  getActiveAgents: () => Agent[];
}

export const useAgentStore = create<AgentStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    agents: [],
    selectedAgent: null,
    memories: [],
    transactions: [],
    networkStats: null,
    loading: false,
    error: null,

    // Actions
    setAgents: (agents) => set({ agents }),

    addAgent: (agent) => set((state) => ({
      agents: [...state.agents, agent]
    })),

    updateAgent: (id, updates) => set((state) => ({
      agents: state.agents.map(agent =>
        agent.id === id ? { ...agent, ...updates } : agent
      )
    })),

    deleteAgent: (id) => set((state) => ({
      agents: state.agents.filter(agent => agent.id !== id),
      selectedAgent: state.selectedAgent?.id === id ? null : state.selectedAgent
    })),

    setSelectedAgent: (agent) => set({ selectedAgent: agent }),

    setMemories: (memories) => set({ memories }),

    addMemory: (memory) => set((state) => ({
      memories: [...state.memories, memory]
    })),

    updateMemory: (id, updates) => set((state) => ({
      memories: state.memories.map(memory =>
        memory.id === id ? { ...memory, ...updates } : memory
      )
    })),

    setTransactions: (transactions) => set({ transactions }),

    addTransaction: (transaction) => set((state) => ({
      transactions: [...state.transactions, transaction]
    })),

    updateTransaction: (id, updates) => set((state) => ({
      transactions: state.transactions.map(transaction =>
        transaction.id === id ? { ...transaction, ...updates } : transaction
      )
    })),

    setNetworkStats: (networkStats) => set({ networkStats }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    // Computed getters
    getAgentsByOwner: (owner) => get().agents.filter(agent => agent.owner === owner),

    getMemoriesByAgent: (agentId) => get().memories.filter(memory => memory.agentId === agentId),

    getTransactionsByAgent: (agentId) =>
      get().transactions.filter(transaction =>
        transaction.from === agentId || transaction.to === agentId
      ),

    getActiveAgents: () => get().agents.filter(agent => agent.status === 'active')
  }))
);