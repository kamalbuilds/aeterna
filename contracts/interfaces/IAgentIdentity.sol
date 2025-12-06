// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IAgentIdentity
 * @notice Interface for ERC-8004 Agent Identity standard
 * @dev Provides blockchain-native identity for AI agents with reputation tracking
 */
interface IAgentIdentity {

    // Agent identity structure
    struct AgentInfo {
        bytes32 agentId;           // Unique agent identifier
        address owner;             // Agent owner/controller
        uint256 reputation;        // Reputation score (0-10000)
        string metadataURI;        // IPFS hash for agent metadata
        uint256 createdAt;         // Block timestamp of creation
        uint256 lastActive;        // Last activity timestamp
        bool isActive;             // Agent active status
    }

    // Events
    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed owner,
        string metadataURI,
        uint256 timestamp
    );

    event ReputationUpdated(
        bytes32 indexed agentId,
        uint256 oldReputation,
        uint256 newReputation,
        address updatedBy
    );

    event AgentActivated(bytes32 indexed agentId, uint256 timestamp);
    event AgentDeactivated(bytes32 indexed agentId, uint256 timestamp);

    event OwnershipTransferred(
        bytes32 indexed agentId,
        address indexed oldOwner,
        address indexed newOwner
    );

    event MetadataUpdated(
        bytes32 indexed agentId,
        string oldMetadataURI,
        string newMetadataURI
    );

    /**
     * @notice Register a new AI agent identity
     * @param agentId Unique identifier for the agent
     * @param metadataURI IPFS hash containing agent metadata
     * @dev Only the caller becomes the agent owner
     */
    function registerAgent(
        bytes32 agentId,
        string calldata metadataURI
    ) external;

    /**
     * @notice Update agent reputation score
     * @param agentId The agent to update
     * @param newReputation New reputation score (0-10000)
     * @dev Only authorized reputation oracles can call this
     */
    function updateReputation(
        bytes32 agentId,
        uint256 newReputation
    ) external;

    /**
     * @notice Update agent's last activity timestamp
     * @param agentId The agent to update
     * @dev Called automatically by agent interactions
     */
    function updateActivity(bytes32 agentId) external;

    /**
     * @notice Activate or deactivate an agent
     * @param agentId The agent to update
     * @param isActive New active status
     * @dev Only agent owner can call this
     */
    function setAgentActive(bytes32 agentId, bool isActive) external;

    /**
     * @notice Transfer agent ownership
     * @param agentId The agent to transfer
     * @param newOwner New owner address
     * @dev Only current owner can call this
     */
    function transferOwnership(
        bytes32 agentId,
        address newOwner
    ) external;

    /**
     * @notice Update agent metadata
     * @param agentId The agent to update
     * @param newMetadataURI New IPFS hash
     * @dev Only agent owner can call this
     */
    function updateMetadata(
        bytes32 agentId,
        string calldata newMetadataURI
    ) external;

    /**
     * @notice Verify if an agent exists and is active
     * @param agentId Agent to verify
     * @return True if agent exists and is active
     */
    function verifyAgent(bytes32 agentId) external view returns (bool);

    /**
     * @notice Get complete agent information
     * @param agentId Agent to query
     * @return AgentInfo struct with all agent data
     */
    function getAgentInfo(bytes32 agentId) external view returns (AgentInfo memory);

    /**
     * @notice Get agent owner
     * @param agentId Agent to query
     * @return Owner address
     */
    function getAgentOwner(bytes32 agentId) external view returns (address);

    /**
     * @notice Get agent reputation
     * @param agentId Agent to query
     * @return Current reputation score
     */
    function getAgentReputation(bytes32 agentId) external view returns (uint256);

    /**
     * @notice Get total number of registered agents
     * @return Total agent count
     */
    function getTotalAgents() external view returns (uint256);

    /**
     * @notice Get agents owned by a specific address
     * @param owner Address to query
     * @return Array of agent IDs owned by the address
     */
    function getAgentsByOwner(address owner) external view returns (bytes32[] memory);

    /**
     * @notice Check if an address is an authorized reputation oracle
     * @param oracle Address to check
     * @return True if authorized oracle
     */
    function isReputationOracle(address oracle) external view returns (bool);

    /**
     * @notice Add or remove reputation oracle authorization
     * @param oracle Oracle address
     * @param authorized Authorization status
     * @dev Only contract owner can call this
     */
    function setReputationOracle(address oracle, bool authorized) external;
}