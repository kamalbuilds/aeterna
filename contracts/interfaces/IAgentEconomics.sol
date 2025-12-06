// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IAgentEconomics
 * @notice Interface for AI Agent autonomous economic operations
 * @dev Enables agents to own assets, create tokens, and participate in DeFi
 */
interface IAgentEconomics {

    // Agent token configuration
    struct TokenConfig {
        string name;               // Token name
        string symbol;             // Token symbol
        uint256 maxSupply;         // Maximum token supply
        uint256 initialPrice;      // Initial bonding curve price
        uint256 curveSlope;        // Bonding curve slope parameter
        address reserveToken;      // Reserve token for bonding curve
        bool governanceEnabled;    // Enable governance features
        uint256 revenueShareBps;   // Revenue share basis points (0-10000)
    }

    // Investment opportunity structure
    struct Investment {
        address target;            // Target contract/token
        uint256 amount;            // Investment amount
        uint256 expectedReturn;    // Expected return percentage
        uint256 timeHorizon;       // Investment time horizon (seconds)
        bytes data;                // Additional investment data
        bool executed;             // Execution status
    }

    // Trading order structure
    struct TradeOrder {
        address tokenIn;           // Input token
        address tokenOut;          // Output token
        uint256 amountIn;          // Input amount
        uint256 minAmountOut;      // Minimum output amount
        address dexRouter;         // DEX router to use
        uint256 deadline;          // Transaction deadline
        bytes routerData;          // Router-specific data
    }

    // Events
    event AgentTokenCreated(
        bytes32 indexed agentId,
        address indexed tokenAddress,
        string name,
        string symbol,
        uint256 maxSupply
    );

    event BondPurchased(
        bytes32 indexed agentId,
        address indexed buyer,
        uint256 amountPaid,
        uint256 tokensReceived,
        uint256 newPrice
    );

    event BondSold(
        bytes32 indexed agentId,
        address indexed seller,
        uint256 tokensSold,
        uint256 amountReceived,
        uint256 newPrice
    );

    event RevenueDistributed(
        bytes32 indexed agentId,
        uint256 totalRevenue,
        uint256 tokenHolderShare,
        uint256 agentShare
    );

    event TradeExecuted(
        bytes32 indexed agentId,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event InvestmentMade(
        bytes32 indexed agentId,
        address indexed target,
        uint256 amount,
        uint256 expectedReturn
    );

    /**
     * @notice Create an ERC-20 token for an AI agent
     * @param agentId The agent creating the token
     * @param config Token configuration parameters
     * @return tokenAddress Address of the created token
     */
    function createAgentToken(
        bytes32 agentId,
        TokenConfig calldata config
    ) external returns (address tokenAddress);

    /**
     * @notice Purchase agent tokens via bonding curve
     * @param agentId Agent whose tokens to buy
     * @param reserveAmount Amount of reserve tokens to spend
     * @param minTokens Minimum tokens expected to receive
     * @return tokensReceived Actual tokens received
     */
    function buyAgentTokens(
        bytes32 agentId,
        uint256 reserveAmount,
        uint256 minTokens
    ) external returns (uint256 tokensReceived);

    /**
     * @notice Sell agent tokens via bonding curve
     * @param agentId Agent whose tokens to sell
     * @param tokenAmount Amount of agent tokens to sell
     * @param minReserve Minimum reserve tokens expected
     * @return reserveReceived Actual reserve tokens received
     */
    function sellAgentTokens(
        bytes32 agentId,
        uint256 tokenAmount,
        uint256 minReserve
    ) external returns (uint256 reserveReceived);

    /**
     * @notice Execute autonomous trade for an agent
     * @param agentId Agent executing the trade
     * @param order Trade order details
     * @return success Whether trade was successful
     * @return amountOut Actual output amount received
     */
    function executeTrade(
        bytes32 agentId,
        TradeOrder calldata order
    ) external returns (bool success, uint256 amountOut);

    /**
     * @notice Make an investment on behalf of an agent
     * @param agentId Agent making the investment
     * @param investment Investment details
     * @return success Whether investment was successful
     */
    function makeInvestment(
        bytes32 agentId,
        Investment calldata investment
    ) external returns (bool success);

    /**
     * @notice Distribute revenue to token holders
     * @param agentId Agent distributing revenue
     * @param totalRevenue Total revenue amount to distribute
     * @dev Automatically splits between token holders and agent based on config
     */
    function distributeRevenue(
        bytes32 agentId,
        uint256 totalRevenue
    ) external;

    /**
     * @notice Withdraw agent earnings to owner
     * @param agentId Agent to withdraw from
     * @param token Token to withdraw (address(0) for ETH)
     * @param amount Amount to withdraw
     * @dev Only agent owner can call this
     */
    function withdrawAgentEarnings(
        bytes32 agentId,
        address token,
        uint256 amount
    ) external;

    /**
     * @notice Get current bonding curve price for agent tokens
     * @param agentId Agent to query
     * @return currentPrice Current price in reserve tokens
     */
    function getCurrentPrice(bytes32 agentId) external view returns (uint256 currentPrice);

    /**
     * @notice Calculate tokens received for reserve amount
     * @param agentId Agent to query
     * @param reserveAmount Reserve tokens to spend
     * @return tokensOut Expected tokens to receive
     */
    function calculateBuyReturn(
        bytes32 agentId,
        uint256 reserveAmount
    ) external view returns (uint256 tokensOut);

    /**
     * @notice Calculate reserve received for token amount
     * @param agentId Agent to query
     * @param tokenAmount Tokens to sell
     * @return reserveOut Expected reserve tokens to receive
     */
    function calculateSellReturn(
        bytes32 agentId,
        uint256 tokenAmount
    ) external view returns (uint256 reserveOut);

    /**
     * @notice Get agent's portfolio value across all assets
     * @param agentId Agent to query
     * @return totalValue Total portfolio value in USD
     */
    function getPortfolioValue(bytes32 agentId) external view returns (uint256 totalValue);

    /**
     * @notice Get agent's token information
     * @param agentId Agent to query
     * @return tokenAddress Agent's token contract address
     * @return totalSupply Current total supply
     * @return reserveBalance Current reserve balance
     */
    function getAgentToken(bytes32 agentId) external view returns (
        address tokenAddress,
        uint256 totalSupply,
        uint256 reserveBalance
    );

    /**
     * @notice Check if agent is authorized to make economic decisions
     * @param agentId Agent to check
     * @return True if agent has economic permissions
     */
    function isEconomicallyActive(bytes32 agentId) external view returns (bool);

    /**
     * @notice Set economic activity status for an agent
     * @param agentId Agent to update
     * @param isActive New economic activity status
     * @dev Only agent owner or authorized operator can call
     */
    function setEconomicActivity(bytes32 agentId, bool isActive) external;
}