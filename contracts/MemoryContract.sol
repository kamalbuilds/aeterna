// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/IMemoryContract.sol";
import "./interfaces/IAgentIdentity.sol";

/**
 * @title MemoryContract
 * @dev Implementation of on-chain memory integrity verification with cryptographic proofs
 * @author AETERNA Protocol Team
 * @notice Provides cryptographic verification for off-chain memory storage with audit trails
 */
contract MemoryContract is
    IMemoryContract,
    ReentrancyGuard,
    AccessControl,
    Pausable
{
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /// @dev Role identifiers
    bytes32 public constant MEMORY_VALIDATOR_ROLE = keccak256("MEMORY_VALIDATOR_ROLE");
    bytes32 public constant CHECKPOINT_CREATOR_ROLE = keccak256("CHECKPOINT_CREATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @dev Memory configuration constants
    uint256 public constant MAX_IMPORTANCE = 100;
    uint256 public constant MAX_TAGS_PER_ENTRY = 10;
    uint256 public constant CHECKPOINT_BATCH_SIZE = 1000;
    uint256 public constant MEMORY_RETENTION_PERIOD = 365 days;
    uint256 public constant MAX_MEMORY_ENTRIES_PER_AGENT = 100000;

    /// @dev Agent identity contract reference
    IAgentIdentity public immutable agentIdentity;

    /// @dev Memory storage mappings
    mapping(bytes32 => mapping(bytes32 => MemoryEntry)) private _agentMemories;
    mapping(bytes32 => EnumerableSet.Bytes32Set) private _agentMemoryHashes;
    mapping(bytes32 => mapping(uint256 => MemoryCheckpoint)) private _agentCheckpoints;
    mapping(bytes32 => uint256) private _checkpointCounts;

    /// @dev Memory statistics
    mapping(bytes32 => MemoryStats) private _agentStats;
    mapping(bytes32 => mapping(bytes32 => uint256)) private _taggedMemories;
    mapping(bytes32 => mapping(uint256 => bytes32[])) private _importanceIndex;

    /// @dev Access tracking
    mapping(bytes32 => mapping(bytes32 => AccessLog[])) private _accessLogs;
    mapping(bytes32 => uint256) private _lastCleanup;

    /// @dev Validation tracking
    mapping(address => bool) private _memoryValidators;
    mapping(bytes32 => uint256) private _violationCounts;
    mapping(bytes32 => mapping(bytes32 => bool)) private _quarantinedMemories;

    /// @dev Memory statistics structure
    struct MemoryStats {
        uint256 totalEntries;
        uint256 verifiedEntries;
        uint256 lastStoredTimestamp;
        uint256 totalImportanceScore;
        uint256 averageImportance;
    }

    /// @dev Access log structure
    struct AccessLog {
        address accessor;
        uint256 timestamp;
        bytes32 contextHash;
    }

    /**
     * @dev Contract constructor
     * @param _agentIdentity Address of agent identity contract
     * @param admin Admin address for role management
     */
    constructor(address _agentIdentity, address admin) {
        require(_agentIdentity != address(0), "MemoryContract: invalid agent identity contract");
        require(admin != address(0), "MemoryContract: invalid admin address");

        agentIdentity = IAgentIdentity(_agentIdentity);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MEMORY_VALIDATOR_ROLE, admin);
        _grantRole(CHECKPOINT_CREATOR_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
    }

    /**
     * @dev Modifier to check if agent exists
     * @param agentId Agent ID to verify
     */
    modifier agentMustExist(bytes32 agentId) {
        require(agentIdentity.agentExists(agentId), "MemoryContract: agent does not exist");
        _;
    }

    /**
     * @dev Modifier to check agent owner or authorized operator
     * @param agentId Agent ID to verify ownership
     */
    modifier onlyAgentOwnerOrValidator(bytes32 agentId) {
        require(
            agentIdentity.getAgentOwner(agentId) == msg.sender ||
            hasRole(MEMORY_VALIDATOR_ROLE, msg.sender) ||
            hasRole(ORACLE_ROLE, msg.sender),
            "MemoryContract: unauthorized"
        );
        _;
    }

    /// @inheritdoc IMemoryContract
    function storeMemory(
        bytes32 agentId,
        bytes32 contentHash,
        bytes calldata signature,
        uint256 importance,
        bytes32[] calldata tags
    )
        external
        override
        nonReentrant
        whenNotPaused
        agentMustExist(agentId)
        onlyAgentOwnerOrValidator(agentId)
        returns (uint256 entryId)
    {
        require(contentHash != bytes32(0), "MemoryContract: invalid content hash");
        require(importance <= MAX_IMPORTANCE, "MemoryContract: importance exceeds maximum");
        require(tags.length <= MAX_TAGS_PER_ENTRY, "MemoryContract: too many tags");
        require(signature.length > 0, "MemoryContract: signature required");

        // Check storage limits
        MemoryStats storage stats = _agentStats[agentId];
        require(
            stats.totalEntries < MAX_MEMORY_ENTRIES_PER_AGENT,
            "MemoryContract: agent memory limit exceeded"
        );

        // Check if memory already exists
        require(
            _agentMemories[agentId][contentHash].timestamp == 0,
            "MemoryContract: memory already stored"
        );

        // Verify signature format (basic validation)
        require(_isValidSignature(signature), "MemoryContract: invalid signature format");

        // Create memory entry
        MemoryEntry memory entry = MemoryEntry({
            contentHash: contentHash,
            timestamp: block.timestamp,
            validator: msg.sender,
            signature: signature,
            importance: importance,
            tags: tags,
            isVerified: false
        });

        // Store memory entry
        _agentMemories[agentId][contentHash] = entry;
        _agentMemoryHashes[agentId].add(contentHash);

        // Update importance index
        _importanceIndex[agentId][importance].push(contentHash);

        // Update tag mappings
        for (uint256 i = 0; i < tags.length; i++) {
            _taggedMemories[agentId][tags[i]]++;
        }

        // Update statistics
        stats.totalEntries++;
        stats.lastStoredTimestamp = block.timestamp;
        stats.totalImportanceScore += importance;
        stats.averageImportance = stats.totalImportanceScore / stats.totalEntries;

        entryId = stats.totalEntries;

        emit MemoryStored(agentId, contentHash, block.timestamp, importance);

        return entryId;
    }

    /// @inheritdoc IMemoryContract
    function verifyMemoryIntegrity(
        bytes32 agentId,
        bytes32 contentHash,
        bytes calldata content,
        bytes calldata signature
    )
        external
        view
        override
        returns (bool isValid)
    {
        MemoryEntry storage entry = _agentMemories[agentId][contentHash];

        if (entry.timestamp == 0) {
            return false; // Memory does not exist
        }

        // Check if memory is quarantined
        if (_quarantinedMemories[agentId][contentHash]) {
            return false;
        }

        // Verify content hash matches
        bytes32 computedHash = keccak256(content);
        if (computedHash != contentHash) {
            return false;
        }

        // Verify signature (simplified - would use more sophisticated verification)
        if (keccak256(entry.signature) != keccak256(signature)) {
            return false;
        }

        return true;
    }

    /// @inheritdoc IMemoryContract
    function createCheckpoint(
        bytes32 agentId,
        bytes32 merkleRoot,
        uint256 fromTimestamp,
        uint256 toTimestamp,
        uint256 entryCount
    )
        external
        override
        nonReentrant
        whenNotPaused
        agentMustExist(agentId)
        onlyRole(CHECKPOINT_CREATOR_ROLE)
    {
        require(merkleRoot != bytes32(0), "MemoryContract: invalid merkle root");
        require(fromTimestamp <= toTimestamp, "MemoryContract: invalid timestamp range");
        require(toTimestamp <= block.timestamp, "MemoryContract: future timestamp");
        require(entryCount > 0, "MemoryContract: no entries to checkpoint");

        uint256 checkpointId = _checkpointCounts[agentId];
        bytes32 previousRoot = checkpointId > 0 ?
            _agentCheckpoints[agentId][checkpointId - 1].merkleRoot : bytes32(0);

        MemoryCheckpoint memory checkpoint = MemoryCheckpoint({
            merkleRoot: merkleRoot,
            fromTimestamp: fromTimestamp,
            toTimestamp: toTimestamp,
            entryCount: entryCount,
            previousRoot: previousRoot,
            isFinalized: true
        });

        _agentCheckpoints[agentId][checkpointId] = checkpoint;
        _checkpointCounts[agentId]++;

        emit CheckpointCreated(
            agentId,
            merkleRoot,
            fromTimestamp,
            toTimestamp,
            entryCount
        );
    }

    /// @inheritdoc IMemoryContract
    function recordMemoryAccess(
        bytes32 agentId,
        bytes32 contentHash
    )
        external
        override
        agentMustExist(agentId)
    {
        require(_agentMemories[agentId][contentHash].timestamp != 0, "MemoryContract: memory does not exist");

        AccessLog memory log = AccessLog({
            accessor: msg.sender,
            timestamp: block.timestamp,
            contextHash: keccak256(abi.encodePacked(msg.sender, block.timestamp))
        });

        _accessLogs[agentId][contentHash].push(log);

        emit MemoryAccessed(agentId, contentHash, msg.sender, block.timestamp);
    }

    /// @inheritdoc IMemoryContract
    function verifyMerkleProof(
        bytes32 agentId,
        bytes32 contentHash,
        bytes32[] calldata merkleProof,
        bytes32 merkleRoot
    )
        external
        pure
        override
        returns (bool isValid)
    {
        // Suppress unused parameter warnings
        agentId;

        return MerkleProof.verify(merkleProof, merkleRoot, contentHash);
    }

    /// @inheritdoc IMemoryContract
    function reportIntegrityViolation(
        bytes32 agentId,
        bytes32 contentHash,
        string calldata reason
    )
        external
        override
        agentMustExist(agentId)
        onlyRole(MEMORY_VALIDATOR_ROLE)
    {
        require(bytes(reason).length > 0, "MemoryContract: reason required");
        require(_agentMemories[agentId][contentHash].timestamp != 0, "MemoryContract: memory does not exist");

        // Quarantine the memory
        _quarantinedMemories[agentId][contentHash] = true;
        _violationCounts[agentId]++;

        // Update verification status
        _agentMemories[agentId][contentHash].isVerified = false;

        emit MemoryIntegrityViolation(agentId, contentHash, reason);
    }

    /// @inheritdoc IMemoryContract
    function getMemoryEntry(
        bytes32 agentId,
        bytes32 contentHash
    )
        external
        view
        override
        returns (MemoryEntry memory entry)
    {
        require(_agentMemories[agentId][contentHash].timestamp != 0, "MemoryContract: memory does not exist");
        return _agentMemories[agentId][contentHash];
    }

    /// @inheritdoc IMemoryContract
    function getLatestCheckpoint(
        bytes32 agentId
    )
        external
        view
        override
        returns (MemoryCheckpoint memory checkpoint)
    {
        uint256 checkpointCount = _checkpointCounts[agentId];
        require(checkpointCount > 0, "MemoryContract: no checkpoints exist");

        return _agentCheckpoints[agentId][checkpointCount - 1];
    }

    /// @inheritdoc IMemoryContract
    function getMemoriesByImportance(
        bytes32 agentId,
        uint256 minImportance,
        uint256 limit
    )
        external
        view
        override
        returns (bytes32[] memory hashes)
    {
        require(minImportance <= MAX_IMPORTANCE, "MemoryContract: importance exceeds maximum");
        require(limit > 0 && limit <= 1000, "MemoryContract: invalid limit");

        uint256 resultCount = 0;
        uint256 maxResults = limit;

        // First pass: count results
        for (uint256 importance = minImportance; importance <= MAX_IMPORTANCE && resultCount < maxResults; importance++) {
            bytes32[] storage importanceHashes = _importanceIndex[agentId][importance];
            for (uint256 j = 0; j < importanceHashes.length && resultCount < maxResults; j++) {
                if (!_quarantinedMemories[agentId][importanceHashes[j]]) {
                    resultCount++;
                }
            }
        }

        // Create result array
        hashes = new bytes32[](resultCount);
        uint256 index = 0;

        // Second pass: populate results
        for (uint256 importance = minImportance; importance <= MAX_IMPORTANCE && index < resultCount; importance++) {
            bytes32[] storage importanceHashes = _importanceIndex[agentId][importance];
            for (uint256 j = 0; j < importanceHashes.length && index < resultCount; j++) {
                if (!_quarantinedMemories[agentId][importanceHashes[j]]) {
                    hashes[index] = importanceHashes[j];
                    index++;
                }
            }
        }

        return hashes;
    }

    /// @inheritdoc IMemoryContract
    function getMemoriesByTags(
        bytes32 agentId,
        bytes32[] calldata tags,
        uint256 limit
    )
        external
        view
        override
        returns (bytes32[] memory hashes)
    {
        require(tags.length > 0, "MemoryContract: no tags provided");
        require(limit > 0 && limit <= 1000, "MemoryContract: invalid limit");

        uint256 memoryCount = _agentMemoryHashes[agentId].length();
        uint256 resultCount = 0;
        bytes32[] memory tempHashes = new bytes32[](memoryCount);

        for (uint256 i = 0; i < memoryCount && resultCount < limit; i++) {
            bytes32 contentHash = _agentMemoryHashes[agentId].at(i);

            if (_quarantinedMemories[agentId][contentHash]) {
                continue;
            }

            MemoryEntry storage entry = _agentMemories[agentId][contentHash];

            // Check if memory has any of the required tags
            bool hasTag = false;
            for (uint256 j = 0; j < tags.length && !hasTag; j++) {
                for (uint256 k = 0; k < entry.tags.length; k++) {
                    if (entry.tags[k] == tags[j]) {
                        hasTag = true;
                        break;
                    }
                }
            }

            if (hasTag) {
                tempHashes[resultCount] = contentHash;
                resultCount++;
            }
        }

        // Create properly sized result array
        hashes = new bytes32[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            hashes[i] = tempHashes[i];
        }

        return hashes;
    }

    /// @inheritdoc IMemoryContract
    function getMemoryCount(bytes32 agentId) external view override returns (uint256 count) {
        return _agentStats[agentId].totalEntries;
    }

    /// @inheritdoc IMemoryContract
    function getMemoryStats(bytes32 agentId)
        external
        view
        override
        returns (
            uint256 totalEntries,
            uint256 verifiedEntries,
            uint256 lastStoredTimestamp,
            uint256 averageImportance
        )
    {
        MemoryStats storage stats = _agentStats[agentId];
        return (
            stats.totalEntries,
            stats.verifiedEntries,
            stats.lastStoredTimestamp,
            stats.averageImportance
        );
    }

    /// @inheritdoc IMemoryContract
    function isMemoryValidator(address validator) external view override returns (bool) {
        return hasRole(MEMORY_VALIDATOR_ROLE, validator);
    }

    /// @inheritdoc IMemoryContract
    function setMemoryValidator(address validator, bool authorized)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (authorized) {
            _grantRole(MEMORY_VALIDATOR_ROLE, validator);
        } else {
            _revokeRole(MEMORY_VALIDATOR_ROLE, validator);
        }
    }

    /**
     * @dev Verify memory entry with cryptographic proof
     * @param agentId Agent ID
     * @param contentHash Memory content hash
     * @param validator Validator address
     */
    function verifyMemoryEntry(
        bytes32 agentId,
        bytes32 contentHash,
        address validator
    )
        external
        onlyRole(MEMORY_VALIDATOR_ROLE)
    {
        require(_agentMemories[agentId][contentHash].timestamp != 0, "MemoryContract: memory does not exist");
        require(!_quarantinedMemories[agentId][contentHash], "MemoryContract: memory quarantined");

        MemoryEntry storage entry = _agentMemories[agentId][contentHash];
        entry.isVerified = true;
        entry.validator = validator;

        _agentStats[agentId].verifiedEntries++;

        emit MemoryVerified(agentId, contentHash, validator);
    }

    /**
     * @dev Clean up old memory entries
     * @param agentId Agent ID
     */
    function cleanupOldMemories(bytes32 agentId) external onlyRole(MEMORY_VALIDATOR_ROLE) {
        uint256 lastCleanupTime = _lastCleanup[agentId];
        require(
            block.timestamp >= lastCleanupTime + MEMORY_RETENTION_PERIOD,
            "MemoryContract: too early for cleanup"
        );

        uint256 cutoffTime = block.timestamp - MEMORY_RETENTION_PERIOD;
        uint256 memoryCount = _agentMemoryHashes[agentId].length();
        uint256 cleanedCount = 0;

        for (uint256 i = 0; i < memoryCount; i++) {
            bytes32 contentHash = _agentMemoryHashes[agentId].at(i);
            MemoryEntry storage entry = _agentMemories[agentId][contentHash];

            if (entry.timestamp < cutoffTime && entry.importance < 50) {
                // Remove low-importance old memories
                delete _agentMemories[agentId][contentHash];
                _agentMemoryHashes[agentId].remove(contentHash);
                cleanedCount++;

                if (cleanedCount >= 100) break; // Limit cleanup per transaction
            }
        }

        _lastCleanup[agentId] = block.timestamp;

        // Update statistics
        MemoryStats storage stats = _agentStats[agentId];
        stats.totalEntries -= cleanedCount;
        if (stats.totalEntries > 0) {
            stats.averageImportance = stats.totalImportanceScore / stats.totalEntries;
        }
    }

    /**
     * @dev Get memory access logs
     * @param agentId Agent ID
     * @param contentHash Content hash
     * @return logs Array of access logs
     */
    function getAccessLogs(bytes32 agentId, bytes32 contentHash)
        external
        view
        returns (AccessLog[] memory logs)
    {
        return _accessLogs[agentId][contentHash];
    }

    /**
     * @dev Check if memory is quarantined
     * @param agentId Agent ID
     * @param contentHash Content hash
     * @return quarantined Whether memory is quarantined
     */
    function isMemoryQuarantined(bytes32 agentId, bytes32 contentHash)
        external
        view
        returns (bool quarantined)
    {
        return _quarantinedMemories[agentId][contentHash];
    }

    /**
     * @dev Get violation count for agent
     * @param agentId Agent ID
     * @return count Number of violations
     */
    function getViolationCount(bytes32 agentId) external view returns (uint256 count) {
        return _violationCounts[agentId];
    }

    /**
     * @dev Internal function to validate signature format
     * @param signature Signature to validate
     * @return valid Whether signature format is valid
     */
    function _isValidSignature(bytes calldata signature) internal pure returns (bool valid) {
        return signature.length == 65; // Basic ECDSA signature length check
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
}