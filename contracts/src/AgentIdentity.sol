// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "../interfaces/IAgentIdentity.sol";
import "../interfaces/IERC8004.sol";

/**
 * @title AgentIdentity
 * @notice Production implementation of ERC-8004 Agent Identity standard
 * @dev Provides secure, verifiable identity management for AI agents with reputation tracking
 * @author AETERNA Development Team
 */
contract AgentIdentity is
    IAgentIdentity,
    IERC8004,
    AccessControl,
    ReentrancyGuard,
    Pausable,
    EIP712
{
    using Counters for Counters.Counter;
    using ECDSA for bytes32;

    // =============================================================
    //                           CONSTANTS
    // =============================================================

    bytes32 public constant REPUTATION_ORACLE_ROLE = keccak256("REPUTATION_ORACLE_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_REPUTATION = 10000; // 100.00% with 2 decimals
    uint256 public constant MIN_REPUTATION = 0;
    uint256 public constant INITIAL_REPUTATION = 5000; // 50.00% starting reputation

    // Signature typehash for agent registration
    bytes32 private constant REGISTER_AGENT_TYPEHASH =
        keccak256("RegisterAgent(bytes32 agentId,string metadataURI,uint256 nonce,uint256 deadline)");

    // Signature typehash for reputation updates
    bytes32 private constant UPDATE_REPUTATION_TYPEHASH =
        keccak256("UpdateReputation(bytes32 agentId,uint256 newReputation,uint256 nonce,uint256 deadline)");

    // =============================================================
    //                           STORAGE
    // =============================================================

    // Agent data mapping
    mapping(bytes32 => AgentInfo) private _agents;

    // Owner to agent IDs mapping
    mapping(address => bytes32[]) private _ownerToAgents;

    // Agent ID to owner index mapping (for efficient removal)
    mapping(bytes32 => uint256) private _agentOwnerIndex;

    // Total number of registered agents
    Counters.Counter private _totalAgents;

    // Nonces for signature verification
    mapping(address => uint256) private _nonces;

    // Verified agents mapping
    mapping(bytes32 => bool) private _verifiedAgents;

    // Agent verifiers mapping
    mapping(bytes32 => address) private _agentVerifiers;

    // Time-based reputation decay parameters
    uint256 public reputationDecayRate = 1; // 0.01% per day
    uint256 public constant DECAY_PERIOD = 1 days;

    // Agent activity thresholds
    uint256 public constant INACTIVITY_THRESHOLD = 30 days;
    uint256 public constant REPUTATION_UPDATE_COOLDOWN = 1 hours;

    // Last reputation update timestamps
    mapping(bytes32 => uint256) private _lastReputationUpdate;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event AgentVerified(bytes32 indexed agentId, address indexed verifier, bool verified);
    event ReputationDecayApplied(bytes32 indexed agentId, uint256 oldReputation, uint256 newReputation);
    event EmergencyPause(address indexed by, uint256 timestamp);
    event EmergencyUnpause(address indexed by, uint256 timestamp);

    // =============================================================
    //                           ERRORS
    // =============================================================

    error AgentAlreadyExists(bytes32 agentId);
    error AgentNotFound(bytes32 agentId);
    error InvalidReputation(uint256 reputation);
    error UnauthorizedCaller(address caller);
    error InvalidSignature();
    error SignatureExpired(uint256 deadline);
    error InsufficientCooldown(uint256 remaining);
    error InvalidMetadataURI();
    error ZeroAddress();

    // =============================================================
    //                           MODIFIERS
    // =============================================================

    modifier onlyAgentOwner(bytes32 agentId) {
        if (_agents[agentId].owner != msg.sender) {
            revert UnauthorizedCaller(msg.sender);
        }
        _;
    }

    modifier onlyExistingAgent(bytes32 agentId) {
        if (_agents[agentId].owner == address(0)) {
            revert AgentNotFound(agentId);
        }
        _;
    }

    modifier validReputation(uint256 reputation) {
        if (reputation > MAX_REPUTATION) {
            revert InvalidReputation(reputation);
        }
        _;
    }

    modifier respectCooldown(bytes32 agentId) {
        uint256 timeSinceLastUpdate = block.timestamp - _lastReputationUpdate[agentId];
        if (timeSinceLastUpdate < REPUTATION_UPDATE_COOLDOWN) {
            revert InsufficientCooldown(REPUTATION_UPDATE_COOLDOWN - timeSinceLastUpdate);
        }
        _;
    }

    // =============================================================
    //                           CONSTRUCTOR
    // =============================================================

    constructor(
        address defaultAdmin,
        address[] memory reputationOracles,
        address[] memory validators
    ) EIP712("AgentIdentity", "1") {
        if (defaultAdmin == address(0)) revert ZeroAddress();

        // Set up roles
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, defaultAdmin);

        // Add reputation oracles
        for (uint256 i = 0; i < reputationOracles.length; i++) {
            if (reputationOracles[i] != address(0)) {
                _grantRole(REPUTATION_ORACLE_ROLE, reputationOracles[i]);
            }
        }

        // Add validators
        for (uint256 i = 0; i < validators.length; i++) {
            if (validators[i] != address(0)) {
                _grantRole(VALIDATOR_ROLE, validators[i]);
            }
        }
    }

    // =============================================================
    //                      AGENT REGISTRATION
    // =============================================================

    /**
     * @inheritdoc IAgentIdentity
     */
    function registerAgent(
        bytes32 agentId,
        string calldata metadataURI
    ) external override whenNotPaused {
        _registerAgent(agentId, metadataURI, msg.sender);
    }

    /**
     * @inheritdoc IERC8004
     */
    function registerAgent(
        bytes32 agentId,
        string calldata metadataURI
    ) external override returns (bool success) {
        _registerAgent(agentId, metadataURI, msg.sender);
        return true;
    }

    /**
     * @notice Register agent with signature verification
     * @param agentId Unique agent identifier
     * @param metadataURI IPFS hash or URI for agent metadata
     * @param owner Owner address
     * @param deadline Signature expiration timestamp
     * @param signature EIP-712 signature from owner
     */
    function registerAgentWithSignature(
        bytes32 agentId,
        string calldata metadataURI,
        address owner,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        if (block.timestamp > deadline) {
            revert SignatureExpired(deadline);
        }

        bytes32 structHash = keccak256(abi.encode(
            REGISTER_AGENT_TYPEHASH,
            agentId,
            keccak256(bytes(metadataURI)),
            _nonces[owner]++,
            deadline
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);

        if (signer != owner) {
            revert InvalidSignature();
        }

        _registerAgent(agentId, metadataURI, owner);
    }

    /**
     * @dev Internal agent registration logic
     */
    function _registerAgent(
        bytes32 agentId,
        string calldata metadataURI,
        address owner
    ) internal {
        if (_agents[agentId].owner != address(0)) {
            revert AgentAlreadyExists(agentId);
        }

        if (bytes(metadataURI).length == 0) {
            revert InvalidMetadataURI();
        }

        // Create agent info
        AgentInfo storage agent = _agents[agentId];
        agent.agentId = agentId;
        agent.owner = owner;
        agent.reputation = INITIAL_REPUTATION;
        agent.metadataURI = metadataURI;
        agent.createdAt = block.timestamp;
        agent.lastActive = block.timestamp;
        agent.isActive = true;

        // Add to owner's agent list
        _ownerToAgents[owner].push(agentId);
        _agentOwnerIndex[agentId] = _ownerToAgents[owner].length - 1;

        // Increment total counter
        _totalAgents.increment();

        emit AgentRegistered(agentId, owner, metadataURI, block.timestamp);
    }

    // =============================================================
    //                      REPUTATION MANAGEMENT
    // =============================================================

    /**
     * @inheritdoc IAgentIdentity
     */
    function updateReputation(
        bytes32 agentId,
        uint256 newReputation
    ) external override
        onlyRole(REPUTATION_ORACLE_ROLE)
        onlyExistingAgent(agentId)
        validReputation(newReputation)
        respectCooldown(agentId)
        whenNotPaused
    {
        uint256 oldReputation = _agents[agentId].reputation;
        _agents[agentId].reputation = newReputation;
        _lastReputationUpdate[agentId] = block.timestamp;

        emit ReputationUpdated(agentId, oldReputation, newReputation, msg.sender);
    }

    /**
     * @notice Update reputation with signature verification
     * @param agentId Agent to update
     * @param newReputation New reputation score
     * @param oracle Oracle address
     * @param deadline Signature deadline
     * @param signature EIP-712 signature from oracle
     */
    function updateReputationWithSignature(
        bytes32 agentId,
        uint256 newReputation,
        address oracle,
        uint256 deadline,
        bytes calldata signature
    ) external
        onlyExistingAgent(agentId)
        validReputation(newReputation)
        respectCooldown(agentId)
        whenNotPaused
    {
        if (!hasRole(REPUTATION_ORACLE_ROLE, oracle)) {
            revert UnauthorizedCaller(oracle);
        }

        if (block.timestamp > deadline) {
            revert SignatureExpired(deadline);
        }

        bytes32 structHash = keccak256(abi.encode(
            UPDATE_REPUTATION_TYPEHASH,
            agentId,
            newReputation,
            _nonces[oracle]++,
            deadline
        ));

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);

        if (signer != oracle) {
            revert InvalidSignature();
        }

        uint256 oldReputation = _agents[agentId].reputation;
        _agents[agentId].reputation = newReputation;
        _lastReputationUpdate[agentId] = block.timestamp;

        emit ReputationUpdated(agentId, oldReputation, newReputation, oracle);
    }

    /**
     * @notice Apply reputation decay for inactive agents
     * @param agentId Agent to apply decay to
     */
    function applyReputationDecay(bytes32 agentId) external onlyExistingAgent(agentId) {
        AgentInfo storage agent = _agents[agentId];

        uint256 timeSinceLastActivity = block.timestamp - agent.lastActive;
        if (timeSinceLastActivity < DECAY_PERIOD) return;

        uint256 decayPeriods = timeSinceLastActivity / DECAY_PERIOD;
        uint256 decayAmount = (agent.reputation * reputationDecayRate * decayPeriods) / 10000;

        if (decayAmount > 0) {
            uint256 oldReputation = agent.reputation;
            agent.reputation = agent.reputation > decayAmount ?
                agent.reputation - decayAmount : MIN_REPUTATION;

            emit ReputationDecayApplied(agentId, oldReputation, agent.reputation);
        }
    }

    // =============================================================
    //                      AGENT VERIFICATION
    // =============================================================

    /**
     * @inheritdoc IERC8004
     */
    function verifyAgent(bytes32 agentId, bool verified)
        external
        override
        onlyRole(VALIDATOR_ROLE)
        onlyExistingAgent(agentId)
        returns (bool success)
    {
        _verifiedAgents[agentId] = verified;
        if (verified) {
            _agentVerifiers[agentId] = msg.sender;
        } else {
            delete _agentVerifiers[agentId];
        }

        emit AgentVerified(agentId, msg.sender, verified);
        return true;
    }

    // =============================================================
    //                      AGENT MANAGEMENT
    // =============================================================

    /**
     * @inheritdoc IAgentIdentity
     */
    function updateActivity(bytes32 agentId)
        external
        override
        onlyExistingAgent(agentId)
        whenNotPaused
    {
        _agents[agentId].lastActive = block.timestamp;
    }

    /**
     * @inheritdoc IAgentIdentity
     */
    function setAgentActive(bytes32 agentId, bool isActive)
        external
        override
        onlyAgentOwner(agentId)
        whenNotPaused
    {
        bool wasActive = _agents[agentId].isActive;
        _agents[agentId].isActive = isActive;

        if (wasActive != isActive) {
            if (isActive) {
                emit AgentActivated(agentId, block.timestamp);
            } else {
                emit AgentDeactivated(agentId, block.timestamp);
            }
        }
    }

    /**
     * @inheritdoc IAgentIdentity
     */
    function transferOwnership(bytes32 agentId, address newOwner)
        external
        override
        onlyAgentOwner(agentId)
        whenNotPaused
    {
        if (newOwner == address(0)) revert ZeroAddress();

        address oldOwner = _agents[agentId].owner;

        // Remove from old owner's list
        _removeAgentFromOwner(agentId, oldOwner);

        // Add to new owner's list
        _ownerToAgents[newOwner].push(agentId);
        _agentOwnerIndex[agentId] = _ownerToAgents[newOwner].length - 1;

        // Update agent owner
        _agents[agentId].owner = newOwner;

        emit OwnershipTransferred(agentId, oldOwner, newOwner);
    }

    /**
     * @inheritdoc IAgentIdentity
     */
    function updateMetadata(bytes32 agentId, string calldata newMetadataURI)
        external
        override
        onlyAgentOwner(agentId)
        whenNotPaused
    {
        if (bytes(newMetadataURI).length == 0) {
            revert InvalidMetadataURI();
        }

        string memory oldMetadataURI = _agents[agentId].metadataURI;
        _agents[agentId].metadataURI = newMetadataURI;

        emit MetadataUpdated(agentId, oldMetadataURI, newMetadataURI);
    }

    /**
     * @inheritdoc IERC8004
     */
    function updateAgentMetadata(bytes32 agentId, string calldata newMetadataURI)
        external
        override
        onlyAgentOwner(agentId)
        returns (bool success)
    {
        if (bytes(newMetadataURI).length == 0) {
            revert InvalidMetadataURI();
        }

        _agents[agentId].metadataURI = newMetadataURI;

        emit AgentMetadataUpdated(agentId, newMetadataURI);
        return true;
    }

    // =============================================================
    //                           VIEW FUNCTIONS
    // =============================================================

    /**
     * @inheritdoc IAgentIdentity
     */
    function verifyAgent(bytes32 agentId) external view override returns (bool) {
        return _agents[agentId].isActive && _agents[agentId].owner != address(0);
    }

    /**
     * @inheritdoc IERC8004
     */
    function agentExists(bytes32 agentId) external view override returns (bool exists) {
        return _agents[agentId].owner != address(0);
    }

    /**
     * @inheritdoc IERC8004
     */
    function isAgentVerified(bytes32 agentId) external view override returns (bool verified) {
        return _verifiedAgents[agentId];
    }

    /**
     * @inheritdoc IAgentIdentity
     */
    function getAgentInfo(bytes32 agentId)
        external
        view
        override
        returns (AgentInfo memory)
    {
        return _agents[agentId];
    }

    /**
     * @inheritdoc IERC8004
     */
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
        AgentInfo memory agent = _agents[agentId];
        return (
            agent.owner,
            agent.metadataURI,
            _verifiedAgents[agentId],
            agent.reputation
        );
    }

    /**
     * @inheritdoc IAgentIdentity
     */
    function getAgentOwner(bytes32 agentId)
        external
        view
        override
        returns (address)
    {
        return _agents[agentId].owner;
    }

    /**
     * @inheritdoc IAgentIdentity
     */
    function getAgentReputation(bytes32 agentId)
        external
        view
        override
        returns (uint256)
    {
        return _agents[agentId].reputation;
    }

    /**
     * @inheritdoc IAgentIdentity
     */
    function getTotalAgents() external view override returns (uint256) {
        return _totalAgents.current();
    }

    /**
     * @inheritdoc IAgentIdentity
     */
    function getAgentsByOwner(address owner)
        external
        view
        override
        returns (bytes32[] memory)
    {
        return _ownerToAgents[owner];
    }

    /**
     * @inheritdoc IAgentIdentity
     */
    function isReputationOracle(address oracle)
        external
        view
        override
        returns (bool)
    {
        return hasRole(REPUTATION_ORACLE_ROLE, oracle);
    }

    /**
     * @notice Get nonce for address (for signature verification)
     * @param account Address to get nonce for
     * @return Current nonce
     */
    function getNonce(address account) external view returns (uint256) {
        return _nonces[account];
    }

    /**
     * @notice Get agent verifier
     * @param agentId Agent to query
     * @return verifier Address that verified the agent
     */
    function getAgentVerifier(bytes32 agentId) external view returns (address verifier) {
        return _agentVerifiers[agentId];
    }

    // =============================================================
    //                           ADMIN FUNCTIONS
    // =============================================================

    /**
     * @inheritdoc IAgentIdentity
     */
    function setReputationOracle(address oracle, bool authorized)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (authorized) {
            _grantRole(REPUTATION_ORACLE_ROLE, oracle);
        } else {
            _revokeRole(REPUTATION_ORACLE_ROLE, oracle);
        }
    }

    /**
     * @notice Set reputation decay rate
     * @param newDecayRate New decay rate (basis points)
     */
    function setReputationDecayRate(uint256 newDecayRate)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newDecayRate <= 100, "Decay rate too high"); // Max 1% per day
        reputationDecayRate = newDecayRate;
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
        emit EmergencyPause(msg.sender, block.timestamp);
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
        emit EmergencyUnpause(msg.sender, block.timestamp);
    }

    // =============================================================
    //                           INTERNAL FUNCTIONS
    // =============================================================

    /**
     * @dev Remove agent from owner's list
     */
    function _removeAgentFromOwner(bytes32 agentId, address owner) internal {
        bytes32[] storage ownerAgents = _ownerToAgents[owner];
        uint256 index = _agentOwnerIndex[agentId];
        uint256 lastIndex = ownerAgents.length - 1;

        if (index != lastIndex) {
            bytes32 lastAgentId = ownerAgents[lastIndex];
            ownerAgents[index] = lastAgentId;
            _agentOwnerIndex[lastAgentId] = index;
        }

        ownerAgents.pop();
        delete _agentOwnerIndex[agentId];
    }

    /**
     * @notice Check if contract supports interface
     * @param interfaceId Interface identifier
     * @return True if interface is supported
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return
            interfaceId == type(IAgentIdentity).interfaceId ||
            interfaceId == type(IERC8004).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}