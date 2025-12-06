// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/IAgentIdentity.sol";
import "./interfaces/IERC8004.sol";

/**
 * @title AgentIdentity
 * @dev Implementation of ERC-8004 Agent Identity Standard with advanced security features
 * @author AETERNA Protocol Team
 * @notice Manages unique digital identities for AI agents with reputation tracking and verification
 */
contract AgentIdentity is
    IAgentIdentity,
    IERC8004,
    ReentrancyGuard,
    AccessControl,
    Pausable
{
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @dev Role identifiers
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant REPUTATION_ORACLE_ROLE = keccak256("REPUTATION_ORACLE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @dev Maximum reputation score
    uint256 public constant MAX_REPUTATION = 10000;

    /// @dev Maximum number of capabilities per agent
    uint256 public constant MAX_CAPABILITIES = 20;

    /// @dev Agent counter for token ID generation
    uint256 private _agentCounter;

    /// @dev Mapping from agent ID to agent metadata
    mapping(bytes32 => AgentMetadata) private _agents;

    /// @dev Mapping from agent ID to owner address
    mapping(bytes32 => address) private _agentOwners;

    /// @dev Mapping from owner to list of agent IDs
    mapping(address => EnumerableSet.Bytes32Set) private _ownerAgents;

    /// @dev Mapping from agent type to list of agent IDs
    mapping(string => EnumerableSet.Bytes32Set) private _typeAgents;

    /// @dev Set of all agent IDs
    EnumerableSet.Bytes32Set private _allAgents;

    /// @dev Mapping from agent ID to capabilities hash
    mapping(bytes32 => bytes32) private _capabilitiesHashes;

    /// @dev Mapping to track if agent ID exists
    mapping(bytes32 => bool) private _agentExists;

    /// @dev Emergency pause flag for specific functions
    mapping(string => bool) private _functionPaused;

    /**
     * @dev Contract constructor
     * @param admin Address to be granted admin role
     */
    constructor(address admin) {
        require(admin != address(0), "AgentIdentity: admin cannot be zero address");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
        _grantRole(REPUTATION_ORACLE_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /**
     * @dev Modifier to check if caller is agent owner
     * @param agentId Agent ID to check ownership
     */
    modifier onlyAgentOwner(bytes32 agentId) {
        require(_agentOwners[agentId] == msg.sender, "AgentIdentity: caller is not agent owner");
        _;
    }

    /**
     * @dev Modifier to check if agent exists
     * @param agentId Agent ID to verify existence
     */
    modifier agentMustExist(bytes32 agentId) {
        require(_agentExists[agentId], "AgentIdentity: agent does not exist");
        _;
    }

    /**
     * @dev Modifier for function-specific pause check
     * @param functionName Name of the function to check
     */
    modifier whenFunctionNotPaused(string memory functionName) {
        require(!_functionPaused[functionName], "AgentIdentity: function is paused");
        _;
    }

    /// @inheritdoc IAgentIdentity
    function registerAgent(
        address to,
        string memory agentName,
        string memory agentType,
        string[] memory capabilities,
        string memory metadataURI
    )
        external
        override
        whenNotPaused
        whenFunctionNotPaused("registerAgent")
        nonReentrant
        returns (uint256 tokenId)
    {
        require(to != address(0), "AgentIdentity: cannot register to zero address");
        require(bytes(agentName).length > 0, "AgentIdentity: agent name cannot be empty");
        require(bytes(agentType).length > 0, "AgentIdentity: agent type cannot be empty");
        require(capabilities.length <= MAX_CAPABILITIES, "AgentIdentity: too many capabilities");
        require(bytes(metadataURI).length > 0, "AgentIdentity: metadata URI cannot be empty");

        // Generate unique agent ID
        bytes32 agentId = keccak256(
            abi.encodePacked(
                agentName,
                agentType,
                to,
                block.timestamp,
                _agentCounter
            )
        );

        require(!_agentExists[agentId], "AgentIdentity: agent already exists");

        // Calculate capabilities hash
        bytes32 capabilitiesHash = keccak256(abi.encodePacked(capabilities));

        // Create agent metadata
        AgentMetadata memory metadata = AgentMetadata({
            name: agentName,
            agentType: agentType,
            capabilities: capabilities,
            reputation: 0,
            status: AgentStatus.Active,
            verified: false,
            verifier: address(0),
            dataHash: keccak256(abi.encodePacked(agentName, agentType, metadataURI)),
            createdAt: block.timestamp,
            lastUpdated: block.timestamp
        });

        // Store agent data
        _agents[agentId] = metadata;
        _agentOwners[agentId] = to;
        _agentExists[agentId] = true;
        _capabilitiesHashes[agentId] = capabilitiesHash;

        // Update indexes
        _ownerAgents[to].add(agentId);
        _typeAgents[agentType].add(agentId);
        _allAgents.add(agentId);

        tokenId = _agentCounter++;

        emit AgentRegistered(tokenId, to, agentName, agentType, agentId);
        emit AgentRegistered(agentId, to, metadataURI);

        return tokenId;
    }

    /// @inheritdoc IERC8004
    function registerAgent(bytes32 agentId, string calldata metadataURI)
        external
        override
        whenNotPaused
        returns (bool success)
    {
        require(!_agentExists[agentId], "AgentIdentity: agent already exists");
        require(bytes(metadataURI).length > 0, "AgentIdentity: metadata URI cannot be empty");

        // Create basic agent metadata
        AgentMetadata memory metadata = AgentMetadata({
            name: "",
            agentType: "",
            capabilities: new string[](0),
            reputation: 0,
            status: AgentStatus.Active,
            verified: false,
            verifier: address(0),
            dataHash: keccak256(abi.encodePacked(metadataURI)),
            createdAt: block.timestamp,
            lastUpdated: block.timestamp
        });

        _agents[agentId] = metadata;
        _agentOwners[agentId] = msg.sender;
        _agentExists[agentId] = true;

        _ownerAgents[msg.sender].add(agentId);
        _allAgents.add(agentId);

        emit AgentRegistered(agentId, msg.sender, metadataURI);

        return true;
    }

    /// @inheritdoc IAgentIdentity
    function updateMetadata(uint256 tokenId, string memory newMetadataURI)
        external
        override
        whenNotPaused
        nonReentrant
    {
        require(bytes(newMetadataURI).length > 0, "AgentIdentity: metadata URI cannot be empty");
        // Implementation would need to map tokenId to agentId
        // For now, using a placeholder implementation
        revert("AgentIdentity: use updateAgentMetadata with agentId");
    }

    /// @inheritdoc IERC8004
    function updateAgentMetadata(bytes32 agentId, string calldata newMetadataURI)
        external
        override
        agentMustExist(agentId)
        onlyAgentOwner(agentId)
        whenNotPaused
        returns (bool success)
    {
        require(bytes(newMetadataURI).length > 0, "AgentIdentity: metadata URI cannot be empty");

        bytes32 newDataHash = keccak256(abi.encodePacked(newMetadataURI));

        _agents[agentId].dataHash = newDataHash;
        _agents[agentId].lastUpdated = block.timestamp;

        emit AgentMetadataUpdated(agentId, newMetadataURI, newDataHash);

        return true;
    }

    /// @inheritdoc IAgentIdentity
    function updateCapabilities(uint256 tokenId, string[] memory newCapabilities)
        external
        override
        whenNotPaused
        nonReentrant
    {
        require(newCapabilities.length <= MAX_CAPABILITIES, "AgentIdentity: too many capabilities");
        // Implementation would need to map tokenId to agentId
        revert("AgentIdentity: use direct agentId-based methods");
    }

    /// @inheritdoc IAgentIdentity
    function setVerificationStatus(uint256 tokenId, bool verified)
        external
        override
        onlyRole(VERIFIER_ROLE)
        whenNotPaused
    {
        // Implementation would need to map tokenId to agentId
        revert("AgentIdentity: use verifyAgent with agentId");
    }

    /// @inheritdoc IERC8004
    function verifyAgent(bytes32 agentId, bool verified)
        external
        override
        agentMustExist(agentId)
        onlyRole(VERIFIER_ROLE)
        whenNotPaused
        returns (bool success)
    {
        _agents[agentId].verified = verified;
        _agents[agentId].verifier = verified ? msg.sender : address(0);
        _agents[agentId].lastUpdated = block.timestamp;

        emit AgentVerificationChanged(agentId, verified, msg.sender);

        return true;
    }

    /// @inheritdoc IAgentIdentity
    function updateReputation(uint256 tokenId, uint256 newReputation)
        external
        override
        onlyRole(REPUTATION_ORACLE_ROLE)
        whenNotPaused
    {
        require(newReputation <= MAX_REPUTATION, "AgentIdentity: reputation exceeds maximum");
        // Implementation would need to map tokenId to agentId
        revert("AgentIdentity: use updateReputation with agentId");
    }

    /// @inheritdoc IERC8004
    function updateReputation(bytes32 agentId, uint256 score)
        external
        override
        agentMustExist(agentId)
        onlyRole(REPUTATION_ORACLE_ROLE)
        whenNotPaused
        returns (bool success)
    {
        require(score <= MAX_REPUTATION, "AgentIdentity: reputation exceeds maximum");

        uint256 oldReputation = _agents[agentId].reputation;
        _agents[agentId].reputation = score;
        _agents[agentId].lastUpdated = block.timestamp;

        emit ReputationUpdated(agentId, oldReputation, score, msg.sender);

        return true;
    }

    /// @inheritdoc IAgentIdentity
    function setAgentStatus(uint256 tokenId, AgentStatus newStatus)
        external
        override
        whenNotPaused
    {
        // Implementation would need to map tokenId to agentId
        revert("AgentIdentity: use direct agentId-based methods");
    }

    /// @inheritdoc IAgentIdentity
    function getAgentMetadata(uint256 tokenId)
        external
        view
        override
        returns (AgentMetadata memory metadata)
    {
        // Implementation would need to map tokenId to agentId
        revert("AgentIdentity: use getAgent with agentId");
    }

    /// @inheritdoc IERC8004
    function getAgent(bytes32 agentId)
        external
        view
        override
        returns (
            address owner,
            string memory metadataURI,
            bool verified,
            uint256 reputation
        )
    {
        require(_agentExists[agentId], "AgentIdentity: agent does not exist");

        AgentMetadata memory metadata = _agents[agentId];

        return (
            _agentOwners[agentId],
            "", // metadataURI would need to be stored separately
            metadata.verified,
            metadata.reputation
        );
    }

    /// @inheritdoc IERC8004
    function agentExists(bytes32 agentId) external view override returns (bool exists) {
        return _agentExists[agentId];
    }

    /// @inheritdoc IERC8004
    function getAgentOwner(bytes32 agentId) external view override returns (address owner) {
        require(_agentExists[agentId], "AgentIdentity: agent does not exist");
        return _agentOwners[agentId];
    }

    /// @inheritdoc IERC8004
    function isAgentVerified(bytes32 agentId) external view override returns (bool verified) {
        require(_agentExists[agentId], "AgentIdentity: agent does not exist");
        return _agents[agentId].verified;
    }

    /// @inheritdoc IERC8004
    function getAgentReputation(bytes32 agentId) external view override returns (uint256 reputation) {
        require(_agentExists[agentId], "AgentIdentity: agent does not exist");
        return _agents[agentId].reputation;
    }

    /// @inheritdoc IAgentIdentity
    function getAgentsByOwner(address owner) external view override returns (uint256[] memory tokenIds) {
        // This would need a proper tokenId to agentId mapping
        revert("AgentIdentity: use getAgentsByOwner for bytes32[] array");
    }

    /**
     * @dev Get agents owned by an address (returns agent IDs)
     * @param owner Address to query
     * @return agentIds Array of agent IDs owned by the address
     */
    function getAgentsByOwner(address owner) external view returns (bytes32[] memory agentIds) {
        uint256 count = _ownerAgents[owner].length();
        agentIds = new bytes32[](count);

        for (uint256 i = 0; i < count; i++) {
            agentIds[i] = _ownerAgents[owner].at(i);
        }

        return agentIds;
    }

    /// @inheritdoc IAgentIdentity
    function getAgentsByType(string memory agentType) external view override returns (uint256[] memory tokenIds) {
        // This would need a proper tokenId system
        revert("AgentIdentity: use getAgentsByType for bytes32[] array");
    }

    /**
     * @dev Get agents by type (returns agent IDs)
     * @param agentType Type to filter by
     * @return agentIds Array of agent IDs matching the type
     */
    function getAgentsByType(string memory agentType) external view returns (bytes32[] memory agentIds) {
        uint256 count = _typeAgents[agentType].length();
        agentIds = new bytes32[](count);

        for (uint256 i = 0; i < count; i++) {
            agentIds[i] = _typeAgents[agentType].at(i);
        }

        return agentIds;
    }

    /// @inheritdoc IAgentIdentity
    function getTotalAgents() external view override returns (uint256 count) {
        return _allAgents.length();
    }

    /**
     * @dev Get agent metadata by agent ID
     * @param agentId Agent ID to query
     * @return metadata Complete agent metadata
     */
    function getAgentMetadata(bytes32 agentId) external view returns (AgentMetadata memory metadata) {
        require(_agentExists[agentId], "AgentIdentity: agent does not exist");
        return _agents[agentId];
    }

    /**
     * @dev Emergency pause specific function
     * @param functionName Name of function to pause
     * @param paused Pause status
     */
    function setFunctionPaused(string memory functionName, bool paused)
        external
        onlyRole(PAUSER_ROLE)
    {
        _functionPaused[functionName] = paused;
    }

    /**
     * @dev Check if specific function is paused
     * @param functionName Function name to check
     * @return paused Whether function is paused
     */
    function isFunctionPaused(string memory functionName) external view returns (bool paused) {
        return _functionPaused[functionName];
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

    /// @inheritdoc IAgentIdentity
    function isAgentVerified(uint256 tokenId) external view override returns (bool verified) {
        // Implementation would need tokenId to agentId mapping
        revert("AgentIdentity: use isAgentVerified with agentId");
    }

    /// @inheritdoc IAgentIdentity
    function getAgentReputation(uint256 tokenId) external view override returns (uint256 reputation) {
        // Implementation would need tokenId to agentId mapping
        revert("AgentIdentity: use getAgentReputation with agentId");
    }

    /// @inheritdoc IAgentIdentity
    function agentExists(uint256 tokenId) external view override returns (bool exists) {
        // Implementation would need tokenId to agentId mapping
        revert("AgentIdentity: use agentExists with agentId");
    }
}