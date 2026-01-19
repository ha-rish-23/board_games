/**
 * Browser-Only P2P Room Creation
 * 
 * Pure client-side implementation using PeerJS for LAN multiplayer.
 * One browser acts as the authoritative host with no backend server.
 * 
 * Features:
 * - Short room codes (6 characters)
 * - In-memory game state storage
 * - WebRTC peer connections via PeerJS
 * - Integration with existing game engine
 * 
 * Usage:
 *   const room = new P2PGameRoom();
 *   await room.createRoom(['Alice', 'Bob', 'Charlie']);
 *   console.log('Share room code:', room.getRoomCode());
 */

// @ts-ignore - PeerJS types installed separately
import Peer, { DataConnection } from 'peerjs';
import { Game, GameAction, GamePhase } from '../types/domain';
import { createNewGame, PlayerInput } from '../setup/gameSetup';
import { validateAction } from '../engine/validation';
import { applyAction } from '../engine/actionResolver';
import { advanceTurn } from '../engine/turnSystem';
import { finalizeGame } from '../engine/endgame';
import {
  HostStateSyncHandler,
  calculateStateHash,
  ResyncRequestMessage
} from './stateSync';
import {
  P2PMessage,
  P2PMessageType,
  JoinGameMessage,
  ActionRequestMessage,
  P2PMessageFactory,
  GameStateMessage
} from './protocol';
import { MessageDeduplicator } from './stateSync';

// ============================================================================
// TYPES
// ============================================================================

export interface RoomConfig {
  playerNames: string[];
  seed?: string;
  observerMode?: boolean;
}

export interface RoomInfo {
  roomCode: string;
  gameId: string;
  hostPeerId: string;
  createdAt: number;
  playerCount: number;
  connectedPlayers: number;
  gamePhase: GamePhase;
}

export interface ConnectedPlayer {
  playerId: string;
  playerName: string;
  peerId: string;
  connected: boolean;
  connectedAt: number;
  disconnectTime?: number;
}

export type RoomEventMap = {
  'room-created': (info: RoomInfo) => void;
  'room-error': (error: Error) => void;
  'peer-connecting': (peerId: string) => void;
  'peer-connected': (player: ConnectedPlayer) => void;
  'peer-disconnected': (peerId: string, playerName: string) => void;
  'peer-reconnected': (peerId: string, playerName: string) => void;
  'action-processed': (action: GameAction, success: boolean) => void;
  'game-state-updated': (game: Game) => void;
  'turn-auto-skipped': (playerId: string, playerName: string) => void;
  'late-joiner-rejected': (peerId: string, playerName: string) => void;
};

// ============================================================================
// BROWSER P2P ROOM (HOST)
// ============================================================================

/**
 * P2P Game Room - Browser-only host implementation.
 * 
 * This class manages:
 * - Room creation with short codes
 * - PeerJS host initialization
 * - Game engine lifecycle
 * - Peer connection management
 * - Authoritative state storage
 * 
 * NO SERVER REQUIRED - runs entirely in the browser.
 */
export class P2PGameRoom {
  // PeerJS
  private peer: Peer | null = null;
  private hostPeerId: string = '';
  private roomCode: string = '';
  
  // Game state (authoritative)
  private game: Game | null = null;
  private syncHandler: HostStateSyncHandler | null = null;
  
  // Connected peers
  private connectedPeers: Map<string, DataConnection> = new Map();
  private playerConnections: Map<string, ConnectedPlayer> = new Map(); // playerId -> info
  private observers: Set<string> = new Set(); // Observer peer IDs
  
  // Configuration
  private config: RoomConfig | null = null;
  private observerModeEnabled: boolean = false;
  
  // Safeguards
  private deduplicator: MessageDeduplicator;
  private autoSkipTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly PEER_RECONNECT_GRACE_PERIOD = 15000; // 15 seconds
  private isProcessingAction: boolean = false; // Race condition protection
  
  // Events
  private eventListeners: Map<keyof RoomEventMap, Set<Function>> = new Map();
  
  constructor() {
    this.deduplicator = new MessageDeduplicator();
  }
  
  // ==========================================================================
  // ROOM CREATION
  // ==========================================================================
  
  /**
   * Create a new game room (browser becomes host).
   * 
   * @param playerNames - Array of player names (2-5 players)
   * @param seed - Optional seed for deterministic setup
   * @param observerMode - Allow late joiners as observers
   * @returns Promise<RoomInfo> - Room details to share with players
   */
  async createRoom(
    playerNames: string[],
    seed?: string,
    observerMode: boolean = false
  ): Promise<RoomInfo> {
    if (playerNames.length < 2 || playerNames.length > 5) {
      throw new Error('Invalid player count. Must be 2-5 players.');
    }
    
    // Prevent duplicate room creation
    if (this.peer) {
      throw new Error('Room already created. Cannot create multiple rooms.');
    }
    
    try {
      // Step 1: Generate short room code
      this.roomCode = this.generateRoomCode();
      
      // Step 2: Create game via engine (NO BACKEND)
      const players: PlayerInput[] = playerNames.map((name, idx) => ({
        id: `player_${idx}`,
        name: name
      }));
      this.game = createNewGame(players, seed || this.generateSeed());
      this.syncHandler = new HostStateSyncHandler(this.game);
      
      // Step 3: Initialize PeerJS host with predictable ID format
      this.hostPeerId = `boardgame-${this.roomCode.toLowerCase()}`;
      await this.initializePeerHost();
      
      // Step 4: Store config
      this.config = { playerNames, seed, observerMode };
      this.observerModeEnabled = observerMode;
      
      // Step 5: Create room info
      const roomInfo: RoomInfo = {
        roomCode: this.roomCode,
        gameId: this.game.id,
        hostPeerId: this.hostPeerId,
        createdAt: Date.now(),
        playerCount: playerNames.length,
        connectedPlayers: 1, // Host counts as connected
        gamePhase: this.game.phase
      };
      
      this.emit('room-created', roomInfo);
      
      // Step 6: Save room info in browser storage
      this.saveRoomToLocalStorage(roomInfo);
      
      return roomInfo;
      
    } catch (error) {
      console.error('[Room] Failed to create:', error);
      this.emit('room-error', error as Error);
      throw error;
    }
  }
  
  /**
   * Generate a short, human-readable room code.
   * Format: 6 uppercase alphanumeric characters (e.g., "A3F9K2")
   * Avoids confusing characters: O, 0, I, 1, L
   */
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // No O,0,I,1,L
    let code = '';
    
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      code += chars[randomIndex];
    }
    
    return code;
  }
  
  /**
   * Generate a random seed for game setup.
   */
  private generateSeed(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
  
  /**
   * Initialize PeerJS as host.
   * Uses room code as part of peer ID for easy discovery.
   */
  private async initializePeerHost(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set a timeout for initialization
      const timeout = setTimeout(() => {
        if (this.peer) {
          this.peer.destroy();
        }
        reject(new Error('PeerJS initialization timeout (10s). Please check your internet connection and try again.'));
      }, 10000);
      
      // Create peer - use async-games working configuration
      try {
        console.log('[Room] Creating Peer:', this.hostPeerId);
        this.peer = new Peer(this.hostPeerId, {
          host: '0.peerjs.com',
          port: 443,
          path: '/',
          secure: true,
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
              {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
              },
              {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
              },
              {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
              }
            ]
          }
        });
        console.log('[Room] Peer instance created, waiting for signaling server...');
      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`Failed to create Peer: ${err}`));
        return;
      }
      
      // Attach connection listener BEFORE 'open' to avoid race condition
      this.peer.on('connection', (conn: DataConnection) => {
        console.log('[Room] >>> Incoming connection from:', conn.peer);
        this.handleIncomingConnection(conn);
      });
      
      this.peer.on('open', (id: string) => {
        clearTimeout(timeout);
        console.log('[Room] ✓ Peer opened, ID:', id);
        console.log('[Room] ✓ Connected to signaling server');
        console.log('[Room] ✓ Ready to accept connections');
        this.setupPeerListeners();
        resolve();
      });
      
      this.peer.on('error', (err: any) => {
        clearTimeout(timeout);
        console.error('[Room] ✗ PeerJS error:', err);
        const errorMsg = err.type ? `${err.type}: ${err.message || err}` : String(err);
        reject(new Error(`Signaling server error: ${errorMsg}. Try refreshing the page.`));
      });
      
      this.peer.on('disconnected', () => {
        console.warn('[Room] PeerJS disconnected from signaling server');
        // Attempt reconnect
        this.peer?.reconnect();
      });
    });
  }
  
  /**
   * Save room info to localStorage for recovery.
   */
  private saveRoomToLocalStorage(info: RoomInfo): void {
    try {
      // Check if localStorage is available (browser environment)
      if (typeof localStorage === 'undefined') {
        console.warn('[Room] localStorage not available');
        return;
      }
      
      const roomData = {
        ...info,
        game: this.game,
        savedAt: Date.now()
      };
      
      localStorage.setItem(
        `p2p_room_${this.roomCode}`,
        JSON.stringify(roomData)
      );
    } catch (err) {
      console.warn('[Room] Failed to save to localStorage:', err);
    }
  }
  
  // ==========================================================================
  // PEER CONNECTION MANAGEMENT
  // ==========================================================================
  
  private setupPeerListeners(): void {
    // Already set up in initializePeerHost
  }
  
  /**
   * Handle incoming peer connection.
   */
  private handleIncomingConnection(conn: DataConnection): void {
    console.log('[Room] Processing incoming connection from:', conn.peer);
    this.emit('peer-connecting', conn.peer);
    
    // Wait for connection to open
    conn.on('open', () => {
      console.log('[Room] ✓ Connection opened with:', conn.peer);
      this.connectedPeers.set(conn.peer, conn);
      this.setupConnectionListeners(conn);
    });
    
    conn.on('error', (err: Error) => {
      console.error('[Room] ✗ Connection error with', conn.peer, ':', err);
    });
    
    conn.on('close', () => {
      console.log('[Room] Connection closed:', conn.peer);
    });
  }
  
  /**
   * Set up listeners for a peer connection.
   */
  private setupConnectionListeners(conn: DataConnection): void {
    console.log('[Room] Attaching message handlers for:', conn.peer);
    
    // Receive messages
    conn.on('data', (data: any) => {
      console.log('[Room] <<< Received message from', conn.peer, 'type:', (data as P2PMessage).type);
      this.handlePeerMessage(data as P2PMessage, conn.peer);
    });
    
    // Handle disconnect
    conn.on('close', () => {
      console.log('[Room] ✗ Peer disconnected:', conn.peer);
      this.handlePeerDisconnect(conn.peer);
    });
    
    conn.on('error', (err: Error) => {
      console.error('[Room] ✗ Peer error:', conn.peer, err);
    });
    
    console.log('[Room] ✓ Message handlers ready for:', conn.peer);
  }
  
  /**
   * Route incoming messages from peers.
   */
  private handlePeerMessage(message: P2PMessage, peerId: string): void {
    // Idempotency check (Layer 1)
    if (!this.deduplicator.shouldProcess(message)) {
      return;
    }
    
    switch (message.type) {
      case P2PMessageType.JoinGame:
        this.handleJoinRequest(message as JoinGameMessage, peerId);
        break;
        
      case P2PMessageType.ActionRequest:
        this.handleActionRequest(message as ActionRequestMessage, peerId);
        break;
        
      default:
        // Check for custom message types
        if ((message as any).type === 'RESYNC_REQUEST') {
          this.handleResyncRequest(message as any, peerId);
        } else {
          console.warn('[Room] Unknown message type:', message.type);
        }
    }
  }
  
  // ==========================================================================
  // JOIN HANDLING
  // ==========================================================================
  
  /**
   * Handle JOIN_GAME request from peer.
   * Validates player and either accepts or rejects.
   */
  private handleJoinRequest(msg: JoinGameMessage, peerId: string): void {
    if (!this.game) {
      this.sendError(peerId, 'GAME_NOT_FOUND', 'Game not initialized');
      return;
    }
    
    // Check if game already started
    if (this.game.phase !== GamePhase.Setup) {
      if (this.observerModeEnabled) {
        this.handleObserverJoin(msg, peerId);
      } else {
        this.sendError(peerId, 'GAME_ALREADY_STARTED', 'Game in progress');
        this.emit('late-joiner-rejected', peerId, msg.playerName);
      }
      return;
    }
    
    // Find first available player slot (not yet connected)
    const availablePlayer = this.game.players.find(p => !this.playerConnections.has(p.id));
    if (!availablePlayer) {
      this.sendError(peerId, 'ROOM_FULL', 'All player slots are taken');
      return;
    }
    
    console.log('[Room] Assigning peer', peerId, 'to player slot:', availablePlayer.id);
    
    // Update player name if provided
    if (msg.playerName && msg.playerName !== availablePlayer.name) {
      availablePlayer.name = msg.playerName;
      console.log('[Room] Updated player name to:', msg.playerName);
    }
    
    // Accept connection
    const playerInfo: ConnectedPlayer = {
      playerId: availablePlayer.id,  // Use the game's player ID
      playerName: availablePlayer.name,
      peerId: peerId,
      connected: true,
      connectedAt: Date.now()
    };
    
    this.playerConnections.set(msg.playerId, playerInfo);
    
    this.emit('peer-connected', playerInfo);
    
    // Check if all players connected - if so, start the game
    if (this.game.phase === GamePhase.Setup && this.playerConnections.size === this.game.players.length) {
      this.game.phase = GamePhase.Playing;
      console.log('[Room] All players connected - game starting!');
    }
    
    // Send current game state
    this.sendGameState(peerId, 'INITIAL_SYNC');
    
    // Broadcast player joined to others
    this.broadcastPlayerStatus(msg.playerId, 'connected');
  }
  
  /**
   * Handle observer join (read-only).
   */
  private handleObserverJoin(msg: JoinGameMessage, peerId: string): void {
    this.observers.add(peerId);
    
    // Send current state (read-only)
    this.sendGameState(peerId, 'OBSERVER_JOIN');
    
    // Send observer notification
    const observerMsg = {
      type: 'OBSERVER_MODE',
      messageId: `obs_${Date.now()}`,
      gameId: this.game!.id,
      senderId: this.hostPeerId,
      turnNumber: this.game!.turnNumber,
      timestamp: Date.now(),
      message: 'Joined as observer (read-only)'
    };
    
    this.sendToPeer(peerId, observerMsg);
  }
  
  // ==========================================================================
  // ACTION PROCESSING (GAME ENGINE INTEGRATION)
  // ==========================================================================
  
  /**
   * Handle ACTION_REQUEST from peer.
   * Validates via engine and applies if valid.
   */
  private handleActionRequest(msg: ActionRequestMessage, peerId: string): void {
    if (!this.game) {
      this.sendActionResult(peerId, msg.messageId, false, 'Game not found');
      return;
    }
    
    // Race condition protection: Only process one action at a time
    if (this.isProcessingAction) {
      this.sendActionResult(peerId, msg.messageId, false, 'Host is processing another action. Please wait.');
      return;
    }
    
    this.isProcessingAction = true;
    
    // Process action via engine (NO GAME LOGIC HERE)
    const result = this.processAction(msg.action);
    
    // Send result to requester
    this.sendActionResult(
      peerId,
      msg.messageId,
      result.valid,
      result.error
    );
    
    // Release lock
    this.isProcessingAction = false;
    
    // Emit event
    this.emit('action-processed', msg.action, result.valid);
  }
  
  /**
   * Process action via game engine.
   * ALL VALIDATION AND LOGIC IN ENGINE - NOT HERE.
   */
  private processAction(action: GameAction): {
    valid: boolean;
    error?: string;
    code?: string;
  } {
    if (!this.game) {
      this.isProcessingAction = false; // Release lock on early return
      return { valid: false, error: 'Game not initialized' };
    }
    
    // Step 1: Validate via engine
    const validation = validateAction(this.game, action);
    if (!validation.valid) {
      this.isProcessingAction = false; // Release lock on validation failure
      return {
        valid: false,
        error: validation.error,
        code: validation.code
      };
    }
    
    // Step 2: Apply via engine
    let newGame = applyAction(this.game, action);
    
    // Step 3: Advance turn via engine
    const turnResult = advanceTurn(newGame);
    newGame = turnResult.game;
    
    // Step 4: Check endgame via engine
    if (turnResult.gameFinished) {
      newGame = finalizeGame(newGame);
    }
    
    // Step 5: Update authoritative state
    this.game = newGame;
    if (this.syncHandler) {
      this.syncHandler.updateGame(newGame);
    }
    
    // Step 6: Broadcast new state to all peers
    this.broadcastGameState(newGame, action);
    
    // Step 7: Emit to local UI
    this.emit('game-state-updated', newGame);
    
    return { valid: true };
  }
  
  // ==========================================================================
  // STATE BROADCASTING
  // ==========================================================================
  
  /**
   * Broadcast game state to all connected peers.
   */
  private broadcastGameState(game: Game, lastAction?: GameAction): void {
    const stateHash = calculateStateHash(game);
    
    const stateMsg: GameStateMessage = {
      type: P2PMessageType.GameState,
      messageId: `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gameId: game.id,
      senderId: this.hostPeerId,
      turnNumber: game.turnNumber,
      timestamp: Date.now(),
      game: game,
      reason: 'ACTION_APPLIED' as any,
      lastAction: lastAction,
      stateHash: stateHash
    };
    
    console.log('[Room] Broadcasting state to', this.connectedPeers.size, 'peers');
    
    // Send to all connected peers (including observers)
    this.connectedPeers.forEach((conn, peerId) => {
      try {
        conn.send(stateMsg);
      } catch (err) {
        console.error('[Room] Failed to send to', peerId, err);
      }
    });
  }
  
  /**
   * Send game state to specific peer.
   */
  private sendGameState(peerId: string, reason: string): void {
    if (!this.game) return;
    
    const stateHash = calculateStateHash(this.game);
    
    const stateMsg: GameStateMessage = {
      type: P2PMessageType.GameState,
      messageId: `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gameId: this.game.id,
      senderId: this.hostPeerId,
      turnNumber: this.game.turnNumber,
      timestamp: Date.now(),
      game: this.game,
      reason: reason as any,
      stateHash: stateHash
    };
    
    this.sendToPeer(peerId, stateMsg);
  }
  
  // ==========================================================================
  // DISCONNECT HANDLING
  // ==========================================================================
  
  /**
   * Handle peer disconnect.
   */
  private handlePeerDisconnect(peerId: string): void {
    // Remove from connected peers
    this.connectedPeers.delete(peerId);
    
    // Check if it's a player
    let disconnectedPlayer: ConnectedPlayer | undefined;
    
    this.playerConnections.forEach((player) => {
      if (player.peerId === peerId && player.connected) {
        player.connected = false;
        player.disconnectTime = Date.now();
        disconnectedPlayer = player;
      }
    });
    
    if (disconnectedPlayer) {
      this.emit('peer-disconnected', peerId, disconnectedPlayer.playerName);
      
      // Check if it's their turn
      if (this.game) {
        const currentPlayer = this.game.players[this.game.currentPlayerIndex];
        if (currentPlayer.id === disconnectedPlayer.playerId) {
          this.handleCurrentPlayerDisconnect(disconnectedPlayer);
        }
      }
      
      // Broadcast to others
      this.broadcastPlayerStatus(disconnectedPlayer.playerId, 'disconnected');
    } else if (this.observers.has(peerId)) {
      // Observer disconnected
      this.observers.delete(peerId);
      console.log('[Room] Observer disconnected:', peerId);
    }
  }
  
  /**
   * Handle current player disconnect - start auto-skip timer.
   */
  private handleCurrentPlayerDisconnect(player: ConnectedPlayer): void {
    console.log('[Room] Current player disconnected, starting grace period');
    
    // Start grace period timer
    const timer = setTimeout(() => {
      // Check if still disconnected
      if (!player.connected) {
        console.log('[Room] Grace period expired, auto-skipping turn');
        this.autoSkipTurn(player.playerId);
      }
      this.autoSkipTimers.delete(player.playerId);
    }, this.PEER_RECONNECT_GRACE_PERIOD);
    
    this.autoSkipTimers.set(player.playerId, timer);
  }
  
  /**
   * Auto-skip turn for disconnected player.
   */
  private autoSkipTurn(playerId: string): void {
    if (!this.game) return;
    
    // Verify still their turn
    const currentPlayer = this.game.players[this.game.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return; // Not their turn anymore
    }
    
    const player = this.playerConnections.get(playerId);
    if (!player) return;
    
    console.log('[Room] Auto-skipping turn for:', player.playerName);
    
    // Create REST action
    const restAction: GameAction = {
      type: 'REST' as any,
      playerId: playerId,
      timestamp: Date.now()
    };
    
    // Process via engine
    const result = this.processAction(restAction);
    
    if (result.valid) {
      this.emit('turn-auto-skipped', playerId, player.playerName);
    }
  }
  
  /**
   * Handle player reconnect.
   */
  private handlePlayerReconnect(msg: JoinGameMessage, peerId: string): void {
    const player = this.playerConnections.get(msg.playerId);
    if (!player) return;
    
    console.log('[Room] Player reconnecting:', player.playerName);
    
    // Cancel auto-skip timer if pending
    const timer = this.autoSkipTimers.get(msg.playerId);
    if (timer) {
      clearTimeout(timer);
      this.autoSkipTimers.delete(msg.playerId);
      console.log('[Room] Cancelled auto-skip timer');
    }
    
    // Update connection info
    player.peerId = peerId;
    player.connected = true;
    player.disconnectTime = undefined;
    
    // Send full state resync
    this.sendGameState(peerId, 'RECONNECT');
    
    this.emit('peer-reconnected', peerId, player.playerName);
    
    // Broadcast to others
    this.broadcastPlayerStatus(msg.playerId, 'connected');
  }
  
  // ==========================================================================
  // RESYNC HANDLING
  // ==========================================================================
  
  /**
   * Handle resync request from peer.
   */
  private handleResyncRequest(request: ResyncRequestMessage, peerId: string): void {
    if (!this.syncHandler || !this.game) return;
    
    console.log('[Room] Resync request from:', peerId, 'reason:', request.reason);
    
    // Use sync handler to create response
    const response = this.syncHandler.handleResyncRequest(request, peerId);
    
    if (response) {
      this.sendToPeer(peerId, response);
    } else {
      console.warn('[Room] Resync rejected (rate limited)');
    }
  }
  
  // ==========================================================================
  // MESSAGING HELPERS
  // ==========================================================================
  
  private sendToPeer(peerId: string, message: any): void {
    const conn = this.connectedPeers.get(peerId);
    if (conn) {
      try {
        conn.send(message);
      } catch (err) {
        console.error('[Room] Failed to send to', peerId, err);
      }
    }
  }
  
  private sendActionResult(
    peerId: string,
    requestMessageId: string,
    success: boolean,
    errorMessage?: string
  ): void {
    const result = P2PMessageFactory.createActionResult(
      this.game!.id,
      this.hostPeerId,
      this.game!.turnNumber,
      requestMessageId,
      success,
      success ? this.game!.turnNumber : undefined,
      errorMessage
    );
    
    this.sendToPeer(peerId, result);
  }
  
  private sendError(peerId: string, code: string, message: string): void {
    const errorMsg = P2PMessageFactory.createError(
      this.game?.id || '',
      this.hostPeerId,
      this.game?.turnNumber || 0,
      'ERROR' as any,
      code as any,
      message,
      true
    );
    
    this.sendToPeer(peerId, errorMsg);
    
    // Disconnect after error
    setTimeout(() => {
      const conn = this.connectedPeers.get(peerId);
      if (conn) {
        conn.close();
      }
    }, 1000);
  }
  
  private broadcastPlayerStatus(playerId: string, status: 'connected' | 'disconnected'): void {
    const statusMsg = {
      type: 'PLAYER_STATUS',
      messageId: `status_${Date.now()}`,
      gameId: this.game?.id,
      senderId: this.hostPeerId,
      turnNumber: this.game?.turnNumber || 0,
      timestamp: Date.now(),
      playerId,
      status
    };
    
    this.connectedPeers.forEach((conn, peerId) => {
      // Don't send to observers
      if (!this.observers.has(peerId)) {
        this.sendToPeer(peerId, statusMsg);
      }
    });
  }
  
  // ==========================================================================
  // PUBLIC API
  // ==========================================================================
  
  /**
   * Get room code to share with other players.
   */
  getRoomCode(): string {
    return this.roomCode;
  }
  
  /**
   * Get host peer ID (for direct connection).
   */
  getHostPeerId(): string {
    return this.hostPeerId;
  }
  
  /**
   * Get current game state (read-only).
   */
  getGame(): Game | null {
    return this.game;
  }
  
  /**
   * Get room info.
   */
  getRoomInfo(): RoomInfo | null {
    if (!this.game) return null;
    
    return {
      roomCode: this.roomCode,
      gameId: this.game.id,
      hostPeerId: this.hostPeerId,
      createdAt: this.config ? Date.now() : 0,
      playerCount: this.game.players.length,
      connectedPlayers: this.getConnectedPlayerCount(),
      gamePhase: this.game.phase
    };
  }
  
  /**
   * Get list of connected players.
   */
  getConnectedPlayers(): ConnectedPlayer[] {
    return Array.from(this.playerConnections.values());
  }
  
  private getConnectedPlayerCount(): number {
    let count = 1; // Host always counts
    this.playerConnections.forEach(p => {
      if (p.connected) count++;
    });
    return count;
  }
  
  /**
   * Close the room and disconnect all peers.
   */
  close(): void {
    console.log('[Room] Closing room');
    
    // Clear timers
    this.autoSkipTimers.forEach(timer => clearTimeout(timer));
    this.autoSkipTimers.clear();
    
    // Disconnect all peers
    this.connectedPeers.forEach((conn, peerId) => {
      try {
        const endMsg = {
          type: 'GAME_ENDED',
          messageId: `end_${Date.now()}`,
          gameId: this.game?.id,
          senderId: this.hostPeerId,
          turnNumber: this.game?.turnNumber || 0,
          timestamp: Date.now(),
          reason: 'Host closed room'
        };
        conn.send(endMsg);
        conn.close();
      } catch (err) {
        console.error('[Room] Error closing connection:', err);
      }
    });
    
    // Destroy peer
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    
    // Clear state
    this.connectedPeers.clear();
    this.playerConnections.clear();
    this.observers.clear();
    
    console.log('[Room] Closed');
  }
  
  // ==========================================================================
  // EVENT SYSTEM
  // ==========================================================================
  
  on<K extends keyof RoomEventMap>(event: K, listener: RoomEventMap[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener as Function);
  }
  
  off<K extends keyof RoomEventMap>(event: K, listener: RoomEventMap[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener as Function);
    }
  }
  
  private emit<K extends keyof RoomEventMap>(
    event: K,
    ...args: Parameters<RoomEventMap[K]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (err) {
          console.error('[Room] Event listener error:', err);
        }
      });
    }
  }
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/*

// HTML
<div id="host-screen">
  <h1>Create Game</h1>
  <input id="player1" placeholder="Player 1 name" value="Alice" />
  <input id="player2" placeholder="Player 2 name" value="Bob" />
  <input id="player3" placeholder="Player 3 name" value="Charlie" />
  <button id="create-btn">Create Room</button>
  
  <div id="room-info" style="display:none;">
    <h2>Room Created!</h2>
    <div class="room-code">
      <h3>Share this code:</h3>
      <div id="code-display"></div>
    </div>
    <div id="players-list"></div>
    <button id="start-game-btn">Start Game</button>
  </div>
</div>

// TypeScript/JavaScript
import { P2PGameRoom } from './p2p/browserRoom';

let room: P2PGameRoom;

document.getElementById('create-btn')?.addEventListener('click', async () => {
  const player1 = (document.getElementById('player1') as HTMLInputElement).value;
  const player2 = (document.getElementById('player2') as HTMLInputElement).value;
  const player3 = (document.getElementById('player3') as HTMLInputElement).value;
  
  const playerNames = [player1, player2, player3].filter(n => n.trim());
  
  if (playerNames.length < 2) {
    alert('Need at least 2 players');
    return;
  }
  
  try {
    // Create room (browser becomes host)
    room = new P2PGameRoom();
    
    // Listen to events
    room.on('room-created', (info) => {
      console.log('Room created:', info);
      displayRoomCode(info.roomCode);
      showWaitingForPlayers();
    });
    
    room.on('peer-connected', (player) => {
      console.log('Player joined:', player.playerName);
      addPlayerToList(player);
    });
    
    room.on('peer-disconnected', (peerId, playerName) => {
      console.log('Player left:', playerName);
      removePlayerFromList(playerName);
    });
    
    room.on('action-processed', (action, success) => {
      if (success) {
        console.log('Action applied:', action.type);
        updateGameUI(room.getGame());
      }
    });
    
    // Create room
    const roomInfo = await room.createRoom(playerNames, undefined, true);
    
  } catch (error) {
    alert('Failed to create room: ' + error.message);
  }
});

function displayRoomCode(code: string) {
  const codeDisplay = document.getElementById('code-display');
  if (codeDisplay) {
    codeDisplay.textContent = code;
    codeDisplay.style.fontSize = '48px';
    codeDisplay.style.fontWeight = 'bold';
    codeDisplay.style.letterSpacing = '8px';
  }
  
  document.getElementById('room-info')!.style.display = 'block';
}

function showWaitingForPlayers() {
  const playersList = document.getElementById('players-list');
  if (playersList) {
    playersList.innerHTML = '<p>Waiting for players to join...</p>';
  }
}

function addPlayerToList(player: ConnectedPlayer) {
  const playersList = document.getElementById('players-list');
  if (playersList) {
    const div = document.createElement('div');
    div.id = `player-${player.playerId}`;
    div.textContent = `✓ ${player.playerName} (connected)`;
    playersList.appendChild(div);
  }
}

function removePlayerFromList(playerName: string) {
  // Find and update player in list
  const playersList = document.getElementById('players-list');
  if (playersList) {
    Array.from(playersList.children).forEach(child => {
      if (child.textContent?.includes(playerName)) {
        child.textContent = `✗ ${playerName} (disconnected)`;
        (child as HTMLElement).style.color = '#999';
      }
    });
  }
}

function updateGameUI(game: Game | null) {
  if (!game) return;
  
  // Update your game UI with new state
  console.log('Current turn:', game.turnNumber);
  console.log('Current player:', game.players[game.currentPlayerIndex].name);
}

*/

export default P2PGameRoom;
