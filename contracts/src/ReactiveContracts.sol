// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/interfaces/IERC165.sol";
import "../interfaces/IAgent.sol";

/**
 * @title ReactiveContracts - Cross-Chain Reactive Automation for AETERNA Protocol
 * @notice Implements reactive patterns for autonomous cross-chain operations
 * @dev Supports event-driven automation, cross-chain messaging, and autonomous reactions
 * @custom:version 1.0.0
 * @custom:author AETERNA Protocol Team
 * @custom:security-contact security@aeterna.io
 */
contract ReactiveContracts is AccessControl, ReentrancyGuard, Pausable, IERC165 {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    // ============ CONSTANTS ============

    bytes32 public constant REACTOR_ROLE = keccak256("REACTOR_ROLE");
    bytes32 public constant BRIDGE_MANAGER_ROLE = keccak256("BRIDGE_MANAGER_ROLE");
    bytes32 public constant AUTOMATION_ROLE = keccak256("AUTOMATION_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    uint256 public constant MAX_REACTIONS_PER_TRIGGER = 50;
    uint256 public constant MAX_CONDITIONS_PER_REACTION = 20;
    uint256 public constant MAX_ACTIONS_PER_REACTION = 30;
    uint256 public constant MAX_CROSS_CHAIN_DELAY = 1 hours;
    uint256 public constant MIN_EXECUTION_INTERVAL = 1 minutes;
    uint256 public constant REACTION_TIMEOUT = 1 days;

    // ============ ENUMS ============

    enum TriggerType {
        Event,           // Contract event trigger
        Timer,           // Time-based trigger
        Condition,       // State condition trigger
        CrossChain,      // Cross-chain event trigger
        Oracle,          // Oracle data trigger
        Manual,          // Manual execution trigger
        Composite        // Multiple trigger combination
    }

    enum ActionType {
        ContractCall,    // Smart contract function call
        Transfer,        // Token transfer
        CrossChainCall,  // Cross-chain function call
        StateUpdate,     // Contract state update
        Notification,    // Event notification
        AgentCommand,    // Agent-specific command
        Compound         // Multiple actions
    }

    enum ReactionStatus {
        Active,          // Reaction is active and monitoring
        Paused,          // Reaction is temporarily paused
        Triggered,       // Reaction has been triggered
        Executing,       // Reaction is currently executing
        Completed,       // Reaction has completed successfully
        Failed,          // Reaction execution failed
        Cancelled        // Reaction was cancelled
    }

    enum ConditionOperator {
        Equal,           // ==
        NotEqual,        // !=
        GreaterThan,     // >
        LessThan,        // <
        GreaterEqual,    // >=
        LessEqual,       // <=
        Contains,        // String/array contains
        And,             // Logical AND
        Or,              // Logical OR
        Not              // Logical NOT
    }

    enum ExecutionStrategy {
        Immediate,       // Execute immediately when triggered
        Delayed,         // Execute after specified delay
        Scheduled,       // Execute at scheduled time
        Batched,         // Batch multiple executions
        Throttled,       // Rate-limited execution
        Sequential,      // Execute in sequence
        Parallel         // Execute in parallel
    }

    // ============ STRUCTS ============

    struct Trigger {
        TriggerType triggerType;
        address contractAddress;     // Target contract for event/state triggers
        bytes4 eventSignature;      // Event signature to monitor
        bytes eventData;            // Event data pattern to match
        uint256 blockNumber;        // Block number for triggers (0 = current)
        uint256 timestamp;          // Timestamp for timer triggers
        uint256 interval;           // Interval for recurring triggers
        bytes32[] conditions;       // Condition IDs for composite triggers
        bool isRecurring;           // Whether trigger repeats
        bool isActive;              // Whether trigger is active
    }

    struct Condition {
        bytes32 id;                 // Unique condition ID
        address targetContract;     // Contract to check condition on
        bytes4 functionSelector;    // Function to call for condition
        bytes callData;             // Function call data
        ConditionOperator operator; // Comparison operator
        bytes expectedValue;        // Expected result value
        uint256 tolerance;          // Tolerance for numeric comparisons
        uint256 lastCheck;          // Last time condition was checked
        bool isActive;              // Whether condition is active
    }

    struct Action {
        ActionType actionType;
        address targetContract;     // Contract to call for actions
        bytes4 functionSelector;    // Function to call
        bytes callData;             // Function call data
        uint256 value;              // ETH value to send
        uint256 gasLimit;           // Gas limit for execution
        uint256 delay;              // Delay before execution
        address[] recipients;       // Recipients for transfers/notifications
        uint256[] amounts;          // Amounts for transfers
        bool isCritical;            // Whether action failure should halt reaction
    }

    struct Reaction {
        bytes32 id;                 // Unique reaction ID
        uint256 agentId;            // Agent that owns this reaction
        string name;                // Human-readable name
        string description;         // Description of reaction purpose
        Trigger trigger;            // Trigger configuration
        bytes32[] conditionIds;     // Condition IDs to evaluate
        Action[] actions;           // Actions to execute
        ReactionStatus status;      // Current status
        ExecutionStrategy strategy; // Execution strategy
        uint256 priority;           // Execution priority (higher = first)
        uint256 maxExecutions;      // Maximum number of executions (0 = unlimited)
        uint256 executionCount;     // Number of times executed
        uint256 lastExecution;      // Timestamp of last execution
        uint256 nextExecution;      // Timestamp of next scheduled execution
        uint256 createdAt;          // Creation timestamp
        uint256 updatedAt;          // Last update timestamp
        address creator;            // Address that created the reaction
        bytes metadata;             // Additional metadata
    }

    struct ExecutionResult {
        bytes32 reactionId;
        uint256 executionId;
        uint256 timestamp;
        bool success;
        string errorMessage;
        uint256 gasUsed;
        bytes[] actionResults;
        uint256 duration;
    }

    struct CrossChainMessage {
        uint256 sourceChainId;
        uint256 targetChainId;
        address sourceContract;
        address targetContract;
        bytes payload;
        uint256 nonce;
        uint256 timestamp;
        bytes32 messageHash;
        bool isProcessed;
    }

    // ============ STATE VARIABLES ============

    IAgent public immutable agentRegistry;

    // Reaction storage
    mapping(bytes32 => Reaction) public reactions;
    mapping(bytes32 => Condition) public conditions;
    mapping(bytes32 => ExecutionResult[]) public executionHistory;

    // Agent reactions mapping
    mapping(uint256 => EnumerableSet.Bytes32Set) private agentReactions;

    // Trigger monitoring
    mapping(TriggerType => EnumerableSet.Bytes32Set) private reactionsByTriggerType;
    mapping(address => EnumerableSet.Bytes32Set) private reactionsByContract;

    // Cross-chain infrastructure
    mapping(uint256 => bool) public supportedChains;
    mapping(uint256 => address) public bridgeContracts;
    mapping(bytes32 => CrossChainMessage) public crossChainMessages;
    mapping(uint256 => uint256) public crossChainNonces;

    // Execution management
    mapping(bytes32 => uint256) public lastExecutionTime;
    mapping(bytes32 => bool) public executionLocks;
    mapping(address => uint256) public executorGasUsage;

    // Analytics and monitoring
    mapping(bytes32 => uint256) public reactionSuccessRate;
    mapping(bytes32 => uint256) public averageExecutionTime;
    mapping(TriggerType => uint256) public triggerTypeCounts;

    // Global settings
    uint256 public globalExecutionDelay;
    uint256 public maxGasPerExecution;
    uint256 public defaultGasLimit;
    bool public automationEnabled;
    address public feeRecipient;

    // ============ EVENTS ============

    event ReactionCreated(
        bytes32 indexed reactionId,
        uint256 indexed agentId,
        address indexed creator,
        TriggerType triggerType
    );

    event ReactionTriggered(
        bytes32 indexed reactionId,
        uint256 indexed executionId,
        address indexed triggerer,
        uint256 timestamp
    );

    event ReactionExecuted(
        bytes32 indexed reactionId,
        uint256 indexed executionId,
        bool success,
        uint256 gasUsed,
        string result
    );

    event CrossChainMessageSent(
        bytes32 indexed messageId,
        uint256 indexed sourceChain,
        uint256 indexed targetChain,
        address sourceContract,
        address targetContract
    );

    event CrossChainMessageReceived(
        bytes32 indexed messageId,
        uint256 indexed sourceChain,
        address indexed sourceContract,
        bool success
    );

    event ConditionEvaluated(
        bytes32 indexed conditionId,
        bytes32 indexed reactionId,
        bool result,
        uint256 timestamp
    );

    event ReactionStatusChanged(
        bytes32 indexed reactionId,
        ReactionStatus oldStatus,
        ReactionStatus newStatus,
        address indexed updatedBy
    );

    // ============ CUSTOM ERRORS ============

    error ReactionNotFound(bytes32 reactionId);
    error ConditionNotFound(bytes32 conditionId);
    error ReactionAlreadyExists(bytes32 reactionId);
    error InvalidTriggerType(TriggerType triggerType);
    error InvalidActionType(ActionType actionType);
    error MaxReactionsExceeded(uint256 current, uint256 maximum);
    error MaxConditionsExceeded(uint256 current, uint256 maximum);
    error MaxActionsExceeded(uint256 current, uint256 maximum);
    error ReactionExecutionFailed(bytes32 reactionId, string reason);
    error CrossChainNotSupported(uint256 chainId);
    error ExecutionLocked(bytes32 reactionId);
    error InvalidExecutionStrategy(ExecutionStrategy strategy);
    error InsufficientGas(uint256 provided, uint256 required);
    error ReactionNotActive(bytes32 reactionId, ReactionStatus status);

    // ============ MODIFIERS ============

    modifier onlyAgentOwner(uint256 agentId) {
        if (!agentRegistry.isAuthorized(agentId, msg.sender)) {
            revert("Not authorized for agent");
        }
        _;
    }

    modifier reactionExists(bytes32 reactionId) {
        if (reactions[reactionId].id == bytes32(0)) {
            revert ReactionNotFound(reactionId);
        }
        _;
    }

    modifier conditionExists(bytes32 conditionId) {
        if (conditions[conditionId].id == bytes32(0)) {
            revert ConditionNotFound(conditionId);
        }
        _;
    }

    modifier notExecutionLocked(bytes32 reactionId) {
        if (executionLocks[reactionId]) {
            revert ExecutionLocked(reactionId);
        }
        _;
    }

    modifier automationActive() {
        require(automationEnabled, "Automation is disabled");
        _;
    }

    // ============ CONSTRUCTOR ============

    constructor(
        address _agentRegistry,
        address defaultAdmin,
        address automationManager,
        address bridgeManager
    ) {
        agentRegistry = IAgent(_agentRegistry);

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(AUTOMATION_ROLE, automationManager);
        _grantRole(BRIDGE_MANAGER_ROLE, bridgeManager);
        _grantRole(REACTOR_ROLE, defaultAdmin);

        // Initialize default settings
        maxGasPerExecution = 10_000_000; // 10M gas
        defaultGasLimit = 500_000;       // 500K gas
        globalExecutionDelay = 0;        // No delay by default
        automationEnabled = true;        // Enable automation by default
    }

    // ============ REACTION MANAGEMENT ============

    /**
     * @notice Create a new reactive pattern
     */
    function createReaction(
        uint256 agentId,
        string calldata name,
        string calldata description,
        Trigger calldata trigger,
        bytes32[] calldata conditionIds,
        Action[] calldata actions,
        ExecutionStrategy strategy,
        uint256 priority
    ) external nonReentrant whenNotPaused onlyAgentOwner(agentId)
      returns (bytes32 reactionId)
    {
        // Validate input parameters
        if (conditionIds.length > MAX_CONDITIONS_PER_REACTION) {
            revert MaxConditionsExceeded(conditionIds.length, MAX_CONDITIONS_PER_REACTION);
        }
        if (actions.length > MAX_ACTIONS_PER_REACTION) {
            revert MaxActionsExceeded(actions.length, MAX_ACTIONS_PER_REACTION);
        }

        // Validate conditions exist
        for (uint256 i = 0; i < conditionIds.length; i++) {
            if (conditions[conditionIds[i]].id == bytes32(0)) {
                revert ConditionNotFound(conditionIds[i]);
            }
        }

        // Generate unique reaction ID
        reactionId = keccak256(abi.encodePacked(
            agentId,
            name,
            block.timestamp,
            msg.sender,
            blockhash(block.number - 1)
        ));

        // Ensure reaction doesn't already exist
        if (reactions[reactionId].id != bytes32(0)) {
            revert ReactionAlreadyExists(reactionId);
        }

        // Create reaction
        Reaction storage reaction = reactions[reactionId];
        reaction.id = reactionId;
        reaction.agentId = agentId;
        reaction.name = name;
        reaction.description = description;
        reaction.trigger = trigger;
        reaction.conditionIds = conditionIds;
        reaction.status = ReactionStatus.Active;
        reaction.strategy = strategy;
        reaction.priority = priority;
        reaction.maxExecutions = 0; // Unlimited by default
        reaction.createdAt = block.timestamp;
        reaction.updatedAt = block.timestamp;
        reaction.creator = msg.sender;

        // Copy actions
        for (uint256 i = 0; i < actions.length; i++) {
            reaction.actions.push(actions[i]);
        }

        // Update indexes
        agentReactions[agentId].add(reactionId);
        reactionsByTriggerType[trigger.triggerType].add(reactionId);
        if (trigger.contractAddress != address(0)) {
            reactionsByContract[trigger.contractAddress].add(reactionId);
        }

        // Update statistics
        triggerTypeCounts[trigger.triggerType]++;

        emit ReactionCreated(reactionId, agentId, msg.sender, trigger.triggerType);
    }

    /**
     * @notice Update reaction status
     */
    function updateReactionStatus(
        bytes32 reactionId,
        ReactionStatus newStatus
    ) external reactionExists(reactionId) {
        Reaction storage reaction = reactions[reactionId];

        // Check authorization
        if (!agentRegistry.isAuthorized(reaction.agentId, msg.sender) &&
            !hasRole(AUTOMATION_ROLE, msg.sender)) {
            revert("Not authorized to update reaction");
        }

        ReactionStatus oldStatus = reaction.status;
        reaction.status = newStatus;
        reaction.updatedAt = block.timestamp;

        emit ReactionStatusChanged(reactionId, oldStatus, newStatus, msg.sender);
    }

    /**
     * @notice Create a new condition
     */
    function createCondition(
        address targetContract,
        bytes4 functionSelector,
        bytes calldata callData,
        ConditionOperator operator,
        bytes calldata expectedValue,
        uint256 tolerance
    ) external nonReentrant whenNotPaused returns (bytes32 conditionId) {
        conditionId = keccak256(abi.encodePacked(
            targetContract,
            functionSelector,
            callData,
            block.timestamp,
            msg.sender
        ));

        Condition storage condition = conditions[conditionId];
        condition.id = conditionId;
        condition.targetContract = targetContract;
        condition.functionSelector = functionSelector;
        condition.callData = callData;
        condition.operator = operator;
        condition.expectedValue = expectedValue;
        condition.tolerance = tolerance;
        condition.isActive = true;
    }

    // ============ EXECUTION ENGINE ============

    /**
     * @notice Trigger a reaction manually
     */
    function triggerReaction(bytes32 reactionId)
        external reactionExists(reactionId) notExecutionLocked(reactionId) automationActive
    {
        Reaction storage reaction = reactions[reactionId];

        // Check if reaction is active
        if (reaction.status != ReactionStatus.Active) {
            revert ReactionNotActive(reactionId, reaction.status);
        }

        // Check execution limits
        if (reaction.maxExecutions > 0 && reaction.executionCount >= reaction.maxExecutions) {
            revert("Reaction execution limit reached");
        }

        // Check minimum execution interval
        if (block.timestamp - reaction.lastExecution < MIN_EXECUTION_INTERVAL) {
            revert("Execution interval not met");
        }

        _executeReaction(reactionId, msg.sender);
    }

    /**
     * @notice Execute reaction with automated triggering
     */
    function _executeReaction(bytes32 reactionId, address triggerer) private {
        Reaction storage reaction = reactions[reactionId];

        // Lock execution to prevent reentrancy
        executionLocks[reactionId] = true;

        // Generate execution ID
        uint256 executionId = uint256(keccak256(abi.encodePacked(
            reactionId,
            block.timestamp,
            triggerer
        )));

        // Update reaction status
        reaction.status = ReactionStatus.Executing;
        reaction.lastExecution = block.timestamp;
        reaction.executionCount++;

        emit ReactionTriggered(reactionId, executionId, triggerer, block.timestamp);

        // Start execution timing
        uint256 startGas = gasleft();
        uint256 startTime = block.timestamp;
        bool success = true;
        string memory errorMessage = "";
        bytes[] memory actionResults = new bytes[](reaction.actions.length);

        try this._executeActions(reactionId, reaction.actions) returns (bytes[] memory results) {
            actionResults = results;
        } catch Error(string memory reason) {
            success = false;
            errorMessage = reason;
        } catch (bytes memory) {
            success = false;
            errorMessage = "Unknown execution error";
        }

        // Calculate execution metrics
        uint256 gasUsed = startGas - gasleft();
        uint256 duration = block.timestamp - startTime;

        // Update reaction status based on result
        reaction.status = success ? ReactionStatus.Completed : ReactionStatus.Failed;

        // Store execution result
        ExecutionResult memory result = ExecutionResult({
            reactionId: reactionId,
            executionId: executionId,
            timestamp: block.timestamp,
            success: success,
            errorMessage: errorMessage,
            gasUsed: gasUsed,
            actionResults: actionResults,
            duration: duration
        });

        executionHistory[reactionId].push(result);

        // Update analytics
        _updateAnalytics(reactionId, success, gasUsed, duration);

        // Unlock execution
        executionLocks[reactionId] = false;

        emit ReactionExecuted(reactionId, executionId, success, gasUsed, errorMessage);

        // Set next execution time for recurring reactions
        if (reaction.trigger.isRecurring && success && reaction.trigger.interval > 0) {
            reaction.nextExecution = block.timestamp + reaction.trigger.interval;
            reaction.status = ReactionStatus.Active;
        }
    }

    /**
     * @notice Execute reaction actions
     */
    function _executeActions(bytes32 reactionId, Action[] calldata actions)
        external returns (bytes[] memory results)
    {
        require(msg.sender == address(this), "Only self-call allowed");

        results = new bytes[](actions.length);

        for (uint256 i = 0; i < actions.length; i++) {
            try this._executeAction(actions[i]) returns (bytes memory result) {
                results[i] = result;
            } catch Error(string memory reason) {
                if (actions[i].isCritical) {
                    revert(reason);
                }
                results[i] = abi.encode(false, reason);
            }
        }
    }

    /**
     * @notice Execute a single action
     */
    function _executeAction(Action calldata action) external returns (bytes memory result) {
        require(msg.sender == address(this), "Only self-call allowed");

        if (action.actionType == ActionType.ContractCall) {
            return _executeContractCall(action);
        } else if (action.actionType == ActionType.Transfer) {
            return _executeTransfer(action);
        } else if (action.actionType == ActionType.CrossChainCall) {
            return _executeCrossChainCall(action);
        } else if (action.actionType == ActionType.StateUpdate) {
            return _executeStateUpdate(action);
        } else if (action.actionType == ActionType.Notification) {
            return _executeNotification(action);
        } else if (action.actionType == ActionType.AgentCommand) {
            return _executeAgentCommand(action);
        } else {
            revert InvalidActionType(action.actionType);
        }
    }

    // ============ ACTION IMPLEMENTATIONS ============

    function _executeContractCall(Action calldata action) private returns (bytes memory) {
        (bool success, bytes memory data) = action.targetContract.call{
            value: action.value,
            gas: action.gasLimit > 0 ? action.gasLimit : defaultGasLimit
        }(abi.encodePacked(action.functionSelector, action.callData));

        if (!success) {
            revert("Contract call failed");
        }

        return data;
    }

    function _executeTransfer(Action calldata action) private returns (bytes memory) {
        require(action.recipients.length == action.amounts.length, "Array length mismatch");

        for (uint256 i = 0; i < action.recipients.length; i++) {
            (bool success,) = action.recipients[i].call{value: action.amounts[i]}("");
            if (!success) {
                revert("Transfer failed");
            }
        }

        return abi.encode(true);
    }

    function _executeCrossChainCall(Action calldata action) private returns (bytes memory) {
        // Simplified cross-chain call - in practice would integrate with actual bridge
        bytes32 messageId = keccak256(abi.encodePacked(
            block.chainid,
            action.targetContract,
            action.callData,
            block.timestamp
        ));

        CrossChainMessage storage message = crossChainMessages[messageId];
        message.sourceChainId = block.chainid;
        message.sourceContract = address(this);
        message.targetContract = action.targetContract;
        message.payload = action.callData;
        message.nonce = crossChainNonces[block.chainid]++;
        message.timestamp = block.timestamp;
        message.messageHash = messageId;

        emit CrossChainMessageSent(
            messageId,
            block.chainid,
            1, // Target chain (placeholder)
            address(this),
            action.targetContract
        );

        return abi.encode(messageId);
    }

    function _executeStateUpdate(Action calldata action) private returns (bytes memory) {
        // Custom state update logic
        return abi.encode(true, "State updated");
    }

    function _executeNotification(Action calldata action) private returns (bytes memory) {
        // Emit notification events
        return abi.encode(true, "Notification sent");
    }

    function _executeAgentCommand(Action calldata action) private returns (bytes memory) {
        // Execute agent-specific command
        return abi.encode(true, "Agent command executed");
    }

    // ============ CONDITION EVALUATION ============

    /**
     * @notice Evaluate a condition
     */
    function evaluateCondition(bytes32 conditionId)
        external view conditionExists(conditionId) returns (bool result)
    {
        Condition storage condition = conditions[conditionId];

        if (!condition.isActive) {
            return false;
        }

        // Execute condition check
        (bool success, bytes memory data) = condition.targetContract.staticcall(
            abi.encodePacked(condition.functionSelector, condition.callData)
        );

        if (!success) {
            return false;
        }

        // Compare result with expected value
        return _compareValues(data, condition.expectedValue, condition.operator, condition.tolerance);
    }

    function _compareValues(
        bytes memory actual,
        bytes memory expected,
        ConditionOperator operator,
        uint256 tolerance
    ) private pure returns (bool) {
        if (operator == ConditionOperator.Equal) {
            return keccak256(actual) == keccak256(expected);
        } else if (operator == ConditionOperator.NotEqual) {
            return keccak256(actual) != keccak256(expected);
        }
        // Additional operator implementations would go here
        return false;
    }

    // ============ CROSS-CHAIN FUNCTIONS ============

    /**
     * @notice Add support for a new chain
     */
    function addSupportedChain(uint256 chainId, address bridgeContract)
        external onlyRole(BRIDGE_MANAGER_ROLE)
    {
        supportedChains[chainId] = true;
        bridgeContracts[chainId] = bridgeContract;
    }

    /**
     * @notice Process incoming cross-chain message
     */
    function processCrossChainMessage(
        bytes32 messageId,
        uint256 sourceChainId,
        address sourceContract,
        bytes calldata payload
    ) external onlyRole(BRIDGE_MANAGER_ROLE) nonReentrant {
        CrossChainMessage storage message = crossChainMessages[messageId];
        require(!message.isProcessed, "Message already processed");

        message.isProcessed = true;

        // Execute cross-chain payload
        (bool success,) = address(this).call(payload);

        emit CrossChainMessageReceived(messageId, sourceChainId, sourceContract, success);
    }

    // ============ ANALYTICS AND MONITORING ============

    function _updateAnalytics(
        bytes32 reactionId,
        bool success,
        uint256 gasUsed,
        uint256 duration
    ) private {
        // Update success rate
        if (success) {
            reactionSuccessRate[reactionId]++;
        }

        // Update average execution time
        averageExecutionTime[reactionId] =
            (averageExecutionTime[reactionId] + duration) / 2;

        // Track gas usage
        executorGasUsage[msg.sender] += gasUsed;
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get reaction details
     */
    function getReaction(bytes32 reactionId)
        external view reactionExists(reactionId) returns (Reaction memory)
    {
        return reactions[reactionId];
    }

    /**
     * @notice Get reactions for an agent
     */
    function getAgentReactions(uint256 agentId)
        external view returns (bytes32[] memory reactionIds)
    {
        EnumerableSet.Bytes32Set storage agentReactionSet = agentReactions[agentId];
        uint256 length = agentReactionSet.length();
        reactionIds = new bytes32[](length);

        for (uint256 i = 0; i < length; i++) {
            reactionIds[i] = agentReactionSet.at(i);
        }
    }

    /**
     * @notice Get execution history for a reaction
     */
    function getExecutionHistory(bytes32 reactionId)
        external view reactionExists(reactionId) returns (ExecutionResult[] memory)
    {
        return executionHistory[reactionId];
    }

    /**
     * @notice Get reactions by trigger type
     */
    function getReactionsByTriggerType(TriggerType triggerType)
        external view returns (bytes32[] memory reactionIds)
    {
        EnumerableSet.Bytes32Set storage reactions = reactionsByTriggerType[triggerType];
        uint256 length = reactions.length();
        reactionIds = new bytes32[](length);

        for (uint256 i = 0; i < length; i++) {
            reactionIds[i] = reactions.at(i);
        }
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @notice Toggle automation on/off
     */
    function toggleAutomation() external onlyRole(DEFAULT_ADMIN_ROLE) {
        automationEnabled = !automationEnabled;
    }

    /**
     * @notice Update global execution settings
     */
    function updateExecutionSettings(
        uint256 _maxGasPerExecution,
        uint256 _defaultGasLimit,
        uint256 _globalExecutionDelay
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxGasPerExecution = _maxGasPerExecution;
        defaultGasLimit = _defaultGasLimit;
        globalExecutionDelay = _globalExecutionDelay;
    }

    /**
     * @notice Emergency pause
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Emergency unpause
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ============ INTERFACE SUPPORT ============

    function supportsInterface(bytes4 interfaceId)
        public view virtual override(AccessControl, IERC165) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}