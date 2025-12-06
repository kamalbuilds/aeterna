// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC8004
 * @dev Interface for ERC-8004 Agent Identity Standard
 * @notice Defines the standard interface for agent identity and reputation systems
 */
interface IERC8004 {
    /**
     * @dev Emitted when a new agent is registered
     * @param agentId Unique identifier for the agent
     * @param owner Address that owns the agent identity
     * @param metadataURI URI pointing to agent metadata
     */
    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed owner,
        string metadataURI
    );

    /**
     * @dev Emitted when agent metadata is updated
     * @param agentId Agent identifier
     * @param newMetadataURI Updated metadata URI
     */
    event AgentMetadataUpdated(bytes32 indexed agentId, string newMetadataURI);

    /**
     * @dev Emitted when agent verification status changes
     * @param agentId Agent identifier
     * @param verifier Address that performed verification
     * @param verified Whether the agent is verified
     */
    event AgentVerificationChanged(
        bytes32 indexed agentId,
        address indexed verifier,
        bool verified
    );

    /**
     * @dev Emitted when agent reputation is updated
     * @param agentId Agent identifier
     * @param provider Address providing the reputation update
     * @param score New reputation score
     */
    event ReputationUpdated(
        bytes32 indexed agentId,
        address indexed provider,
        uint256 score
    );

    /**
     * @dev Register a new agent identity
     * @param agentId Unique identifier for the agent
     * @param metadataURI URI pointing to agent metadata
     * @return success Whether the registration was successful
     */
    function registerAgent(bytes32 agentId, string calldata metadataURI)
        external
        returns (bool success);

    /**
     * @dev Update agent metadata
     * @param agentId Agent identifier
     * @param newMetadataURI New metadata URI
     * @return success Whether the update was successful
     */
    function updateAgentMetadata(bytes32 agentId, string calldata newMetadataURI)
        external
        returns (bool success);

    /**
     * @dev Verify an agent's identity
     * @param agentId Agent identifier
     * @param verified Verification status
     * @return success Whether the verification was successful
     */
    function verifyAgent(bytes32 agentId, bool verified)
        external
        returns (bool success);

    /**
     * @dev Update agent reputation score
     * @param agentId Agent identifier
     * @param score Reputation score
     * @return success Whether the update was successful
     */
    function updateReputation(bytes32 agentId, uint256 score)
        external
        returns (bool success);

    /**
     * @dev Get agent information
     * @param agentId Agent identifier
     * @return owner Owner address
     * @return metadataURI Metadata URI
     * @return verified Verification status
     * @return reputation Reputation score
     */
    function getAgent(bytes32 agentId)
        external
        view
        returns (
            address owner,
            string memory metadataURI,
            bool verified,
            uint256 reputation
        );

    /**
     * @dev Check if an agent exists
     * @param agentId Agent identifier
     * @return exists Whether the agent exists
     */
    function agentExists(bytes32 agentId) external view returns (bool exists);

    /**
     * @dev Get agent owner
     * @param agentId Agent identifier
     * @return owner Owner address
     */
    function getAgentOwner(bytes32 agentId) external view returns (address owner);

    /**
     * @dev Get agent verification status
     * @param agentId Agent identifier
     * @return verified Verification status
     */
    function isAgentVerified(bytes32 agentId) external view returns (bool verified);

    /**
     * @dev Get agent reputation score
     * @param agentId Agent identifier
     * @return reputation Reputation score
     */
    function getAgentReputation(bytes32 agentId) external view returns (uint256 reputation);
}