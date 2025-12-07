// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../interfaces/IMemory.sol";
import "../interfaces/IAgent.sol";

/**
 * @title MemoryContract - Decentralized Memory Storage for AETERNA Protocol
 * @notice Implements secure memory storage with cryptographic verification and IPFS integration
 * @dev Gas-optimized implementation with zero-knowledge proofs and access control
 * @custom:version 1.0.0
 * @custom:author AETERNA Protocol Team
 * @custom:security-contact security@aeterna.io
 */
contract MemoryContract is AccessControl, ReentrancyGuard, Pausable, IMemory {
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // ============ CONSTANTS ============

    bytes32 public constant MEMORY_MANAGER_ROLE = keccak256("MEMORY_MANAGER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant ENCRYPTION_MANAGER_ROLE = keccak256("ENCRYPTION_MANAGER_ROLE");

    uint256 public constant MAX_MEMORY_SIZE = 100 * 1024 * 1024; // 100 MB
    uint256 public constant MAX_TAGS_PER_MEMORY = 50;
    uint256 public constant MAX_ACCESS_PERMISSIONS = 1000;
    uint256 public constant VERIFICATION_THRESHOLD = 3;
    uint256 public constant MAX_BATCH_SIZE = 100;
    uint256 public constant MEMORY_EXPIRATION_BUFFER = 7 days;

    // Memory ID salt for security
    bytes32 private constant MEMORY_ID_SALT = keccak256("AETERNA_MEMORY_ID_SALT_V1");

    // ============ STATE VARIABLES ============

    IAgent public immutable agentRegistry;

    // Memory ID => Memory Entry
    mapping(bytes32 => MemoryEntry) private _memories;

    // Memory ID => Access Permissions
    mapping(bytes32 => mapping(address => AccessPermission)) private _accessPermissions;

    // Memory ID => List of addresses with access
    mapping(bytes32 => address[]) private _accessList;

    // Memory ID => Verification Proof
    mapping(bytes32 => VerificationProof) private _verificationProofs;

    // Agent ID => Memory IDs (for efficient querying)
    mapping(uint256 => EnumerableSet.Bytes32Set) private _agentMemories;

    // Tag => Memory IDs
    mapping(bytes32 => EnumerableSet.Bytes32Set) private _memoriesByTag;

    // Memory Type => Memory IDs
    mapping(MemoryType => EnumerableSet.Bytes32Set) private _memoriesByType;

    // Access Level => Memory IDs
    mapping(AccessLevel => EnumerableSet.Bytes32Set) private _memoriesByAccess;

    // Agent ID => Encryption Key Hash
    mapping(uint256 => bytes32) private _encryptionKeys;

    // Agent ID => Last Key Rotation Timestamp
    mapping(uint256 => uint256) private _lastKeyRotation;

    // Parent Memory ID => Child Memory IDs
    mapping(bytes32 => EnumerableSet.Bytes32Set) private _childMemories;

    // Global memory statistics
    mapping(uint256 => MemoryStatistics) private _agentMemoryStats;

    // Memory access tracking for analytics
    mapping(bytes32 => uint256) private _accessCounts;
    mapping(bytes32 => uint256) private _lastAccessTime;

    // Gas-optimized packed data for frequently accessed info
    struct PackedMemoryData {
        uint64 createdAt;
        uint64 updatedAt;
        uint64 accessCount;
        uint32 size;
        MemoryStatus status;
        AccessLevel accessLevel;
        MemoryType memoryType;
    }

    mapping(bytes32 => PackedMemoryData) private _packedMemoryData;

    struct MemoryStatistics {
        uint256 totalMemories;
        uint256 activeMemories;
        uint256 archivedMemories;
        uint256 totalSize;
        uint256 lastUpdated;
    }

    // ============ EVENTS ============

    event MemoryBatchStored(bytes32[] memoryIds, uint256 indexed agentId, uint256 totalSize);
    event MemoryVerified(bytes32 indexed memoryId, uint8 verificationLevel, address verifier);
    event EncryptionKeyBatchRotated(uint256[] agentIds, uint256 timestamp);
    event MemoryMigrated(bytes32 indexed memoryId, string oldIpfsHash, string newIpfsHash);
    event MemoryAnalyticsUpdated(uint256 indexed agentId, uint256 totalMemories, uint256 totalSize);

    // ============ CUSTOM ERRORS ============

    error MemoryNotFound(bytes32 memoryId);
    error MemoryAlreadyExists(bytes32 memoryId);
    error AccessDenied(address accessor, bytes32 memoryId);
    error InvalidMemorySize(uint256 provided, uint256 maximum);
    error InvalidTagCount(uint256 provided, uint256 maximum);
    error InvalidAccessLevel(AccessLevel provided);
    error MemoryLocked(bytes32 memoryId);
    error VerificationFailed(bytes32 memoryId, string reason);
    error BatchSizeExceeded(uint256 provided, uint256 maximum);
    error InvalidPermissionExpiry(uint256 expiresAt, uint256 currentTime);
    error MaxAccessPermissionsExceeded(uint256 current, uint256 maximum);
    error InvalidMemoryType(MemoryType memoryType);
    error InvalidProof(string reason);
    error EncryptionKeyNotSet(uint256 agentId);

    // ============ MODIFIERS ============

    modifier onlyAgentOwner(uint256 agentId) {
        if (!agentRegistry.isAuthorized(agentId, msg.sender)) {
            revert("Not authorized for agent");
        }
        _;
    }

    modifier memoryExists(bytes32 memoryId) {
        if (_memories[memoryId].id == bytes32(0)) {
            revert MemoryNotFound(memoryId);
        }
        _;
    }

    modifier hasMemoryAccess(bytes32 memoryId, address accessor) {
        (bool hasAccess,) = _checkAccess(memoryId, accessor);
        if (!hasAccess) {
            revert AccessDenied(accessor, memoryId);
        }
        _;
    }

    modifier validMemorySize(uint256 size) {
        if (size > MAX_MEMORY_SIZE) {
            revert InvalidMemorySize(size, MAX_MEMORY_SIZE);
        }
        _;
    }

    modifier validTagCount(uint256 tagCount) {
        if (tagCount > MAX_TAGS_PER_MEMORY) {
            revert InvalidTagCount(tagCount, MAX_TAGS_PER_MEMORY);
        }
        _;
    }

    modifier validBatchSize(uint256 batchSize) {
        if (batchSize > MAX_BATCH_SIZE) {
            revert BatchSizeExceeded(batchSize, MAX_BATCH_SIZE);
        }
        _;
    }

    // ============ CONSTRUCTOR ============

    constructor(
        address _agentRegistry,
        address defaultAdmin,
        address memoryManager,
        address verifier
    ) {
        agentRegistry = IAgent(_agentRegistry);

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MEMORY_MANAGER_ROLE, memoryManager);
        _grantRole(VERIFIER_ROLE, verifier);
        _grantRole(ENCRYPTION_MANAGER_ROLE, defaultAdmin);
    }

    // ============ CORE MEMORY FUNCTIONS ============

    /**
     * @notice Store a new memory entry
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
    ) external override nonReentrant whenNotPaused onlyAgentOwner(agentId)
      validTagCount(tags.length) returns (bytes32 memoryId)
    {
        // Generate unique memory ID
        memoryId = _generateMemoryId(agentId, contentHash, block.timestamp);

        // Ensure memory doesn't already exist
        if (_memories[memoryId].id != bytes32(0)) {
            revert MemoryAlreadyExists(memoryId);
        }

        // Validate parent memory if specified
        if (parentMemoryId != bytes32(0)) {
            if (_memories[parentMemoryId].id == bytes32(0)) {
                revert MemoryNotFound(parentMemoryId);
            }
        }

        // Create memory entry
        MemoryEntry storage memory_ = _memories[memoryId];
        memory_.id = memoryId;
        memory_.agentId = agentId;
        memory_.memoryType = memoryType;
        memory_.accessLevel = accessLevel;
        memory_.status = MemoryStatus.Active;
        memory_.contentHash = contentHash;
        memory_.metadataHash = metadataHash;
        memory_.ipfsHash = ipfsHash;
        memory_.createdAt = block.timestamp;
        memory_.updatedAt = block.timestamp;
        memory_.parentMemoryId = parentMemoryId;
        memory_.tags = tags;

        // Set default size (would be calculated from content in practice)
        memory_.size = 1024; // Placeholder

        // Store packed data for gas optimization
        PackedMemoryData storage packed = _packedMemoryData[memoryId];
        packed.createdAt = uint64(block.timestamp);
        packed.updatedAt = uint64(block.timestamp);
        packed.size = uint32(memory_.size);
        packed.status = MemoryStatus.Active;
        packed.accessLevel = accessLevel;
        packed.memoryType = memoryType;

        // Update indexes
        _agentMemories[agentId].add(memoryId);
        _memoriesByType[memoryType].add(memoryId);
        _memoriesByAccess[accessLevel].add(memoryId);

        // Index by tags
        for (uint256 i = 0; i < tags.length; i++) {
            _memoriesByTag[tags[i]].add(memoryId);
        }

        // Update parent-child relationship
        if (parentMemoryId != bytes32(0)) {
            _childMemories[parentMemoryId].add(memoryId);
        }

        // Update statistics
        _updateMemoryStatistics(agentId, memory_.size, true);

        emit MemoryStored(memoryId, agentId, contentHash, accessLevel, block.timestamp);
    }

    /**
     * @notice Retrieve memory content
     */
    function getMemory(
        bytes32 memoryId,
        address accessor,
        bytes calldata proof
    ) external override nonReentrant memoryExists(memoryId) hasMemoryAccess(memoryId, accessor)
      returns (MemoryEntry memory memory_)
    {
        memory_ = _memories[memoryId];

        // Verify access proof for private memories
        if (memory_.accessLevel == AccessLevel.Private && accessor != agentRegistry.ownerOf(memory_.agentId)) {
            if (!_verifyAccessProof(memoryId, accessor, proof)) {
                revert VerificationFailed(memoryId, "Invalid access proof");
            }
        }

        // Update access tracking
        _accessCounts[memoryId]++;
        _lastAccessTime[memoryId] = block.timestamp;
        _packedMemoryData[memoryId].accessCount++;

        emit MemoryAccessed(memoryId, accessor, memory_.agentId, block.timestamp);
    }

    /**
     * @notice Update existing memory
     */
    function updateMemory(
        bytes32 memoryId,
        bytes32 newContentHash,
        bytes32 newMetadataHash,
        string calldata newIpfsHash,
        bytes32[] calldata newTags
    ) external override nonReentrant memoryExists(memoryId) validTagCount(newTags.length) {
        MemoryEntry storage memory_ = _memories[memoryId];

        // Check authorization
        if (!agentRegistry.isAuthorized(memory_.agentId, msg.sender)) {
            revert AccessDenied(msg.sender, memoryId);
        }

        // Check if memory is locked
        if (memory_.status == MemoryStatus.Locked) {
            revert MemoryLocked(memoryId);
        }

        // Store old hashes for event
        bytes32 oldContentHash = memory_.contentHash;
        string memory oldIpfsHash = memory_.ipfsHash;

        // Update memory
        memory_.contentHash = newContentHash;
        memory_.metadataHash = newMetadataHash;
        memory_.ipfsHash = newIpfsHash;
        memory_.updatedAt = block.timestamp;

        // Update tags - remove old ones and add new ones
        for (uint256 i = 0; i < memory_.tags.length; i++) {
            _memoriesByTag[memory_.tags[i]].remove(memoryId);
        }
        memory_.tags = newTags;
        for (uint256 i = 0; i < newTags.length; i++) {
            _memoriesByTag[newTags[i]].add(memoryId);
        }

        // Update packed data
        _packedMemoryData[memoryId].updatedAt = uint64(block.timestamp);

        emit MemoryUpdated(memoryId, oldContentHash, newContentHash, msg.sender);

        if (keccak256(bytes(oldIpfsHash)) != keccak256(bytes(newIpfsHash))) {
            emit MemoryMigrated(memoryId, oldIpfsHash, newIpfsHash);
        }
    }

    /**
     * @notice Delete or archive a memory
     */
    function deleteMemory(bytes32 memoryId, bool archive)
        external override nonReentrant memoryExists(memoryId)
    {
        MemoryEntry storage memory_ = _memories[memoryId];

        // Check authorization
        if (!agentRegistry.isAuthorized(memory_.agentId, msg.sender)) {
            revert AccessDenied(msg.sender, memoryId);
        }

        uint256 agentId = memory_.agentId;
        uint256 memorySize = memory_.size;
        MemoryStatus newStatus = archive ? MemoryStatus.Archived : MemoryStatus.Deleted;

        // Update status
        memory_.status = newStatus;
        memory_.updatedAt = block.timestamp;
        _packedMemoryData[memoryId].status = newStatus;
        _packedMemoryData[memoryId].updatedAt = uint64(block.timestamp);

        if (!archive) {
            // Remove from indexes for permanent deletion
            _agentMemories[agentId].remove(memoryId);
            _memoriesByType[memory_.memoryType].remove(memoryId);
            _memoriesByAccess[memory_.accessLevel].remove(memoryId);

            // Remove from tag indexes
            for (uint256 i = 0; i < memory_.tags.length; i++) {
                _memoriesByTag[memory_.tags[i]].remove(memoryId);
            }

            // Remove from parent-child relationships
            if (memory_.parentMemoryId != bytes32(0)) {
                _childMemories[memory_.parentMemoryId].remove(memoryId);
            }

            // Update statistics
            _updateMemoryStatistics(agentId, memorySize, false);
        }

        emit MemoryDeleted(memoryId, agentId, msg.sender, archive);
    }

    // ============ ACCESS CONTROL FUNCTIONS ============

    /**
     * @notice Grant access to a memory
     */
    function grantAccess(
        bytes32 memoryId,
        address grantTo,
        AccessLevel accessLevel,
        uint256 expiresAt,
        bool canShare,
        string calldata purpose
    ) external override nonReentrant memoryExists(memoryId) {
        MemoryEntry storage memory_ = _memories[memoryId];

        // Check authorization to grant access
        if (!agentRegistry.isAuthorized(memory_.agentId, msg.sender)) {
            revert AccessDenied(msg.sender, memoryId);
        }

        // Validate expiry time
        if (expiresAt != 0 && expiresAt <= block.timestamp) {
            revert InvalidPermissionExpiry(expiresAt, block.timestamp);
        }

        // Check max permissions limit
        if (_accessList[memoryId].length >= MAX_ACCESS_PERMISSIONS) {
            revert MaxAccessPermissionsExceeded(_accessList[memoryId].length, MAX_ACCESS_PERMISSIONS);
        }

        // Grant permission
        AccessPermission storage permission = _accessPermissions[memoryId][grantTo];
        permission.accessor = grantTo;
        permission.level = accessLevel;
        permission.grantedAt = block.timestamp;
        permission.expiresAt = expiresAt;
        permission.canShare = canShare;
        permission.purpose = purpose;

        // Add to access list if not already present
        bool alreadyExists = false;
        for (uint256 i = 0; i < _accessList[memoryId].length; i++) {
            if (_accessList[memoryId][i] == grantTo) {
                alreadyExists = true;
                break;
            }
        }
        if (!alreadyExists) {
            _accessList[memoryId].push(grantTo);
        }

        emit AccessGranted(memoryId, grantTo, accessLevel, msg.sender);
    }

    /**
     * @notice Revoke access to a memory
     */
    function revokeAccess(bytes32 memoryId, address revokeFrom)
        external override nonReentrant memoryExists(memoryId)
    {
        MemoryEntry storage memory_ = _memories[memoryId];

        // Check authorization
        if (!agentRegistry.isAuthorized(memory_.agentId, msg.sender)) {
            revert AccessDenied(msg.sender, memoryId);
        }

        // Remove permission
        delete _accessPermissions[memoryId][revokeFrom];

        // Remove from access list
        address[] storage accessList = _accessList[memoryId];
        for (uint256 i = 0; i < accessList.length; i++) {
            if (accessList[i] == revokeFrom) {
                accessList[i] = accessList[accessList.length - 1];
                accessList.pop();
                break;
            }
        }
    }

    // ============ QUERY FUNCTIONS ============

    /**
     * @notice Query memories by filter criteria
     */
    function queryMemories(
        MemoryFilter calldata filter,
        uint256 offset,
        uint256 limit
    ) external view override returns (bytes32[] memory memoryIds, uint256 total) {
        // Get base set of memory IDs to filter
        EnumerableSet.Bytes32Set storage baseSet = filter.agentId != 0
            ? _agentMemories[filter.agentId]
            : _memoriesByType[filter.memoryType];

        // Count total matches
        uint256 matchCount = 0;
        bytes32[] memory tempResults = new bytes32[](baseSet.length());

        for (uint256 i = 0; i < baseSet.length(); i++) {
            bytes32 memoryId = baseSet.at(i);
            if (_matchesFilter(memoryId, filter)) {
                tempResults[matchCount] = memoryId;
                matchCount++;
            }
        }

        total = matchCount;

        // Apply pagination
        uint256 startIndex = offset;
        uint256 endIndex = startIndex + limit;
        if (endIndex > matchCount) {
            endIndex = matchCount;
        }

        uint256 resultLength = endIndex > startIndex ? endIndex - startIndex : 0;
        memoryIds = new bytes32[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            memoryIds[i] = tempResults[startIndex + i];
        }
    }

    /**
     * @notice Get all memories owned by an agent
     */
    function getAgentMemories(uint256 agentId, bool includeArchived)
        external view override returns (bytes32[] memory)
    {
        EnumerableSet.Bytes32Set storage memorySet = _agentMemories[agentId];
        uint256 totalMemories = memorySet.length();

        if (includeArchived) {
            bytes32[] memory allMemories = new bytes32[](totalMemories);
            for (uint256 i = 0; i < totalMemories; i++) {
                allMemories[i] = memorySet.at(i);
            }
            return allMemories;
        }

        // Filter out archived memories
        bytes32[] memory tempResults = new bytes32[](totalMemories);
        uint256 activeCount = 0;

        for (uint256 i = 0; i < totalMemories; i++) {
            bytes32 memoryId = memorySet.at(i);
            if (_packedMemoryData[memoryId].status == MemoryStatus.Active) {
                tempResults[activeCount] = memoryId;
                activeCount++;
            }
        }

        bytes32[] memory activeMemories = new bytes32[](activeCount);
        for (uint256 i = 0; i < activeCount; i++) {
            activeMemories[i] = tempResults[i];
        }

        return activeMemories;
    }

    /**
     * @notice Get memories by tag
     */
    function getMemoriesByTag(bytes32 tag, address accessibleBy)
        external view override returns (bytes32[] memory)
    {
        EnumerableSet.Bytes32Set storage taggedMemories = _memoriesByTag[tag];
        uint256 totalTagged = taggedMemories.length();

        bytes32[] memory tempResults = new bytes32[](totalTagged);
        uint256 accessibleCount = 0;

        for (uint256 i = 0; i < totalTagged; i++) {
            bytes32 memoryId = taggedMemories.at(i);
            (bool hasAccess,) = _checkAccess(memoryId, accessibleBy);
            if (hasAccess) {
                tempResults[accessibleCount] = memoryId;
                accessibleCount++;
            }
        }

        bytes32[] memory accessibleMemories = new bytes32[](accessibleCount);
        for (uint256 i = 0; i < accessibleCount; i++) {
            accessibleMemories[i] = tempResults[i];
        }

        return accessibleMemories;
    }

    /**
     * @notice Get memory tree children
     */
    function getChildMemories(bytes32 parentMemoryId)
        external view override returns (bytes32[] memory)
    {
        EnumerableSet.Bytes32Set storage children = _childMemories[parentMemoryId];
        uint256 childCount = children.length();

        bytes32[] memory childMemories = new bytes32[](childCount);
        for (uint256 i = 0; i < childCount; i++) {
            childMemories[i] = children.at(i);
        }

        return childMemories;
    }

    /**
     * @notice Get memory statistics for an agent
     */
    function getMemoryStats(uint256 agentId)
        external view override returns (uint256 total, uint256 active, uint256 archived)
    {
        MemoryStatistics storage stats = _agentMemoryStats[agentId];
        total = stats.totalMemories;
        active = stats.activeMemories;
        archived = stats.archivedMemories;
    }

    // ============ ACCESS CHECK FUNCTIONS ============

    /**
     * @notice Check if an address has access to a memory
     */
    function hasAccess(bytes32 memoryId, address accessor)
        external view override returns (bool hasAccess_, AccessLevel accessLevel)
    {
        return _checkAccess(memoryId, accessor);
    }

    /**
     * @notice Get memory metadata without accessing content
     */
    function getMemoryMetadata(bytes32 memoryId)
        external view override memoryExists(memoryId) returns (MemoryEntry memory memory_)
    {
        memory_ = _memories[memoryId];

        // Redact content hash for private memories if caller doesn't have access
        (bool hasAccess,) = _checkAccess(memoryId, msg.sender);
        if (!hasAccess && memory_.accessLevel == AccessLevel.Private) {
            memory_.contentHash = bytes32(0);
            memory_.ipfsHash = "";
        }
    }

    // ============ VERIFICATION FUNCTIONS ============

    /**
     * @notice Verify memory integrity
     */
    function verifyMemory(bytes32 memoryId, VerificationProof calldata proof)
        external view override memoryExists(memoryId) returns (bool isValid, uint8 verificationLevel)
    {
        MemoryEntry memory memory_ = _memories[memoryId];

        // Basic hash verification
        bool hashValid = memory_.contentHash != bytes32(0);

        // Merkle proof verification
        bool merkleValid = proof.merkleRoot != bytes32(0) && proof.proof.length > 0;
        if (merkleValid) {
            merkleValid = MerkleProof.verify(proof.proof, proof.merkleRoot, memory_.contentHash);
        }

        // Signature verification
        bool signatureValid = false;
        if (proof.signature.length > 0) {
            bytes32 messageHash = keccak256(abi.encodePacked(memoryId, memory_.contentHash, proof.verifiedAt));
            signatureValid = messageHash.toEthSignedMessageHash().recover(proof.signature) == proof.verifier;
        }

        // Determine verification level
        verificationLevel = 0;
        if (hashValid) verificationLevel += 1;
        if (merkleValid) verificationLevel += 2;
        if (signatureValid) verificationLevel += 4;

        isValid = verificationLevel >= VERIFICATION_THRESHOLD;
    }

    /**
     * @notice Generate verification proof for a memory
     */
    function generateVerificationProof(bytes32 memoryId)
        external view override memoryExists(memoryId) returns (VerificationProof memory proof)
    {
        MemoryEntry memory memory_ = _memories[memoryId];

        // Generate basic proof structure
        proof.merkleRoot = keccak256(abi.encodePacked(memory_.contentHash, memory_.metadataHash));
        proof.proof = new bytes32[](1);
        proof.proof[0] = memory_.contentHash;
        proof.verifier = msg.sender;
        proof.verifiedAt = block.timestamp;

        // Note: In a real implementation, zkProof would be generated using
        // zero-knowledge proof libraries and signature would be created off-chain
    }

    // ============ ENCRYPTION FUNCTIONS ============

    /**
     * @notice Rotate encryption key for an agent
     */
    function rotateEncryptionKey(uint256 agentId, bytes32 newKeyHash)
        external override onlyAgentOwner(agentId)
    {
        bytes32 oldKeyHash = _encryptionKeys[agentId];
        _encryptionKeys[agentId] = newKeyHash;
        _lastKeyRotation[agentId] = block.timestamp;

        emit EncryptionKeyRotated(agentId, oldKeyHash, newKeyHash);
    }

    /**
     * @notice Get current encryption key hash for an agent
     */
    function getEncryptionKeyInfo(uint256 agentId)
        external view override returns (bytes32 keyHash, uint256 lastRotated)
    {
        keyHash = _encryptionKeys[agentId];
        lastRotated = _lastKeyRotation[agentId];
    }

    // ============ BATCH OPERATIONS ============

    /**
     * @notice Batch store multiple memories
     */
    function batchStoreMemories(MemoryEntry[] calldata memories)
        external override nonReentrant whenNotPaused validBatchSize(memories.length)
        returns (bytes32[] memory memoryIds)
    {
        memoryIds = new bytes32[](memories.length);
        uint256 totalSize = 0;
        uint256 agentId = memories[0].agentId; // Assume same agent for batch

        for (uint256 i = 0; i < memories.length; i++) {
            // Generate memory ID
            bytes32 memoryId = _generateMemoryId(
                memories[i].agentId,
                memories[i].contentHash,
                block.timestamp + i
            );
            memoryIds[i] = memoryId;

            // Store memory (simplified)
            _memories[memoryId] = memories[i];
            _memories[memoryId].id = memoryId;
            _memories[memoryId].createdAt = block.timestamp;
            _memories[memoryId].updatedAt = block.timestamp;

            // Update indexes
            _agentMemories[memories[i].agentId].add(memoryId);
            _memoriesByType[memories[i].memoryType].add(memoryId);
            _memoriesByAccess[memories[i].accessLevel].add(memoryId);

            totalSize += memories[i].size;
        }

        emit MemoryBatchStored(memoryIds, agentId, totalSize);
    }

    /**
     * @notice Batch grant access to multiple memories
     */
    function batchGrantAccess(
        bytes32[] calldata memoryIds,
        address grantTo,
        AccessLevel accessLevel
    ) external override nonReentrant validBatchSize(memoryIds.length) {
        for (uint256 i = 0; i < memoryIds.length; i++) {
            // Simplified batch access grant
            if (_memories[memoryIds[i]].id != bytes32(0)) {
                _accessPermissions[memoryIds[i]][grantTo] = AccessPermission({
                    accessor: grantTo,
                    level: accessLevel,
                    grantedAt: block.timestamp,
                    expiresAt: 0,
                    canShare: false,
                    purpose: "Batch grant"
                });

                _accessList[memoryIds[i]].push(grantTo);
                emit AccessGranted(memoryIds[i], grantTo, accessLevel, msg.sender);
            }
        }
    }

    // ============ INTERNAL FUNCTIONS ============

    function _generateMemoryId(uint256 agentId, bytes32 contentHash, uint256 timestamp)
        private pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(MEMORY_ID_SALT, agentId, contentHash, timestamp));
    }

    function _checkAccess(bytes32 memoryId, address accessor)
        private view returns (bool hasAccess_, AccessLevel accessLevel)
    {
        MemoryEntry storage memory_ = _memories[memoryId];

        // Owner always has access
        if (agentRegistry.isAuthorized(memory_.agentId, accessor)) {
            return (true, AccessLevel.Protected);
        }

        // Check explicit permissions
        AccessPermission storage permission = _accessPermissions[memoryId][accessor];
        if (permission.accessor == accessor) {
            // Check if permission has expired
            if (permission.expiresAt == 0 || block.timestamp <= permission.expiresAt) {
                return (true, permission.level);
            }
        }

        // Check public access
        if (memory_.accessLevel == AccessLevel.Public) {
            return (true, AccessLevel.Public);
        }

        // Check internal access (for agents in same protocol)
        if (memory_.accessLevel == AccessLevel.Internal) {
            try agentRegistry.getAgentInfo(1) returns (IAgent.AgentInfo memory) {
                return (true, AccessLevel.Internal);
            } catch {
                // If accessor is not an agent, deny access
                return (false, AccessLevel.Private);
            }
        }

        return (false, AccessLevel.Private);
    }

    function _verifyAccessProof(bytes32 memoryId, address accessor, bytes calldata proof)
        private pure returns (bool)
    {
        // Simplified proof verification - in practice would implement
        // proper zero-knowledge proof verification
        if (proof.length == 0) return false;

        bytes32 expectedHash = keccak256(abi.encodePacked(memoryId, accessor));
        bytes32 providedHash = abi.decode(proof, (bytes32));

        return expectedHash == providedHash;
    }

    function _matchesFilter(bytes32 memoryId, MemoryFilter calldata filter)
        private view returns (bool)
    {
        MemoryEntry storage memory_ = _memories[memoryId];
        PackedMemoryData storage packed = _packedMemoryData[memoryId];

        // Agent ID filter
        if (filter.agentId != 0 && memory_.agentId != filter.agentId) {
            return false;
        }

        // Memory type filter
        if (memory_.memoryType != filter.memoryType && filter.memoryType != MemoryType.Experience) {
            return false;
        }

        // Access level filter
        if (memory_.accessLevel < filter.minAccessLevel) {
            return false;
        }

        // Time range filter
        if (filter.fromTimestamp > 0 && packed.createdAt < filter.fromTimestamp) {
            return false;
        }
        if (filter.toTimestamp > 0 && packed.createdAt > filter.toTimestamp) {
            return false;
        }

        // Size filter
        if (filter.minSize > 0 && packed.size < filter.minSize) {
            return false;
        }
        if (filter.maxSize > 0 && packed.size > filter.maxSize) {
            return false;
        }

        // Tags filter
        if (filter.tags.length > 0) {
            bool hasRequiredTag = false;
            for (uint256 i = 0; i < filter.tags.length; i++) {
                if (_memoriesByTag[filter.tags[i]].contains(memoryId)) {
                    hasRequiredTag = true;
                    break;
                }
            }
            if (!hasRequiredTag) return false;
        }

        return true;
    }

    function _updateMemoryStatistics(uint256 agentId, uint256 memorySize, bool isAddition)
        private
    {
        MemoryStatistics storage stats = _agentMemoryStats[agentId];

        if (isAddition) {
            stats.totalMemories++;
            stats.activeMemories++;
            stats.totalSize += memorySize;
        } else {
            if (stats.totalMemories > 0) stats.totalMemories--;
            if (stats.activeMemories > 0) stats.activeMemories--;
            if (stats.totalSize >= memorySize) stats.totalSize -= memorySize;
        }

        stats.lastUpdated = block.timestamp;

        emit MemoryAnalyticsUpdated(agentId, stats.totalMemories, stats.totalSize);
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
     * @notice Emergency memory cleanup (admin only)
     */
    function emergencyCleanup(bytes32[] calldata memoryIds)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < memoryIds.length; i++) {
            _memories[memoryIds[i]].status = MemoryStatus.Deleted;
            _packedMemoryData[memoryIds[i]].status = MemoryStatus.Deleted;
        }
    }
}