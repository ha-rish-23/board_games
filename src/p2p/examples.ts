/**
 * P2P State Consistency Example
 * 
 * Complete example of client and host implementations with
 * all 4 safeguard layers integrated.
 */

import {
  calculateStateHash,
  ClientStateSyncHandler,
  HostStateSyncHandler,
  ResyncReason,
  createResyncRequest
} from './stateSync';
import {
  P2PMessage,
  P2PMessageType,
  GameStateMessage,
  ActionRequestMessage,
  ActionResultMessage,
  P2PMessageFactory
} from './protocol';
import { Game, GameAction } from '../types/domain';
import { applyAction } from '../engine/actionResolver';
import { validateAction } from '../engine/validation';

// ============================================================================
// CLIENT IMPLEMENTATION
// ============================================================================

class P2PGameClient {
  private hostPeerId: string;
  private myPeerId: string;
  private syncHandler: ClientStateSyncHandler;
  private connection: any; // PeerJS DataConnection
  
  constructor(hostPeerId: string, myPeerId: string) {
    this.hostPeerId = hostPeerId;
    this.myPeerId = myPeerId;
    this.syncHandler = new ClientStateSyncHandler(hostPeerId);
  }
  
  /**
   * Connect to host via PeerJS.
   */
  async connect(peer: any): Promise<void> {
    this.connection = peer.connect(this.hostPeerId);
    
    this.connection.on('open', () => {
      console.log('[Client] Connected to host');
      this.sendJoinRequest();
    });
    
    this.connection.on('data', (data: any) => {
      this.handleMessage(data as P2PMessage);
    });
    
    this.connection.on('close', () => {
      console.warn('[Client] Disconnected from host');
      this.handleDisconnect();
    });
    
    this.connection.on('error', (err: Error) => {
      console.error('[Client] Connection error:', err);
    });
  }
  
  /**
   * Send join request to host.
   */
  private sendJoinRequest(): void {
    const joinMsg = P2PMessageFactory.createJoinGame(
      '', // gameId will be provided by host
      this.myPeerId,
      this.myPeerId, // playerId
      'Player Name',
      '1.0.0'
    );
    
    this.connection.send(joinMsg);
  }
  
  /**
   * Handle incoming message from host.
   * 
   * This demonstrates all 4 safeguard layers:
   * 1. Idempotency (handled by syncHandler)
   * 2. Turn validation (handled by syncHandler)
   * 3. Hash verification (handled by syncHandler)
   * 4. Resync mechanism (handled by syncHandler)
   */
  private handleMessage(message: P2PMessage): void {
    console.log(`[Client] Received ${message.type}`);
    
    switch (message.type) {
      case P2PMessageType.GameState:
        this.handleGameState(message as GameStateMessage);
        break;
        
      case P2PMessageType.ActionResult:
        this.handleActionResult(message as ActionResultMessage);
        break;
        
      case P2PMessageType.Error:
        console.error('[Client] Error from host:', message);
        break;
        
      default:
        console.warn('[Client] Unknown message type:', message);
    }
  }
  
  /**
   * Handle GAME_STATE message with full safeguards.
   */
  private handleGameState(message: GameStateMessage): void {
    const result = this.syncHandler.handleGameState(message);
    
    switch (result) {
      case 'applied':
        console.log('[Client] State synchronized');
        this.updateUI();
        break;
        
      case 'resync_needed':
        console.warn('[Client] Desync detected, resync requested');
        this.showResyncUI();
        break;
        
      case 'ignored':
        console.log('[Client] Duplicate message ignored');
        break;
    }
  }
  
  /**
   * Handle ACTION_RESULT message.
   */
  private handleActionResult(message: ActionResultMessage): void {
    if (message.success) {
      console.log('[Client] Action accepted by host');
    } else {
      console.error('[Client] Action rejected:', message.errorMessage);
      this.showErrorUI(message.errorMessage || 'Action rejected');
    }
  }
  
  /**
   * Submit action to host.
   */
  submitAction(action: GameAction): void {
    const localGame = this.syncHandler.getLocalGame();
    if (!localGame) {
      console.error('[Client] No game state yet');
      return;
    }
    
    const actionMsg = P2PMessageFactory.createActionRequest(
      localGame.id,
      this.myPeerId,
      localGame.turnNumber,
      action
    );
    
    console.log(`[Client] Submitting action: ${action.type}`);
    this.connection.send(actionMsg);
  }
  
  /**
   * Handle disconnect and request resync on reconnect.
   */
  private handleDisconnect(): void {
    this.syncHandler.reset();
    // Attempt reconnect...
  }
  
  /**
   * UI update methods (implement based on your framework).
   */
  private updateUI(): void {
    const game = this.syncHandler.getLocalGame();
    if (game) {
      // Update React/Vue/etc. with new game state
      console.log(`[Client] Game at turn ${game.turnNumber}`);
    }
  }
  
  private showResyncUI(): void {
    // Show "Synchronizing..." spinner
  }
  
  private showErrorUI(message: string): void {
    // Show error toast/notification
  }
}

// ============================================================================
// HOST IMPLEMENTATION
// ============================================================================

class P2PGameHost {
  private hostPeerId: string;
  private game: Game;
  private syncHandler: HostStateSyncHandler;
  private peer: any; // PeerJS Peer
  private clients: Map<string, any> = new Map(); // peerId -> DataConnection
  
  constructor(hostPeerId: string, game: Game) {
    this.hostPeerId = hostPeerId;
    this.game = game;
    this.syncHandler = new HostStateSyncHandler(game);
  }
  
  /**
   * Start hosting on PeerJS.
   */
  async startHosting(Peer: any): Promise<void> {
    this.peer = new Peer(this.hostPeerId);
    
    this.peer.on('open', (id: string) => {
      console.log(`[Host] Hosting as ${id}`);
    });
    
    this.peer.on('connection', (conn: any) => {
      console.log(`[Host] Client connecting: ${conn.peer}`);
      this.handleNewClient(conn);
    });
    
    this.peer.on('error', (err: Error) => {
      console.error('[Host] Peer error:', err);
    });
  }
  
  /**
   * Handle new client connection.
   */
  private handleNewClient(conn: any): void {
    this.clients.set(conn.peer, conn);
    
    conn.on('open', () => {
      console.log(`[Host] Client connected: ${conn.peer}`);
    });
    
    conn.on('data', (data: any) => {
      this.handleClientMessage(data as P2PMessage, conn.peer);
    });
    
    conn.on('close', () => {
      console.log(`[Host] Client disconnected: ${conn.peer}`);
      this.clients.delete(conn.peer);
    });
    
    conn.on('error', (err: Error) => {
      console.error(`[Host] Client error (${conn.peer}):`, err);
    });
  }
  
  /**
   * Handle message from client.
   */
  private handleClientMessage(message: P2PMessage, clientPeerId: string): void {
    console.log(`[Host] Received ${message.type} from ${clientPeerId}`);
    
    switch (message.type) {
      case P2PMessageType.JoinGame:
        this.handleJoinRequest(message, clientPeerId);
        break;
        
      case P2PMessageType.ActionRequest:
        this.handleActionRequest(message as ActionRequestMessage, clientPeerId);
        break;
        
      default:
        if ((message as any).type === 'RESYNC_REQUEST') {
          this.handleResyncRequest(message as any, clientPeerId);
        } else {
          console.warn('[Host] Unknown message type from client:', message);
        }
    }
  }
  
  /**
   * Handle client join request.
   */
  private handleJoinRequest(message: P2PMessage, clientPeerId: string): void {
    console.log(`[Host] Client ${clientPeerId} joining game`);
    
    // Send current game state
    this.sendStateToClient(clientPeerId, 'INITIAL_SYNC');
  }
  
  /**
   * Handle action request from client.
   * 
   * Validates and applies action, then broadcasts new state.
   */
  private handleActionRequest(
    message: ActionRequestMessage,
    clientPeerId: string
  ): void {
    const { action } = message;
    
    // Validate action
    const validation = validateAction(this.game, action);
    if (!validation.valid) {
      console.log(`[Host] Invalid action from ${clientPeerId}: ${validation.error}`);
      this.sendActionResult(clientPeerId, message.messageId, false, validation.error);
      return;
    }
    
    // Apply action (creates new game state)
    const newGame = applyAction(this.game, action);
    
    // Update host state
    this.game = newGame;
    const newHash = this.syncHandler.updateGame(newGame);
    
    console.log(`[Host] Action applied. Turn ${newGame.turnNumber}, hash: ${newHash}`);
    
    // Send result to requester
    this.sendActionResult(clientPeerId, message.messageId, true);
    
    // Broadcast new state to ALL clients (including requester)
    this.broadcastState('ACTION_APPLIED', action);
  }
  
  /**
   * Handle resync request from client.
   * 
   * Sends full authoritative state (HOST STATE WINS).
   */
  private handleResyncRequest(request: any, clientPeerId: string): void {
    const response = this.syncHandler.handleResyncRequest(request, clientPeerId);
    
    if (response) {
      console.log(`[Host] Sending resync response to ${clientPeerId}`);
      const conn = this.clients.get(clientPeerId);
      if (conn) {
        conn.send(response);
      }
    } else {
      console.warn(`[Host] Resync rejected for ${clientPeerId} (rate limited)`);
    }
  }
  
  /**
   * Send ACTION_RESULT to specific client.
   */
  private sendActionResult(
    clientPeerId: string,
    requestMessageId: string,
    success: boolean,
    errorMessage?: string
  ): void {
    const result = P2PMessageFactory.createActionResult(
      this.game.id,
      this.hostPeerId,
      this.game.turnNumber,
      requestMessageId,
      success,
      success ? this.game.turnNumber : undefined,
      errorMessage
    );
    
    const conn = this.clients.get(clientPeerId);
    if (conn) {
      conn.send(result);
    }
  }
  
  /**
   * Broadcast GAME_STATE to all connected clients.
   */
  private broadcastState(reason: any, lastAction?: GameAction): void {
    const stateHash = calculateStateHash(this.game);
    
    const stateMsg: GameStateMessage = {
      type: P2PMessageType.GameState,
      messageId: `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gameId: this.game.id,
      senderId: this.hostPeerId,
      turnNumber: this.game.turnNumber,
      timestamp: Date.now(),
      game: this.game,
      reason,
      lastAction,
      stateHash // Include hash for client verification
    };
    
    console.log(`[Host] Broadcasting state to ${this.clients.size} clients`);
    this.clients.forEach((conn, peerId) => {
      conn.send(stateMsg);
    });
  }
  
  /**
   * Send GAME_STATE to specific client.
   */
  private sendStateToClient(clientPeerId: string, reason: any): void {
    const stateHash = calculateStateHash(this.game);
    
    const stateMsg: GameStateMessage = {
      type: P2PMessageType.GameState,
      messageId: `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gameId: this.game.id,
      senderId: this.hostPeerId,
      turnNumber: this.game.turnNumber,
      timestamp: Date.now(),
      game: this.game,
      reason,
      stateHash
    };
    
    const conn = this.clients.get(clientPeerId);
    if (conn) {
      conn.send(stateMsg);
    }
  }
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/*

// CLIENT SETUP
import Peer from 'peerjs';

const peer = new Peer('my-unique-peer-id');
const client = new P2PGameClient('host-peer-id', 'my-unique-peer-id');

await client.connect(peer);

// When user takes action
const action: GameAction = {
  type: ActionType.PlayMerchantCard,
  playerId: 'player_1',
  cardId: 'merchant_card_123',
  timestamp: Date.now()
};

client.submitAction(action);


// HOST SETUP
import Peer from 'peerjs';
import { createNewGame } from '../setup/gameSetup';

const game = createNewGame(['Alice', 'Bob']);
const host = new P2PGameHost('host-peer-id', game);

await host.startHosting(Peer);

console.log('Host ready! Share peer ID with clients: host-peer-id');

*/

export { P2PGameClient, P2PGameHost };
