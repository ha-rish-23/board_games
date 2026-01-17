# Host UI Responsibilities

## Overview

This document defines the responsibilities and architecture of the **Host UI** in a P2P multiplayer game. The key principle is **separation of concerns**: the UI orchestrates the game but **never contains game rules**.

**Golden Rule:** UI is a thin adapter. All game logic lives in the engine.

---

## Architecture Principle

```
┌─────────────────────────────────────────────────────────────┐
│                        HOST UI                               │
│  (React/Vue/etc.)                                            │
│                                                              │
│  Responsibilities:                                           │
│  • Rendering game state                                     │
│  • Capturing user input                                     │
│  • Managing WebRTC connections                              │
│  • Displaying errors/notifications                          │
│                                                              │
│  ❌ NO GAME RULES                                           │
│  ❌ NO VALIDATION LOGIC                                     │
│  ❌ NO STATE CALCULATIONS                                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Calls via thin adapter
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                   HOST ADAPTER                               │
│  (Thin layer - no business logic)                           │
│                                                              │
│  • Translates UI events → Engine actions                    │
│  • Translates Engine results → UI updates                   │
│  • Manages P2P message routing                              │
│  • NO RULES - just orchestration                            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Calls pure functions
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    GAME ENGINE                               │
│  (Pure TypeScript - no UI dependencies)                     │
│                                                              │
│  • validateAction()                                          │
│  • applyAction()                                             │
│  • advanceTurn()                                             │
│  • finalizeGame()                                            │
│                                                              │
│  ✅ ALL GAME RULES HERE                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Host UI Responsibilities

### 1. Hosting Game

**Responsibility:** Initialize and manage the game session.

**What the UI does:**
- Display "Host Game" button/screen
- Collect host configuration (player names, game settings)
- Initialize PeerJS with unique host ID
- Create initial game state via engine
- Display shareable game code/QR code
- Show "Waiting for players..." state

**What the UI does NOT do:**
- ❌ Decide starting player order (engine does this)
- ❌ Shuffle decks (engine does this)
- ❌ Validate player count (engine does this)
- ❌ Distribute starting cards (engine does this)

**Implementation:**

```typescript
// ✅ CORRECT: UI calls engine through adapter
class HostUI {
  private adapter: HostGameAdapter;
  
  async startHosting(playerNames: string[]) {
    try {
      // UI responsibility: Show loading state
      this.showLoading('Creating game...');
      
      // Adapter responsibility: Create game via engine
      const gameId = await this.adapter.createGame(playerNames);
      
      // Adapter responsibility: Start P2P hosting
      const hostPeerId = await this.adapter.startP2PHost(gameId);
      
      // UI responsibility: Display share code
      this.showShareCode(hostPeerId);
      this.showWaitingForPlayers();
      
    } catch (error) {
      // UI responsibility: Display error
      this.showError('Failed to create game: ' + error.message);
    }
  }
}

// ❌ WRONG: UI contains game logic
class HostUI_WRONG {
  startHosting(playerNames: string[]) {
    // ❌ UI should NOT shuffle decks
    const shuffledDeck = this.shuffleCards(allCards);
    
    // ❌ UI should NOT decide starting player
    const firstPlayer = Math.floor(Math.random() * playerNames.length);
    
    // ❌ UI should NOT distribute cards
    playerNames.forEach(name => {
      this.giveCardsToPlayer(name, shuffledDeck.splice(0, 5));
    });
  }
}
```

---

### 2. Accepting Peer Connections

**Responsibility:** Manage WebRTC peer connections.

**What the UI does:**
- Listen for incoming peer connections
- Display "Player X is connecting..." notification
- Show connected players list
- Display connection status (connected/disconnected)
- Handle connection errors

**What the UI does NOT do:**
- ❌ Validate if player is allowed to join (adapter validates via engine)
- ❌ Assign player IDs (engine does this)
- ❌ Decide if game is full (engine knows player count)

**Implementation:**

```typescript
class HostUI {
  private adapter: HostGameAdapter;
  
  setupPeerListeners() {
    this.adapter.onPeerConnecting((peerId: string) => {
      // UI: Show notification
      this.showNotification(`Player connecting: ${peerId}`);
    });
    
    this.adapter.onPeerConnected((peerId: string, playerName: string) => {
      // UI: Update players list
      this.addPlayerToList(peerId, playerName);
      this.showNotification(`${playerName} joined!`);
    });
    
    this.adapter.onPeerRejected((peerId: string, reason: string) => {
      // UI: Show why connection was rejected
      this.showNotification(`Connection rejected: ${reason}`);
    });
    
    this.adapter.onPeerDisconnected((peerId: string, playerName: string) => {
      // UI: Update players list
      this.removePlayerFromList(peerId);
      this.showNotification(`${playerName} disconnected`);
    });
  }
}

// Adapter validates via engine
class HostGameAdapter {
  handleJoinRequest(joinMsg: JoinGameMessage, peerId: string) {
    // Adapter asks engine: Can this player join?
    const canJoin = this.validatePlayerJoin(
      this.game,
      joinMsg.playerId,
      joinMsg.playerName
    );
    
    if (!canJoin.valid) {
      // Adapter tells UI to reject
      this.emit('peer-rejected', peerId, canJoin.reason);
      this.sendError(peerId, canJoin.reason);
      return;
    }
    
    // Adapter tells UI player connected
    this.emit('peer-connected', peerId, joinMsg.playerName);
    this.sendGameState(peerId);
  }
  
  private validatePlayerJoin(
    game: Game,
    playerId: string,
    playerName: string
  ): { valid: boolean; reason?: string } {
    // Check if game already started
    if (game.phase !== GamePhase.Setup) {
      return { valid: false, reason: 'Game already started' };
    }
    
    // Check if player ID exists in game
    const player = game.players.find(p => p.id === playerId);
    if (!player) {
      return { valid: false, reason: 'Player not found in game' };
    }
    
    // Check if player already connected
    if (this.connectedPlayers.has(playerId)) {
      return { valid: false, reason: 'Player already connected' };
    }
    
    return { valid: true };
  }
}
```

---

### 3. Rejecting Invalid Actions

**Responsibility:** Validate actions and communicate rejection to clients.

**What the UI does:**
- Display validation errors to local player
- Show "Waiting for action validation..." spinner
- Display rejection reasons from other players

**What the UI does NOT do:**
- ❌ Validate action legality (engine does this)
- ❌ Check if it's player's turn (engine does this)
- ❌ Verify card costs (engine does this)
- ❌ Check win conditions (engine does this)

**Implementation:**

```typescript
class HostUI {
  private adapter: HostGameAdapter;
  
  // When local player (host) takes action
  onLocalPlayerAction(action: GameAction) {
    // UI: Show loading
    this.showActionSpinner();
    
    // Adapter: Validate and apply via engine
    const result = this.adapter.processAction(action);
    
    if (!result.valid) {
      // UI: Show rejection reason
      this.hideActionSpinner();
      this.showError(result.error);
      return;
    }
    
    // UI: Update to new state
    this.hideActionSpinner();
    this.renderGameState(result.newGame);
  }
}

class HostGameAdapter {
  processAction(action: GameAction): ActionResult {
    // Step 1: Validate via engine (NO UI CODE)
    const validation = validateAction(this.game, action);
    
    if (!validation.valid) {
      // Return error - UI will display
      return {
        valid: false,
        error: validation.error,
        code: validation.code
      };
    }
    
    // Step 2: Apply via engine
    const newGame = applyAction(this.game, action);
    
    // Step 3: Advance turn via engine
    const turnResult = advanceTurn(newGame);
    this.game = turnResult.game;
    
    // Step 4: Check endgame via engine
    if (turnResult.gameFinished) {
      this.game = finalizeGame(this.game);
    }
    
    // Step 5: Broadcast new state to peers
    this.broadcastState(this.game, action);
    
    return {
      valid: true,
      newGame: this.game
    };
  }
  
  // When remote player sends action
  handleActionRequest(msg: ActionRequestMessage, peerId: string) {
    const result = this.processAction(msg.action);
    
    // Send result back to requesting peer
    this.sendActionResult(peerId, msg.messageId, result);
    
    // If valid, state was already broadcasted in processAction
  }
}

// ❌ WRONG: UI validates actions
class HostUI_WRONG {
  onLocalPlayerAction(action: GameAction) {
    // ❌ UI should NOT check turns
    if (this.currentPlayerIndex !== this.localPlayerIndex) {
      this.showError('Not your turn!');
      return;
    }
    
    // ❌ UI should NOT validate card costs
    if (action.type === 'CLAIM_POINT_CARD') {
      const card = this.findCard(action.cardId);
      if (this.playerCrystals < card.cost) {
        this.showError('Not enough crystals!');
        return;
      }
    }
    
    // ❌ UI contains game rules - BAD!
  }
}
```

---

### 4. Broadcasting Authoritative State

**Responsibility:** Send validated state to all connected peers.

**What the UI does:**
- Display "Syncing..." indicator during broadcast
- Show broadcast success/failure
- Display "Player X disconnected during sync" warnings
- Retry failed broadcasts (with UI feedback)

**What the UI does NOT do:**
- ❌ Decide when to broadcast (adapter knows after action applied)
- ❌ Modify state before broadcasting (engine state is authoritative)
- ❌ Calculate state hashes (stateSync module does this)
- ❌ Handle resync requests (adapter does this)

**Implementation:**

```typescript
class HostUI {
  private adapter: HostGameAdapter;
  
  constructor(adapter: HostGameAdapter) {
    this.adapter = adapter;
    
    // Listen to adapter events
    this.adapter.onBroadcasting(() => {
      this.showSyncIndicator('Syncing state...');
    });
    
    this.adapter.onBroadcastComplete((successCount: number, totalCount: number) => {
      this.hideSyncIndicator();
      
      if (successCount < totalCount) {
        this.showWarning(
          `State sent to ${successCount}/${totalCount} players. ` +
          `${totalCount - successCount} may be disconnected.`
        );
      }
    });
    
    this.adapter.onResyncRequested((peerId: string, reason: string) => {
      this.showNotification(
        `Player requested resync: ${reason}`
      );
    });
  }
}

class HostGameAdapter {
  private syncHandler: HostStateSyncHandler;
  private connectedPeers: Map<string, PeerConnection>;
  
  // Called after engine applies action
  broadcastState(game: Game, lastAction?: GameAction) {
    // Notify UI: Starting broadcast
    this.emit('broadcasting');
    
    // Calculate hash via stateSync module (NOT UI)
    const stateHash = calculateStateHash(game);
    
    // Create message via protocol factory (NOT UI)
    const stateMsg: GameStateMessage = {
      type: P2PMessageType.GameState,
      messageId: this.generateMessageId(),
      gameId: game.id,
      senderId: this.hostPeerId,
      turnNumber: game.turnNumber,
      timestamp: Date.now(),
      game: game, // Authoritative state from engine
      reason: GameStateReason.ActionApplied,
      lastAction: lastAction,
      stateHash: stateHash
    };
    
    // Broadcast to all peers
    let successCount = 0;
    const totalCount = this.connectedPeers.size;
    
    this.connectedPeers.forEach((conn, peerId) => {
      try {
        conn.send(stateMsg);
        successCount++;
      } catch (error) {
        console.error(`Failed to send to ${peerId}:`, error);
      }
    });
    
    // Notify UI: Broadcast complete
    this.emit('broadcast-complete', successCount, totalCount);
  }
  
  // Handle resync requests (NO UI CODE)
  handleResyncRequest(request: ResyncRequestMessage, peerId: string) {
    // Notify UI
    this.emit('resync-requested', peerId, request.reason);
    
    // Use stateSync module to handle (NOT UI)
    const response = this.syncHandler.handleResyncRequest(request, peerId);
    
    if (!response) {
      console.warn(`Resync rejected for ${peerId} (rate limited)`);
      return;
    }
    
    // Send full authoritative state
    const conn = this.connectedPeers.get(peerId);
    if (conn) {
      conn.send(response);
    }
  }
}

// ❌ WRONG: UI modifies state before broadcast
class HostGameAdapter_WRONG {
  broadcastState(game: Game) {
    // ❌ UI should NOT modify engine state
    const uiGame = {
      ...game,
      // ❌ Adding UI-specific fields to engine state
      animationDelay: 500,
      soundEffect: 'card-play.mp3'
    };
    
    // ❌ Broadcasting modified state - BAD!
    this.sendToAll(uiGame);
  }
}
```

---

## Complete Host Adapter Example

Here's a complete thin adapter that enforces separation:

```typescript
import { Game, GameAction } from '../types/domain';
import { validateAction } from '../engine/validation';
import { applyAction } from '../engine/actionResolver';
import { advanceTurn } from '../engine/turnSystem';
import { finalizeGame } from '../engine/endgame';
import { createNewGame } from '../setup/gameSetup';
import {
  HostStateSyncHandler,
  calculateStateHash
} from './stateSync';
import {
  P2PMessageType,
  GameStateMessage,
  ActionRequestMessage,
  P2PMessageFactory
} from './protocol';
import Peer from 'peerjs';

/**
 * Host Game Adapter
 * 
 * Thin orchestration layer between UI and engine.
 * 
 * RULES:
 * - NO game rules or validation logic
 * - NO state calculations
 * - ONLY orchestration and message routing
 * - ALL game logic delegated to engine
 */
export class HostGameAdapter extends EventEmitter {
  private game: Game | null = null;
  private peer: Peer | null = null;
  private hostPeerId: string;
  private syncHandler: HostStateSyncHandler | null = null;
  private connectedPeers: Map<string, DataConnection> = new Map();
  private connectedPlayers: Map<string, string> = new Map(); // playerId -> peerId
  
  // ========================================================================
  // 1. HOSTING GAME
  // ========================================================================
  
  /**
   * Create new game via engine.
   * NO GAME LOGIC - just calls engine.
   */
  async createGame(playerNames: string[]): Promise<string> {
    // Engine creates game (handles all setup logic)
    this.game = createNewGame(playerNames);
    
    // Initialize sync handler
    this.syncHandler = new HostStateSyncHandler(this.game);
    
    return this.game.id;
  }
  
  /**
   * Start P2P hosting.
   * NO GAME LOGIC - just WebRTC setup.
   */
  async startP2PHost(gameId: string): Promise<string> {
    this.hostPeerId = `host_${gameId}_${Date.now()}`;
    
    return new Promise((resolve, reject) => {
      this.peer = new Peer(this.hostPeerId);
      
      this.peer.on('open', (id) => {
        console.log(`[Adapter] Hosting as ${id}`);
        this.setupPeerListeners();
        resolve(id);
      });
      
      this.peer.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  // ========================================================================
  // 2. ACCEPTING PEER CONNECTIONS
  // ========================================================================
  
  private setupPeerListeners(): void {
    if (!this.peer) return;
    
    this.peer.on('connection', (conn) => {
      this.emit('peer-connecting', conn.peer);
      
      conn.on('open', () => {
        this.connectedPeers.set(conn.peer, conn);
        this.setupConnectionListeners(conn);
      });
    });
  }
  
  private setupConnectionListeners(conn: DataConnection): void {
    conn.on('data', (data) => {
      this.handlePeerMessage(data as any, conn.peer);
    });
    
    conn.on('close', () => {
      this.handlePeerDisconnect(conn.peer);
    });
    
    conn.on('error', (err) => {
      console.error(`[Adapter] Peer error (${conn.peer}):`, err);
    });
  }
  
  private handlePeerMessage(message: any, peerId: string): void {
    switch (message.type) {
      case P2PMessageType.JoinGame:
        this.handleJoinRequest(message, peerId);
        break;
        
      case P2PMessageType.ActionRequest:
        this.handleActionRequest(message, peerId);
        break;
        
      default:
        if (message.type === 'RESYNC_REQUEST') {
          this.handleResyncRequest(message, peerId);
        }
    }
  }
  
  /**
   * Validate player join via engine state.
   * NO RULES - just checks engine state.
   */
  private handleJoinRequest(msg: any, peerId: string): void {
    if (!this.game) {
      this.sendError(peerId, 'Game not initialized');
      this.emit('peer-rejected', peerId, 'Game not initialized');
      return;
    }
    
    // Check engine state (NO game rules)
    const player = this.game.players.find(p => p.id === msg.playerId);
    if (!player) {
      this.sendError(peerId, 'Player not found');
      this.emit('peer-rejected', peerId, 'Player not found');
      return;
    }
    
    if (this.connectedPlayers.has(msg.playerId)) {
      this.sendError(peerId, 'Player already connected');
      this.emit('peer-rejected', peerId, 'Already connected');
      return;
    }
    
    // Accept connection
    this.connectedPlayers.set(msg.playerId, peerId);
    this.emit('peer-connected', peerId, player.name);
    
    // Send current state
    this.sendGameState(peerId, 'INITIAL_SYNC');
  }
  
  private handlePeerDisconnect(peerId: string): void {
    this.connectedPeers.delete(peerId);
    
    // Find player ID
    let disconnectedPlayerId: string | null = null;
    this.connectedPlayers.forEach((pid, playerId) => {
      if (pid === peerId) {
        disconnectedPlayerId = playerId;
      }
    });
    
    if (disconnectedPlayerId) {
      this.connectedPlayers.delete(disconnectedPlayerId);
      const player = this.game?.players.find(p => p.id === disconnectedPlayerId);
      this.emit('peer-disconnected', peerId, player?.name || 'Unknown');
    }
  }
  
  // ========================================================================
  // 3. REJECTING INVALID ACTIONS
  // ========================================================================
  
  /**
   * Process action via engine.
   * NO VALIDATION LOGIC - engine does all validation.
   */
  processAction(action: GameAction): {
    valid: boolean;
    error?: string;
    code?: string;
    newGame?: Game;
  } {
    if (!this.game) {
      return { valid: false, error: 'Game not initialized' };
    }
    
    // Engine validates (ALL RULES IN ENGINE)
    const validation = validateAction(this.game, action);
    if (!validation.valid) {
      return {
        valid: false,
        error: validation.error,
        code: validation.code
      };
    }
    
    // Engine applies (ALL LOGIC IN ENGINE)
    let newGame = applyAction(this.game, action);
    
    // Engine advances turn (ALL LOGIC IN ENGINE)
    const turnResult = advanceTurn(newGame);
    newGame = turnResult.game;
    
    // Engine checks endgame (ALL LOGIC IN ENGINE)
    if (turnResult.gameFinished) {
      newGame = finalizeGame(newGame);
    }
    
    // Update state
    this.game = newGame;
    if (this.syncHandler) {
      this.syncHandler.updateGame(newGame);
    }
    
    // Broadcast to peers
    this.broadcastState(newGame, action);
    
    return { valid: true, newGame };
  }
  
  private handleActionRequest(msg: ActionRequestMessage, peerId: string): void {
    const result = this.processAction(msg.action);
    
    // Send result to requester
    const resultMsg = P2PMessageFactory.createActionResult(
      this.game!.id,
      this.hostPeerId,
      this.game!.turnNumber,
      msg.messageId,
      result.valid,
      result.valid ? this.game!.turnNumber : undefined,
      result.error
    );
    
    const conn = this.connectedPeers.get(peerId);
    if (conn) {
      conn.send(resultMsg);
    }
  }
  
  // ========================================================================
  // 4. BROADCASTING AUTHORITATIVE STATE
  // ========================================================================
  
  /**
   * Broadcast state to all peers.
   * NO LOGIC - just message creation and sending.
   */
  private broadcastState(game: Game, lastAction?: GameAction): void {
    this.emit('broadcasting');
    
    // Calculate hash via stateSync (NOT HERE)
    const stateHash = calculateStateHash(game);
    
    // Create message via protocol (NOT HERE)
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
    
    // Send to all
    let successCount = 0;
    this.connectedPeers.forEach((conn) => {
      try {
        conn.send(stateMsg);
        successCount++;
      } catch (err) {
        console.error('Broadcast failed:', err);
      }
    });
    
    this.emit('broadcast-complete', successCount, this.connectedPeers.size);
  }
  
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
    
    const conn = this.connectedPeers.get(peerId);
    if (conn) {
      conn.send(stateMsg);
    }
  }
  
  private handleResyncRequest(request: any, peerId: string): void {
    if (!this.syncHandler) return;
    
    this.emit('resync-requested', peerId, request.reason);
    
    // Delegate to syncHandler (NOT HERE)
    const response = this.syncHandler.handleResyncRequest(request, peerId);
    
    if (response) {
      const conn = this.connectedPeers.get(peerId);
      if (conn) {
        conn.send(response);
      }
    }
  }
  
  private sendError(peerId: string, message: string): void {
    const errorMsg = P2PMessageFactory.createError(
      this.game?.id || '',
      this.hostPeerId,
      this.game?.turnNumber || 0,
      'ERROR' as any,
      'CONNECTION_ERROR' as any,
      message,
      false
    );
    
    const conn = this.connectedPeers.get(peerId);
    if (conn) {
      conn.send(errorMsg);
    }
  }
  
  // ========================================================================
  // GETTERS (for UI)
  // ========================================================================
  
  getGame(): Game | null {
    return this.game;
  }
  
  getConnectedPeers(): string[] {
    return Array.from(this.connectedPeers.keys());
  }
}
```

---

## UI Implementation Guidelines

### ✅ DO

1. **Render state from adapter**
   ```typescript
   render() {
     const game = this.adapter.getGame();
     return <GameBoard game={game} />;
   }
   ```

2. **Pass user actions to adapter**
   ```typescript
   onCardClick(cardId: string) {
     const action = { type: 'PLAY_CARD', cardId, ... };
     this.adapter.processAction(action);
   }
   ```

3. **Display adapter events**
   ```typescript
   this.adapter.on('peer-connected', (peerId, name) => {
     this.toast.show(`${name} joined!`);
   });
   ```

4. **Show validation errors**
   ```typescript
   const result = this.adapter.processAction(action);
   if (!result.valid) {
     this.toast.error(result.error);
   }
   ```

### ❌ DON'T

1. **Don't validate actions in UI**
   ```typescript
   // ❌ WRONG
   if (game.currentPlayerIndex !== myIndex) {
     return; // UI should not check this
   }
   ```

2. **Don't modify engine state**
   ```typescript
   // ❌ WRONG
   game.players[0].score += 10; // Never mutate
   ```

3. **Don't calculate game results**
   ```typescript
   // ❌ WRONG
   const winner = this.calculateWinner(game); // Engine does this
   ```

4. **Don't implement game rules**
   ```typescript
   // ❌ WRONG
   if (card.cost > player.crystals) {
     return; // Engine validates this
   }
   ```

---

## Testing

### Test the Adapter (Not UI)

```typescript
describe('HostGameAdapter', () => {
  it('rejects invalid actions via engine', () => {
    const adapter = new HostGameAdapter();
    await adapter.createGame(['Alice', 'Bob']);
    
    // Try invalid action
    const result = adapter.processAction({
      type: 'PLAY_CARD',
      playerId: 'wrong-player', // Not their turn
      cardId: 'card-1',
      timestamp: Date.now()
    });
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not your turn');
  });
  
  it('broadcasts state after valid action', (done) => {
    const adapter = new HostGameAdapter();
    await adapter.createGame(['Alice', 'Bob']);
    
    adapter.on('broadcast-complete', (sent, total) => {
      expect(sent).toBe(1); // One connected peer
      done();
    });
    
    // Mock peer connection
    adapter.addMockPeer('peer-1');
    
    // Valid action
    adapter.processAction(validAction);
  });
});
```

### Test UI Separately

```typescript
describe('HostUI', () => {
  it('displays game state from adapter', () => {
    const mockAdapter = createMockAdapter();
    const ui = new HostUI(mockAdapter);
    
    // Adapter provides state
    mockAdapter.setGame(testGame);
    
    // UI renders it
    const rendered = ui.render();
    expect(rendered).toContain('Alice');
    expect(rendered).toContain('Turn 5');
  });
  
  it('shows error on invalid action', () => {
    const mockAdapter = createMockAdapter();
    mockAdapter.processAction = () => ({
      valid: false,
      error: 'Not your turn'
    });
    
    const ui = new HostUI(mockAdapter);
    ui.onCardClick('card-1');
    
    expect(ui.errorMessage).toBe('Not your turn');
  });
});
```

---

## Summary

| Responsibility | Who Does It |
|----------------|-------------|
| **Hosting game** | UI starts → Adapter creates via engine |
| **Accepting peers** | UI listens → Adapter validates via engine state |
| **Rejecting actions** | Adapter validates via engine → UI displays error |
| **Broadcasting state** | Adapter sends → stateSync calculates hash |
| **Game rules** | ✅ Engine ONLY |
| **State calculations** | ✅ Engine ONLY |
| **Validation logic** | ✅ Engine ONLY |
| **UI rendering** | ✅ UI ONLY |
| **User input** | ✅ UI ONLY |
| **Notifications** | ✅ UI ONLY |

**Remember:** The adapter is a thin orchestration layer. It has **no business logic**, only routing and event translation.
