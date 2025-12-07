// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAgent - Core Agent Interface for AETERNA Protocol
 * @notice Defines the essential functionality for autonomous agents in the AETERNA ecosystem
 * @dev Implements ERC-8004 Agent Standard for decentralized agent management
 * @custom:version 1.0.0
 * @custom:author AETERNA Protocol Team
 */
interface IAgent {
    // ============ EVENTS ============

    /**
     * @dev Emitted when an agent is created
     * @param agentId Unique identifier for the agent
     * @param creator Address that created the agent
     * @param agentType Type of agent (e.g., "researcher", "trader", "analyst")
     * @param initialCapabilities Initial capabilities granted to the agent
     */
    event AgentCreated(
        uint256 indexed agentId,
        address indexed creator,
        string agentType,
        string[] initialCapabilities
    );

    /**
     * @dev Emitted when agent capabilities are updated
     * @param agentId Agent identifier
     * @param newCapabilities Updated list of capabilities
     * @param updatedBy Address that performed the update
     */
    event CapabilitiesUpdated(
        uint256 indexed agentId,
        string[] newCapabilities,
        address indexed updatedBy
    );

    /**
     * @dev Emitted when an agent's status changes
     * @param agentId Agent identifier
     * @param oldStatus Previous status
     * @param newStatus New status
     * @param reason Reason for status change
     */
    event StatusChanged(
        uint256 indexed agentId,
        AgentStatus oldStatus,
        AgentStatus newStatus,
        string reason
    );

    /**
     * @dev Emitted when agent performs an action
     * @param agentId Agent identifier
     * @param actionType Type of action performed
     * @param target Target of the action (contract address, user, etc.)
     * @param data Additional action data
     * @param gasUsed Gas consumed by the action
     */
    event ActionPerformed(
        uint256 indexed agentId,
        string actionType,
        address indexed target,
        bytes data,
        uint256 gasUsed
    );

    /**
     * @dev Emitted when agent reputation is updated
     * @param agentId Agent identifier
     * @param oldReputation Previous reputation score
     * @param newReputation New reputation score
     * @param reason Reason for reputation change
     */
    event ReputationUpdated(
        uint256 indexed agentId,
        int256 oldReputation,
        int256 newReputation,
        string reason
    );

    // ============ ENUMS ============

    /**
     * @dev Possible states for an agent
     */
    enum AgentStatus {
        Inactive,       // Agent is created but not active
        Active,         // Agent is operational and can perform actions
        Suspended,      // Agent is temporarily disabled
        Retired,        // Agent is permanently disabled
        Upgrading       // Agent is being upgraded
    }

    /**
     * @dev Trust levels for agent interactions
     */
    enum TrustLevel {
        Untrusted,      // No trust established
        BasicTrust,     // Basic verification passed
        Verified,       // Formally verified by protocol
        Trusted,        // High trust level
        Elite          // Maximum trust level
    }

    // ============ STRUCTS ============

    /**
     * @dev Core agent information
     */
    struct AgentInfo {
        uint256 id;                    // Unique agent identifier
        address owner;                 // Agent owner/creator
        string agentType;              // Type classification
        AgentStatus status;            // Current operational status
        TrustLevel trustLevel;         // Trust level
        uint256 createdAt;             // Creation timestamp
        uint256 lastActive;            // Last activity timestamp
        string[] capabilities;         // List of agent capabilities
        int256 reputation;             // Reputation score (-1000 to 1000)
        uint256 actionsPerformed;      // Total actions count
        uint256 successfulActions;     // Successful actions count
        bytes32 metadataHash;          // Hash of extended metadata
    }

    /**
     * @dev Agent performance metrics
     */
    struct PerformanceMetrics {
        uint256 totalGasUsed;          // Total gas consumed
        uint256 averageResponseTime;   // Average response time in seconds
        uint256 totalEarnings;         // Total earnings in protocol tokens
        uint256 stakingAmount;         // Amount currently staked
        uint256 successRate;           // Success percentage (0-10000 for 0-100%)
        uint256 uptime;               // Uptime percentage (0-10000 for 0-100%)
        uint256 lastPerformanceUpdate; // Last metrics update timestamp
    }

    // ============ CORE FUNCTIONS ============

    /**
     * @notice Create a new autonomous agent
     * @param agentType Type of agent to create
     * @param capabilities Initial capabilities for the agent
     * @param metadataHash Hash of additional metadata
     * @return agentId Unique identifier for the created agent
     */
    function createAgent(
        string calldata agentType,
        string[] calldata capabilities,
        bytes32 metadataHash
    ) external returns (uint256 agentId);

    /**
     * @notice Update agent capabilities (only by owner or authorized contracts)
     * @param agentId Agent identifier
     * @param newCapabilities Updated capabilities list
     */
    function updateCapabilities(
        uint256 agentId,
        string[] calldata newCapabilities
    ) external;

    /**
     * @notice Change agent status
     * @param agentId Agent identifier
     * @param newStatus New status to set
     * @param reason Reason for status change
     */
    function changeStatus(
        uint256 agentId,
        AgentStatus newStatus,
        string calldata reason
    ) external;

    /**
     * @notice Record an action performed by the agent
     * @param agentId Agent identifier
     * @param actionType Type of action
     * @param target Target of the action
     * @param data Action data
     * @param success Whether the action was successful
     */
    function recordAction(
        uint256 agentId,
        string calldata actionType,
        address target,
        bytes calldata data,
        bool success
    ) external;

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get basic agent information
     * @param agentId Agent identifier
     * @return Agent information struct
     */
    function getAgentInfo(uint256 agentId) external view returns (AgentInfo memory);

    /**
     * @notice Get agent performance metrics
     * @param agentId Agent identifier
     * @return Performance metrics struct
     */
    function getPerformanceMetrics(uint256 agentId) external view returns (PerformanceMetrics memory);

    /**
     * @notice Check if agent has specific capability
     * @param agentId Agent identifier
     * @param capability Capability to check
     * @return True if agent has the capability
     */
    function hasCapability(uint256 agentId, string calldata capability) external view returns (bool);

    /**
     * @notice Get all agents owned by a specific address
     * @param owner Owner address
     * @return Array of agent IDs
     */
    function getAgentsByOwner(address owner) external view returns (uint256[] memory);

    /**
     * @notice Get agents by type
     * @param agentType Type to filter by
     * @return Array of agent IDs
     */
    function getAgentsByType(string calldata agentType) external view returns (uint256[] memory);

    /**
     * @notice Get total number of agents
     * @return Total agent count
     */
    function getTotalAgents() external view returns (uint256);

    /**
     * @notice Check if an address is authorized to control an agent
     * @param agentId Agent identifier
     * @param operator Address to check authorization for
     * @return True if authorized
     */
    function isAuthorized(uint256 agentId, address operator) external view returns (bool);

    /**
     * @notice Get agent reputation score
     * @param agentId Agent identifier
     * @return Reputation score (-1000 to 1000)
     */
    function getReputation(uint256 agentId) external view returns (int256);

    /**
     * @notice Check if agent is active and can perform actions
     * @param agentId Agent identifier
     * @return True if agent is active
     */
    function isActive(uint256 agentId) external view returns (bool);

    // ============ REPUTATION MANAGEMENT ============

    /**
     * @notice Update agent reputation (only by authorized contracts)
     * @param agentId Agent identifier
     * @param reputationDelta Change in reputation (-100 to +100)
     * @param reason Reason for reputation change
     */
    function updateReputation(
        uint256 agentId,
        int256 reputationDelta,
        string calldata reason
    ) external;

    /**
     * @notice Get agents by reputation range
     * @param minReputation Minimum reputation score
     * @param maxReputation Maximum reputation score
     * @return Array of agent IDs within the range
     */
    function getAgentsByReputation(
        int256 minReputation,
        int256 maxReputation
    ) external view returns (uint256[] memory);
}