// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IMemoryContract
 * @notice Interface for on-chain memory integrity verification
 * @dev Provides cryptographic proofs for off-chain memory storage
 */
interface IMemoryContract {

    // Memory entry metadata
    struct MemoryEntry {
        bytes32 contentHash;       // Hash of the memory content
        uint256 timestamp;         // When memory was stored
        address validator;         // Address that validated the memory
        bytes signature;           // Cryptographic signature
        uint256 importance;        // Importance score (0-100)
        bytes32[] tags;           // Content tags for categorization
        bool isVerified;          // Verification status
    }

    // Memory checkpoint for batch verification
    struct MemoryCheckpoint {
        bytes32 merkleRoot;        // Merkle root of memory batch
        uint256 fromTimestamp;     // Start timestamp of batch
        uint256 toTimestamp;       // End timestamp of batch
        uint256 entryCount;        // Number of entries in batch
        bytes32 previousRoot;      // Previous checkpoint root
        bool isFinalized;          // Finalization status
    }

    // Events
    event MemoryStored(
        bytes32 indexed agentId,
        bytes32 indexed contentHash,
        uint256 timestamp,
        uint256 importance
    );

    event MemoryVerified(
        bytes32 indexed agentId,
        bytes32 indexed contentHash,
        address indexed validator
    );

    event CheckpointCreated(
        bytes32 indexed agentId,
        bytes32 merkleRoot,
        uint256 fromTimestamp,
        uint256 toTimestamp,
        uint256 entryCount
    );

    event MemoryAccessed(
        bytes32 indexed agentId,
        bytes32 indexed contentHash,
        address indexed accessor,
        uint256 timestamp
    );

    event MemoryIntegrityViolation(
        bytes32 indexed agentId,
        bytes32 indexed contentHash,
        string reason
    );

    /**
     * @notice Store memory entry hash with verification
     * @param agentId Agent storing the memory
     * @param contentHash Hash of the memory content
     * @param signature Cryptographic signature of content
     * @param importance Importance score (0-100)
     * @param tags Content categorization tags
     * @return entryId Unique identifier for the memory entry
     */
    function storeMemory(
        bytes32 agentId,
        bytes32 contentHash,
        bytes calldata signature,
        uint256 importance,
        bytes32[] calldata tags
    ) external returns (uint256 entryId);

    /**
     * @notice Verify memory integrity
     * @param agentId Agent whose memory to verify
     * @param contentHash Hash to verify
     * @param content Original content for verification
     * @param signature Expected signature
     * @return isValid True if memory is valid and unmodified
     */
    function verifyMemoryIntegrity(
        bytes32 agentId,
        bytes32 contentHash,
        bytes calldata content,
        bytes calldata signature
    ) external view returns (bool isValid);

    /**
     * @notice Create memory checkpoint for batch verification
     * @param agentId Agent creating checkpoint
     * @param merkleRoot Merkle root of memory batch
     * @param fromTimestamp Start timestamp
     * @param toTimestamp End timestamp
     * @param entryCount Number of entries
     * @dev Creates immutable checkpoint for memory integrity
     */
    function createCheckpoint(
        bytes32 agentId,
        bytes32 merkleRoot,
        uint256 fromTimestamp,
        uint256 toTimestamp,
        uint256 entryCount
    ) external;

    /**
     * @notice Record memory access for audit trail
     * @param agentId Agent whose memory was accessed
     * @param contentHash Hash of accessed memory
     * @dev Automatically called when memory is retrieved
     */
    function recordMemoryAccess(
        bytes32 agentId,
        bytes32 contentHash
    ) external;

    /**
     * @notice Verify merkle proof for memory entry
     * @param agentId Agent to verify
     * @param contentHash Memory hash to verify
     * @param merkleProof Merkle proof array
     * @param merkleRoot Root to verify against
     * @return isValid True if proof is valid
     */
    function verifyMerkleProof(
        bytes32 agentId,
        bytes32 contentHash,
        bytes32[] calldata merkleProof,
        bytes32 merkleRoot
    ) external pure returns (bool isValid);

    /**
     * @notice Report memory integrity violation
     * @param agentId Agent with violated memory
     * @param contentHash Hash of corrupted memory
     * @param reason Description of the violation
     * @dev Can be called by authorized validators or oracles
     */
    function reportIntegrityViolation(
        bytes32 agentId,
        bytes32 contentHash,
        string calldata reason
    ) external;

    /**
     * @notice Get memory entry information
     * @param agentId Agent to query
     * @param contentHash Memory hash to query
     * @return entry Complete memory entry information
     */
    function getMemoryEntry(
        bytes32 agentId,
        bytes32 contentHash
    ) external view returns (MemoryEntry memory entry);

    /**
     * @notice Get latest checkpoint for agent
     * @param agentId Agent to query
     * @return checkpoint Latest memory checkpoint
     */
    function getLatestCheckpoint(
        bytes32 agentId
    ) external view returns (MemoryCheckpoint memory checkpoint);

    /**
     * @notice Get memory entries by importance
     * @param agentId Agent to query
     * @param minImportance Minimum importance threshold
     * @param limit Maximum number of entries to return
     * @return hashes Array of content hashes matching criteria
     */
    function getMemoriesByImportance(
        bytes32 agentId,
        uint256 minImportance,
        uint256 limit
    ) external view returns (bytes32[] memory hashes);

    /**
     * @notice Get memory entries by tags
     * @param agentId Agent to query
     * @param tags Tags to search for
     * @param limit Maximum number of entries to return
     * @return hashes Array of content hashes with matching tags
     */
    function getMemoriesByTags(
        bytes32 agentId,
        bytes32[] calldata tags,
        uint256 limit
    ) external view returns (bytes32[] memory hashes);

    /**
     * @notice Get total memory count for agent
     * @param agentId Agent to query
     * @return count Total number of stored memories
     */
    function getMemoryCount(bytes32 agentId) external view returns (uint256 count);

    /**
     * @notice Get memory statistics for agent
     * @param agentId Agent to query
     * @return totalEntries Total memory entries
     * @return verifiedEntries Number of verified entries
     * @return lastStoredTimestamp Most recent storage timestamp
     * @return averageImportance Average importance score
     */
    function getMemoryStats(bytes32 agentId) external view returns (
        uint256 totalEntries,
        uint256 verifiedEntries,
        uint256 lastStoredTimestamp,
        uint256 averageImportance
    );

    /**
     * @notice Check if address is authorized memory validator
     * @param validator Address to check
     * @return True if authorized validator
     */
    function isMemoryValidator(address validator) external view returns (bool);

    /**
     * @notice Set memory validator authorization
     * @param validator Validator address
     * @param authorized Authorization status
     * @dev Only contract owner can call this
     */
    function setMemoryValidator(address validator, bool authorized) external;
}