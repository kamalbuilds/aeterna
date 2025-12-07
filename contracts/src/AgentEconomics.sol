// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IEconomics.sol";
import "../interfaces/IAgent.sol";

/**
 * @title AgentEconomics - Economic System for AETERNA Protocol
 * @notice Implements bonding curves, staking, and autonomous trading for agent economies
 * @dev Gas-optimized implementation with comprehensive DeFi features
 * @custom:version 1.0.0
 * @custom:author AETERNA Protocol Team
 * @custom:security-contact security@aeterna.io
 */
contract AgentEconomics is AccessControl, ReentrancyGuard, Pausable, IEconomics {
    using SafeERC20 for IERC20;
    using Math for uint256;
    using SafeMath for uint256;

    // ============ CONSTANTS ============

    bytes32 public constant TREASURY_MANAGER_ROLE = keccak256("TREASURY_MANAGER_ROLE");
    bytes32 public constant TRADING_MANAGER_ROLE = keccak256("TRADING_MANAGER_ROLE");
    bytes32 public constant ECONOMICS_ADMIN_ROLE = keccak256("ECONOMICS_ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    uint256 public constant PRECISION = 1e18;
    uint256 public constant MAX_BONDING_SUPPLY = 1e12 * PRECISION; // 1 trillion tokens
    uint256 public constant MIN_BONDING_AMOUNT = 1e15; // 0.001 tokens
    uint256 public constant MAX_SLIPPAGE = 5000; // 50%
    uint256 public constant FEE_DENOMINATOR = 10000; // 100%
    uint256 public constant MAX_TRADING_FEE = 1000; // 10%
    uint256 public constant STAKING_PRECISION = 1e12;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    // ============ STATE VARIABLES ============

    IAgent public immutable agentRegistry;
    IERC20 public immutable baseToken; // Primary token for economics

    // Agent ID => Bonding Curve Configuration
    mapping(uint256 => BondingCurve) public bondingCurves;

    // Agent ID => Economic Metrics
    mapping(uint256 => EconomicMetrics) public agentMetrics;

    // Agent ID => Staking Pool
    mapping(uint256 => StakingPoolData) public stakingPools;

    // Stakeholder => Agent ID => Staking Info
    mapping(address => mapping(uint256 => StakingInfo)) public stakingInfo;

    // Agent ID => Trading Configuration
    mapping(uint256 => TradingConfig) public tradingConfigs;

    // Agent ID => Treasury data
    mapping(uint256 => TreasuryData) public treasuries;

    // Agent ID => Token => Balance
    mapping(uint256 => mapping(address => uint256)) public treasuryBalances;

    // Agent ID => Active trading positions
    mapping(uint256 => TradingPosition[]) public tradingPositions;

    // Global parameters
    mapping(string => uint256) public economicParameters;

    // Trading pairs configuration
    mapping(address => mapping(address => bool)) public allowedTradingPairs;

    // Price oracles
    mapping(address => address) public priceOracles;

    // ============ STRUCTS ============

    struct StakingPoolData {
        uint256 totalStaked;
        uint256 rewardRate; // Annual percentage rate (in basis points)
        uint256 lockPeriod;
        uint256 totalRewards;
        uint256 lastRewardUpdate;
        uint256 rewardPerTokenStored;
        bool isActive;
    }

    struct StakingInfo {
        uint256 stakedAmount;
        uint256 stakingTimestamp;
        uint256 pendingRewards;
        uint256 userRewardPerTokenPaid;
        uint256 lockUntil;
    }

    struct TradingConfig {
        uint256 maxPositionSize;
        uint8 riskTolerance; // 0-100
        TradingStrategy[] allowedStrategies;
        bool isActive;
        uint256 totalVolume;
        uint256 successfulTrades;
        uint256 totalTrades;
    }

    struct TreasuryData {
        uint256 totalValue; // In USD equivalent
        uint256 lastValuation;
        address[] allowedTokens;
        mapping(address => bool) isTokenAllowed;
        uint256 tokenCount;
    }

    // Gas-optimized packed struct for frequently accessed data
    struct PackedEconomicData {
        uint128 totalBonded;
        uint64 lastActivityTimestamp;
        uint32 holdersCount;
        uint32 tradingVolume24h;
    }

    mapping(uint256 => PackedEconomicData) private _packedEconomics;

    // ============ EVENTS ============

    event EconomicsInitialized(uint256 indexed agentId, address indexed creator);
    event BondingCurveConfigured(uint256 indexed agentId, CurveType curveType);
    event StakingPoolCreated(uint256 indexed agentId, uint256 rewardRate, uint256 lockPeriod);
    event TradingConfigUpdated(uint256 indexed agentId, uint256 maxPositionSize, uint8 riskTolerance);
    event TreasuryUpdated(uint256 indexed agentId, uint256 totalValue, uint256 tokenCount);
    event AutonomousTradeExecuted(
        uint256 indexed agentId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        TradingStrategy strategy
    );

    // ============ CUSTOM ERRORS ============

    error AgentNotFound(uint256 agentId);
    error InsufficientBalance(uint256 available, uint256 required);
    error InvalidBondingAmount(uint256 amount, uint256 minimum);
    error InvalidSlippage(uint256 slippage, uint256 maximum);
    error TradingNotAllowed(uint256 agentId);
    error InvalidTradingPair(address tokenA, address tokenB);
    error StakingPoolNotActive(uint256 agentId);
    error InsufficientStakingBalance(uint256 available, uint256 requested);
    error StakingLockNotExpired(uint256 lockUntil, uint256 currentTime);
    error ExcessivePositionSize(uint256 requested, uint256 maximum);
    error PriceOracleNotSet(address token);
    error InvalidCurveParameters();

    // ============ MODIFIERS ============

    modifier onlyAgentOwner(uint256 agentId) {
        if (!agentRegistry.isAuthorized(agentId, msg.sender)) {
            revert("Not authorized for agent");
        }
        _;
    }

    modifier agentExists(uint256 agentId) {
        if (!_agentExists(agentId)) {
            revert AgentNotFound(agentId);
        }
        _;
    }

    modifier validBondingAmount(uint256 amount) {
        if (amount < MIN_BONDING_AMOUNT) {
            revert InvalidBondingAmount(amount, MIN_BONDING_AMOUNT);
        }
        _;
    }

    // ============ CONSTRUCTOR ============

    constructor(
        address _agentRegistry,
        address _baseToken,
        address defaultAdmin
    ) {
        agentRegistry = IAgent(_agentRegistry);
        baseToken = IERC20(_baseToken);

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ECONOMICS_ADMIN_ROLE, defaultAdmin);
        _grantRole(TREASURY_MANAGER_ROLE, defaultAdmin);
        _grantRole(TRADING_MANAGER_ROLE, defaultAdmin);

        // Initialize default economic parameters
        economicParameters["tradingFee"] = 100; // 1%
        economicParameters["stakingFee"] = 50;  // 0.5%
        economicParameters["unbondingFee"] = 200; // 2%
        economicParameters["maxLeverage"] = 300; // 3x
        economicParameters["liquidationThreshold"] = 8000; // 80%
    }

    // ============ BONDING CURVE FUNCTIONS ============

    /**
     * @notice Get current bond price for an agent
     */
    function getBondPrice(uint256 agentId, uint256 amount)
        external view override agentExists(agentId)
        returns (uint256 price, uint256 pricePerToken)
    {
        BondingCurve memory curve = bondingCurves[agentId];
        if (curve.curveType == CurveType.Linear) {
            return _calculateLinearPrice(curve, amount);
        } else if (curve.curveType == CurveType.Exponential) {
            return _calculateExponentialPrice(curve, amount);
        } else if (curve.curveType == CurveType.Logarithmic) {
            return _calculateLogarithmicPrice(curve, amount);
        } else {
            return _calculateCustomPrice(curve, amount);
        }
    }

    /**
     * @notice Bond tokens to an agent
     */
    function bondTokens(uint256 agentId, uint256 amount, uint256 maxPrice)
        external payable override nonReentrant whenNotPaused agentExists(agentId) validBondingAmount(amount)
        returns (uint256 totalCost)
    {
        (uint256 price,) = this.getBondPrice(agentId, amount);
        if (price > maxPrice) {
            revert("Price exceeds maximum");
        }

        // Handle payment
        if (address(baseToken) == address(0)) {
            // ETH payment
            if (msg.value < price) {
                revert InsufficientBalance(msg.value, price);
            }
            totalCost = price;

            // Refund excess
            if (msg.value > price) {
                payable(msg.sender).transfer(msg.value - price);
            }
        } else {
            // ERC20 payment
            baseToken.safeTransferFrom(msg.sender, address(this), price);
            totalCost = price;
        }

        // Update bonding curve
        BondingCurve storage curve = bondingCurves[agentId];
        curve.currentSupply += amount;

        // Update metrics
        EconomicMetrics storage metrics = agentMetrics[agentId];
        metrics.totalBonded += amount;
        metrics.holdersCount = _updateHoldersCount(agentId, msg.sender, true);
        metrics.lastUpdated = block.timestamp;

        // Update packed data
        PackedEconomicData storage packed = _packedEconomics[agentId];
        packed.totalBonded = uint128(metrics.totalBonded);
        packed.lastActivityTimestamp = uint64(block.timestamp);
        packed.holdersCount = uint32(metrics.holdersCount);

        emit TokensBonded(agentId, msg.sender, amount, metrics.totalBonded, price);
    }

    /**
     * @notice Unbond tokens from an agent
     */
    function unbondTokens(uint256 agentId, uint256 amount, uint256 minPayout)
        external override nonReentrant whenNotPaused agentExists(agentId)
        returns (uint256 payout)
    {
        // Calculate payout with unbonding fee
        uint256 feeRate = economicParameters["unbondingFee"];
        uint256 grossPayout = _calculateUnbondingPayout(agentId, amount);
        uint256 fee = grossPayout.mul(feeRate).div(FEE_DENOMINATOR);
        payout = grossPayout.sub(fee);

        if (payout < minPayout) {
            revert("Payout below minimum");
        }

        // Update bonding curve
        BondingCurve storage curve = bondingCurves[agentId];
        curve.currentSupply = curve.currentSupply.sub(amount);

        // Update metrics
        EconomicMetrics storage metrics = agentMetrics[agentId];
        metrics.totalBonded = metrics.totalBonded.sub(amount);
        metrics.lastUpdated = block.timestamp;

        // Transfer payout
        if (address(baseToken) == address(0)) {
            payable(msg.sender).transfer(payout);
        } else {
            baseToken.safeTransfer(msg.sender, payout);
        }

        emit TokensUnbonded(agentId, msg.sender, amount, metrics.totalBonded, payout);
    }

    /**
     * @notice Configure bonding curve for an agent
     */
    function configureBondingCurve(uint256 agentId, BondingCurve calldata curveConfig)
        external override agentExists(agentId) onlyAgentOwner(agentId)
    {
        if (curveConfig.maxSupply > MAX_BONDING_SUPPLY || curveConfig.basePrice == 0) {
            revert InvalidCurveParameters();
        }

        bondingCurves[agentId] = curveConfig;
        emit BondingCurveConfigured(agentId, curveConfig.curveType);
    }

    // ============ STAKING FUNCTIONS ============

    /**
     * @notice Stake tokens for an agent
     */
    function stake(uint256 agentId, uint256 amount, uint256 lockPeriod)
        external override nonReentrant whenNotPaused agentExists(agentId)
        returns (uint256 stakingId)
    {
        StakingPoolData storage pool = stakingPools[agentId];
        if (!pool.isActive) {
            revert StakingPoolNotActive(agentId);
        }

        // Transfer tokens
        baseToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update pool metrics
        _updateStakingRewards(agentId);

        // Update user staking info
        StakingInfo storage userStaking = stakingInfo[msg.sender][agentId];
        userStaking.pendingRewards = _calculateStakingRewards(msg.sender, agentId);
        userStaking.stakedAmount = userStaking.stakedAmount.add(amount);
        userStaking.stakingTimestamp = block.timestamp;
        userStaking.lockUntil = block.timestamp.add(lockPeriod);
        userStaking.userRewardPerTokenPaid = pool.rewardPerTokenStored;

        // Update pool totals
        pool.totalStaked = pool.totalStaked.add(amount);

        stakingId = uint256(keccak256(abi.encodePacked(msg.sender, agentId, block.timestamp)));

        emit RewardDistributed(agentId, msg.sender, 0, RewardType.Staking);
    }

    /**
     * @notice Unstake tokens
     */
    function unstake(uint256 stakingId)
        external override nonReentrant whenNotPaused
        returns (uint256 amount, uint256 rewards)
    {
        // Extract agent ID from staking ID (simplified for demo)
        uint256 agentId = 1; // This should be derived from stakingId in practice

        StakingInfo storage userStaking = stakingInfo[msg.sender][agentId];
        if (userStaking.stakedAmount == 0) {
            revert InsufficientStakingBalance(0, 1);
        }

        if (block.timestamp < userStaking.lockUntil) {
            revert StakingLockNotExpired(userStaking.lockUntil, block.timestamp);
        }

        // Calculate rewards
        _updateStakingRewards(agentId);
        rewards = _calculateStakingRewards(msg.sender, agentId);

        // Get staked amount
        amount = userStaking.stakedAmount;

        // Update pool
        StakingPoolData storage pool = stakingPools[agentId];
        pool.totalStaked = pool.totalStaked.sub(amount);

        // Reset user staking
        delete stakingInfo[msg.sender][agentId];

        // Transfer tokens and rewards
        baseToken.safeTransfer(msg.sender, amount.add(rewards));

        emit RewardDistributed(agentId, msg.sender, rewards, RewardType.Staking);
    }

    /**
     * @notice Claim staking rewards
     */
    function claimRewards(uint256 agentId)
        external override nonReentrant whenNotPaused agentExists(agentId)
        returns (uint256 rewards)
    {
        _updateStakingRewards(agentId);
        rewards = _calculateStakingRewards(msg.sender, agentId);

        if (rewards > 0) {
            stakingInfo[msg.sender][agentId].pendingRewards = 0;
            stakingInfo[msg.sender][agentId].userRewardPerTokenPaid = stakingPools[agentId].rewardPerTokenStored;

            baseToken.safeTransfer(msg.sender, rewards);
            emit RewardDistributed(agentId, msg.sender, rewards, RewardType.Performance);
        }
    }

    /**
     * @notice Get pending rewards for a staker
     */
    function getPendingRewards(uint256 agentId, address staker)
        external view override agentExists(agentId)
        returns (uint256 rewards)
    {
        return _calculateStakingRewards(staker, agentId);
    }

    // ============ TRADING FUNCTIONS ============

    /**
     * @notice Execute autonomous trade
     */
    function executeTrade(
        uint256 agentId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        TradingStrategy strategy,
        uint256 slippage
    ) external override nonReentrant whenNotPaused agentExists(agentId) onlyRole(TRADING_MANAGER_ROLE)
        returns (uint256 amountOut)
    {
        if (slippage > MAX_SLIPPAGE) {
            revert InvalidSlippage(slippage, MAX_SLIPPAGE);
        }

        TradingConfig storage config = tradingConfigs[agentId];
        if (!config.isActive) {
            revert TradingNotAllowed(agentId);
        }

        if (!allowedTradingPairs[tokenIn][tokenOut]) {
            revert InvalidTradingPair(tokenIn, tokenOut);
        }

        // Check position size limits
        uint256 positionValue = _getTokenValue(tokenIn, amountIn);
        if (positionValue > config.maxPositionSize) {
            revert ExcessivePositionSize(positionValue, config.maxPositionSize);
        }

        // Execute trade (simplified - in practice would integrate with DEX)
        amountOut = _simulateTrade(tokenIn, tokenOut, amountIn, slippage);

        // Update trading metrics
        config.totalVolume = config.totalVolume.add(positionValue);
        config.totalTrades = config.totalTrades.add(1);

        // Update economic metrics
        EconomicMetrics storage metrics = agentMetrics[agentId];
        metrics.tradingVolume24h = metrics.tradingVolume24h.add(positionValue);
        metrics.lastUpdated = block.timestamp;

        emit TradeExecuted(agentId, tokenIn, tokenOut, amountIn, amountOut, _strategyToString(strategy));
        emit AutonomousTradeExecuted(agentId, tokenIn, tokenOut, amountIn, amountOut, strategy);
    }

    /**
     * @notice Set trading parameters for an agent
     */
    function setTradingParameters(
        uint256 agentId,
        uint256 maxPositionSize,
        uint8 riskTolerance,
        TradingStrategy[] calldata allowedStrategies
    ) external override agentExists(agentId) onlyAgentOwner(agentId) {
        if (riskTolerance > 100) {
            revert("Invalid risk tolerance");
        }

        TradingConfig storage config = tradingConfigs[agentId];
        config.maxPositionSize = maxPositionSize;
        config.riskTolerance = riskTolerance;
        delete config.allowedStrategies;

        for (uint256 i = 0; i < allowedStrategies.length; i++) {
            config.allowedStrategies.push(allowedStrategies[i]);
        }
        config.isActive = true;

        emit TradingConfigUpdated(agentId, maxPositionSize, riskTolerance);
    }

    /**
     * @notice Get optimal trade route (simplified implementation)
     */
    function getOptimalRoute(address tokenIn, address tokenOut, uint256 amountIn)
        external view override
        returns (address[] memory route, uint256 expectedOut)
    {
        route = new address[](2);
        route[0] = tokenIn;
        route[1] = tokenOut;

        // Simplified calculation - in practice would query multiple DEXes
        expectedOut = _simulateTrade(tokenIn, tokenOut, amountIn, 100); // 1% slippage
    }

    // ============ LIQUIDITY FUNCTIONS ============

    /**
     * @notice Create liquidity pool for an agent (simplified)
     */
    function createLiquidityPool(
        uint256 agentId,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external override agentExists(agentId) onlyAgentOwner(agentId) returns (address poolAddress) {
        // Simplified implementation - in practice would deploy actual pool contract
        poolAddress = address(uint160(uint256(keccak256(abi.encodePacked(agentId, tokenA, tokenB, block.timestamp)))));
        emit PoolCreated(agentId, poolAddress, amountA.add(amountB), msg.sender);
    }

    /**
     * @notice Add liquidity to existing pool (simplified)
     */
    function addLiquidity(
        uint256 agentId,
        address poolAddress,
        uint256 amountA,
        uint256 amountB
    ) external override agentExists(agentId) onlyAgentOwner(agentId) returns (uint256 liquidity) {
        // Simplified calculation
        liquidity = Math.sqrt(amountA.mul(amountB));
    }

    /**
     * @notice Remove liquidity from pool (simplified)
     */
    function removeLiquidity(uint256 agentId, address poolAddress, uint256 liquidity)
        external override agentExists(agentId) onlyAgentOwner(agentId)
        returns (uint256 amountA, uint256 amountB)
    {
        // Simplified calculation
        amountA = liquidity.div(2);
        amountB = liquidity.div(2);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get economic metrics for an agent
     */
    function getEconomicMetrics(uint256 agentId)
        external view override agentExists(agentId)
        returns (EconomicMetrics memory)
    {
        return agentMetrics[agentId];
    }

    /**
     * @notice Get bonding curve configuration
     */
    function getBondingCurve(uint256 agentId)
        external view override agentExists(agentId)
        returns (BondingCurve memory)
    {
        return bondingCurves[agentId];
    }

    /**
     * @notice Get treasury information
     */
    function getTreasuryInfo(uint256 agentId)
        external view override agentExists(agentId)
        returns (uint256 totalValue, uint256 tokenCount)
    {
        TreasuryData storage treasury = treasuries[agentId];
        totalValue = treasury.totalValue;
        tokenCount = treasury.tokenCount;
    }

    /**
     * @notice Get trading positions for an agent
     */
    function getTradingPositions(uint256 agentId)
        external view override agentExists(agentId)
        returns (TradingPosition[] memory positions)
    {
        return tradingPositions[agentId];
    }

    /**
     * @notice Calculate potential returns for staking
     */
    function calculateStakingReturns(uint256 agentId, uint256 amount, uint256 duration)
        external view override agentExists(agentId)
        returns (uint256 expectedReward, uint256 apy)
    {
        StakingPoolData memory pool = stakingPools[agentId];
        apy = pool.rewardRate;
        expectedReward = amount.mul(apy).mul(duration).div(SECONDS_PER_YEAR).div(FEE_DENOMINATOR);
    }

    // ============ INTERNAL FUNCTIONS ============

    function _agentExists(uint256 agentId) private view returns (bool) {
        try agentRegistry.getAgentInfo(agentId) returns (IAgent.AgentInfo memory) {
            return true;
        } catch {
            return false;
        }
    }

    function _calculateLinearPrice(BondingCurve memory curve, uint256 amount)
        private pure returns (uint256 price, uint256 pricePerToken)
    {
        pricePerToken = curve.basePrice.add(curve.currentSupply.mul(curve.priceMultiplier).div(PRECISION));
        price = pricePerToken.mul(amount).div(PRECISION);
    }

    function _calculateExponentialPrice(BondingCurve memory curve, uint256 amount)
        private pure returns (uint256 price, uint256 pricePerToken)
    {
        // Simplified exponential calculation
        uint256 exponent = curve.currentSupply.mul(curve.priceMultiplier).div(PRECISION);
        pricePerToken = curve.basePrice.mul(2**exponent);
        price = pricePerToken.mul(amount).div(PRECISION);
    }

    function _calculateLogarithmicPrice(BondingCurve memory curve, uint256 amount)
        private pure returns (uint256 price, uint256 pricePerToken)
    {
        // Simplified logarithmic calculation
        uint256 logValue = curve.currentSupply.add(PRECISION); // Add 1 to avoid log(0)
        pricePerToken = curve.basePrice.add(logValue.mul(curve.priceMultiplier).div(PRECISION));
        price = pricePerToken.mul(amount).div(PRECISION);
    }

    function _calculateCustomPrice(BondingCurve memory curve, uint256 amount)
        private pure returns (uint256 price, uint256 pricePerToken)
    {
        // Placeholder for custom pricing logic
        pricePerToken = curve.basePrice;
        price = pricePerToken.mul(amount).div(PRECISION);
    }

    function _calculateUnbondingPayout(uint256 agentId, uint256 amount) private view returns (uint256) {
        BondingCurve memory curve = bondingCurves[agentId];
        // Simplified calculation - should implement proper curve mathematics
        return amount.mul(curve.basePrice).div(PRECISION);
    }

    function _updateHoldersCount(uint256 agentId, address holder, bool isNewHolder) private view returns (uint256) {
        // Simplified implementation - in practice would maintain proper holder tracking
        EconomicMetrics memory metrics = agentMetrics[agentId];
        return isNewHolder ? metrics.holdersCount + 1 : metrics.holdersCount;
    }

    function _updateStakingRewards(uint256 agentId) private {
        StakingPoolData storage pool = stakingPools[agentId];
        if (pool.totalStaked > 0) {
            uint256 timeElapsed = block.timestamp.sub(pool.lastRewardUpdate);
            uint256 rewardPerToken = timeElapsed.mul(pool.rewardRate).mul(STAKING_PRECISION).div(SECONDS_PER_YEAR).div(pool.totalStaked);
            pool.rewardPerTokenStored = pool.rewardPerTokenStored.add(rewardPerToken);
        }
        pool.lastRewardUpdate = block.timestamp;
    }

    function _calculateStakingRewards(address staker, uint256 agentId) private view returns (uint256) {
        StakingInfo memory userStaking = stakingInfo[staker][agentId];
        StakingPoolData memory pool = stakingPools[agentId];

        uint256 rewardPerTokenPaid = userStaking.userRewardPerTokenPaid;
        uint256 rewardPerTokenCurrent = pool.rewardPerTokenStored;

        return userStaking.stakedAmount
            .mul(rewardPerTokenCurrent.sub(rewardPerTokenPaid))
            .div(STAKING_PRECISION)
            .add(userStaking.pendingRewards);
    }

    function _simulateTrade(address tokenIn, address tokenOut, uint256 amountIn, uint256 slippage)
        private pure returns (uint256 amountOut)
    {
        // Simplified trade simulation - in practice would integrate with actual DEX
        amountOut = amountIn.mul(PRECISION.sub(slippage)).div(PRECISION);
    }

    function _getTokenValue(address token, uint256 amount) private view returns (uint256) {
        // Simplified token valuation - in practice would use price oracles
        return amount; // Assume 1:1 with base token for simplicity
    }

    function _strategyToString(TradingStrategy strategy) private pure returns (string memory) {
        if (strategy == TradingStrategy.Conservative) return "Conservative";
        if (strategy == TradingStrategy.Moderate) return "Moderate";
        if (strategy == TradingStrategy.Aggressive) return "Aggressive";
        if (strategy == TradingStrategy.Arbitrage) return "Arbitrage";
        if (strategy == TradingStrategy.DCA) return "DCA";
        return "Custom";
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @notice Update economic parameters (governance only)
     */
    function updateEconomicParameter(string calldata parameter, uint256 newValue)
        external override onlyRole(ECONOMICS_ADMIN_ROLE)
    {
        uint256 oldValue = economicParameters[parameter];
        economicParameters[parameter] = newValue;
        emit ParameterUpdated(parameter, oldValue, newValue, msg.sender);
    }

    /**
     * @notice Emergency pause trading (governance only)
     */
    function pauseTrading(uint256 agentId) external override onlyRole(ECONOMICS_ADMIN_ROLE) {
        if (agentId == 0) {
            // Pause all trading
            _pause();
        } else {
            // Pause specific agent trading
            tradingConfigs[agentId].isActive = false;
        }
    }

    /**
     * @notice Resume trading (governance only)
     */
    function resumeTrading(uint256 agentId) external override onlyRole(ECONOMICS_ADMIN_ROLE) {
        if (agentId == 0) {
            // Resume all trading
            _unpause();
        } else {
            // Resume specific agent trading
            tradingConfigs[agentId].isActive = true;
        }
    }

    // ============ ANALYTICS FUNCTIONS ============

    /**
     * @notice Get market statistics
     */
    function getMarketStats()
        external view override
        returns (uint256 totalMarketCap, uint256 totalVolume24h, uint256 activeTraders)
    {
        // Simplified implementation - in practice would aggregate across all agents
        totalMarketCap = 1000000 * PRECISION; // Placeholder
        totalVolume24h = 50000 * PRECISION;   // Placeholder
        activeTraders = 100;                  // Placeholder
    }

    /**
     * @notice Get top performing agents by metric
     */
    function getTopPerformers(string calldata metric, uint256 limit)
        external view override
        returns (uint256[] memory agentIds, uint256[] memory values)
    {
        // Simplified implementation - in practice would sort and return top performers
        agentIds = new uint256[](limit);
        values = new uint256[](limit);

        for (uint256 i = 0; i < limit; i++) {
            agentIds[i] = i + 1;
            values[i] = 1000 * PRECISION; // Placeholder values
        }
    }
}