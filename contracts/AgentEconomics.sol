// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IAgentEconomics.sol";
import "./interfaces/IAgentIdentity.sol";

/**
 * @title AgentEconomics
 * @dev Implementation of autonomous economic operations for AI agents
 * @author AETERNA Protocol Team
 * @notice Enables agents to create tokens, participate in bonding curves, and execute autonomous trades
 */
contract AgentEconomics is
    IAgentEconomics,
    ReentrancyGuard,
    AccessControl,
    Pausable
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    /// @dev Role identifiers
    bytes32 public constant AGENT_OPERATOR_ROLE = keccak256("AGENT_OPERATOR_ROLE");
    bytes32 public constant TRADING_ROLE = keccak256("TRADING_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    /// @dev Protocol configuration
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_REVENUE_SHARE = 9000; // 90%
    uint256 public constant MIN_INITIAL_PRICE = 1000; // Minimum initial price
    uint256 public constant MAX_CURVE_SLOPE = 1000000; // Maximum curve slope
    uint256 public constant PLATFORM_FEE_BPS = 250; // 2.5% platform fee

    /// @dev Agent identity contract reference
    IAgentIdentity public immutable agentIdentity;

    /// @dev Platform treasury address
    address public treasury;

    /// @dev Mapping from agent ID to token configuration
    mapping(bytes32 => TokenConfig) private _tokenConfigs;

    /// @dev Mapping from agent ID to token address
    mapping(bytes32 => address) private _agentTokens;

    /// @dev Mapping from agent ID to bonding curve data
    mapping(bytes32 => BondingCurve) private _bondingCurves;

    /// @dev Mapping from agent ID to economic status
    mapping(bytes32 => bool) private _economicallyActive;

    /// @dev Mapping from agent ID to total revenue
    mapping(bytes32 => uint256) private _agentRevenue;

    /// @dev Mapping from agent ID to owner earnings
    mapping(bytes32 => mapping(address => uint256)) private _ownerEarnings;

    /// @dev Mapping for authorized DEX routers
    mapping(address => bool) private _authorizedRouters;

    /// @dev Mapping for investment tracking
    mapping(bytes32 => mapping(uint256 => Investment)) private _agentInvestments;
    mapping(bytes32 => uint256) private _investmentCounts;

    /// @dev Emergency circuit breaker
    bool private _emergencyStop;

    /// @dev Bonding curve data structure
    struct BondingCurve {
        uint256 totalSupply;
        uint256 reserveBalance;
        uint256 slope;
        uint256 basePrice;
        bool initialized;
    }

    /**
     * @dev Contract constructor
     * @param _agentIdentity Address of agent identity contract
     * @param _treasury Platform treasury address
     * @param admin Admin address for role management
     */
    constructor(
        address _agentIdentity,
        address _treasury,
        address admin
    ) {
        require(_agentIdentity != address(0), "AgentEconomics: invalid agent identity contract");
        require(_treasury != address(0), "AgentEconomics: invalid treasury address");
        require(admin != address(0), "AgentEconomics: invalid admin address");

        agentIdentity = IAgentIdentity(_agentIdentity);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_OPERATOR_ROLE, admin);
        _grantRole(TRADING_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(TREASURY_ROLE, admin);
    }

    /**
     * @dev Modifier to check if agent exists and caller is authorized
     * @param agentId Agent ID to verify
     */
    modifier onlyAgentOwnerOrOperator(bytes32 agentId) {
        require(agentIdentity.agentExists(agentId), "AgentEconomics: agent does not exist");
        require(
            agentIdentity.getAgentOwner(agentId) == msg.sender ||
            hasRole(AGENT_OPERATOR_ROLE, msg.sender),
            "AgentEconomics: unauthorized"
        );
        _;
    }

    /**
     * @dev Modifier for emergency stop check
     */
    modifier notInEmergency() {
        require(!_emergencyStop, "AgentEconomics: emergency stop active");
        _;
    }

    /// @inheritdoc IAgentEconomics
    function createAgentToken(
        bytes32 agentId,
        TokenConfig calldata config
    )
        external
        override
        nonReentrant
        whenNotPaused
        notInEmergency
        onlyAgentOwnerOrOperator(agentId)
        returns (address tokenAddress)
    {
        require(_agentTokens[agentId] == address(0), "AgentEconomics: token already exists");
        require(bytes(config.name).length > 0, "AgentEconomics: invalid token name");
        require(bytes(config.symbol).length > 0, "AgentEconomics: invalid token symbol");
        require(config.maxSupply > 0, "AgentEconomics: invalid max supply");
        require(config.initialPrice >= MIN_INITIAL_PRICE, "AgentEconomics: price too low");
        require(config.curveSlope <= MAX_CURVE_SLOPE, "AgentEconomics: slope too high");
        require(config.revenueShareBps <= MAX_REVENUE_SHARE, "AgentEconomics: revenue share too high");

        // Create agent token contract (simplified - would deploy actual ERC20)
        tokenAddress = _deployAgentToken(config);

        // Store configuration
        _tokenConfigs[agentId] = config;
        _agentTokens[agentId] = tokenAddress;

        // Initialize bonding curve
        _bondingCurves[agentId] = BondingCurve({
            totalSupply: 0,
            reserveBalance: 0,
            slope: config.curveSlope,
            basePrice: config.initialPrice,
            initialized: true
        });

        _economicallyActive[agentId] = true;

        emit AgentTokenCreated(
            agentId,
            tokenAddress,
            config.name,
            config.symbol,
            config.maxSupply
        );

        return tokenAddress;
    }

    /// @inheritdoc IAgentEconomics
    function buyAgentTokens(
        bytes32 agentId,
        uint256 reserveAmount,
        uint256 minTokens
    )
        external
        payable
        override
        nonReentrant
        whenNotPaused
        notInEmergency
        returns (uint256 tokensReceived)
    {
        require(agentIdentity.agentExists(agentId), "AgentEconomics: agent does not exist");
        require(_agentTokens[agentId] != address(0), "AgentEconomics: token does not exist");
        require(reserveAmount > 0, "AgentEconomics: invalid reserve amount");

        BondingCurve storage curve = _bondingCurves[agentId];
        require(curve.initialized, "AgentEconomics: bonding curve not initialized");

        TokenConfig storage config = _tokenConfigs[agentId];

        // Handle ETH or ERC20 reserve token
        if (config.reserveToken == address(0)) {
            require(msg.value == reserveAmount, "AgentEconomics: incorrect ETH amount");
        } else {
            require(msg.value == 0, "AgentEconomics: should not send ETH");
            IERC20(config.reserveToken).safeTransferFrom(msg.sender, address(this), reserveAmount);
        }

        // Calculate tokens to mint using bonding curve
        tokensReceived = _calculateBuyReturn(agentId, reserveAmount);
        require(tokensReceived >= minTokens, "AgentEconomics: insufficient output amount");
        require(
            curve.totalSupply + tokensReceived <= config.maxSupply,
            "AgentEconomics: exceeds max supply"
        );

        // Calculate platform fee
        uint256 platformFee = (reserveAmount * PLATFORM_FEE_BPS) / BASIS_POINTS;
        uint256 netReserve = reserveAmount - platformFee;

        // Update bonding curve state
        curve.reserveBalance += netReserve;
        curve.totalSupply += tokensReceived;

        // Transfer platform fee
        if (config.reserveToken == address(0)) {
            payable(treasury).transfer(platformFee);
        } else {
            IERC20(config.reserveToken).safeTransfer(treasury, platformFee);
        }

        // Mint tokens to buyer (simplified - would use actual token contract)
        // _mintTokens(agentId, msg.sender, tokensReceived);

        uint256 newPrice = _getCurrentPrice(agentId);

        emit BondPurchased(
            agentId,
            msg.sender,
            reserveAmount,
            tokensReceived,
            newPrice
        );

        return tokensReceived;
    }

    /// @inheritdoc IAgentEconomics
    function sellAgentTokens(
        bytes32 agentId,
        uint256 tokenAmount,
        uint256 minReserve
    )
        external
        override
        nonReentrant
        whenNotPaused
        notInEmergency
        returns (uint256 reserveReceived)
    {
        require(agentIdentity.agentExists(agentId), "AgentEconomics: agent does not exist");
        require(_agentTokens[agentId] != address(0), "AgentEconomics: token does not exist");
        require(tokenAmount > 0, "AgentEconomics: invalid token amount");

        BondingCurve storage curve = _bondingCurves[agentId];
        require(curve.totalSupply >= tokenAmount, "AgentEconomics: insufficient supply");

        // Calculate reserve to return using bonding curve
        reserveReceived = _calculateSellReturn(agentId, tokenAmount);
        require(reserveReceived >= minReserve, "AgentEconomics: insufficient output amount");
        require(curve.reserveBalance >= reserveReceived, "AgentEconomics: insufficient reserve");

        // Calculate platform fee
        uint256 platformFee = (reserveReceived * PLATFORM_FEE_BPS) / BASIS_POINTS;
        uint256 netReserve = reserveReceived - platformFee;

        // Update bonding curve state
        curve.reserveBalance -= reserveReceived;
        curve.totalSupply -= tokenAmount;

        // Burn tokens from seller (simplified - would use actual token contract)
        // _burnTokens(agentId, msg.sender, tokenAmount);

        TokenConfig storage config = _tokenConfigs[agentId];

        // Transfer reserve tokens to seller
        if (config.reserveToken == address(0)) {
            payable(msg.sender).transfer(netReserve);
            payable(treasury).transfer(platformFee);
        } else {
            IERC20(config.reserveToken).safeTransfer(msg.sender, netReserve);
            IERC20(config.reserveToken).safeTransfer(treasury, platformFee);
        }

        uint256 newPrice = _getCurrentPrice(agentId);

        emit BondSold(
            agentId,
            msg.sender,
            tokenAmount,
            netReserve,
            newPrice
        );

        return netReserve;
    }

    /// @inheritdoc IAgentEconomics
    function executeTrade(
        bytes32 agentId,
        TradeOrder calldata order
    )
        external
        override
        nonReentrant
        whenNotPaused
        notInEmergency
        onlyAgentOwnerOrOperator(agentId)
        returns (bool success, uint256 amountOut)
    {
        require(_economicallyActive[agentId], "AgentEconomics: agent not economically active");
        require(_authorizedRouters[order.dexRouter], "AgentEconomics: unauthorized router");
        require(order.deadline >= block.timestamp, "AgentEconomics: order expired");
        require(order.amountIn > 0, "AgentEconomics: invalid input amount");

        // Transfer input tokens from agent
        IERC20(order.tokenIn).safeTransferFrom(msg.sender, address(this), order.amountIn);

        // Approve router to spend tokens
        IERC20(order.tokenIn).safeApprove(order.dexRouter, order.amountIn);

        // Execute trade (simplified - would use actual DEX interface)
        try this._executeDEXTrade(order) returns (uint256 outputAmount) {
            amountOut = outputAmount;
            require(amountOut >= order.minAmountOut, "AgentEconomics: insufficient output");

            // Transfer output tokens to agent owner
            address agentOwner = agentIdentity.getAgentOwner(agentId);
            IERC20(order.tokenOut).safeTransfer(agentOwner, amountOut);

            emit TradeExecuted(
                agentId,
                order.tokenIn,
                order.tokenOut,
                order.amountIn,
                amountOut
            );

            success = true;
        } catch {
            // Refund input tokens on failure
            IERC20(order.tokenIn).safeTransfer(msg.sender, order.amountIn);
            success = false;
            amountOut = 0;
        }

        return (success, amountOut);
    }

    /// @inheritdoc IAgentEconomics
    function makeInvestment(
        bytes32 agentId,
        Investment calldata investment
    )
        external
        override
        nonReentrant
        whenNotPaused
        notInEmergency
        onlyAgentOwnerOrOperator(agentId)
        returns (bool success)
    {
        require(_economicallyActive[agentId], "AgentEconomics: agent not economically active");
        require(investment.target != address(0), "AgentEconomics: invalid target");
        require(investment.amount > 0, "AgentEconomics: invalid amount");

        uint256 investmentId = _investmentCounts[agentId]++;

        _agentInvestments[agentId][investmentId] = investment;

        // Execute investment (simplified - would use actual investment logic)
        // success = _executeInvestment(investment);

        emit InvestmentMade(
            agentId,
            investment.target,
            investment.amount,
            investment.expectedReturn
        );

        return true; // Simplified implementation
    }

    /// @inheritdoc IAgentEconomics
    function distributeRevenue(
        bytes32 agentId,
        uint256 totalRevenue
    )
        external
        override
        nonReentrant
        whenNotPaused
        onlyAgentOwnerOrOperator(agentId)
    {
        require(totalRevenue > 0, "AgentEconomics: no revenue to distribute");
        require(_agentTokens[agentId] != address(0), "AgentEconomics: token does not exist");

        TokenConfig storage config = _tokenConfigs[agentId];
        BondingCurve storage curve = _bondingCurves[agentId];

        // Calculate revenue shares
        uint256 tokenHolderShare = (totalRevenue * config.revenueShareBps) / BASIS_POINTS;
        uint256 agentShare = totalRevenue - tokenHolderShare;

        // Add to agent owner earnings
        address agentOwner = agentIdentity.getAgentOwner(agentId);
        _ownerEarnings[agentId][agentOwner] += agentShare;

        // Add to bonding curve reserve (benefits all token holders)
        curve.reserveBalance += tokenHolderShare;

        _agentRevenue[agentId] += totalRevenue;

        emit RevenueDistributed(
            agentId,
            totalRevenue,
            tokenHolderShare,
            agentShare
        );
    }

    /// @inheritdoc IAgentEconomics
    function withdrawAgentEarnings(
        bytes32 agentId,
        address token,
        uint256 amount
    )
        external
        override
        nonReentrant
        whenNotPaused
        onlyAgentOwnerOrOperator(agentId)
    {
        require(amount > 0, "AgentEconomics: invalid amount");

        address agentOwner = agentIdentity.getAgentOwner(agentId);
        require(
            _ownerEarnings[agentId][agentOwner] >= amount,
            "AgentEconomics: insufficient earnings"
        );

        _ownerEarnings[agentId][agentOwner] -= amount;

        if (token == address(0)) {
            payable(agentOwner).transfer(amount);
        } else {
            IERC20(token).safeTransfer(agentOwner, amount);
        }
    }

    /// @inheritdoc IAgentEconomics
    function getCurrentPrice(bytes32 agentId) external view override returns (uint256 currentPrice) {
        return _getCurrentPrice(agentId);
    }

    /// @inheritdoc IAgentEconomics
    function calculateBuyReturn(
        bytes32 agentId,
        uint256 reserveAmount
    ) external view override returns (uint256 tokensOut) {
        return _calculateBuyReturn(agentId, reserveAmount);
    }

    /// @inheritdoc IAgentEconomics
    function calculateSellReturn(
        bytes32 agentId,
        uint256 tokenAmount
    ) external view override returns (uint256 reserveOut) {
        return _calculateSellReturn(agentId, tokenAmount);
    }

    /// @inheritdoc IAgentEconomics
    function getPortfolioValue(bytes32 agentId) external view override returns (uint256 totalValue) {
        // Simplified implementation - would calculate actual portfolio value
        return _agentRevenue[agentId];
    }

    /// @inheritdoc IAgentEconomics
    function getAgentToken(bytes32 agentId)
        external
        view
        override
        returns (
            address tokenAddress,
            uint256 totalSupply,
            uint256 reserveBalance
        )
    {
        tokenAddress = _agentTokens[agentId];
        BondingCurve storage curve = _bondingCurves[agentId];
        totalSupply = curve.totalSupply;
        reserveBalance = curve.reserveBalance;
    }

    /// @inheritdoc IAgentEconomics
    function isEconomicallyActive(bytes32 agentId) external view override returns (bool) {
        return _economicallyActive[agentId];
    }

    /// @inheritdoc IAgentEconomics
    function setEconomicActivity(bytes32 agentId, bool isActive)
        external
        override
        onlyAgentOwnerOrOperator(agentId)
    {
        _economicallyActive[agentId] = isActive;
    }

    /**
     * @dev Internal function to calculate bonding curve buy return
     * @param agentId Agent ID
     * @param reserveAmount Reserve tokens to spend
     * @return tokensOut Tokens to receive
     */
    function _calculateBuyReturn(bytes32 agentId, uint256 reserveAmount)
        internal
        view
        returns (uint256 tokensOut)
    {
        BondingCurve storage curve = _bondingCurves[agentId];
        if (!curve.initialized) return 0;

        // Simplified linear bonding curve: price = basePrice + (supply * slope)
        uint256 currentPrice = curve.basePrice + (curve.totalSupply * curve.slope) / 1e18;
        tokensOut = reserveAmount / currentPrice;

        return tokensOut;
    }

    /**
     * @dev Internal function to calculate bonding curve sell return
     * @param agentId Agent ID
     * @param tokenAmount Tokens to sell
     * @return reserveOut Reserve tokens to receive
     */
    function _calculateSellReturn(bytes32 agentId, uint256 tokenAmount)
        internal
        view
        returns (uint256 reserveOut)
    {
        BondingCurve storage curve = _bondingCurves[agentId];
        if (!curve.initialized) return 0;

        uint256 newSupply = curve.totalSupply - tokenAmount;
        uint256 avgPrice = curve.basePrice + ((curve.totalSupply + newSupply) * curve.slope) / (2 * 1e18);
        reserveOut = tokenAmount * avgPrice;

        return reserveOut;
    }

    /**
     * @dev Get current price for agent tokens
     * @param agentId Agent ID
     * @return price Current token price
     */
    function _getCurrentPrice(bytes32 agentId) internal view returns (uint256 price) {
        BondingCurve storage curve = _bondingCurves[agentId];
        if (!curve.initialized) return 0;

        return curve.basePrice + (curve.totalSupply * curve.slope) / 1e18;
    }

    /**
     * @dev Deploy agent token contract (simplified implementation)
     * @param config Token configuration
     * @return tokenAddress Address of deployed token
     */
    function _deployAgentToken(TokenConfig memory config) internal pure returns (address tokenAddress) {
        // Simplified - in reality would deploy actual ERC20 contract
        return address(uint160(uint256(keccak256(abi.encode(config.name, config.symbol)))));
    }

    /**
     * @dev External function for DEX trade execution (for try-catch)
     * @param order Trade order
     * @return outputAmount Amount of output tokens received
     */
    function _executeDEXTrade(TradeOrder calldata order) external returns (uint256 outputAmount) {
        require(msg.sender == address(this), "AgentEconomics: internal only");
        // Simplified implementation - would use actual DEX router
        return order.amountIn * 95 / 100; // Simulated 5% slippage
    }

    /**
     * @dev Set authorized DEX router
     * @param router Router address
     * @param authorized Authorization status
     */
    function setAuthorizedRouter(address router, bool authorized)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _authorizedRouters[router] = authorized;
    }

    /**
     * @dev Emergency stop function
     * @param stopped Emergency stop status
     */
    function setEmergencyStop(bool stopped) external onlyRole(PAUSER_ROLE) {
        _emergencyStop = stopped;
    }

    /**
     * @dev Update treasury address
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyRole(TREASURY_ROLE) {
        require(newTreasury != address(0), "AgentEconomics: invalid treasury");
        treasury = newTreasury;
    }

    /**
     * @dev Pause contract
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Get contract version
     * @return version Contract version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    /**
     * @dev Emergency withdrawal function
     * @param token Token to withdraw (address(0) for ETH)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(_emergencyStop, "AgentEconomics: not in emergency");

        if (token == address(0)) {
            payable(treasury).transfer(amount);
        } else {
            IERC20(token).safeTransfer(treasury, amount);
        }
    }
}