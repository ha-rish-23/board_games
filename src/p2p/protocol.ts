/**
 * PEER-TO-PEER MESSAGE PROTOCOL
 * 
 * This module defines the WebRTC/PeerJS message protocol for host-authoritative
 * peer-to-peer multiplayer gameplay.
 * 
 * PROTOCOL RULES:
 * 1. All messages are JSON-serializable
 * 2. Only HOST may send GAME_STATE messages
 * 3. All messages include: gameId, senderId, turnNumber, messageId
 * 4. Messages are sent over WebRTC data channels
 * 
 * MESSAGE FLOW:
 * ```
 * Client → Host:  JOIN_GAME, ACTION_REQUEST
 * Host → Client:  GAME_STATE, ACTION_RESULT, ERROR
 * Host → All:     GAME_STATE (broadcast)
 * ```
 */

import { Game, GameAction } from '../types/domain';

// ============================================================================
// BASE MESSAGE
// ============================================================================

/**
 * Base message type with required fields for all P2P messages.
 * 
 * Required Fields:
 * - messageId: Unique identifier for this message (for deduplication)
 * - gameId: Game session identifier
 * - senderId: Peer ID of the sender
 * - turnNumber: Current turn number (for ordering/validation)
 * - timestamp: Unix epoch milliseconds (for debugging)
 */
export interface BaseP2PMessage {
  messageId: string;
  gameId: string;
  senderId: string;
  turnNumber: number;
  timestamp: number;
}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export enum P2PMessageType {
  JoinGame = 'JOIN_GAME',
  GameState = 'GAME_STATE',
  ActionRequest = 'ACTION_REQUEST',
  ActionResult = 'ACTION_RESULT',
  Error = 'ERROR'
}

// ============================================================================
// JOIN_GAME
// ============================================================================

/**
 * JOIN_GAME message
 * 
 * Sent by: Client (non-host peer)
 * Sent to: Host
 * 
 * Purpose: Request to join an existing game session
 * 
 * Flow:
 * 1. Client establishes WebRTC connection to host
 * 2. Client sends JOIN_GAME with player info
 * 3. Host validates request
 * 4. Host sends GAME_STATE with current state or ERROR
 */
export interface JoinGameMessage extends BaseP2PMessage {
  type: P2PMessageType.JoinGame;
  
  /**
   * Player information for the joining peer.
   * Host will verify this matches a player in the game.
   */
  playerId: string;
  playerName: string;
  
  /**
   * Client version (for compatibility checking).
   * Format: "major.minor.patch" (semantic versioning)
   */
  clientVersion: string;
  
  /**
   * Optional: If rejoining after disconnect, last known turn.
   * Host can use this to detect state desync.
   */
  lastKnownTurn?: number;
}

// ============================================================================
// GAME_STATE
// ============================================================================

/**
 * GAME_STATE message
 * 
 * Sent by: HOST ONLY ⚠️
 * Sent to: Individual client or broadcast to all
 * 
 * Purpose: Synchronize game state from authoritative host to clients
 * 
 * SECURITY: Non-host peers MUST NOT send this message type.
 * Clients should ignore GAME_STATE from non-host senders.
 * 
 * Flow:
 * 1. Host validates action
 * 2. Host applies action to state
 * 3. Host broadcasts GAME_STATE to all peers
 * 4. Clients update their local state
 */
export interface GameStateMessage extends BaseP2PMessage {
  type: P2PMessageType.GameState;
  
  /**
   * Complete authoritative game state.
   * This is the single source of truth.
   */
  game: Game;
  
  /**
   * Reason for state update.
   * Helps clients understand what changed.
   */
  reason: GameStateReason;
  
  /**
   * If reason is ACTION_APPLIED, this is the action that was applied.
   * Clients can use this for optimistic updates or rollback.
   */
  lastAction?: GameAction;
  
  /**
   * If reason is ERROR, this is the error that occurred.
   * Used when host needs to broadcast error affecting game state.
   */
  errorMessage?: string;
  
  /**
   * State hash for verification (recommended for production).
   * Clients can compare this hash to detect desyncs.
   * See stateSync.ts for hash calculation.
   */
  stateHash?: string;
}

/**
 * Reasons why game state is being sent.
 */
export enum GameStateReason {
  /** Initial sync after JOIN_GAME */
  InitialSync = 'INITIAL_SYNC',
  
  /** State update after valid action applied */
  ActionApplied = 'ACTION_APPLIED',
  
  /** State resync requested by client */
  ResyncRequested = 'RESYNC_REQUESTED',
  
  /** State recovery after host migration */
  HostMigration = 'HOST_MIGRATION',
  
  /** Periodic heartbeat sync (optional) */
  PeriodicSync = 'PERIODIC_SYNC',
  
  /** Game ended normally */
  GameEnded = 'GAME_ENDED'
}

// ============================================================================
// ACTION_REQUEST
// ============================================================================

/**
 * ACTION_REQUEST message
 * 
 * Sent by: Client (non-host peer)
 * Sent to: Host
 * 
 * Purpose: Request host to validate and apply an action
 * 
 * Flow:
 * 1. Player takes action in UI
 * 2. Client sends ACTION_REQUEST to host
 * 3. Host validates action
 * 4. Host sends ACTION_RESULT (success) or ERROR (failure)
 * 5. If success, host broadcasts GAME_STATE to all
 */
export interface ActionRequestMessage extends BaseP2PMessage {
  type: P2PMessageType.ActionRequest;
  
  /**
   * The game action to be validated and applied.
   * Must match one of the GameAction types.
   */
  action: GameAction;
  
  /**
   * Optional: Expected turn number after action.
   * Host can use this to detect race conditions.
   */
  expectedNextTurn?: number;
  
  /**
   * Optional: Client-side optimistic state hash.
   * Host can use this to detect client desync.
   */
  optimisticStateHash?: string;
}

// ============================================================================
// ACTION_RESULT
// ============================================================================

/**
 * ACTION_RESULT message
 * 
 * Sent by: Host
 * Sent to: Client who sent ACTION_REQUEST
 * 
 * Purpose: Confirm action was processed (success or failure)
 * 
 * Note: Even on success, host will also broadcast GAME_STATE.
 * This message is just acknowledgment that the request was processed.
 * 
 * Flow:
 * 1. Host receives ACTION_REQUEST
 * 2. Host validates action
 * 3. Host sends ACTION_RESULT to requester
 * 4. If valid, host broadcasts GAME_STATE to all
 */
export interface ActionResultMessage extends BaseP2PMessage {
  type: P2PMessageType.ActionResult;
  
  /**
   * ID of the ACTION_REQUEST this is responding to.
   * Clients use this to match requests with responses.
   */
  requestMessageId: string;
  
  /**
   * Whether action was accepted.
   */
  success: boolean;
  
  /**
   * If success, the new turn number after action.
   * Client can verify this matches GAME_STATE broadcast.
   */
  newTurnNumber?: number;
  
  /**
   * If failure, error message explaining why.
   */
  errorMessage?: string;
  
  /**
   * If failure, error code for programmatic handling.
   */
  errorCode?: ActionErrorCode;
}

/**
 * Error codes for action validation failures.
 */
export enum ActionErrorCode {
  /** Not the player's turn */
  NotYourTurn = 'NOT_YOUR_TURN',
  
  /** Invalid action for current game state */
  InvalidAction = 'INVALID_ACTION',
  
  /** Action violates game rules */
  RuleViolation = 'RULE_VIOLATION',
  
  /** Game is not in PLAYING phase */
  GameNotPlaying = 'GAME_NOT_PLAYING',
  
  /** Player not found in game */
  PlayerNotFound = 'PLAYER_NOT_FOUND',
  
  /** Turn number mismatch (stale request) */
  TurnMismatch = 'TURN_MISMATCH',
  
  /** Duplicate action (same messageId seen before) */
  DuplicateAction = 'DUPLICATE_ACTION',
  
  /** Host is busy processing another action */
  HostBusy = 'HOST_BUSY'
}

// ============================================================================
// ERROR
// ============================================================================

/**
 * ERROR message
 * 
 * Sent by: Host or Client
 * Sent to: Specific peer or broadcast
 * 
 * Purpose: Communicate protocol errors, disconnections, or issues
 * 
 * Flow:
 * - Host sends ERROR when it can't process a request
 * - Client sends ERROR when it detects protocol violation
 * - Either can send ERROR before disconnecting
 */
export interface ErrorMessage extends BaseP2PMessage {
  type: P2PMessageType.Error;
  
  /**
   * Error severity level.
   */
  severity: ErrorSeverity;
  
  /**
   * Error category for programmatic handling.
   */
  errorCode: ProtocolErrorCode;
  
  /**
   * Human-readable error message.
   */
  message: string;
  
  /**
   * Optional: ID of message that caused this error.
   */
  causedByMessageId?: string;
  
  /**
   * Optional: Additional context for debugging.
   */
  details?: {
    expectedTurn?: number;
    receivedTurn?: number;
    expectedSender?: string;
    receivedSender?: string;
    [key: string]: any;
  };
  
  /**
   * Whether sender will disconnect after sending this error.
   */
  willDisconnect: boolean;
}

/**
 * Error severity levels.
 */
export enum ErrorSeverity {
  /** Informational, no action needed */
  Info = 'INFO',
  
  /** Warning, might cause issues */
  Warning = 'WARNING',
  
  /** Error, request failed but connection OK */
  Error = 'ERROR',
  
  /** Critical, connection will be terminated */
  Critical = 'CRITICAL'
}

/**
 * Protocol error codes.
 */
export enum ProtocolErrorCode {
  /** Message format invalid (not JSON or missing fields) */
  InvalidMessage = 'INVALID_MESSAGE',
  
  /** Client sent GAME_STATE (only host allowed) */
  UnauthorizedGameState = 'UNAUTHORIZED_GAME_STATE',
  
  /** Message from unknown sender */
  UnknownSender = 'UNKNOWN_SENDER',
  
  /** Game ID doesn't match expected */
  GameIdMismatch = 'GAME_ID_MISMATCH',
  
  /** Turn number too old (duplicate/replay) */
  StaleTurn = 'STALE_TURN',
  
  /** Turn number too new (missed messages) */
  FutureTurn = 'FUTURE_TURN',
  
  /** Client and host versions incompatible */
  VersionMismatch = 'VERSION_MISMATCH',
  
  /** Peer disconnected unexpectedly */
  PeerDisconnected = 'PEER_DISCONNECTED',
  
  /** Host is migrating to another peer */
  HostMigrating = 'HOST_MIGRATING',
  
  /** WebRTC connection failed */
  ConnectionFailed = 'CONNECTION_FAILED',
  
  /** Message size exceeds limit */
  MessageTooLarge = 'MESSAGE_TOO_LARGE',
  
  /** Rate limit exceeded (too many messages) */
  RateLimitExceeded = 'RATE_LIMIT_EXCEEDED'
}

// ============================================================================
// MESSAGE UNION TYPE
// ============================================================================

/**
 * Discriminated union of all P2P message types.
 * 
 * Use TypeScript's discriminated unions for type-safe message handling:
 * 
 * ```typescript
 * function handleMessage(msg: P2PMessage) {
 *   switch (msg.type) {
 *     case P2PMessageType.JoinGame:
 *       // TypeScript knows msg is JoinGameMessage
 *       handleJoin(msg);
 *       break;
 *     case P2PMessageType.GameState:
 *       // TypeScript knows msg is GameStateMessage
 *       handleState(msg);
 *       break;
 *     // ...
 *   }
 * }
 * ```
 */
export type P2PMessage =
  | JoinGameMessage
  | GameStateMessage
  | ActionRequestMessage
  | ActionResultMessage
  | ErrorMessage;

// ============================================================================
// MESSAGE VALIDATION
// ============================================================================

/**
 * Validate a P2P message has required base fields.
 */
export function isValidP2PMessage(data: any): data is P2PMessage {
  if (typeof data !== 'object' || data === null) return false;
  
  // Check required base fields
  if (typeof data.messageId !== 'string') return false;
  if (typeof data.gameId !== 'string') return false;
  if (typeof data.senderId !== 'string') return false;
  if (typeof data.turnNumber !== 'number') return false;
  if (typeof data.timestamp !== 'number') return false;
  if (typeof data.type !== 'string') return false;
  
  // Check type is valid
  const validTypes = Object.values(P2PMessageType);
  if (!validTypes.includes(data.type as P2PMessageType)) return false;
  
  return true;
}

/**
 * Validate GAME_STATE message is from host.
 * 
 * SECURITY: Always check this before processing GAME_STATE!
 * 
 * @param message - The message to validate
 * @param hostPeerId - The expected host peer ID
 * @returns true if message is valid GAME_STATE from host
 */
export function isValidGameStateMessage(
  message: P2PMessage,
  hostPeerId: string
): message is GameStateMessage {
  if (message.type !== P2PMessageType.GameState) return false;
  if (message.senderId !== hostPeerId) {
    console.error('SECURITY: Non-host tried to send GAME_STATE!', {
      sender: message.senderId,
      expectedHost: hostPeerId
    });
    return false;
  }
  return true;
}

// ============================================================================
// MESSAGE FACTORY
// ============================================================================

/**
 * Factory functions to create properly formatted messages.
 */
export class P2PMessageFactory {
  /**
   * Create JOIN_GAME message.
   */
  static createJoinGame(
    gameId: string,
    senderId: string,
    playerId: string,
    playerName: string,
    clientVersion: string,
    lastKnownTurn?: number
  ): JoinGameMessage {
    return {
      type: P2PMessageType.JoinGame,
      messageId: this.generateMessageId(),
      gameId,
      senderId,
      turnNumber: lastKnownTurn ?? 0,
      timestamp: Date.now(),
      playerId,
      playerName,
      clientVersion,
      lastKnownTurn
    };
  }
  
  /**
   * Create GAME_STATE message.
   * Should only be called by host!
   */
  static createGameState(
    gameId: string,
    hostId: string,
    game: Game,
    reason: GameStateReason,
    lastAction?: GameAction,
    errorMessage?: string
  ): GameStateMessage {
    return {
      type: P2PMessageType.GameState,
      messageId: this.generateMessageId(),
      gameId,
      senderId: hostId,
      turnNumber: game.turnNumber,
      timestamp: Date.now(),
      game,
      reason,
      lastAction,
      errorMessage
    };
  }
  
  /**
   * Create ACTION_REQUEST message.
   */
  static createActionRequest(
    gameId: string,
    senderId: string,
    turnNumber: number,
    action: GameAction,
    expectedNextTurn?: number
  ): ActionRequestMessage {
    return {
      type: P2PMessageType.ActionRequest,
      messageId: this.generateMessageId(),
      gameId,
      senderId,
      turnNumber,
      timestamp: Date.now(),
      action,
      expectedNextTurn
    };
  }
  
  /**
   * Create ACTION_RESULT message.
   */
  static createActionResult(
    gameId: string,
    hostId: string,
    turnNumber: number,
    requestMessageId: string,
    success: boolean,
    newTurnNumber?: number,
    errorMessage?: string,
    errorCode?: ActionErrorCode
  ): ActionResultMessage {
    return {
      type: P2PMessageType.ActionResult,
      messageId: this.generateMessageId(),
      gameId,
      senderId: hostId,
      turnNumber,
      timestamp: Date.now(),
      requestMessageId,
      success,
      newTurnNumber,
      errorMessage,
      errorCode
    };
  }
  
  /**
   * Create ERROR message.
   */
  static createError(
    gameId: string,
    senderId: string,
    turnNumber: number,
    severity: ErrorSeverity,
    errorCode: ProtocolErrorCode,
    message: string,
    willDisconnect: boolean = false,
    causedByMessageId?: string,
    details?: any
  ): ErrorMessage {
    return {
      type: P2PMessageType.Error,
      messageId: this.generateMessageId(),
      gameId,
      senderId,
      turnNumber,
      timestamp: Date.now(),
      severity,
      errorCode,
      message,
      causedByMessageId,
      details,
      willDisconnect
    };
  }
  
  /**
   * Generate unique message ID.
   * Format: <senderId>_<timestamp>_<random>
   */
  private static generateMessageId(): string {
    const random = Math.random().toString(36).substring(2, 9);
    return `${Date.now()}_${random}`;
  }
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example: Client joins game
 * 
 * ```typescript
 * const joinMsg = P2PMessageFactory.createJoinGame(
 *   'game_abc123',
 *   'peer_xyz',
 *   'player_1',
 *   'Alice',
 *   '1.0.0'
 * );
 * 
 * hostConnection.send(JSON.stringify(joinMsg));
 * ```
 */

/**
 * Example: Host broadcasts state after action
 * 
 * ```typescript
 * const stateMsg = P2PMessageFactory.createGameState(
 *   game.id,
 *   hostPeerId,
 *   updatedGame,
 *   GameStateReason.ActionApplied,
 *   action
 * );
 * 
 * // Broadcast to all peers
 * peers.forEach(peer => {
 *   peer.send(JSON.stringify(stateMsg));
 * });
 * ```
 */

/**
 * Example: Client sends action
 * 
 * ```typescript
 * const actionMsg = P2PMessageFactory.createActionRequest(
 *   game.id,
 *   myPeerId,
 *   game.turnNumber,
 *   {
 *     type: ActionType.PlayMerchantCard,
 *     playerId: myPlayerId,
 *     timestamp: Date.now(),
 *     cardId: 'card_123'
 *   }
 * );
 * 
 * hostConnection.send(JSON.stringify(actionMsg));
 * ```
 */

/**
 * Example: Host validates and responds
 * 
 * ```typescript
 * hostConnection.on('data', (data) => {
 *   const msg: P2PMessage = JSON.parse(data);
 *   
 *   if (!isValidP2PMessage(msg)) {
 *     sendError(ProtocolErrorCode.InvalidMessage);
 *     return;
 *   }
 *   
 *   if (msg.type === P2PMessageType.ActionRequest) {
 *     const validation = validateAction(game, msg.action);
 *     
 *     const result = P2PMessageFactory.createActionResult(
 *       game.id,
 *       hostPeerId,
 *       game.turnNumber,
 *       msg.messageId,
 *       validation.valid,
 *       validation.valid ? game.turnNumber + 1 : undefined,
 *       validation.valid ? undefined : validation.error,
 *       validation.valid ? undefined : ActionErrorCode.InvalidAction
 *     );
 *     
 *     sendToPeer(msg.senderId, result);
 *     
 *     if (validation.valid) {
 *       const newGame = applyAction(game, msg.action);
 *       broadcastGameState(newGame, GameStateReason.ActionApplied, msg.action);
 *     }
 *   }
 * });
 * ```
 */
