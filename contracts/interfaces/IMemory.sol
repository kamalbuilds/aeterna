// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IMemory - Decentralized Memory Interface for AETERNA Protocol
 * @notice Defines functionality for storing and retrieving agent memories with cryptographic verification
 * @dev Implements secure memory storage with IPFS integration and zero-knowledge proofs
 * @custom:version 1.0.0
 * @custom:author AETERNA Protocol Team
 */
interface IMemory {
    // ============ EVENTS ============

    /**
     * @dev Emitted when a memory is stored
     * @param memoryId Unique memory identifier
     * @param agentId Agent that owns the memory
     * @param contentHash Hash of the memory content
     * @param accessLevel Access level for the memory
     * @param timestamp When the memory was stored
     */
    event MemoryStored(
        bytes32 indexed memoryId,
        uint256 indexed agentId,
        bytes32 contentHash,
        AccessLevel accessLevel,
        uint256 timestamp
    );

    /**
     * @dev Emitted when a memory is accessed
     * @param memoryId Memory identifier
     * @param accessor Address accessing the memory
     * @param agentId Agent requesting access
     * @param timestamp Access timestamp
     */
    event MemoryAccessed(
        bytes32 indexed memoryId,
        address indexed accessor,
        uint256 indexed agentId,
        uint256 timestamp
    );

    /**
     * @dev Emitted when memory access permissions are updated
     * @param memoryId Memory identifier
     * @param grantedTo Address granted access
     * @param accessLevel Level of access granted
     * @param grantor Address granting access
     */
    event AccessGranted(
        bytes32 indexed memoryId,
        address indexed grantedTo,
        AccessLevel accessLevel,
        address indexed grantor
    );

    /**
     * @dev Emitted when a memory is updated
     * @param memoryId Memory identifier
     * @param oldContentHash Previous content hash
     * @param newContentHash New content hash
     * @param updatedBy Address performing the update
     */
    event MemoryUpdated(
        bytes32 indexed memoryId,
        bytes32 oldContentHash,
        bytes32 newContentHash,
        address indexed updatedBy
    );

    /**
     * @dev Emitted when a memory is deleted or archived
     * @param memoryId Memory identifier
     * @param agentId Owner agent ID
     * @param deletedBy Address performing deletion
     * @param isArchived Whether memory is archived (true) or permanently deleted (false)
     */
    event MemoryDeleted(
        bytes32 indexed memoryId,
        uint256 indexed agentId,
        address indexed deletedBy,
        bool isArchived
    );

    /**
     * @dev Emitted when memory encryption key is rotated
     * @param agentId Agent whose encryption key was rotated
     * @param oldKeyHash Hash of the old key
     * @param newKeyHash Hash of the new key
     */
    event EncryptionKeyRotated(
        uint256 indexed agentId,
        bytes32 oldKeyHash,
        bytes32 newKeyHash
    );

    // ============ ENUMS ============

    /**
     * @dev Access levels for memory entries
     */
    enum AccessLevel {
        Private,        // Only agent owner can access
        Protected,      // Owner + explicitly granted addresses
        Internal,       // Any agent in the same protocol
        Public,         // Anyone can read (but not modify)
        Shared          // Collaborative access with multiple agents
    }

    /**
     * @dev Types of memory content
     */
    enum MemoryType {
        Experience,     // Past experiences and learnings
        Knowledge,      // Factual information and data
        Preference,     // User preferences and settings
        Relationship,   // Social connections and interactions
        Task,          // Task-related information
        Log,           // Activity logs and traces
        Model          // AI model parameters or updates
    }

    /**
     * @dev Memory status
     */
    enum MemoryStatus {
        Active,         // Memory is active and accessible
        Archived,       // Memory is archived but accessible
        Deleted,        // Memory is marked for deletion
        Corrupted,      // Memory integrity check failed
        Locked          // Memory is temporarily locked
    }

    // ============ STRUCTS ============

    /**
     * @dev Core memory entry structure
     */
    struct MemoryEntry {
        bytes32 id;                    // Unique memory identifier
        uint256 agentId;               // Owner agent ID
        MemoryType memoryType;         // Type of memory
        AccessLevel accessLevel;       // Access control level
        MemoryStatus status;           // Current status
        bytes32 contentHash;           // Hash of encrypted content
        bytes32 metadataHash;          // Hash of metadata
        string ipfsHash;               // IPFS hash for content storage
        uint256 createdAt;             // Creation timestamp
        uint256 updatedAt;             // Last update timestamp
        uint256 accessCount;           // Number of times accessed
        uint256 size;                  // Size in bytes
        bytes32 parentMemoryId;        // Parent memory (for hierarchical structure)
        bytes32[] tags;                // Tags for categorization
    }

    /**
     * @dev Memory access permissions
     */
    struct AccessPermission {
        address accessor;              // Address with access
        AccessLevel level;             // Level of access granted
        uint256 grantedAt;             // When access was granted
        uint256 expiresAt;             // When access expires (0 = never)
        bool canShare;                 // Whether accessor can share with others
        string purpose;                // Purpose of access (optional)
    }

    /**
     * @dev Memory verification proof
     */
    struct VerificationProof {
        bytes32 merkleRoot;            // Merkle root of memory tree
        bytes32[] proof;               // Merkle proof path
        bytes zkProof;                 // Zero-knowledge proof
        bytes signature;               // Digital signature
        address verifier;              // Address of verifying entity
        uint256 verifiedAt;            // Verification timestamp
    }

    /**
     * @dev Memory query filters
     */
    struct MemoryFilter {
        uint256 agentId;               // Filter by agent (0 = all)
        MemoryType memoryType;         // Filter by type
        AccessLevel minAccessLevel;    // Minimum access level
        uint256 fromTimestamp;         // From timestamp
        uint256 toTimestamp;           // To timestamp
        bytes32[] tags;                // Required tags
        uint256 minSize;               // Minimum size
        uint256 maxSize;               // Maximum size
    }

    // ============ CORE FUNCTIONS ============

    /**
     * @notice Store a new memory entry
     * @param agentId Agent storing the memory
     * @param memoryType Type of memory being stored
     * @param accessLevel Access control level
     * @param contentHash Hash of the encrypted content
     * @param metadataHash Hash of the metadata
     * @param ipfsHash IPFS hash for content storage
     * @param tags Tags for categorization
     * @param parentMemoryId Parent memory ID (for hierarchical structure)
     * @return memoryId Unique identifier for the stored memory
     */
    function storeMemory(
        uint256 agentId,
        MemoryType memoryType,
        AccessLevel accessLevel,
        bytes32 contentHash,
        bytes32 metadataHash,
        string calldata ipfsHash,
        bytes32[] calldata tags,
        bytes32 parentMemoryId
    ) external returns (bytes32 memoryId);

    /**
     * @notice Retrieve memory content
     * @param memoryId Memory identifier
     * @param accessor Address requesting access
     * @param proof Access proof (for private memories)
     * @return memory MemoryEntry struct
     */
    function getMemory(
        bytes32 memoryId,
        address accessor,
        bytes calldata proof
    ) external returns (MemoryEntry memory);

    /**
     * @notice Update existing memory
     * @param memoryId Memory to update
     * @param newContentHash New content hash
     * @param newMetadataHash New metadata hash
     * @param newIpfsHash New IPFS hash
     * @param newTags New tags
     */
    function updateMemory(
        bytes32 memoryId,
        bytes32 newContentHash,
        bytes32 newMetadataHash,
        string calldata newIpfsHash,
        bytes32[] calldata newTags
    ) external;

    /**
     * @notice Delete or archive a memory
     * @param memoryId Memory to delete
     * @param archive Whether to archive (true) or permanently delete (false)
     */
    function deleteMemory(bytes32 memoryId, bool archive) external;

    /**
     * @notice Grant access to a memory
     * @param memoryId Memory identifier
     * @param grantTo Address to grant access to
     * @param accessLevel Level of access to grant
     * @param expiresAt Expiration timestamp (0 = never expires)
     * @param canShare Whether grantee can share access
     * @param purpose Purpose of access
     */
    function grantAccess(
        bytes32 memoryId,
        address grantTo,
        AccessLevel accessLevel,
        uint256 expiresAt,
        bool canShare,
        string calldata purpose
    ) external;

    /**
     * @notice Revoke access to a memory
     * @param memoryId Memory identifier
     * @param revokeFrom Address to revoke access from
     */
    function revokeAccess(bytes32 memoryId, address revokeFrom) external;

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Check if an address has access to a memory
     * @param memoryId Memory identifier
     * @param accessor Address to check
     * @return hasAccess Whether access is granted
     * @return accessLevel Level of access
     */
    function hasAccess(bytes32 memoryId, address accessor)
        external view returns (bool hasAccess, AccessLevel accessLevel);

    /**
     * @notice Get memory metadata without accessing content
     * @param memoryId Memory identifier
     * @return memory MemoryEntry struct (content hash may be redacted)
     */
    function getMemoryMetadata(bytes32 memoryId) external view returns (MemoryEntry memory);

    /**
     * @notice Query memories by filter criteria
     * @param filter Query filter parameters
     * @param offset Pagination offset
     * @param limit Maximum results to return
     * @return memoryIds Array of matching memory IDs
     * @return total Total number of matches
     */
    function queryMemories(
        MemoryFilter calldata filter,
        uint256 offset,
        uint256 limit
    ) external view returns (bytes32[] memory memoryIds, uint256 total);

    /**
     * @notice Get all memories owned by an agent
     * @param agentId Agent identifier
     * @param includeArchived Whether to include archived memories
     * @return Array of memory IDs
     */
    function getAgentMemories(uint256 agentId, bool includeArchived)
        external view returns (bytes32[] memory);

    /**
     * @notice Get memories by tag
     * @param tag Tag to search for
     * @param accessibleBy Address that must have access
     * @return Array of memory IDs
     */
    function getMemoriesByTag(bytes32 tag, address accessibleBy)
        external view returns (bytes32[] memory);

    /**
     * @notice Get memory tree children
     * @param parentMemoryId Parent memory ID
     * @return Array of child memory IDs
     */
    function getChildMemories(bytes32 parentMemoryId) external view returns (bytes32[] memory);

    /**
     * @notice Get total memory count for an agent
     * @param agentId Agent identifier
     * @return total Total number of memories
     * @return active Number of active memories
     * @return archived Number of archived memories
     */
    function getMemoryStats(uint256 agentId)
        external view returns (uint256 total, uint256 active, uint256 archived);

    // ============ VERIFICATION FUNCTIONS ============

    /**
     * @notice Verify memory integrity
     * @param memoryId Memory to verify
     * @param proof Verification proof
     * @return isValid Whether the memory is valid
     * @return verificationLevel Level of verification achieved
     */
    function verifyMemory(bytes32 memoryId, VerificationProof calldata proof)
        external view returns (bool isValid, uint8 verificationLevel);

    /**
     * @notice Generate verification proof for a memory
     * @param memoryId Memory identifier
     * @return proof Verification proof structure
     */
    function generateVerificationProof(bytes32 memoryId)
        external view returns (VerificationProof memory proof);

    // ============ ENCRYPTION FUNCTIONS ============

    /**
     * @notice Rotate encryption key for an agent
     * @param agentId Agent whose key to rotate
     * @param newKeyHash Hash of the new encryption key
     */
    function rotateEncryptionKey(uint256 agentId, bytes32 newKeyHash) external;

    /**
     * @notice Get current encryption key hash for an agent
     * @param agentId Agent identifier
     * @return keyHash Current key hash
     * @return lastRotated Last rotation timestamp
     */
    function getEncryptionKeyInfo(uint256 agentId)
        external view returns (bytes32 keyHash, uint256 lastRotated);

    // ============ BATCH OPERATIONS ============

    /**
     * @notice Batch store multiple memories
     * @param memories Array of memory data to store
     * @return memoryIds Array of generated memory IDs
     */
    function batchStoreMemories(
        MemoryEntry[] calldata memories
    ) external returns (bytes32[] memory memoryIds);

    /**
     * @notice Batch grant access to multiple memories
     * @param memoryIds Array of memory IDs
     * @param grantTo Address to grant access to
     * @param accessLevel Access level to grant
     */
    function batchGrantAccess(
        bytes32[] calldata memoryIds,
        address grantTo,
        AccessLevel accessLevel
    ) external;
}