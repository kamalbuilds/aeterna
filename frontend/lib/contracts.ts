// Contract addresses and ABIs for AETERNA protocol
export const CONTRACTS = {
  BSC_MAINNET: {
    AGENT_IDENTITY: '0x0000000000000000000000000000000000000000', // To be deployed
    AGENT_ECONOMICS: '0x0000000000000000000000000000000000000000', // To be deployed
    MEMORY_STORE: '0x0000000000000000000000000000000000000000', // To be deployed
  },
  BSC_TESTNET: {
    AGENT_IDENTITY: '0x0000000000000000000000000000000000000000', // To be deployed
    AGENT_ECONOMICS: '0x0000000000000000000000000000000000000000', // To be deployed
    MEMORY_STORE: '0x0000000000000000000000000000000000000000', // To be deployed
  }
};

// Minimal ABIs for frontend interaction
export const AGENT_IDENTITY_ABI = [
  {
    "inputs": [
      {"name": "name", "type": "string"},
      {"name": "agentType", "type": "string"},
      {"name": "metadata", "type": "string"}
    ],
    "name": "createAgent",
    "outputs": [{"name": "agentId", "type": "bytes32"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "agentId", "type": "bytes32"}],
    "name": "getAgent",
    "outputs": [
      {"name": "name", "type": "string"},
      {"name": "agentType", "type": "string"},
      {"name": "owner", "type": "address"},
      {"name": "isActive", "type": "bool"},
      {"name": "reputation", "type": "uint256"},
      {"name": "createdAt", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

export const AGENT_ECONOMICS_ABI = [
  {
    "inputs": [{"name": "agentId", "type": "bytes32"}],
    "name": "fundAgent",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"name": "agentId", "type": "bytes32"}],
    "name": "getBalance",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];