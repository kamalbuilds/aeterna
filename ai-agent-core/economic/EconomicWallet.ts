/**
 * AETERNA Economic Wallet
 * Multi-sig and trading capabilities with strict TypeScript typing
 */

import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import {
  WalletConfig,
  NetworkType,
  NetworkConfig,
  MultiSigConfig,
  TradingConfig,
  ExchangeType,
  AsyncResult,
  AgentId,
  Serializable,
  Deserializable
} from '../types';
import {
  WalletError,
  InsufficientFundsError,
  TransactionError,
  MultiSigError,
  TradingError,
  SlippageExceededError,
  NetworkConnectionError,
  ValidationError,
  ContractError,
  GasEstimationError
} from '../errors';

interface WalletBalance {
  readonly network: NetworkType;
  readonly address: string;
  readonly native: string; // Native token balance in Wei
  readonly tokens: Record<string, string>; // Token address -> balance in Wei
  readonly lastUpdated: Date;
}

interface Transaction {
  readonly id: string;
  readonly network: NetworkType;
  readonly hash?: string;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly gasPrice?: string;
  readonly gasLimit?: string;
  readonly data?: string;
  readonly status: TransactionStatus;
  readonly timestamp: Date;
  readonly confirmations: number;
  readonly receipt?: ethers.TransactionReceipt;
}

enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

interface TradeOrder {
  readonly id: string;
  readonly exchange: ExchangeType;
  readonly network: NetworkType;
  readonly type: TradeType;
  readonly tokenIn: string;
  readonly tokenOut: string;
  readonly amountIn: string;
  readonly amountOutMin: string;
  readonly slippageTolerance: number;
  readonly deadline: Date;
  readonly status: TradeStatus;
  readonly createdAt: Date;
  readonly executedAt?: Date;
  readonly txHash?: string;
  readonly actualAmountOut?: string;
}

enum TradeType {
  BUY = 'buy',
  SELL = 'sell',
  SWAP = 'swap'
}

enum TradeStatus {
  CREATED = 'created',
  PENDING = 'pending',
  EXECUTED = 'executed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

interface MultiSigTransaction {
  readonly id: string;
  readonly contractAddress: string;
  readonly network: NetworkType;
  readonly to: string;
  readonly value: string;
  readonly data: string;
  readonly nonce: number;
  readonly signatures: Signature[];
  readonly threshold: number;
  readonly status: MultiSigStatus;
  readonly createdAt: Date;
  readonly executedAt?: Date;
}

interface Signature {
  readonly signer: string;
  readonly signature: string;
  readonly signedAt: Date;
}

enum MultiSigStatus {
  PENDING = 'pending',
  READY = 'ready',
  EXECUTED = 'executed',
  REJECTED = 'rejected'
}

export class EconomicWallet extends EventEmitter implements Serializable, Deserializable<EconomicWallet> {
  private readonly _config: WalletConfig;
  private readonly _agentId: AgentId;
  private readonly _providers: Map<NetworkType, ethers.JsonRpcProvider>;
  private readonly _wallets: Map<NetworkType, ethers.Wallet>;
  private readonly _balances: Map<NetworkType, WalletBalance>;
  private readonly _transactions: Map<string, Transaction>;
  private readonly _tradeOrders: Map<string, TradeOrder>;
  private readonly _multiSigTransactions: Map<string, MultiSigTransaction>;
  private readonly _multiSigContracts: Map<NetworkType, ethers.Contract>;
  private _isInitialized: boolean;

  constructor(config: WalletConfig, agentId: AgentId) {
    super();
    this.setMaxListeners(30);

    this.validateConfiguration(config);

    this._config = config;
    this._agentId = agentId;
    this._providers = new Map();
    this._wallets = new Map();
    this._balances = new Map();
    this._transactions = new Map();
    this._tradeOrders = new Map();
    this._multiSigTransactions = new Map();
    this._multiSigContracts = new Map();
    this._isInitialized = false;
  }

  // Public API
  public get config(): WalletConfig {
    return this._config;
  }

  public get agentId(): AgentId {
    return this._agentId;
  }

  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  public get supportedNetworks(): readonly NetworkType[] {
    return Object.keys(this._config.networkConfigs) as NetworkType[];
  }

  // Initialization
  public async initialize(): AsyncResult<void> {
    if (this._isInitialized) {
      return { success: true };
    }

    try {
      // Initialize providers and wallets for each network
      for (const [network, config] of Object.entries(this._config.networkConfigs)) {
        await this.initializeNetwork(network as NetworkType, config);
      }

      // Initialize multi-sig contracts
      await this.initializeMultiSigContracts();

      // Load initial balances
      await this.refreshAllBalances();

      this._isInitialized = true;
      this.emit('initialized', { agentId: this._agentId });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new WalletError(String(error), 'WALLET_INIT_ERROR')
      };
    }
  }

  // Balance Management
  public async getBalance(network: NetworkType, address?: string): AsyncResult<WalletBalance> {
    try {
      this.validateNetwork(network);

      const targetAddress = address || this.getWalletAddress(network);
      if (!targetAddress) {
        throw new WalletError('No wallet address available', 'NO_WALLET_ADDRESS', network);
      }

      const provider = this._providers.get(network);
      if (!provider) {
        throw new NetworkConnectionError(`Provider not available for ${network}`, network, '');
      }

      // Get native balance
      const nativeBalance = await provider.getBalance(targetAddress);

      // Get token balances (implement token contract interactions)
      const tokenBalances = await this.getTokenBalances(network, targetAddress);

      const balance: WalletBalance = {
        network,
        address: targetAddress,
        native: nativeBalance.toString(),
        tokens: tokenBalances,
        lastUpdated: new Date()
      };

      this._balances.set(network, balance);

      return { success: true, data: balance };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new WalletError(String(error), 'BALANCE_ERROR', network)
      };
    }
  }

  public async refreshAllBalances(): AsyncResult<Record<NetworkType, WalletBalance>> {
    try {
      const balances: Partial<Record<NetworkType, WalletBalance>> = {};

      for (const network of this.supportedNetworks) {
        const balanceResult = await this.getBalance(network);
        if (balanceResult.success && balanceResult.data) {
          balances[network] = balanceResult.data;
        }
      }

      return { success: true, data: balances as Record<NetworkType, WalletBalance> };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new WalletError(String(error), 'REFRESH_BALANCES_ERROR')
      };
    }
  }

  // Transaction Management
  public async sendTransaction(
    network: NetworkType,
    to: string,
    value: string,
    data?: string,
    gasOverride?: { gasPrice?: string; gasLimit?: string }
  ): AsyncResult<Transaction> {
    try {
      this.validateNetwork(network);
      this.validateAddress(to);

      const wallet = this._wallets.get(network);
      if (!wallet) {
        throw new WalletError(`Wallet not available for ${network}`, 'NO_WALLET', network);
      }

      // Check balance
      const balanceResult = await this.getBalance(network);
      if (!balanceResult.success || !balanceResult.data) {
        throw balanceResult.error || new WalletError('Failed to get balance', 'BALANCE_ERROR', network);
      }

      const balance = balanceResult.data;
      if (BigInt(balance.native) < BigInt(value)) {
        throw new InsufficientFundsError(value, balance.native, network);
      }

      // Prepare transaction
      const tx: ethers.TransactionRequest = {
        to,
        value,
        data: data || '0x'
      };

      // Estimate gas if not provided
      if (!gasOverride?.gasLimit) {
        try {
          const estimatedGas = await wallet.estimateGas(tx);
          tx.gasLimit = estimatedGas;
        } catch (error) {
          throw new GasEstimationError(
            `Gas estimation failed: ${error}`,
            network,
            gasOverride?.gasLimit
          );
        }
      } else {
        tx.gasLimit = gasOverride.gasLimit;
      }

      // Set gas price
      if (gasOverride?.gasPrice) {
        tx.gasPrice = gasOverride.gasPrice;
      } else {
        const feeData = await wallet.provider!.getFeeData();
        tx.gasPrice = feeData.gasPrice;
      }

      // Send transaction
      const txResponse = await wallet.sendTransaction(tx);

      const transaction: Transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        network,
        hash: txResponse.hash,
        from: wallet.address,
        to,
        value,
        gasPrice: tx.gasPrice?.toString(),
        gasLimit: tx.gasLimit?.toString(),
        data: tx.data,
        status: TransactionStatus.PENDING,
        timestamp: new Date(),
        confirmations: 0
      };

      this._transactions.set(transaction.id, transaction);

      // Monitor transaction
      this.monitorTransaction(transaction.id, txResponse);

      this.emit('transaction_sent', {
        transactionId: transaction.id,
        hash: txResponse.hash,
        network,
        agentId: this._agentId
      });

      return { success: true, data: transaction };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new TransactionError(String(error), undefined, network)
      };
    }
  }

  // Multi-Sig Operations
  public async createMultiSigTransaction(
    network: NetworkType,
    to: string,
    value: string,
    data: string = '0x'
  ): AsyncResult<MultiSigTransaction> {
    try {
      this.validateNetwork(network);
      this.validateAddress(to);

      const multiSigContract = this._multiSigContracts.get(network);
      if (!multiSigContract) {
        throw new MultiSigError(
          'Multi-sig contract not available for network',
          this._config.multiSigConfig.threshold,
          0
        );
      }

      const nonce = await multiSigContract.nonce();

      const multiSigTx: MultiSigTransaction = {
        id: `multisig_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        contractAddress: await multiSigContract.getAddress(),
        network,
        to,
        value,
        data,
        nonce: Number(nonce),
        signatures: [],
        threshold: this._config.multiSigConfig.threshold,
        status: MultiSigStatus.PENDING,
        createdAt: new Date()
      };

      this._multiSigTransactions.set(multiSigTx.id, multiSigTx);

      this.emit('multisig_transaction_created', {
        transactionId: multiSigTx.id,
        network,
        agentId: this._agentId
      });

      return { success: true, data: multiSigTx };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MultiSigError(String(error), 0, 0)
      };
    }
  }

  public async signMultiSigTransaction(transactionId: string, privateKey: string): AsyncResult<Signature> {
    try {
      const multiSigTx = this._multiSigTransactions.get(transactionId);
      if (!multiSigTx) {
        throw new MultiSigError('Multi-sig transaction not found', 0, 0);
      }

      const wallet = new ethers.Wallet(privateKey);
      const signer = wallet.address;

      // Check if already signed
      const existingSignature = multiSigTx.signatures.find(sig => sig.signer === signer);
      if (existingSignature) {
        return { success: true, data: existingSignature };
      }

      // Create signature hash
      const messageHash = this.createMultiSigHash(multiSigTx);
      const signature = await wallet.signMessage(ethers.getBytes(messageHash));

      const newSignature: Signature = {
        signer,
        signature,
        signedAt: new Date()
      };

      // Update transaction
      const updatedTx: MultiSigTransaction = {
        ...multiSigTx,
        signatures: [...multiSigTx.signatures, newSignature],
        status: multiSigTx.signatures.length + 1 >= multiSigTx.threshold
          ? MultiSigStatus.READY
          : MultiSigStatus.PENDING
      };

      this._multiSigTransactions.set(transactionId, updatedTx);

      this.emit('multisig_transaction_signed', {
        transactionId,
        signer,
        signaturesCount: updatedTx.signatures.length,
        threshold: updatedTx.threshold,
        agentId: this._agentId
      });

      return { success: true, data: newSignature };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MultiSigError(String(error), 0, 0)
      };
    }
  }

  public async executeMultiSigTransaction(transactionId: string): AsyncResult<Transaction> {
    try {
      const multiSigTx = this._multiSigTransactions.get(transactionId);
      if (!multiSigTx) {
        throw new MultiSigError('Multi-sig transaction not found', 0, 0);
      }

      if (multiSigTx.status !== MultiSigStatus.READY) {
        throw new MultiSigError(
          'Not enough signatures to execute transaction',
          multiSigTx.threshold,
          multiSigTx.signatures.length
        );
      }

      const multiSigContract = this._multiSigContracts.get(multiSigTx.network);
      if (!multiSigContract) {
        throw new MultiSigError('Multi-sig contract not available', 0, 0);
      }

      // Execute the transaction
      const txResponse = await multiSigContract.executeTransaction(
        multiSigTx.to,
        multiSigTx.value,
        multiSigTx.data,
        multiSigTx.signatures.map(sig => sig.signature)
      );

      const transaction: Transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        network: multiSigTx.network,
        hash: txResponse.hash,
        from: await multiSigContract.getAddress(),
        to: multiSigTx.to,
        value: multiSigTx.value,
        data: multiSigTx.data,
        status: TransactionStatus.PENDING,
        timestamp: new Date(),
        confirmations: 0
      };

      this._transactions.set(transaction.id, transaction);

      // Update multi-sig transaction
      const updatedMultiSigTx: MultiSigTransaction = {
        ...multiSigTx,
        status: MultiSigStatus.EXECUTED,
        executedAt: new Date()
      };

      this._multiSigTransactions.set(transactionId, updatedMultiSigTx);

      // Monitor transaction
      this.monitorTransaction(transaction.id, txResponse);

      this.emit('multisig_transaction_executed', {
        transactionId,
        executionTxId: transaction.id,
        hash: txResponse.hash,
        agentId: this._agentId
      });

      return { success: true, data: transaction };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MultiSigError(String(error), 0, 0)
      };
    }
  }

  // Trading Operations
  public async createTradeOrder(
    exchange: ExchangeType,
    network: NetworkType,
    type: TradeType,
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    slippageTolerance?: number
  ): AsyncResult<TradeOrder> {
    try {
      this.validateNetwork(network);
      this.validateAddress(tokenIn);
      this.validateAddress(tokenOut);

      if (!this._config.tradingConfig.enabledExchanges.includes(exchange)) {
        throw new TradingError(
          `Exchange ${exchange} is not enabled`,
          'EXCHANGE_NOT_ENABLED',
          exchange
        );
      }

      const effectiveSlippage = slippageTolerance || this._config.tradingConfig.slippageTolerance;

      // Get quote for the trade
      const quote = await this.getTradeQuote(exchange, network, tokenIn, tokenOut, amountIn);

      const order: TradeOrder = {
        id: `order_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        exchange,
        network,
        type,
        tokenIn,
        tokenOut,
        amountIn,
        amountOutMin: this.calculateMinAmountOut(quote.amountOut, effectiveSlippage),
        slippageTolerance: effectiveSlippage,
        deadline: new Date(Date.now() + 20 * 60 * 1000), // 20 minutes
        status: TradeStatus.CREATED,
        createdAt: new Date()
      };

      this._tradeOrders.set(order.id, order);

      this.emit('trade_order_created', {
        orderId: order.id,
        exchange,
        type,
        agentId: this._agentId
      });

      return { success: true, data: order };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new TradingError(String(error), 'TRADE_ORDER_ERROR', exchange)
      };
    }
  }

  public async executeTradeOrder(orderId: string): AsyncResult<Transaction> {
    try {
      const order = this._tradeOrders.get(orderId);
      if (!order) {
        throw new TradingError('Trade order not found', 'ORDER_NOT_FOUND');
      }

      if (order.status !== TradeStatus.CREATED) {
        throw new TradingError(
          `Cannot execute order in status ${order.status}`,
          'INVALID_ORDER_STATUS',
          order.exchange
        );
      }

      if (new Date() > order.deadline) {
        throw new TradingError('Trade order has expired', 'ORDER_EXPIRED', order.exchange);
      }

      // Check trading limits
      if (BigInt(order.amountIn) > BigInt(this._config.tradingConfig.tradingLimits.maxTradeSize)) {
        throw new TradingError(
          'Trade amount exceeds maximum trade size',
          'TRADE_LIMIT_EXCEEDED',
          order.exchange
        );
      }

      // Update order status
      const updatedOrder: TradeOrder = {
        ...order,
        status: TradeStatus.PENDING
      };
      this._tradeOrders.set(orderId, updatedOrder);

      // Execute trade based on exchange
      const txResult = await this.executeExchangeTrade(order);

      if (!txResult.success || !txResult.data) {
        throw txResult.error || new TradingError('Failed to execute trade', 'EXECUTION_ERROR', order.exchange);
      }

      // Update order with execution details
      const finalOrder: TradeOrder = {
        ...updatedOrder,
        status: TradeStatus.EXECUTED,
        executedAt: new Date(),
        txHash: txResult.data.hash
      };
      this._tradeOrders.set(orderId, finalOrder);

      this.emit('trade_order_executed', {
        orderId,
        txHash: txResult.data.hash,
        exchange: order.exchange,
        agentId: this._agentId
      });

      return txResult;
    } catch (error) {
      // Update order status to failed
      const order = this._tradeOrders.get(orderId);
      if (order) {
        this._tradeOrders.set(orderId, { ...order, status: TradeStatus.FAILED });
      }

      return {
        success: false,
        error: error instanceof Error ? error : new TradingError(String(error), 'TRADE_EXECUTION_ERROR')
      };
    }
  }

  // Serialization
  public serialize(): string {
    const serializable = {
      agentId: this._agentId,
      config: this._config,
      balances: Array.from(this._balances.entries()),
      transactions: Array.from(this._transactions.entries()),
      tradeOrders: Array.from(this._tradeOrders.entries()),
      multiSigTransactions: Array.from(this._multiSigTransactions.entries()),
      isInitialized: this._isInitialized
    };

    return JSON.stringify(serializable, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });
  }

  public deserialize(data: string): EconomicWallet {
    throw new Error('Use EconomicWallet.fromSerialized() instead');
  }

  public static fromSerialized(data: string): EconomicWallet {
    const parsed = JSON.parse(data);

    const wallet = new EconomicWallet(parsed.config, parsed.agentId);

    // Restore state
    for (const [network, balance] of parsed.balances) {
      wallet._balances.set(network, balance);
    }

    for (const [id, transaction] of parsed.transactions) {
      wallet._transactions.set(id, transaction);
    }

    for (const [id, order] of parsed.tradeOrders) {
      wallet._tradeOrders.set(id, order);
    }

    for (const [id, multiSigTx] of parsed.multiSigTransactions) {
      wallet._multiSigTransactions.set(id, multiSigTx);
    }

    (wallet as any)._isInitialized = parsed.isInitialized;

    return wallet;
  }

  // Private Methods
  private async initializeNetwork(network: NetworkType, config: NetworkConfig): Promise<void> {
    try {
      // Create provider
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
        chainId: config.chainId,
        name: config.name
      });

      // Test connection
      await provider.getNetwork();

      this._providers.set(network, provider);

      // Create wallet if private key is available (would be injected securely)
      // For now, we'll create a random wallet for demonstration
      const wallet = ethers.Wallet.createRandom().connect(provider);
      this._wallets.set(network, wallet);

      this.emit('network_initialized', { network, address: wallet.address, agentId: this._agentId });
    } catch (error) {
      throw new NetworkConnectionError(
        `Failed to initialize network ${network}: ${error}`,
        network,
        config.rpcUrl
      );
    }
  }

  private async initializeMultiSigContracts(): Promise<void> {
    if (!this._config.multiSigConfig.contractAddress) {
      return; // Multi-sig not configured
    }

    // Initialize multi-sig contracts for each network
    for (const network of this.supportedNetworks) {
      const provider = this._providers.get(network);
      const wallet = this._wallets.get(network);

      if (provider && wallet) {
        // Create contract instance (ABI would be imported)
        const multiSigContract = new ethers.Contract(
          this._config.multiSigConfig.contractAddress,
          [], // Multi-sig ABI would go here
          wallet
        );

        this._multiSigContracts.set(network, multiSigContract);
      }
    }
  }

  private async getTokenBalances(network: NetworkType, address: string): Promise<Record<string, string>> {
    // Implement token balance fetching
    // This would interact with ERC-20 contracts
    return {};
  }

  private getWalletAddress(network: NetworkType): string | undefined {
    return this._wallets.get(network)?.address;
  }

  private async monitorTransaction(transactionId: string, txResponse: ethers.TransactionResponse): Promise<void> {
    try {
      const receipt = await txResponse.wait();

      const transaction = this._transactions.get(transactionId);
      if (transaction) {
        const updatedTx: Transaction = {
          ...transaction,
          status: receipt ? TransactionStatus.CONFIRMED : TransactionStatus.FAILED,
          confirmations: receipt?.confirmations || 0,
          receipt: receipt || undefined
        };

        this._transactions.set(transactionId, updatedTx);

        this.emit('transaction_confirmed', {
          transactionId,
          status: updatedTx.status,
          confirmations: updatedTx.confirmations,
          agentId: this._agentId
        });
      }
    } catch (error) {
      const transaction = this._transactions.get(transactionId);
      if (transaction) {
        this._transactions.set(transactionId, {
          ...transaction,
          status: TransactionStatus.FAILED
        });
      }

      this.emit('transaction_failed', {
        transactionId,
        error: error instanceof Error ? error.message : String(error),
        agentId: this._agentId
      });
    }
  }

  private createMultiSigHash(multiSigTx: MultiSigTransaction): string {
    // Create deterministic hash for multi-sig transaction
    const data = `${multiSigTx.contractAddress}${multiSigTx.to}${multiSigTx.value}${multiSigTx.data}${multiSigTx.nonce}`;
    return ethers.keccak256(ethers.toUtf8Bytes(data));
  }

  private async getTradeQuote(
    exchange: ExchangeType,
    network: NetworkType,
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<{ amountOut: string; priceImpact: number }> {
    // Implement exchange-specific quote fetching
    // This would interact with DEX aggregators or direct exchange APIs
    return {
      amountOut: (BigInt(amountIn) * BigInt(95) / BigInt(100)).toString(), // Simulate 5% price impact
      priceImpact: 5.0
    };
  }

  private calculateMinAmountOut(amountOut: string, slippageTolerance: number): string {
    const slippageMultiplier = (100 - slippageTolerance) / 100;
    return (BigInt(amountOut) * BigInt(Math.floor(slippageMultiplier * 100)) / BigInt(100)).toString();
  }

  private async executeExchangeTrade(order: TradeOrder): AsyncResult<Transaction> {
    // Implement exchange-specific trade execution
    switch (order.exchange) {
      case ExchangeType.UNISWAP_V3:
        return this.executeUniswapTrade(order);
      case ExchangeType.SUSHISWAP:
        return this.executeSushiswapTrade(order);
      default:
        throw new TradingError(`Exchange ${order.exchange} not implemented`, 'NOT_IMPLEMENTED', order.exchange);
    }
  }

  private async executeUniswapTrade(order: TradeOrder): AsyncResult<Transaction> {
    // Implement Uniswap V3 trade execution
    // This would interact with Uniswap router contracts
    return {
      success: false,
      error: new TradingError('Uniswap integration not implemented', 'NOT_IMPLEMENTED', order.exchange)
    };
  }

  private async executeSushiswapTrade(order: TradeOrder): AsyncResult<Transaction> {
    // Implement Sushiswap trade execution
    return {
      success: false,
      error: new TradingError('Sushiswap integration not implemented', 'NOT_IMPLEMENTED', order.exchange)
    };
  }

  private validateNetwork(network: NetworkType): void {
    if (!this.supportedNetworks.includes(network)) {
      throw new ValidationError('Unsupported network', 'network', network, 'supported_network');
    }
  }

  private validateAddress(address: string): void {
    if (!ethers.isAddress(address)) {
      throw new ValidationError('Invalid Ethereum address', 'address', address, 'valid_address');
    }
  }

  private validateConfiguration(config: WalletConfig): void {
    if (!config) {
      throw new ValidationError('Wallet configuration is required', 'config', config, 'not_null');
    }

    if (!config.networkConfigs || Object.keys(config.networkConfigs).length === 0) {
      throw new ValidationError('Network configurations are required', 'config.networkConfigs', config.networkConfigs, 'not_empty');
    }

    if (config.multiSigConfig.threshold < 1) {
      throw new ValidationError('Multi-sig threshold must be at least 1', 'config.multiSigConfig.threshold', config.multiSigConfig.threshold, 'gte_1');
    }

    if (config.multiSigConfig.threshold > config.multiSigConfig.signers.length) {
      throw new ValidationError('Multi-sig threshold cannot exceed number of signers', 'config.multiSigConfig.threshold', config.multiSigConfig.threshold, 'lte_signers');
    }
  }
}