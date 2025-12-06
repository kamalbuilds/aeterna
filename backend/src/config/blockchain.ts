import { ethers } from 'ethers';
import { logger, loggers } from './logger';

// Blockchain configuration interface
export interface BlockchainConfig {
  rpcUrl: string;
  privateKey: string;
  network: string;
  contractAddress?: string;
  gasLimit: string;
  gasPrice: string;
}

// Smart contract ABI for AETERNA agents
export const AGENT_CONTRACT_ABI = [
  'function createAgent(string memory name, string memory metadata) external returns (uint256)',
  'function updateAgent(uint256 tokenId, string memory metadata) external',
  'function getAgent(uint256 tokenId) external view returns (address owner, string memory name, string memory metadata, uint256 createdAt)',
  'function transferAgent(address to, uint256 tokenId) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'event AgentCreated(uint256 indexed tokenId, address indexed owner, string name)',
  'event AgentUpdated(uint256 indexed tokenId, string metadata)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

// Blockchain service class
export class BlockchainService {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private contract?: ethers.Contract;
  private config: BlockchainConfig;

  constructor(config: BlockchainConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);

    if (config.contractAddress) {
      this.contract = new ethers.Contract(
        config.contractAddress,
        AGENT_CONTRACT_ABI,
        this.wallet
      );
    }
  }

  /**
   * Check blockchain connection health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      loggers.blockchain.transaction('health_check', 'network', 'confirmed');
      return blockNumber > 0;
    } catch (error) {
      loggers.blockchain.error(error as Error, 'health_check');
      return false;
    }
  }

  /**
   * Get account balance
   */
  async getBalance(address?: string): Promise<string> {
    try {
      const accountAddress = address || this.wallet.address;
      const balance = await this.provider.getBalance(accountAddress);
      return ethers.formatEther(balance);
    } catch (error) {
      loggers.blockchain.error(error as Error, 'get_balance', address);
      throw error;
    }
  }

  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<bigint> {
    try {
      const gasPrice = await this.provider.getFeeData();
      return gasPrice.gasPrice || BigInt(this.config.gasPrice);
    } catch (error) {
      loggers.blockchain.error(error as Error, 'get_gas_price');
      return BigInt(this.config.gasPrice);
    }
  }

  /**
   * Create agent on blockchain
   */
  async createAgent(name: string, metadata: string): Promise<{
    tokenId: string;
    txHash: string;
    gasUsed: string;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const gasPrice = await this.getGasPrice();

      const tx = await this.contract.createAgent(name, metadata, {
        gasLimit: this.config.gasLimit,
        gasPrice: gasPrice,
      });

      loggers.blockchain.transaction(tx.hash, 'agent_creation', 'pending');

      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error('Transaction receipt not available');
      }

      // Extract token ID from logs
      const createEvent = receipt.logs.find((log: any) => {
        try {
          const parsed = this.contract!.interface.parseLog(log);
          return parsed?.name === 'AgentCreated';
        } catch {
          return false;
        }
      });

      let tokenId = '0';
      if (createEvent) {
        const parsed = this.contract.interface.parseLog(createEvent);
        tokenId = parsed?.args[0]?.toString() || '0';
      }

      loggers.blockchain.transaction(tx.hash, 'agent_creation', 'confirmed');
      loggers.blockchain.contract(
        this.config.contractAddress!,
        'createAgent',
        'success',
        receipt.gasUsed.toString()
      );

      return {
        tokenId,
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      loggers.blockchain.error(error as Error, 'create_agent');
      throw error;
    }
  }

  /**
   * Update agent metadata on blockchain
   */
  async updateAgent(tokenId: string, metadata: string): Promise<{
    txHash: string;
    gasUsed: string;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const gasPrice = await this.getGasPrice();

      const tx = await this.contract.updateAgent(tokenId, metadata, {
        gasLimit: this.config.gasLimit,
        gasPrice: gasPrice,
      });

      loggers.blockchain.transaction(tx.hash, 'agent_update', 'pending');

      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error('Transaction receipt not available');
      }

      loggers.blockchain.transaction(tx.hash, 'agent_update', 'confirmed');
      loggers.blockchain.contract(
        this.config.contractAddress!,
        'updateAgent',
        'success',
        receipt.gasUsed.toString()
      );

      return {
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      loggers.blockchain.error(error as Error, 'update_agent', tokenId);
      throw error;
    }
  }

  /**
   * Get agent data from blockchain
   */
  async getAgent(tokenId: string): Promise<{
    owner: string;
    name: string;
    metadata: string;
    createdAt: string;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const result = await this.contract.getAgent(tokenId);

      return {
        owner: result[0],
        name: result[1],
        metadata: result[2],
        createdAt: result[3].toString(),
      };
    } catch (error) {
      loggers.blockchain.error(error as Error, 'get_agent', tokenId);
      throw error;
    }
  }

  /**
   * Transfer agent ownership
   */
  async transferAgent(to: string, tokenId: string): Promise<{
    txHash: string;
    gasUsed: string;
  }> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const gasPrice = await this.getGasPrice();

      const tx = await this.contract.transferAgent(to, tokenId, {
        gasLimit: this.config.gasLimit,
        gasPrice: gasPrice,
      });

      loggers.blockchain.transaction(tx.hash, 'agent_transfer', 'pending');

      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error('Transaction receipt not available');
      }

      loggers.blockchain.transaction(tx.hash, 'agent_transfer', 'confirmed');
      loggers.blockchain.contract(
        this.config.contractAddress!,
        'transferAgent',
        'success',
        receipt.gasUsed.toString()
      );

      return {
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      loggers.blockchain.error(error as Error, 'transfer_agent', tokenId);
      throw error;
    }
  }

  /**
   * Get agents owned by address
   */
  async getOwnedAgents(ownerAddress: string): Promise<string[]> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const balance = await this.contract.balanceOf(ownerAddress);
      const tokenIds: string[] = [];

      for (let i = 0; i < balance; i++) {
        const tokenId = await this.contract.tokenOfOwnerByIndex(ownerAddress, i);
        tokenIds.push(tokenId.toString());
      }

      return tokenIds;
    } catch (error) {
      loggers.blockchain.error(error as Error, 'get_owned_agents', ownerAddress);
      throw error;
    }
  }

  /**
   * Listen to contract events
   */
  async listenToEvents(callback: (event: any) => void): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      // Listen to AgentCreated events
      this.contract.on('AgentCreated', (tokenId, owner, name, event) => {
        callback({
          type: 'AgentCreated',
          tokenId: tokenId.toString(),
          owner,
          name,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
        });
      });

      // Listen to AgentUpdated events
      this.contract.on('AgentUpdated', (tokenId, metadata, event) => {
        callback({
          type: 'AgentUpdated',
          tokenId: tokenId.toString(),
          metadata,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
        });
      });

      // Listen to Transfer events
      this.contract.on('Transfer', (from, to, tokenId, event) => {
        callback({
          type: 'Transfer',
          from,
          to,
          tokenId: tokenId.toString(),
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
        });
      });

      logger.info('Blockchain event listeners started');
    } catch (error) {
      loggers.blockchain.error(error as Error, 'listen_to_events');
      throw error;
    }
  }

  /**
   * Stop listening to events
   */
  async stopListening(): Promise<void> {
    if (this.contract) {
      await this.contract.removeAllListeners();
      logger.info('Blockchain event listeners stopped');
    }
  }

  /**
   * Send ETH transaction
   */
  async sendTransaction(to: string, value: string, data?: string): Promise<{
    txHash: string;
    gasUsed: string;
  }> {
    try {
      const gasPrice = await this.getGasPrice();

      const tx = await this.wallet.sendTransaction({
        to,
        value: ethers.parseEther(value),
        data: data || '0x',
        gasLimit: this.config.gasLimit,
        gasPrice: gasPrice,
      });

      loggers.blockchain.transaction(tx.hash, 'eth_transfer', 'pending');

      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error('Transaction receipt not available');
      }

      loggers.blockchain.transaction(tx.hash, 'eth_transfer', 'confirmed');

      return {
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      loggers.blockchain.error(error as Error, 'send_transaction');
      throw error;
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(txHash: string): Promise<any> {
    try {
      const [tx, receipt] = await Promise.all([
        this.provider.getTransaction(txHash),
        this.provider.getTransactionReceipt(txHash),
      ]);

      return {
        transaction: tx,
        receipt: receipt,
        confirmations: receipt?.confirmations || 0,
        status: receipt?.status === 1 ? 'success' : 'failed',
      };
    } catch (error) {
      loggers.blockchain.error(error as Error, 'get_transaction', txHash);
      throw error;
    }
  }
}

// Create blockchain service instance
const createBlockchainService = (): BlockchainService | null => {
  try {
    const config: BlockchainConfig = {
      rpcUrl: process.env.ETHEREUM_RPC_URL || '',
      privateKey: process.env.ETHEREUM_PRIVATE_KEY || '',
      network: process.env.ETHEREUM_NETWORK || 'mainnet',
      contractAddress: process.env.SMART_CONTRACT_ADDRESS,
      gasLimit: process.env.GAS_LIMIT || '21000',
      gasPrice: process.env.GAS_PRICE || '20000000000',
    };

    if (!config.rpcUrl || !config.privateKey) {
      logger.warn('Blockchain configuration incomplete, service disabled');
      return null;
    }

    return new BlockchainService(config);
  } catch (error) {
    logger.error('Failed to initialize blockchain service', error);
    return null;
  }
};

export const blockchain = createBlockchainService();

export default BlockchainService;