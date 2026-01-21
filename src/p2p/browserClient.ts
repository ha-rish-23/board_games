/**
 * Browser-Only P2P Client (Join Room)
 * 
 * Pure client-side implementation for joining a P2P game room.
 * Client connects to host peer and receives game state updates.
 * 
 * Features:
 * - Join room by entering code
 * - Connect to host via PeerJS
 * - Receive game state from host (read-only)
 * - Send action requests to host
 * - Auto-reconnect on disconnect
 * 
 * Usage:
 *   const client = new P2PGameClient();
 *   await client.joinRoom('A3F9K2', 'player_1', 'Alice');
 *   
 *   // Send action
 *   await client.sendAction({
 *     type: ActionType.PlayMerchantCard,
 *     playerId: 'player_1',
 *     cardId: 'card123',
 *     timestamp: Date.now()
 *   });
 */

// @ts-ignore - PeerJS types installed separately
import Peer, { DataConnection } from 'peerjs';
import { Game, GameAction, GamePhase } from '../types/domain';
import {
  ClientStateSyncHandler,
  calculateStateHash
} from './stateSync';
import {
  P2PMessage,
  P2PMessageType,
  JoinGameMessage,
  GameStateMessage,
  ActionRequestMessage,
  ActionResultMessage,
  ErrorMessage,
  P2PMessageFactory
} from './protocol';
import { MessageDeduplicator } from './stateSync';

// ============================================================================
// TYPES
// ============================================================================

export interface JoinRoomConfig {
  roomCode: string;
  playerId: string;
  playerName: string;
  timeout?: number; // Connection timeout in ms (default: 30000)
}

export interface ClientRoomInfo {
  roomCode: string;
  gameId: string;
  hostPeerId: string;
  playerId: string;
  playerName: string;
  connected: boolean;
  connectedAt?: number;
}

export type ClientEventMap = {
  'connected': (info: ClientRoomInfo) => void;
  'disconnected': (reason: string) => void;
  'reconnecting': () => void;
  'reconnected': () => void;
  'game-state-received': (game: Game) => void;
  'action-accepted': (action: GameAction) => void;
  'action-rejected': (action: GameAction, error: string) => void;
  'error': (error: Error) => void;
  'host-disconnected': () => void;
  'resync-complete': (game: Game) => void;
  'player-status-changed': (playerId: string, status: 'connected' | 'disconnected') => void;
  'player-assigned': (assignedPlayerId: string, playerName: string) => void;
};

// ============================================================================
// BROWSER P2P CLIENT
// ============================================================================

/**
 * P2P Game Client - Browser-only join implementation.
 * 
 * This class manages:
 * - Connecting to host by room code
 * - Receiving game state updates
 * - Sending action requests
 * - Auto-reconnection
 * - State consistency validation
 * 
 * NO SERVER REQUIRED - runs entirely in the browser.
 */
export class P2PGameClient {
  // PeerJS
  private peer: Peer | null = null;
  private hostConnection: DataConnection | null = null;
  private clientPeerId: string = '';
  
  // Connection info
  private roomCode: string = '';
  private hostPeerId: string = '';
  private playerId: string = '';
  private playerName: string = '';
  
  // Game state (READ-ONLY - received from host)
  private game: Game | null = null;
  private syncHandler: ClientStateSyncHandler | null = null;
  
  // Connection management
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly RECONNECT_DELAY = 3000; // 3 seconds
  
  // Host disconnect detection
  private hostAliveTimer: ReturnType<typeof setInterval> | null = null;
  private lastHostMessage: number = 0;
  private readonly HOST_TIMEOUT = 30000; // 30 seconds
  
  // Safeguards
  private deduplicator: MessageDeduplicator;
  
  // Pending actions
  private pendingActions: Map<string, {
    action: GameAction;
    resolve: (success: boolean) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = new Map();
  private readonly ACTION_TIMEOUT = 10000; // 10 seconds
  
  // Events
  private eventListeners: Map<keyof ClientEventMap, Set<Function>> = new Map();
  
  constructor() {
    this.deduplicator = new MessageDeduplicator();
  }
  
  // ==========================================================================
  // JOIN ROOM
  // ==========================================================================
  
  /**
   * Join a game room by room code.
   * 
   * @param roomCode - 6-character room code from host
   * @param playerId - Player ID (must match server's player list)
   * @param playerName - Player name for display
   * @param timeout - Connection timeout in ms (default: 30000)
   * @returns Promise<ClientRoomInfo> - Connection details
   */
  async joinRoom(
    roomCode: string,
    playerId: string,
    playerName: string,
    timeout: number = 60000
  ): Promise<ClientRoomInfo> {
    if (this.connected || this.connecting) {
      throw new Error('Already connected or connecting to a room');
    }
    
    if (this.peer) {
      throw new Error('Peer already exists. Call disconnect() first.');
    }
    
    this.connecting = true;
    this.roomCode = roomCode.toUpperCase();
    this.playerId = playerId;
    this.playerName = playerName;
    
    try {
      // Step 1: Initialize PeerJS client
      this.clientPeerId = `client_${playerId}_${Date.now()}`;
      await this.initializePeerClient();
      
      // Step 2: Derive host peer ID from room code
      // Host uses format: host_{roomCode}_{timestamp}
      // We need to discover the exact host peer ID
      this.hostPeerId = await this.discoverHostPeerId(roomCode, timeout);
      
      // Step 3: Connect to host
      await this.connectToHost(timeout);
      
      // Step 4: Send JOIN_GAME message
      await this.sendJoinRequest();
      
      // Step 5: Wait for initial game state
      await this.waitForInitialState(timeout);
      
      // Step 6: Start host alive monitoring
      this.startHostMonitoring();
      
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      
      const info: ClientRoomInfo = {
        roomCode: this.roomCode,
        gameId: this.game!.id,
        hostPeerId: this.hostPeerId,
        playerId: this.playerId,
        playerName: this.playerName,
        connected: true,
        connectedAt: Date.now()
      };
      
      console.log('[Client] Successfully joined room:', info);
      this.emit('connected', info);
      
      return info;
      
    } catch (error) {
      this.connecting = false;
      console.error('[Client] Failed to join room:', error);
      this.emit('error', error as Error);
      this.cleanup();
      throw error;
    }
  }
  
  /**
   * Initialize PeerJS as client.
   */
  private async initializePeerClient(): Promise<void> {
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
        console.log('[Client] Creating Peer:', this.clientPeerId);
        this.peer = new Peer(this.clientPeerId, {
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
        console.log('[Client] Peer instance created, waiting for signaling server...');
      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`Failed to create Peer: ${err}`));
        return;
      }
      
      this.peer.on('open', (id: string) => {
        clearTimeout(timeout);
        console.log('[Client] ✓ Peer opened, ID:', id);
        console.log('[Client] ✓ Connected to signaling server');
        resolve();
      });
      
      this.peer.on('error', (err: any) => {
        clearTimeout(timeout);
        console.error('[Client] ✗ PeerJS error:', err);
        const errorMsg = err.type ? `${err.type}: ${err.message || err}` : String(err);
        reject(new Error(`Signaling server error: ${errorMsg}. Try refreshing the page.`));
      });
      
      this.peer.on('disconnected', () => {
        console.warn('[Client] PeerJS disconnected from signaling server');
        this.peer?.reconnect();
      });
    });
  }
  
  /**
   * Discover host peer ID from room code.
   * 
   * Strategy: Try to connect to common host ID patterns.
   * Host format: host_{roomCode}_{timestamp}
   * 
   * For production: Use a discovery service or QR code with full peer ID.
   */
  private async discoverHostPeerId(
    roomCode: string,
    timeout: number
  ): Promise<string> {
    // For this implementation, we'll require the full host peer ID to be shared
    // along with the room code. In a real app, you could:
    // 1. Use a lightweight discovery service
    // 2. Encode full peer ID in QR code
    // 3. Use a peer discovery protocol
    
    // Check localStorage for cached host peer ID
    const cached = this.getCachedHostPeerId(roomCode);
    if (cached) {
      console.log('[Client] Using cached host peer ID:', cached);
      return cached;
    }
    
    throw new Error(
      'Host peer ID not found. Please provide the full peer ID along with room code. ' +
      'Host should share both: Room Code + Host Peer ID'
    );
  }
  
  /**
   * Get cached host peer ID from localStorage.
   */
  private getCachedHostPeerId(roomCode: string): string | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      
      const cached = localStorage.getItem(`host_peer_${roomCode}`);
      if (cached) {
        const data = JSON.parse(cached);
        // Cache expires after 1 hour
        if (Date.now() - data.timestamp < 3600000) {
          return data.peerId;
        }
      }
    } catch (err) {
      console.warn('[Client] Failed to read cache:', err);
    }
    return null;
  }
  
  /**
   * Connect to host peer.
   */
  private async connectToHost(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[Client] >>> Attempting connection to host:', this.hostPeerId);
      
      const timeoutTimer = setTimeout(() => {
        console.error('[Client] ✗ Connection timeout after', timeout, 'ms');
        this.hostConnection?.close();
        reject(new Error('Connection timeout. Make sure you and the host are on the same network (WiFi). Check that the Host Peer ID is correct.'));
      }, timeout);
      
      console.log('[Client] Creating DataConnection...');
      this.hostConnection = this.peer!.connect(this.hostPeerId, {
        reliable: true,
        serialization: 'json'
      });
      
      // CRITICAL: Attach ALL handlers IMMEDIATELY after creating connection
      this.hostConnection.on('open', () => {
        clearTimeout(timeoutTimer);
        console.log('[Client] ✓ Connection opened to host');
        this.setupConnectionListeners();
        resolve();
      });
      
      this.hostConnection.on('error', (err: Error) => {
        clearTimeout(timeoutTimer);
        console.error('[Client] ✗ Connection error:', err);
        reject(new Error(`Connection failed: ${err.message}. Ensure you're on the same network as the host.`));
      });
      
      this.hostConnection.on('close', () => {
        console.log('[Client] Connection closed during setup');
      });
      
      console.log('[Client] Connection handlers attached, waiting for open...');
    });
  }
  
  /**
   * Set up listeners for host connection.
   */
  private setupConnectionListeners(): void {
    if (!this.hostConnection) return;
    
    console.log('[Client] Setting up data/close handlers...');
    
    this.hostConnection.on('data', (data: any) => {
      this.lastHostMessage = Date.now();
      console.log('[Client] <<< Received message type:', (data as P2PMessage).type);
      this.handleHostMessage(data as P2PMessage);
    });
    
    this.hostConnection.on('close', () => {
      console.log('[Client] ✗ Host connection closed');
      this.handleHostDisconnect();
    });
    
    this.hostConnection.on('error', (err: Error) => {
      console.error('[Client] ✗ Host connection error:', err);
    });
    
    console.log('[Client] ✓ All connection listeners ready');
  }
  
  /**
   * Send JOIN_GAME request to host.
   */
  private async sendJoinRequest(): Promise<void> {
    const joinMsg: JoinGameMessage = P2PMessageFactory.createJoinGame(
      '', // gameId not known yet
      this.clientPeerId,
      this.playerId,
      this.playerName,
      '1.0.0', // clientVersion
      undefined // lastKnownTurn
    );
    
    this.sendToHost(joinMsg);
    console.log('[Client] Sent JOIN_GAME request');
  }
  
  /**
   * Wait for initial game state from host.
   */
  private async waitForInitialState(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        reject(new Error('Timeout waiting for initial game state'));
      }, timeout);
      
      const handler = (game: Game) => {
        clearTimeout(timeoutTimer);
        this.off('game-state-received', handler);
        resolve();
      };
      
      this.on('game-state-received', handler);
    });
  }
  
  // ==========================================================================
  // MESSAGE HANDLING
  // ==========================================================================
  
  /**
   * Handle incoming messages from host.
   */
  private handleHostMessage(message: P2PMessage): void {
    // Idempotency check (Layer 1)
    if (!this.deduplicator.shouldProcess(message)) {
      console.log('[Client] Ignoring duplicate message:', message.messageId);
      return;
    }
    
    console.log('[Client] Received message:', message.type);
    
    switch (message.type) {
      case P2PMessageType.GameState:
        this.handleGameState(message as GameStateMessage);
        break;
        
      case P2PMessageType.ActionResult:
        this.handleActionResult(message as ActionResultMessage);
        break;
        
      case P2PMessageType.Error:
        this.handleError(message as ErrorMessage);
        break;
        
      default:
        // Check for custom message types
        if ((message as any).type === 'PING') {
          // Keepalive ping - no action needed, just updates lastHostMessage
          console.log('[Client] Received keepalive ping');
        } else if ((message as any).type === 'PLAYER_ASSIGNED') {
          this.handlePlayerAssigned(message as any);
        } else if ((message as any).type === 'RESYNC_RESPONSE') {
          this.handleResyncResponse(message as any);
        } else if ((message as any).type === 'PLAYER_STATUS') {
          this.handlePlayerStatus(message as any);
        } else if ((message as any).type === 'GAME_ENDED') {
          this.handleGameEnded(message as any);
        } else {
          console.warn('[Client] Unknown message type:', message.type);
        }
    }
  }
  
  /**
   * Handle GAME_STATE message from host.
   * This is the ONLY way client receives game state.
   */
  private handleGameState(message: GameStateMessage): void {
    console.log('[Client] Received game state, turn:', message.turnNumber);
    
    // First state? Initialize sync handler
    if (!this.syncHandler) {
      this.syncHandler = new ClientStateSyncHandler(this.hostPeerId);
      this.game = message.game;
      console.log('[Client] Initial state received');
      this.emit('game-state-received', message.game);
      return;
    }
    
    // Validate state via sync handler (Layers 2 & 3)
    const result = this.syncHandler.handleGameState(message);
    
    if (result === 'applied') {
      // State validated and applied
      this.game = message.game;
      console.log('[Client] State updated successfully');
      this.emit('game-state-received', message.game);
    } else if (result === 'resync_needed') {
      // State hash mismatch or turn jump - request full resync
      console.warn('[Client] State mismatch detected, requesting resync');
      this.requestResync('STATE_MISMATCH');
    } else {
      // Ignored - stale message or duplicate
      console.log('[Client] State message ignored (stale or duplicate)');
    }
  }
  
  /**
   * Handle ACTION_RESULT from host.
   */
  private handleActionResult(message: ActionResultMessage): void {
    console.log('[Client] Action result:', message.success ? 'accepted' : 'rejected');
    
    // Find pending action
    const pending = this.pendingActions.get(message.requestMessageId);
    if (!pending) {
      console.warn('[Client] Received result for unknown action');
      return;
    }
    
    this.pendingActions.delete(message.requestMessageId);
    
    if (message.success) {
      pending.resolve(true);
      this.emit('action-accepted', pending.action);
    } else {
      pending.resolve(false);
      this.emit('action-rejected', pending.action, message.errorMessage || 'Unknown error');
    }
  }
  
  /**
   * Handle ERROR message from host.
   */
  private handleError(message: ErrorMessage): void {
    console.error('[Client] Error from host:', message.errorCode, message.message);
    
    if (message.willDisconnect) {
      this.emit('error', new Error(`Fatal error: ${message.message}`));
      this.disconnect();
    }
  }
  
  /**
   * Handle RESYNC_RESPONSE from host.
   */
  private handleResyncResponse(message: any): void {
    console.log('[Client] Resync response received');
    
    if (message.game) {
      this.game = message.game;
      this.emit('resync-complete', message.game);
      this.emit('game-state-received', message.game);
    }
  }
  
  /**
   * Handle PLAYER_STATUS updates.
   */
  private handlePlayerStatus(message: any): void {
    console.log('[Client] Player status update:', message.playerId, message.status);
    this.emit('player-status-changed', message.playerId, message.status);
  }
  
  /**
   * Handle GAME_ENDED notification.
   */
  private handleGameEnded(message: any): void {
    console.log('[Client] Game ended:', message.reason);
    this.disconnect();
  }
  
  /**
   * Handle PLAYER_ASSIGNED notification from host.
   * This tells the client what their actual player ID is in the game.
   */
  private handlePlayerAssigned(message: any): void {
    console.log('[Client] Player assigned:', message.assignedPlayerId);
    this.playerId = message.assignedPlayerId;
    this.emit('player-assigned', message.assignedPlayerId, message.playerName);
  }
  
  // ==========================================================================
  // ACTION REQUESTS
  // ==========================================================================
  
  /**
   * Send action request to host.
   * 
   * CLIENT DOES NOT APPLY ACTION LOCALLY.
   * Client waits for host to validate and broadcast new state.
   * 
   * @param action - Action to request
   * @returns Promise<boolean> - True if accepted, false if rejected
   */
  async sendAction(action: GameAction): Promise<boolean> {
    if (!this.connected || !this.game) {
      throw new Error('Not connected to room');
    }
    
    // Validate it's this player's action
    if (action.playerId !== this.playerId) {
      throw new Error('Cannot send action for another player');
    }
    
    return new Promise((resolve, reject) => {
      const requestMsg: ActionRequestMessage = P2PMessageFactory.createActionRequest(
        this.game!.id,
        this.clientPeerId,
        this.game!.turnNumber,
        action
      );
      
      // Store pending action
      this.pendingActions.set(requestMsg.messageId, {
        action,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      // Set timeout
      setTimeout(() => {
        if (this.pendingActions.has(requestMsg.messageId)) {
          this.pendingActions.delete(requestMsg.messageId);
          reject(new Error('Action request timeout'));
        }
      }, this.ACTION_TIMEOUT);
      
      // Send to host
      this.sendToHost(requestMsg);
      console.log('[Client] Sent action request:', action.type);
    });
  }
  
  // ==========================================================================
  // RESYNC
  // ==========================================================================
  
  /**
   * Request full state resync from host.
   */
  private requestResync(reason: string): void {
    if (!this.game) return;
    
    const resyncMsg = {
      type: 'RESYNC_REQUEST',
      messageId: `resync_${Date.now()}`,
      gameId: this.game.id,
      senderId: this.clientPeerId,
      turnNumber: this.game.turnNumber,
      timestamp: Date.now(),
      reason: reason,
      clientTurnNumber: this.game.turnNumber,
      clientStateHash: calculateStateHash(this.game)
    };
    
    this.sendToHost(resyncMsg);
    console.log('[Client] Requested state resync:', reason);
  }
  
  // ==========================================================================
  // HOST MONITORING
  // ==========================================================================
  
  /**
   * Start monitoring host liveness.
   */
  private startHostMonitoring(): void {
    this.lastHostMessage = Date.now();
    
    this.hostAliveTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastHostMessage;
      
      if (elapsed > this.HOST_TIMEOUT) {
        console.error('[Client] Host timeout - no messages for', elapsed, 'ms');
        this.handleHostDisconnect();
      }
    }, 5000); // Check every 5 seconds
  }
  
  /**
   * Stop monitoring host.
   */
  private stopHostMonitoring(): void {
    if (this.hostAliveTimer) {
      clearInterval(this.hostAliveTimer);
      this.hostAliveTimer = null;
    }
  }
  
  // ==========================================================================
  // DISCONNECT HANDLING
  // ==========================================================================
  
  /**
   * Handle host disconnect.
   */
  private handleHostDisconnect(): void {
    if (!this.connected) return;
    
    console.warn('[Client] Host disconnected');
    this.connected = false;
    this.stopHostMonitoring();
    
    this.emit('host-disconnected');
    this.emit('disconnected', 'Host disconnected');
    
    // Attempt reconnection
    this.attemptReconnect();
  }
  
  /**
   * Attempt to reconnect to host.
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('[Client] Max reconnect attempts reached');
      this.emit('error', new Error('Failed to reconnect to host'));
      this.cleanup();
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`[Client] Reconnect attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);
    this.emit('reconnecting');
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connectToHost(10000);
        await this.sendJoinRequest();
        
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startHostMonitoring();
        
        console.log('[Client] Reconnected successfully');
        this.emit('reconnected');
        
      } catch (error) {
        console.error('[Client] Reconnect failed:', error);
        this.attemptReconnect(); // Try again
      }
    }, this.RECONNECT_DELAY);
  }
  
  /**
   * Disconnect from room.
   */
  disconnect(): void {
    console.log('[Client] Disconnecting');
    
    this.connected = false;
    this.connecting = false;
    
    this.stopHostMonitoring();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.cleanup();
    
    this.emit('disconnected', 'User disconnected');
  }
  
  /**
   * Clean up resources.
   */
  private cleanup(): void {
    // Close host connection
    if (this.hostConnection) {
      try {
        this.hostConnection.close();
      } catch (err) {
        console.error('[Client] Error closing host connection:', err);
      }
      this.hostConnection = null;
    }
    
    // Destroy peer
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (err) {
        console.error('[Client] Error destroying peer:', err);
      }
      this.peer = null;
    }
    
    // Clear pending actions
    this.pendingActions.forEach((pending) => {
      pending.reject(new Error('Disconnected'));
    });
    this.pendingActions.clear();
  }
  
  // ==========================================================================
  // MESSAGING HELPERS
  // ==========================================================================
  
  private sendToHost(message: any): void {
    if (this.hostConnection) {
      try {
        this.hostConnection.send(message);
      } catch (err) {
        console.error('[Client] Failed to send to host:', err);
      }
    }
  }
  
  // ==========================================================================
  // PUBLIC API
  // ==========================================================================
  
  /**
   * Get current game state (read-only).
   */
  getGame(): Game | null {
    return this.game;
  }
  
  /**
   * Get connection status.
   */
  isConnected(): boolean {
    return this.connected;
  }
  
  /**
   * Get client info.
   */
  getClientInfo(): ClientRoomInfo | null {
    if (!this.game) return null;
    
    return {
      roomCode: this.roomCode,
      gameId: this.game.id,
      hostPeerId: this.hostPeerId,
      playerId: this.playerId,
      playerName: this.playerName,
      connected: this.connected,
      connectedAt: this.connected ? Date.now() : undefined
    };
  }
  
  /**
   * Join room with host peer ID (alternative method).
   * Use this when you have the full host peer ID.
   */
  async joinRoomWithPeerId(
    roomCode: string,
    hostPeerId: string,
    playerId: string,
    playerName: string,
    timeout: number = 60000
  ): Promise<ClientRoomInfo> {
    // Cache the peer ID for future connections
    this.cacheHostPeerId(roomCode, hostPeerId);
    
    // Store host peer ID
    this.hostPeerId = hostPeerId;
    
    // Join normally
    return this.joinRoom(roomCode, playerId, playerName, timeout);
  }
  
  /**
   * Cache host peer ID to localStorage.
   */
  private cacheHostPeerId(roomCode: string, peerId: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      
      const data = {
        peerId,
        timestamp: Date.now()
      };
      
      localStorage.setItem(`host_peer_${roomCode}`, JSON.stringify(data));
    } catch (err) {
      console.warn('[Client] Failed to cache host peer ID:', err);
    }
  }
  
  // ==========================================================================
  // EVENT SYSTEM
  // ==========================================================================
  
  on<K extends keyof ClientEventMap>(event: K, listener: ClientEventMap[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener as Function);
  }
  
  off<K extends keyof ClientEventMap>(event: K, listener: ClientEventMap[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener as Function);
    }
  }
  
  private emit<K extends keyof ClientEventMap>(
    event: K,
    ...args: Parameters<ClientEventMap[K]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (err) {
          console.error('[Client] Event listener error:', err);
        }
      });
    }
  }
}

export default P2PGameClient;
