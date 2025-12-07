// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "../interfaces/IAgent.sol";

/**
 * @title AgentIdentity - Core Agent Identity Contract for AETERNA Protocol
 * @notice Implements ERC-721 NFT standard for agent identities with comprehensive functionality
 * @dev Gas-optimized implementation with ERC-8004 compliance for autonomous agents
 * @custom:version 1.0.0
 * @custom:author AETERNA Protocol Team
 * @custom:security-contact security@aeterna.io
 */
contract AgentIdentity is
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    AccessControl,
    ReentrancyGuard,
    Pausable,
    IAgent
{
    using Counters for Counters.Counter;

    // ============ CONSTANTS ============

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant REPUTATION_MANAGER_ROLE = keccak256("REPUTATION_MANAGER_ROLE");

    uint256 public constant MAX_CAPABILITIES = 50;
    uint256 public constant MAX_AGENTS_PER_OWNER = 100;
    int256 public constant MIN_REPUTATION = -1000;
    int256 public constant MAX_REPUTATION = 1000;
    uint256 public constant REPUTATION_DECAY_PERIOD = 30 days;

    // ============ STATE VARIABLES ============

    Counters.Counter private _agentIdCounter;

    // Agent ID => AgentInfo
    mapping(uint256 => AgentInfo) private _agents;

    // Agent ID => PerformanceMetrics
    mapping(uint256 => PerformanceMetrics) private _metrics;

    // Agent ID => Authorized operators
    mapping(uint256 => mapping(address => bool)) private _authorizedOperators;

    // Owner => Agent IDs array
    mapping(address => uint256[]) private _ownerAgents;

    // Agent type => Agent IDs array
    mapping(string => uint256[]) private _agentsByType;

    // Reputation range => Agent IDs array
    mapping(int256 => mapping(int256 => uint256[])) private _agentsByReputation;

    // Agent ID => Capability => exists
    mapping(uint256 => mapping(string => bool)) private _agentCapabilities;

    // Agent ID => array of capability strings (for enumeration)
    mapping(uint256 => string[]) private _agentCapabilityList;

    // Global statistics
    uint256 private _totalActiveAgents;
    uint256 private _totalRetiredAgents;

    // Gas optimization: packed structs for frequently accessed data
    struct PackedAgentData {
        uint128 createdAt;
        uint128 lastActive;
        AgentStatus status;
        TrustLevel trustLevel;
        int16 reputation;  // Scaled by 10 for precision
        uint16 capabilityCount;
    }

    mapping(uint256 => PackedAgentData) private _packedData;

    // ============ EVENTS ============

    event AgentMinted(
        uint256 indexed agentId,
        address indexed owner,
        string agentType,
        uint256 timestamp
    );

    event BatchAgentsCreated(
        uint256[] agentIds,
        address indexed creator,
        uint256 count
    );

    event AgentTransferred(
        uint256 indexed agentId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    // ============ MODIFIERS ============

    modifier onlyAgentOwner(uint256 agentId) {
        if (ownerOf(agentId) != msg.sender) {
            revert Unauthorized(msg.sender, agentId);
        }
        _;
    }

    modifier onlyAuthorized(uint256 agentId) {
        address owner = ownerOf(agentId);
        if (msg.sender != owner && !_authorizedOperators[agentId][msg.sender] && !hasRole(CONTROLLER_ROLE, msg.sender)) {
            revert Unauthorized(msg.sender, agentId);
        }
        _;
    }

    modifier agentExists(uint256 agentId) {
        if (!_exists(agentId)) {
            revert AgentNotFound(agentId);
        }
        _;
    }

    modifier validReputation(int256 reputation) {
        if (reputation < MIN_REPUTATION || reputation > MAX_REPUTATION) {
            revert InvalidReputation(reputation);
        }
        _;
    }

    // ============ CUSTOM ERRORS ============

    error AgentNotFound(uint256 agentId);
    error Unauthorized(address caller, uint256 agentId);
    error InvalidReputation(int256 reputation);
    error MaxCapabilitiesExceeded(uint256 provided, uint256 maximum);
    error MaxAgentsPerOwnerExceeded(address owner, uint256 current, uint256 maximum);
    error InvalidAgentStatus(AgentStatus current, AgentStatus requested);
    error CapabilityNotFound(string capability);
    error EmptyCapabilityString();
    error InvalidMetadata(string reason);

    // ============ CONSTRUCTOR ============

    constructor(
        address defaultAdmin,
        address minter,
        address controller
    ) ERC721("AETERNA Agent Identity", "AGENT") {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, minter);
        _grantRole(CONTROLLER_ROLE, controller);
        _grantRole(REPUTATION_MANAGER_ROLE, controller);

        // Start agent IDs at 1
        _agentIdCounter.increment();
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
    ) external override nonReentrant whenNotPaused returns (uint256 agentId) {
        return _createAgent(msg.sender, agentType, capabilities, metadataHash);
    }

    /**
     * @notice Create agent on behalf of another address (minter role required)
     */
    function createAgentFor(
        address to,
        string calldata agentType,
        string[] calldata capabilities,
        bytes32 metadataHash
    ) external onlyRole(MINTER_ROLE) nonReentrant whenNotPaused returns (uint256 agentId) {
        return _createAgent(to, agentType, capabilities, metadataHash);
    }

    /**
     * @notice Batch create multiple agents (gas optimized)
     */
    function batchCreateAgents(
        string[] calldata agentTypes,
        string[][] calldata capabilities,
        bytes32[] calldata metadataHashes
    ) external onlyRole(MINTER_ROLE) nonReentrant whenNotPaused returns (uint256[] memory agentIds) {
        uint256 length = agentTypes.length;
        if (length != capabilities.length || length != metadataHashes.length) {
            revert("Array length mismatch");
        }

        agentIds = new uint256[](length);
        for (uint256 i = 0; i < length;) {
            agentIds[i] = _createAgent(msg.sender, agentTypes[i], capabilities[i], metadataHashes[i]);
            unchecked { ++i; }
        }

        emit BatchAgentsCreated(agentIds, msg.sender, length);
    }

    /**
     * @dev Internal function to create an agent with gas optimizations
     */
    function _createAgent(
        address to,
        string calldata agentType,
        string[] calldata capabilities,
        bytes32 metadataHash
    ) private returns (uint256 agentId) {
        // Validate input parameters
        if (capabilities.length > MAX_CAPABILITIES) {
            revert MaxCapabilitiesExceeded(capabilities.length, MAX_CAPABILITIES);
        }

        if (_ownerAgents[to].length >= MAX_AGENTS_PER_OWNER) {
            revert MaxAgentsPerOwnerExceeded(to, _ownerAgents[to].length, MAX_AGENTS_PER_OWNER);
        }

        // Get next agent ID
        agentId = _agentIdCounter.current();
        _agentIdCounter.increment();

        // Mint NFT
        _safeMint(to, agentId);

        // Initialize agent data
        AgentInfo storage agent = _agents[agentId];
        agent.id = agentId;
        agent.owner = to;
        agent.agentType = agentType;
        agent.status = AgentStatus.Active;
        agent.trustLevel = TrustLevel.Untrusted;
        agent.createdAt = block.timestamp;
        agent.lastActive = block.timestamp;
        agent.reputation = 0;
        agent.metadataHash = metadataHash;

        // Store packed data for gas optimization
        PackedAgentData storage packed = _packedData[agentId];
        packed.createdAt = uint128(block.timestamp);
        packed.lastActive = uint128(block.timestamp);
        packed.status = AgentStatus.Active;
        packed.trustLevel = TrustLevel.Untrusted;
        packed.reputation = 0;
        packed.capabilityCount = uint16(capabilities.length);

        // Set capabilities
        _setCapabilities(agentId, capabilities);

        // Update mappings
        _ownerAgents[to].push(agentId);
        _agentsByType[agentType].push(agentId);
        _totalActiveAgents++;

        emit AgentCreated(agentId, to, agentType, capabilities);
        emit AgentMinted(agentId, to, agentType, block.timestamp);
    }

    /**
     * @notice Update agent capabilities (only by owner or authorized contracts)
     */
    function updateCapabilities(
        uint256 agentId,
        string[] calldata newCapabilities
    ) external override agentExists(agentId) onlyAuthorized(agentId) nonReentrant {
        if (newCapabilities.length > MAX_CAPABILITIES) {
            revert MaxCapabilitiesExceeded(newCapabilities.length, MAX_CAPABILITIES);
        }

        // Clear existing capabilities
        string[] storage currentCapabilities = _agentCapabilityList[agentId];
        for (uint256 i = 0; i < currentCapabilities.length;) {
            delete _agentCapabilities[agentId][currentCapabilities[i]];
            unchecked { ++i; }
        }
        delete _agentCapabilityList[agentId];

        // Set new capabilities
        _setCapabilities(agentId, newCapabilities);

        // Update agent info
        _agents[agentId].capabilities = newCapabilities;
        _packedData[agentId].capabilityCount = uint16(newCapabilities.length);

        emit CapabilitiesUpdated(agentId, newCapabilities, msg.sender);
    }

    /**
     * @dev Internal function to set capabilities with validation
     */
    function _setCapabilities(uint256 agentId, string[] calldata capabilities) private {
        for (uint256 i = 0; i < capabilities.length;) {
            if (bytes(capabilities[i]).length == 0) {
                revert EmptyCapabilityString();
            }

            _agentCapabilities[agentId][capabilities[i]] = true;
            _agentCapabilityList[agentId].push(capabilities[i]);

            unchecked { ++i; }
        }

        // Store reference in main struct (for backward compatibility)
        _agents[agentId].capabilities = capabilities;
    }

    /**
     * @notice Change agent status
     */
    function changeStatus(
        uint256 agentId,
        AgentStatus newStatus,
        string calldata reason
    ) external override agentExists(agentId) onlyAuthorized(agentId) {
        AgentStatus currentStatus = _packedData[agentId].status;

        // Validate status transition
        if (!_isValidStatusTransition(currentStatus, newStatus)) {
            revert InvalidAgentStatus(currentStatus, newStatus);
        }

        // Update status
        _agents[agentId].status = newStatus;
        _packedData[agentId].status = newStatus;

        // Update counters
        if (currentStatus == AgentStatus.Active && newStatus != AgentStatus.Active) {
            _totalActiveAgents--;
        } else if (currentStatus != AgentStatus.Active && newStatus == AgentStatus.Active) {
            _totalActiveAgents++;
        }

        if (newStatus == AgentStatus.Retired) {
            _totalRetiredAgents++;
        }

        emit StatusChanged(agentId, currentStatus, newStatus, reason);
    }

    /**
     * @dev Validate status transitions
     */
    function _isValidStatusTransition(AgentStatus current, AgentStatus next) private pure returns (bool) {
        if (current == next) return false;
        if (current == AgentStatus.Retired) return false; // Cannot change from retired

        return true; // All other transitions are allowed
    }

    /**
     * @notice Record an action performed by the agent
     */
    function recordAction(
        uint256 agentId,
        string calldata actionType,
        address target,
        bytes calldata data,
        bool success
    ) external override agentExists(agentId) onlyRole(CONTROLLER_ROLE) {
        uint256 gasUsed = gasleft();

        PerformanceMetrics storage metrics = _metrics[agentId];
        metrics.totalGasUsed += gasUsed;

        AgentInfo storage agent = _agents[agentId];
        agent.actionsPerformed++;
        agent.lastActive = block.timestamp;
        _packedData[agentId].lastActive = uint128(block.timestamp);

        if (success) {
            agent.successfulActions++;
            metrics.successfulActions++;
        }

        emit ActionPerformed(agentId, actionType, target, data, gasUsed);
    }

    // ============ REPUTATION MANAGEMENT ============

    /**
     * @notice Update agent reputation (only by authorized contracts)
     */
    function updateReputation(
        uint256 agentId,
        int256 reputationDelta,
        string calldata reason
    ) external override agentExists(agentId) onlyRole(REPUTATION_MANAGER_ROLE) validReputation(_agents[agentId].reputation + reputationDelta) {
        int256 oldReputation = _agents[agentId].reputation;
        int256 newReputation = oldReputation + reputationDelta;

        // Clamp to valid range
        if (newReputation > MAX_REPUTATION) newReputation = MAX_REPUTATION;
        if (newReputation < MIN_REPUTATION) newReputation = MIN_REPUTATION;

        _agents[agentId].reputation = newReputation;
        _packedData[agentId].reputation = int16(newReputation);

        emit ReputationUpdated(agentId, oldReputation, newReputation, reason);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get basic agent information (gas optimized)
     */
    function getAgentInfo(uint256 agentId) external view override agentExists(agentId) returns (AgentInfo memory) {
        return _agents[agentId];
    }

    /**
     * @notice Get agent performance metrics
     */
    function getPerformanceMetrics(uint256 agentId) external view override agentExists(agentId) returns (PerformanceMetrics memory) {
        return _metrics[agentId];
    }

    /**
     * @notice Check if agent has specific capability (gas optimized)
     */
    function hasCapability(uint256 agentId, string calldata capability)
        external view override agentExists(agentId) returns (bool) {
        return _agentCapabilities[agentId][capability];
    }

    /**
     * @notice Get all agents owned by a specific address
     */
    function getAgentsByOwner(address owner) external view override returns (uint256[] memory) {
        return _ownerAgents[owner];
    }

    /**
     * @notice Get agents by type
     */
    function getAgentsByType(string calldata agentType) external view override returns (uint256[] memory) {
        return _agentsByType[agentType];
    }

    /**
     * @notice Get total number of agents
     */
    function getTotalAgents() external view override returns (uint256) {
        return _agentIdCounter.current() - 1;
    }

    /**
     * @notice Check if an address is authorized to control an agent
     */
    function isAuthorized(uint256 agentId, address operator) external view override agentExists(agentId) returns (bool) {
        address owner = ownerOf(agentId);
        return operator == owner ||
               _authorizedOperators[agentId][operator] ||
               hasRole(CONTROLLER_ROLE, operator);
    }

    /**
     * @notice Get agent reputation score
     */
    function getReputation(uint256 agentId) external view override agentExists(agentId) returns (int256) {
        return _agents[agentId].reputation;
    }

    /**
     * @notice Check if agent is active and can perform actions
     */
    function isActive(uint256 agentId) external view override agentExists(agentId) returns (bool) {
        return _packedData[agentId].status == AgentStatus.Active;
    }

    /**
     * @notice Get agents by reputation range
     */
    function getAgentsByReputation(
        int256 minReputation,
        int256 maxReputation
    ) external view override returns (uint256[] memory) {
        return _agentsByReputation[minReputation][maxReputation];
    }

    // ============ AUTHORIZATION FUNCTIONS ============

    /**
     * @notice Authorize an operator for an agent
     */
    function authorize(uint256 agentId, address operator) external onlyAgentOwner(agentId) {
        _authorizedOperators[agentId][operator] = true;
    }

    /**
     * @notice Revoke authorization for an operator
     */
    function revoke(uint256 agentId, address operator) external onlyAgentOwner(agentId) {
        delete _authorizedOperators[agentId][operator];
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @notice Pause contract (admin only)
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause contract (admin only)
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Update base URI for metadata
     */
    function setBaseURI(string calldata newBaseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setBaseURI(newBaseURI);
    }

    // ============ STATISTICS FUNCTIONS ============

    /**
     * @notice Get global agent statistics
     */
    function getGlobalStats() external view returns (
        uint256 totalAgents,
        uint256 activeAgents,
        uint256 retiredAgents,
        uint256 averageReputation
    ) {
        totalAgents = _agentIdCounter.current() - 1;
        activeAgents = _totalActiveAgents;
        retiredAgents = _totalRetiredAgents;

        // Calculate average reputation (simplified)
        int256 totalReputation = 0;
        for (uint256 i = 1; i < _agentIdCounter.current();) {
            if (_exists(i)) {
                totalReputation += _agents[i].reputation;
            }
            unchecked { ++i; }
        }
        averageReputation = totalAgents > 0 ? uint256(totalReputation) / totalAgents : 0;
    }

    // ============ OVERRIDE FUNCTIONS ============

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) whenNotPaused {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);

        if (from != address(0) && to != address(0)) {
            // Update owner mappings when transferring
            _updateOwnerMappings(firstTokenId, from, to);
        }
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal override {
        super._afterTokenTransfer(from, to, firstTokenId, batchSize);

        if (from != address(0) && to != address(0)) {
            emit AgentTransferred(firstTokenId, from, to, block.timestamp);
        }
    }

    /**
     * @dev Update owner mappings on transfer
     */
    function _updateOwnerMappings(uint256 agentId, address from, address to) private {
        // Remove from old owner's list
        uint256[] storage fromAgents = _ownerAgents[from];
        for (uint256 i = 0; i < fromAgents.length;) {
            if (fromAgents[i] == agentId) {
                fromAgents[i] = fromAgents[fromAgents.length - 1];
                fromAgents.pop();
                break;
            }
            unchecked { ++i; }
        }

        // Add to new owner's list
        _ownerAgents[to].push(agentId);

        // Update agent owner
        _agents[agentId].owner = to;
    }

    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage) agentExists(tokenId) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }
}