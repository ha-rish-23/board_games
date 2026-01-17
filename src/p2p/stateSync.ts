/**
 * State Synchronization Module
 * 
 * Provides safeguards for P2P state consistency:
 * - Turn number validation
 * - State hash verification
 * - Idempotent message handling
 * - Re-sync mechanism
 * 
 * Rule: Host state always wins. Clients must request full state on mismatch.
 */

import { Game } from '../types/domain';
import { P2PMessage, P2PMessageType, GameStateMessage } from './protocol';

// ============================================================================
// State Hash Calculation
// ============================================================================

/**
 * Calculate deterministic hash of game state for verification.
 * Uses critical fields that must match between host and clients.
 */
export function calculateStateHash(game: Game): string {
  // Include only deterministic fields that affect gameplay
  const criticalState = {
    id: game.id,
    phase: game.phase,
    turnNumber: game.turnNumber,
    currentPlayerIndex: game.currentPlayerIndex,
    
    // Player data (cards, crystals, points)
    players: game.players.map(p => ({
      id: p.id,
      name: p.name,
      hand: p.hand.map(c => c.id).sort(), // Sort for determinism
      playArea: p.playArea.map(c => c.id).sort(),
      caravan: { ...p.caravan }, // Crystal counts
      pointCards: p.pointCards.map(c => c.id).sort(),
      score: p.score,
      isFirstPlayer: p.isFirstPlayer
    })),
    
    // Merchant row state
    merchantRow: game.merchantRow.cards.map(c => c ? c.id : null),
    
    // Deck sizes (not contents, for security)
    merchantDeckSize: game.merchantDeck.length,
    pointCardDeckSize: game.pointCardDeck.length,
    
    // Point cards visible
    pointCardRow: game.pointCardRow.cards.map(c => c ? c.id : null),
    
    // End game state
    endGameTriggered: game.endGameTriggered,
    endGameTriggerPlayerIndex: game.endGameTriggerPlayerIndex,
    finalRoundComplete: game.finalRoundComplete,
    winnerId: game.winnerId
  };
  
  // Simple hash: stringify and use a basic hash function
  const json = JSON.stringify(criticalState);
  return simpleHash(json);
}

/**
 * Simple string hash for state verification.
 * Not cryptographic - just for detecting desyncs.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

// ============================================================================
// Turn Number Validation
// ============================================================================

export interface TurnValidationResult {
  valid: boolean;
  action: 'accept' | 'ignore' | 'resync';
  reason?: string;
}

/**
 * Validate turn number of incoming message against current state.
 * 
 * Rules:
 * - Exact match: Accept
 * - One behind: Accept (tolerate minor lag)
 * - Two or more behind: Ignore (too stale)
 * - Ahead: Request resync (missed updates)
 */
export function validateTurnNumber(
  messageTurn: number,
  currentTurn: number
): TurnValidationResult {
  const diff = messageTurn - currentTurn;
  
  if (diff === 0) {
    // Exact match
    return { valid: true, action: 'accept' };
  }
  
  if (diff === -1) {
    // One turn behind - tolerate network lag
    return { valid: true, action: 'accept', reason: 'Tolerated lag' };
  }
  
  if (diff < -1) {
    // Too old - ignore
    return {
      valid: false,
      action: 'ignore',
      reason: `Message too old: turn ${messageTurn} vs current ${currentTurn}`
    };
  }
  
  // diff > 0: Message from future
  return {
    valid: false,
    action: 'resync',
    reason: `Missed updates: message at turn ${messageTurn}, we're at ${currentTurn}`
  };
}

// ============================================================================
// Idempotent Message Handling
// ============================================================================

export class MessageDeduplicator {
  private seenMessages: Set<string>;
  private messageTimestamps: Map<string, number>;
  private readonly maxAge: number; // milliseconds
  private readonly maxSize: number;
  
  constructor(maxAge: number = 60000, maxSize: number = 1000) {
    this.seenMessages = new Set();
    this.messageTimestamps = new Map();
    this.maxAge = maxAge;
    this.maxSize = maxSize;
  }
  
  /**
   * Check if message has been seen before (idempotency).
   * Returns true if message is NEW (should be processed).
   * Returns false if message is DUPLICATE (should be ignored).
   */
  shouldProcess(message: P2PMessage): boolean {
    const msgId = message.messageId;
    
    if (this.seenMessages.has(msgId)) {
      console.log(`[Dedup] Ignoring duplicate message: ${msgId}`);
      return false;
    }
    
    // Add to seen set
    this.seenMessages.add(msgId);
    this.messageTimestamps.set(msgId, message.timestamp);
    
    // Cleanup old messages
    this.cleanup();
    
    return true;
  }
  
  /**
   * Remove old messages from deduplication cache.
   */
  private cleanup(): void {
    if (this.seenMessages.size < this.maxSize) {
      return;
    }
    
    const now = Date.now();
    const toRemove: string[] = [];
    
    this.messageTimestamps.forEach((timestamp, msgId) => {
      if (now - timestamp > this.maxAge) {
        toRemove.push(msgId);
      }
    });
    
    toRemove.forEach(msgId => {
      this.seenMessages.delete(msgId);
      this.messageTimestamps.delete(msgId);
    });
    
    console.log(`[Dedup] Cleaned up ${toRemove.length} old messages`);
  }
  
  /**
   * Clear all cached messages (e.g., on game restart).
   */
  clear(): void {
    this.seenMessages.clear();
    this.messageTimestamps.clear();
  }
}

// ============================================================================
// State Verification (Client-side)
// ============================================================================

export interface StateVerificationResult {
  valid: boolean;
  localHash: string;
  remoteHash: string;
  turnMatches: boolean;
  action: 'accept' | 'resync';
  reason?: string;
}

/**
 * Verify received GAME_STATE against local state.
 * Called by clients when receiving state from host.
 * 
 * Rule: If mismatch detected, client MUST request full resync.
 */
export function verifyGameState(
  receivedState: GameStateMessage,
  localGame: Game | null,
  hostPeerId: string
): StateVerificationResult {
  // Security: Verify sender is host
  if (receivedState.senderId !== hostPeerId) {
    console.error('[Security] Non-host tried to send GAME_STATE!');
    return {
      valid: false,
      localHash: '',
      remoteHash: '',
      turnMatches: false,
      action: 'resync',
      reason: 'SECURITY: Unauthorized sender'
    };
  }
  
  // First state received - always accept
  if (!localGame) {
    return {
      valid: true,
      localHash: '',
      remoteHash: receivedState.stateHash || 'none',
      turnMatches: true,
      action: 'accept',
      reason: 'Initial state'
    };
  }
  
  // Calculate hashes
  const localHash = calculateStateHash(localGame);
  const remoteHash = receivedState.stateHash || '';
  
  // Check turn number
  const turnValidation = validateTurnNumber(
    receivedState.turnNumber,
    localGame.turnNumber
  );
  
  if (!turnValidation.valid && turnValidation.action === 'ignore') {
    return {
      valid: false,
      localHash,
      remoteHash,
      turnMatches: false,
      action: 'resync',
      reason: turnValidation.reason
    };
  }
  
  // If we're ahead of received state, something is wrong
  if (receivedState.turnNumber < localGame.turnNumber) {
    console.warn('[StateSync] Received older state from host - requesting resync');
    return {
      valid: false,
      localHash,
      remoteHash,
      turnMatches: false,
      action: 'resync',
      reason: `Host sent older state: ${receivedState.turnNumber} < ${localGame.turnNumber}`
    };
  }
  
  // If turn numbers match, verify hash
  if (receivedState.turnNumber === localGame.turnNumber) {
    if (!remoteHash || remoteHash === localHash) {
      return {
        valid: true,
        localHash,
        remoteHash,
        turnMatches: true,
        action: 'accept'
      };
    } else {
      // HASH MISMATCH - desync detected!
      console.error('[StateSync] Hash mismatch detected!');
      console.error(`  Local:  ${localHash}`);
      console.error(`  Remote: ${remoteHash}`);
      return {
        valid: false,
        localHash,
        remoteHash,
        turnMatches: true,
        action: 'resync',
        reason: `State hash mismatch at turn ${localGame.turnNumber}`
      };
    }
  }
  
  // Host is ahead - accept update
  return {
    valid: true,
    localHash,
    remoteHash,
    turnMatches: false,
    action: 'accept',
    reason: `Catching up: ${localGame.turnNumber} → ${receivedState.turnNumber}`
  };
}

// ============================================================================
// Re-sync Mechanism
// ============================================================================

/**
 * Request types for state synchronization.
 */
export enum ResyncReason {
  HashMismatch = 'HASH_MISMATCH',
  MissedUpdates = 'MISSED_UPDATES',
  TurnMismatch = 'TURN_MISMATCH',
  ConnectionRecovered = 'CONNECTION_RECOVERED',
  ManualRequest = 'MANUAL_REQUEST'
}

/**
 * Resync request message (Client → Host).
 * Client requests full state when detecting inconsistency.
 */
export interface ResyncRequestMessage {
  type: 'RESYNC_REQUEST';
  messageId: string;
  gameId: string;
  senderId: string;
  turnNumber: number;
  timestamp: number;
  reason: ResyncReason;
  clientTurnNumber: number;
  clientStateHash?: string;
  lastReceivedTurn: number;
}

/**
 * Resync response message (Host → Client).
 * Host sends full authoritative state.
 */
export interface ResyncResponseMessage extends GameStateMessage {
  isResyncResponse: true;
  resyncRequestId: string; // ID of ResyncRequestMessage
}

/**
 * Create a resync request message.
 */
export function createResyncRequest(
  gameId: string,
  senderId: string,
  reason: ResyncReason,
  currentGame: Game | null,
  lastReceivedTurn: number
): ResyncRequestMessage {
  const turnNumber = currentGame?.turnNumber ?? 0;
  const stateHash = currentGame ? calculateStateHash(currentGame) : undefined;
  
  return {
    type: 'RESYNC_REQUEST',
    messageId: `resync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    gameId,
    senderId,
    turnNumber,
    timestamp: Date.now(),
    reason,
    clientTurnNumber: turnNumber,
    clientStateHash: stateHash,
    lastReceivedTurn
  };
}

/**
 * Client-side resync manager.
 * Handles detection and recovery from desyncs.
 */
export class ClientResyncManager {
  private pendingResync: boolean = false;
  private lastResyncRequest: number = 0;
  private readonly minResyncInterval: number = 2000; // 2 seconds between resyncs
  
  /**
   * Check if client should request resync.
   * Prevents spam requests.
   */
  shouldRequestResync(): boolean {
    if (this.pendingResync) {
      console.log('[Resync] Already waiting for resync response');
      return false;
    }
    
    const now = Date.now();
    if (now - this.lastResyncRequest < this.minResyncInterval) {
      console.log('[Resync] Too soon since last request');
      return false;
    }
    
    return true;
  }
  
  /**
   * Mark resync as requested.
   */
  markResyncRequested(): void {
    this.pendingResync = true;
    this.lastResyncRequest = Date.now();
  }
  
  /**
   * Mark resync as completed.
   */
  markResyncCompleted(): void {
    this.pendingResync = false;
    console.log('[Resync] State synchronized successfully');
  }
  
  /**
   * Reset resync state (e.g., on disconnect).
   */
  reset(): void {
    this.pendingResync = false;
    this.lastResyncRequest = 0;
  }
}

/**
 * Host-side resync handler.
 * Responds to client resync requests.
 */
export class HostResyncManager {
  private resyncCount: Map<string, number> = new Map(); // peerId -> count
  private readonly maxResyncsPerMinute: number = 10;
  
  /**
   * Check if client is allowed to resync (rate limiting).
   */
  canClientResync(clientPeerId: string): boolean {
    const count = this.resyncCount.get(clientPeerId) || 0;
    return count < this.maxResyncsPerMinute;
  }
  
  /**
   * Record resync request from client.
   */
  recordResync(clientPeerId: string): void {
    const count = this.resyncCount.get(clientPeerId) || 0;
    this.resyncCount.set(clientPeerId, count + 1);
    
    console.log(`[Resync] Client ${clientPeerId} requested resync (${count + 1}/${this.maxResyncsPerMinute})`);
  }
  
  /**
   * Reset resync counters (called every minute).
   */
  resetCounters(): void {
    this.resyncCount.clear();
  }
}

// ============================================================================
// Complete State Sync Workflow
// ============================================================================

/**
 * Example client-side workflow for handling GAME_STATE messages.
 */
export class ClientStateSyncHandler {
  private localGame: Game | null = null;
  private hostPeerId: string;
  private deduplicator: MessageDeduplicator;
  private resyncManager: ClientResyncManager;
  
  constructor(hostPeerId: string) {
    this.hostPeerId = hostPeerId;
    this.deduplicator = new MessageDeduplicator();
    this.resyncManager = new ClientResyncManager();
  }
  
  /**
   * Handle incoming GAME_STATE message with full validation.
   */
  handleGameState(message: GameStateMessage): 'applied' | 'resync_needed' | 'ignored' {
    // Step 1: Idempotency check
    if (!this.deduplicator.shouldProcess(message)) {
      return 'ignored';
    }
    
    // Step 2: Verify state
    const verification = verifyGameState(message, this.localGame, this.hostPeerId);
    
    if (!verification.valid) {
      console.error('[StateSync] State verification failed:', verification.reason);
      
      // Request resync if not already pending
      if (this.resyncManager.shouldRequestResync()) {
        const reason = verification.turnMatches
          ? ResyncReason.HashMismatch
          : ResyncReason.TurnMismatch;
        
        this.requestResync(reason, message.turnNumber);
      }
      
      return 'resync_needed';
    }
    
    // Step 3: Apply state (HOST STATE ALWAYS WINS)
    this.localGame = message.game;
    
    // If this was a resync response, mark complete
    if ((message as ResyncResponseMessage).isResyncResponse) {
      this.resyncManager.markResyncCompleted();
    }
    
    console.log(`[StateSync] Applied state at turn ${message.turnNumber}, hash: ${verification.remoteHash}`);
    return 'applied';
  }
  
  /**
   * Request full state resync from host.
   */
  private requestResync(reason: ResyncReason, lastReceivedTurn: number): void {
    this.resyncManager.markResyncRequested();
    
    const request = createResyncRequest(
      this.localGame?.id || '',
      'my-peer-id', // Replace with actual peer ID
      reason,
      this.localGame,
      lastReceivedTurn
    );
    
    console.warn('[StateSync] Requesting full state resync:', reason);
    // Send request to host via WebRTC
    // hostConnection.send(request);
  }
  
  /**
   * Get current local game state.
   */
  getLocalGame(): Game | null {
    return this.localGame;
  }
  
  /**
   * Reset sync state (on disconnect/reconnect).
   */
  reset(): void {
    this.deduplicator.clear();
    this.resyncManager.reset();
  }
}

/**
 * Example host-side workflow for handling resync requests.
 */
export class HostStateSyncHandler {
  private game: Game;
  private resyncManager: HostResyncManager;
  
  constructor(game: Game) {
    this.game = game;
    this.resyncManager = new HostResyncManager();
    
    // Reset rate limits every minute
    setInterval(() => {
      this.resyncManager.resetCounters();
    }, 60000);
  }
  
  /**
   * Handle resync request from client.
   */
  handleResyncRequest(
    request: ResyncRequestMessage,
    clientPeerId: string
  ): ResyncResponseMessage | null {
    // Check rate limits
    if (!this.resyncManager.canClientResync(clientPeerId)) {
      console.warn(`[Resync] Rate limit exceeded for client ${clientPeerId}`);
      return null;
    }
    
    this.resyncManager.recordResync(clientPeerId);
    
    // Log resync reason for monitoring
    console.log(`[Resync] Client ${clientPeerId} reason: ${request.reason}`);
    console.log(`  Client turn: ${request.clientTurnNumber}, Host turn: ${this.game.turnNumber}`);
    if (request.clientStateHash) {
      const hostHash = calculateStateHash(this.game);
      console.log(`  Client hash: ${request.clientStateHash}`);
      console.log(`  Host hash:   ${hostHash}`);
    }
    
    // Create resync response with full state
    const response: ResyncResponseMessage = {
      type: P2PMessageType.GameState,
      messageId: `resync_resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gameId: this.game.id,
      senderId: 'host-peer-id', // Replace with actual host peer ID
      turnNumber: this.game.turnNumber,
      timestamp: Date.now(),
      game: this.game,
      reason: 'RESYNC_RESPONSE' as any,
      stateHash: calculateStateHash(this.game),
      isResyncResponse: true,
      resyncRequestId: request.messageId
    };
    
    return response;
  }
  
  /**
   * Update game state and calculate hash for next broadcast.
   */
  updateGame(newGame: Game): string {
    this.game = newGame;
    return calculateStateHash(newGame);
  }
}
