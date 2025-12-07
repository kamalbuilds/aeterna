// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IEconomics - Economic System Interface for AETERNA Protocol
 * @notice Defines economic functions including bonding curves, staking, and autonomous trading
 * @dev Implements DeFi mechanisms for agent economic activities
 * @custom:version 1.0.0
 * @custom:author AETERNA Protocol Team
 */
interface IEconomics {
    // ============ EVENTS ============

    /**
     * @dev Emitted when tokens are bonded to an agent
     * @param agentId Agent receiving the bonding
     * @param bonder Address performing the bonding
     * @param amount Amount of tokens bonded
     * @param totalBonded New total bonded amount
     * @param price Price paid per token
     */
    event TokensBonded(
        uint256 indexed agentId,
        address indexed bonder,
        uint256 amount,
        uint256 totalBonded,
        uint256 price
    );

    /**
     * @dev Emitted when tokens are unbonded from an agent
     * @param agentId Agent losing the bonding
     * @param unbonder Address performing the unbonding
     * @param amount Amount of tokens unbonded
     * @param totalBonded New total bonded amount
     * @param payout Amount paid out to unbonder
     */
    event TokensUnbonded(
        uint256 indexed agentId,
        address indexed unbonder,
        uint256 amount,
        uint256 totalBonded,
        uint256 payout
    );

    /**
     * @dev Emitted when staking rewards are distributed
     * @param agentId Agent earning rewards
     * @param stakeholder Address of stakeholder
     * @param reward Amount of reward distributed
     * @param rewardType Type of reward (performance, time, etc.)
     */
    event RewardDistributed(
        uint256 indexed agentId,
        address indexed stakeholder,
        uint256 reward,
        RewardType rewardType
    );

    /**
     * @dev Emitted when an autonomous trade is executed
     * @param agentId Agent executing the trade
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Input amount
     * @param amountOut Output amount
     * @param strategy Trading strategy used
     */
    event TradeExecuted(
        uint256 indexed agentId,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        string strategy
    );

    /**
     * @dev Emitted when economic parameters are updated
     * @param parameter Parameter name
     * @param oldValue Previous value
     * @param newValue New value
     * @param updatedBy Address performing the update
     */
    event ParameterUpdated(
        string parameter,
        uint256 oldValue,
        uint256 newValue,
        address indexed updatedBy
    );

    /**
     * @dev Emitted when a liquidity pool is created for an agent
     * @param agentId Agent identifier
     * @param poolAddress Address of the created pool
     * @param initialLiquidity Initial liquidity provided
     * @param creator Address creating the pool
     */
    event PoolCreated(
        uint256 indexed agentId,
        address indexed poolAddress,
        uint256 initialLiquidity,
        address indexed creator
    );

    /**
     * @dev Emitted when economic metrics are updated
     * @param agentId Agent identifier
     * @param totalValue Total economic value
     * @param marketCap Market capitalization
     * @param tradingVolume 24h trading volume
     */
    event MetricsUpdated(
        uint256 indexed agentId,
        uint256 totalValue,
        uint256 marketCap,
        uint256 tradingVolume
    );

    // ============ ENUMS ============

    /**
     * @dev Types of economic rewards
     */
    enum RewardType {
        Performance,    // Based on agent performance metrics
        Staking,       // Time-based staking rewards
        Trading,       // Successful trading profits
        Governance,    // Governance participation
        Referral       // Referral bonuses
    }

    /**
     * @dev Bonding curve types
     */
    enum CurveType {
        Linear,        // Linear price increase
        Exponential,   // Exponential price increase
        Logarithmic,   // Logarithmic price increase
        Sigmoid,       // S-curve pricing
        Custom         // Custom mathematical formula
    }

    /**
     * @dev Trading strategies for autonomous agents
     */
    enum TradingStrategy {
        Conservative,  // Low risk, steady returns
        Moderate,      // Balanced risk/reward
        Aggressive,    // High risk, high reward
        Arbitrage,     // Cross-market arbitrage
        DCA,          // Dollar cost averaging
        Custom        // Custom strategy
    }

    // ============ STRUCTS ============

    /**
     * @dev Bonding curve configuration
     */
    struct BondingCurve {
        CurveType curveType;           // Type of curve
        uint256 basePrice;             // Base price per token
        uint256 priceMultiplier;       // Price multiplier factor
        uint256 maxSupply;             // Maximum bondable supply
        uint256 currentSupply;         // Current bonded supply
        uint256 reserveRatio;          // Reserve ratio (0-1000000)
        bytes curveParameters;         // Custom curve parameters
    }

    /**
     * @dev Economic metrics for an agent
     */
    struct EconomicMetrics {
        uint256 totalBonded;           // Total tokens bonded
        uint256 totalStaked;           // Total tokens staked
        uint256 marketCap;             // Market capitalization
        uint256 tradingVolume24h;      // 24h trading volume
        uint256 liquidityDepth;        // Total liquidity depth
        uint256 priceVolatility;       // Price volatility index
        uint256 holdersCount;          // Number of token holders
        uint256 averageHoldTime;       // Average holding time
        uint256 lastUpdated;           // Last metrics update
    }

    /**
     * @dev Staking pool information
     */
    struct StakingPool {
        uint256 agentId;               // Associated agent
        uint256 totalStaked;           // Total staked amount
        uint256 rewardRate;            // Annual percentage rate
        uint256 lockPeriod;            // Minimum lock period
        uint256 totalRewards;          // Total rewards distributed
        uint256 lastRewardUpdate;      // Last reward calculation
        bool isActive;                 // Whether pool is active
        mapping(address => uint256) stakedBalances;
        mapping(address => uint256) stakingTimestamps;
        mapping(address => uint256) pendingRewards;
    }

    /**
     * @dev Trading position
     */
    struct TradingPosition {
        uint256 agentId;               // Agent holding position
        address tokenAddress;          // Token contract address
        uint256 amount;                // Position size
        uint256 entryPrice;            // Entry price
        uint256 currentPrice;          // Current price
        TradingStrategy strategy;      // Trading strategy
        uint256 openedAt;              // When position was opened
        bool isLong;                   // Long (true) or short (false)
        uint256 stopLoss;              // Stop loss price
        uint256 takeProfit;            // Take profit price
    }

    /**
     * @dev Treasury information
     */
    struct Treasury {
        uint256 agentId;               // Associated agent
        mapping(address => uint256) balances;  // Token balances
        uint256 totalValue;            // Total USD value
        uint256 lastValuation;         // Last valuation timestamp
        address[] allowedTokens;       // Whitelisted tokens
        mapping(address => bool) isTokenAllowed;
    }

    // ============ BONDING CURVE FUNCTIONS ============

    /**
     * @notice Get current bond price for an agent
     * @param agentId Agent identifier
     * @param amount Amount to bond
     * @return price Total price for bonding the amount
     * @return pricePerToken Price per individual token
     */
    function getBondPrice(uint256 agentId, uint256 amount)
        external view returns (uint256 price, uint256 pricePerToken);

    /**
     * @notice Bond tokens to an agent
     * @param agentId Agent to bond to
     * @param amount Amount to bond
     * @param maxPrice Maximum price willing to pay
     * @return totalCost Total cost of bonding
     */
    function bondTokens(uint256 agentId, uint256 amount, uint256 maxPrice)
        external payable returns (uint256 totalCost);

    /**
     * @notice Unbond tokens from an agent
     * @param agentId Agent to unbond from
     * @param amount Amount to unbond
     * @param minPayout Minimum payout expected
     * @return payout Amount received from unbonding
     */
    function unbondTokens(uint256 agentId, uint256 amount, uint256 minPayout)
        external returns (uint256 payout);

    /**
     * @notice Configure bonding curve for an agent
     * @param agentId Agent identifier
     * @param curveConfig Bonding curve configuration
     */
    function configureBondingCurve(uint256 agentId, BondingCurve calldata curveConfig) external;

    // ============ STAKING FUNCTIONS ============

    /**
     * @notice Stake tokens for an agent
     * @param agentId Agent to stake for
     * @param amount Amount to stake
     * @param lockPeriod Lock period in seconds
     * @return stakingId Unique staking position identifier
     */
    function stake(uint256 agentId, uint256 amount, uint256 lockPeriod)
        external returns (uint256 stakingId);

    /**
     * @notice Unstake tokens
     * @param stakingId Staking position identifier
     * @return amount Amount unstaked
     * @return rewards Rewards claimed
     */
    function unstake(uint256 stakingId) external returns (uint256 amount, uint256 rewards);

    /**
     * @notice Claim staking rewards
     * @param agentId Agent identifier
     * @return rewards Amount of rewards claimed
     */
    function claimRewards(uint256 agentId) external returns (uint256 rewards);

    /**
     * @notice Get pending rewards for a staker
     * @param agentId Agent identifier
     * @param staker Staker address
     * @return rewards Pending reward amount
     */
    function getPendingRewards(uint256 agentId, address staker)
        external view returns (uint256 rewards);

    // ============ AUTONOMOUS TRADING FUNCTIONS ============

    /**
     * @notice Execute autonomous trade
     * @param agentId Agent executing the trade
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Input amount
     * @param strategy Trading strategy to use
     * @param slippage Maximum allowed slippage
     * @return amountOut Amount received from trade
     */
    function executeTrade(
        uint256 agentId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        TradingStrategy strategy,
        uint256 slippage
    ) external returns (uint256 amountOut);

    /**
     * @notice Set trading parameters for an agent
     * @param agentId Agent identifier
     * @param maxPositionSize Maximum position size
     * @param riskTolerance Risk tolerance level (0-100)
     * @param allowedStrategies Allowed trading strategies
     */
    function setTradingParameters(
        uint256 agentId,
        uint256 maxPositionSize,
        uint8 riskTolerance,
        TradingStrategy[] calldata allowedStrategies
    ) external;

    /**
     * @notice Get optimal trade route
     * @param tokenIn Input token
     * @param tokenOut Output token
     * @param amountIn Input amount
     * @return route Array of addresses representing the trade route
     * @return expectedOut Expected output amount
     */
    function getOptimalRoute(address tokenIn, address tokenOut, uint256 amountIn)
        external view returns (address[] memory route, uint256 expectedOut);

    // ============ LIQUIDITY FUNCTIONS ============

    /**
     * @notice Create liquidity pool for an agent
     * @param agentId Agent identifier
     * @param tokenA First token address
     * @param tokenB Second token address
     * @param amountA Amount of first token
     * @param amountB Amount of second token
     * @return poolAddress Address of created pool
     */
    function createLiquidityPool(
        uint256 agentId,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external returns (address poolAddress);

    /**
     * @notice Add liquidity to existing pool
     * @param agentId Agent identifier
     * @param poolAddress Pool address
     * @param amountA Amount of first token
     * @param amountB Amount of second token
     * @return liquidity Liquidity tokens received
     */
    function addLiquidity(
        uint256 agentId,
        address poolAddress,
        uint256 amountA,
        uint256 amountB
    ) external returns (uint256 liquidity);

    /**
     * @notice Remove liquidity from pool
     * @param agentId Agent identifier
     * @param poolAddress Pool address
     * @param liquidity Liquidity tokens to remove
     * @return amountA Amount of first token received
     * @return amountB Amount of second token received
     */
    function removeLiquidity(uint256 agentId, address poolAddress, uint256 liquidity)
        external returns (uint256 amountA, uint256 amountB);

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get economic metrics for an agent
     * @param agentId Agent identifier
     * @return metrics EconomicMetrics struct
     */
    function getEconomicMetrics(uint256 agentId) external view returns (EconomicMetrics memory);

    /**
     * @notice Get bonding curve configuration
     * @param agentId Agent identifier
     * @return curve BondingCurve struct
     */
    function getBondingCurve(uint256 agentId) external view returns (BondingCurve memory);

    /**
     * @notice Get treasury information
     * @param agentId Agent identifier
     * @return totalValue Total treasury value in USD
     * @return tokenCount Number of different tokens
     */
    function getTreasuryInfo(uint256 agentId)
        external view returns (uint256 totalValue, uint256 tokenCount);

    /**
     * @notice Get trading positions for an agent
     * @param agentId Agent identifier
     * @return positions Array of active trading positions
     */
    function getTradingPositions(uint256 agentId)
        external view returns (TradingPosition[] memory positions);

    /**
     * @notice Calculate potential returns for staking
     * @param agentId Agent identifier
     * @param amount Amount to stake
     * @param duration Staking duration in seconds
     * @return expectedReward Expected reward amount
     * @return apy Annual percentage yield
     */
    function calculateStakingReturns(uint256 agentId, uint256 amount, uint256 duration)
        external view returns (uint256 expectedReward, uint256 apy);

    // ============ GOVERNANCE FUNCTIONS ============

    /**
     * @notice Update economic parameters (governance only)
     * @param parameter Parameter name
     * @param newValue New parameter value
     */
    function updateEconomicParameter(string calldata parameter, uint256 newValue) external;

    /**
     * @notice Emergency pause trading (governance only)
     * @param agentId Agent identifier (0 = all agents)
     */
    function pauseTrading(uint256 agentId) external;

    /**
     * @notice Resume trading (governance only)
     * @param agentId Agent identifier (0 = all agents)
     */
    function resumeTrading(uint256 agentId) external;

    // ============ ANALYTICS FUNCTIONS ============

    /**
     * @notice Get market statistics
     * @return totalMarketCap Total market cap across all agents
     * @return totalVolume24h Total 24h trading volume
     * @return activeTraders Number of active traders
     */
    function getMarketStats()
        external view returns (uint256 totalMarketCap, uint256 totalVolume24h, uint256 activeTraders);

    /**
     * @notice Get top performing agents by metric
     * @param metric Metric to sort by ("marketCap", "volume", "returns")
     * @param limit Number of results to return
     * @return agentIds Array of top performing agent IDs
     * @return values Array of corresponding metric values
     */
    function getTopPerformers(string calldata metric, uint256 limit)
        external view returns (uint256[] memory agentIds, uint256[] memory values);
}