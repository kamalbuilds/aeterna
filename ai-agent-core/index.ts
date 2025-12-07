/**
 * AETERNA Protocol - Main Application Entry Point
 * TypeScript-first architecture with production debugging support
 */

import { config } from 'dotenv';
import { ethers } from 'ethers';
import type { AeternaConfig } from '@types/config';

// Load environment variables
config();

/**
 * Main application class for AETERNA protocol
 * Handles initialization, configuration, and service coordination
 */
export class AeternaApp {
  private readonly config: AeternaConfig;
  private provider: ethers.Provider | null = null;
  private signer: ethers.Signer | null = null;

  constructor(config: AeternaConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Initialize the AETERNA application
   */
  public async initialize(): Promise<void> {
    console.log('🚀 Initializing AETERNA Protocol...');

    try {
      await this.setupProvider();
      await this.setupSigner();
      await this.validateConnection();

      console.log('✅ AETERNA Protocol initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize AETERNA Protocol:', error);
      throw error;
    }
  }

  /**
   * Setup Ethereum provider
   */
  private async setupProvider(): Promise<void> {
    if (!this.config.rpc.url) {
      throw new Error('RPC URL not configured');
    }

    this.provider = new ethers.JsonRpcProvider(this.config.rpc.url);
    console.log('📡 Provider connected to:', this.config.rpc.url);
  }

  /**
   * Setup signer for transactions
   */
  private async setupSigner(): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    if (this.config.wallet.privateKey) {
      this.signer = new ethers.Wallet(this.config.wallet.privateKey, this.provider);
    } else if (this.config.wallet.mnemonic) {
      this.signer = ethers.Wallet.fromPhrase(this.config.wallet.mnemonic, this.provider);
    } else {
      console.warn('⚠️  No wallet configuration found. Running in read-only mode.');
      return;
    }

    const address = await this.signer.getAddress();
    console.log('🔑 Signer initialized:', address);
  }

  /**
   * Validate network connection
   */
  private async validateConnection(): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const network = await this.provider.getNetwork();
    const blockNumber = await this.provider.getBlockNumber();

    console.log(`🌐 Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
    console.log(`📦 Latest block: ${blockNumber}`);
  }

  /**
   * Validate application configuration
   */
  private validateConfig(): void {
    if (!this.config.rpc?.url) {
      throw new Error('RPC configuration is required');
    }

    if (!this.config.wallet?.privateKey && !this.config.wallet?.mnemonic) {
      console.warn('⚠️  No wallet configuration provided. Some features may be limited.');
    }
  }

  /**
   * Get the current provider
   */
  public getProvider(): ethers.Provider | null {
    return this.provider;
  }

  /**
   * Get the current signer
   */
  public getSigner(): ethers.Signer | null {
    return this.signer;
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('🛑 Shutting down AETERNA Protocol...');

    // Cleanup resources
    this.provider = null;
    this.signer = null;

    console.log('✅ AETERNA Protocol shutdown complete');
  }
}

/**
 * Application entry point
 */
async function main(): Promise<void> {
  try {
    const config: AeternaConfig = {
      rpc: {
        url: process.env.RPC_URL || 'http://localhost:8545',
      },
      wallet: {
        privateKey: process.env.PRIVATE_KEY,
        mnemonic: process.env.MNEMONIC,
      },
      contracts: {
        deploymentNetwork: process.env.DEPLOYMENT_NETWORK || 'localhost',
      },
      debug: {
        enabled: process.env.NODE_ENV !== 'production',
        logLevel: process.env.LOG_LEVEL || 'info',
      },
    };

    const app = new AeternaApp(config);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await app.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await app.shutdown();
      process.exit(0);
    });

    await app.initialize();

    // Application is now ready
    console.log('🎯 AETERNA Protocol is ready for operations');

  } catch (error) {
    console.error('💥 Fatal error during startup:', error);
    process.exit(1);
  }
}

// Run the application if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export default AeternaApp;