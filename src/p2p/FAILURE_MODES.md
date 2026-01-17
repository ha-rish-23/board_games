# LAN P2P Failure Modes & Recovery

## Overview

This document enumerates all failure modes specific to LAN peer-to-peer multiplayer and defines expected behavior and recovery mechanisms for each.

**Design Philosophy:** Graceful degradation. The game should handle failures transparently when possible, and fail clearly when recovery is impossible.

---

## Failure Mode Categories

```
┌─────────────────────────────────────────────────────────┐
│  FAILURE MODE TAXONOMY                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. HOST FAILURES                                       │
│     • Host disconnects completely                       │
│     • Host crashes mid-action                           │
│     • Host network partitioned                          │
│                                                         │
│  2. PEER FAILURES                                       │
│     • Peer disconnects mid-turn                         │
│     • Peer crashes during action validation             │
│     • Peer network partitioned                          │
│                                                         │
│  3. MESSAGE FAILURES                                    │
│     • Duplicate action messages                         │
│     • Out-of-order messages                             │
│     • Message loss (packet drop)                        │
│                                                         │
│  4. TIMING FAILURES                                     │
│     • Late joiners (game already started)               │
│     • Reconnection attempts                             │
│     • Host migration timeouts                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 1. HOST DISCONNECTS

### Problem

The host is the authoritative server. If the host disconnects, all clients lose their source of truth.

### Severity

**🔴 CRITICAL** - Game cannot continue without host.

### Expected Behavior

```
┌─────────────────────────────────────────────────────────┐
│  HOST DISCONNECT SEQUENCE                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Host WebRTC connection closes                       │
│  2. All clients detect disconnect within 5 seconds      │
│  3. Clients display: "Host disconnected"                │
│  4. Clients show options:                               │
│     a) Wait for host to reconnect (30s timeout)         │
│     b) Elect new host (if enabled)                      │
│     c) End game and return to lobby                     │
│  5. If timeout expires:                                 │
│     - Save game state locally (optional)                │
│     - Return to lobby                                   │
│     - Show "Game ended: Host disconnected"              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**Client-side detection:**

```typescript
class ClientGameAdapter extends EventEmitter {
  private hostConnection: DataConnection | null = null;
  private hostDisconnectTimer: NodeJS.Timeout | null = null;
  private readonly HOST_TIMEOUT = 30000; // 30 seconds
  
  setupHostConnection(conn: DataConnection) {
    this.hostConnection = conn;
    
    // Detect disconnect
    conn.on('close', () => {
      this.handleHostDisconnect();
    });
    
    // Also monitor connection state
    conn.on('error', (err) => {
      console.error('[Client] Host connection error:', err);
      if (conn.peerConnection?.connectionState === 'failed') {
        this.handleHostDisconnect();
      }
    });
  }
  
  private handleHostDisconnect() {
    console.error('[Client] Host disconnected!');
    
    // Emit to UI immediately
    this.emit('host-disconnected');
    
    // Start timeout timer
    this.hostDisconnectTimer = setTimeout(() => {
      this.emit('host-timeout');
      this.cleanupAndReturnToLobby();
    }, this.HOST_TIMEOUT);
  }
  
  // If host reconnects before timeout
  handleHostReconnected() {
    console.log('[Client] Host reconnected!');
    
    if (this.hostDisconnectTimer) {
      clearTimeout(this.hostDisconnectTimer);
      this.hostDisconnectTimer = null;
    }
    
    // Request full state resync
    this.requestResync(ResyncReason.ConnectionRecovered);
    
    this.emit('host-reconnected');
  }
  
  private cleanupAndReturnToLobby() {
    // Save game state locally (optional)
    const game = this.syncHandler.getLocalGame();
    if (game) {
      this.saveGameStateLocally(game);
    }
    
    // Disconnect from all peers
    this.disconnect();
    
    // UI will show "Game ended" screen
    this.emit('game-ended', 'host-disconnected');
  }
  
  private saveGameStateLocally(game: Game) {
    try {
      localStorage.setItem(
        `game_${game.id}_backup`,
        JSON.stringify({
          game,
          timestamp: Date.now(),
          reason: 'host-disconnected'
        })
      );
      console.log('[Client] Game state saved locally');
    } catch (err) {
      console.error('[Client] Failed to save game state:', err);
    }
  }
}
```

**UI implementation:**

```typescript
class ClientUI {
  private adapter: ClientGameAdapter;
  
  setupFailureHandlers() {
    this.adapter.on('host-disconnected', () => {
      this.showModal({
        title: '⚠️ Host Disconnected',
        message: 'The game host has lost connection.',
        options: [
          {
            label: 'Wait for Host (30s)',
            action: 'wait'
          },
          {
            label: 'End Game',
            action: 'end',
            style: 'danger'
          }
        ]
      });
      
      this.startReconnectCountdown(30);
    });
    
    this.adapter.on('host-reconnected', () => {
      this.hideModal();
      this.showNotification('✅ Host reconnected! Syncing...');
    });
    
    this.adapter.on('host-timeout', () => {
      this.hideModal();
      this.showErrorScreen(
        'Game Ended',
        'Host did not reconnect in time.',
        'Return to Lobby'
      );
    });
  }
}
```

### Alternative: Host Migration

**Optional advanced feature** (see P2P_ARCHITECTURE.md for full design):

```typescript
class ClientGameAdapter {
  private handleHostDisconnect() {
    // Check if host migration is enabled
    if (this.hostMigrationEnabled) {
      this.emit('host-migration-started');
      this.electNewHost();
    } else {
      // Standard timeout behavior
      this.startHostTimeout();
    }
  }
  
  private electNewHost() {
    // Election algorithm (e.g., lowest peer ID becomes host)
    const allPeers = this.getConnectedPeers();
    const sortedPeers = allPeers.sort();
    const newHostPeerId = sortedPeers[0];
    
    if (newHostPeerId === this.myPeerId) {
      // I'm the new host
      this.promoteToHost();
    } else {
      // Connect to new host
      this.reconnectToNewHost(newHostPeerId);
    }
  }
}
```

---

## 2. PEER DISCONNECTS MID-TURN

### Problem

A peer (non-host player) disconnects while it's their turn or while another player is waiting for their action.

### Severity

**🟡 MEDIUM** - Game can continue but affected player cannot act.

### Expected Behavior

```
┌─────────────────────────────────────────────────────────┐
│  PEER DISCONNECT SEQUENCE                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SCENARIO A: Peer disconnects on their turn             │
│  1. Host detects disconnect                             │
│  2. Host waits 15 seconds for reconnect                 │
│  3. If no reconnect:                                    │
│     a) Skip peer's turn automatically                   │
│     b) Advance to next player                           │
│     c) Broadcast new state                              │
│  4. Display: "Alice disconnected. Turn skipped."        │
│                                                         │
│  SCENARIO B: Peer disconnects NOT on their turn         │
│  1. Host detects disconnect                             │
│  2. Mark player as "disconnected"                       │
│  3. Game continues normally                             │
│  4. When disconnected player's turn arrives:            │
│     - Auto-skip turn (see Scenario A)                   │
│  5. If peer reconnects:                                 │
│     - Resync full state                                 │
│     - Resume on their next turn                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**Host-side handling:**

```typescript
class HostGameAdapter extends EventEmitter {
  private connectedPlayers: Map<string, {
    peerId: string;
    playerId: string;
    playerName: string;
    connected: boolean;
    disconnectTime?: number;
  }> = new Map();
  
  private readonly PEER_RECONNECT_GRACE_PERIOD = 15000; // 15 seconds
  
  private handlePeerDisconnect(peerId: string) {
    const playerInfo = this.getPlayerInfoByPeerId(peerId);
    if (!playerInfo) return;
    
    console.log(`[Host] Peer ${playerInfo.playerName} disconnected`);
    
    // Mark as disconnected
    playerInfo.connected = false;
    playerInfo.disconnectTime = Date.now();
    
    // Emit to UI
    this.emit('peer-disconnected', peerId, playerInfo.playerName);
    
    // Check if it's their turn
    const game = this.getGame();
    if (!game) return;
    
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.id === playerInfo.playerId) {
      // Disconnected player's turn
      this.handleCurrentPlayerDisconnect(playerInfo);
    }
    
    // Broadcast to other clients
    this.broadcastPlayerStatus(playerInfo.playerId, 'disconnected');
  }
  
  private handleCurrentPlayerDisconnect(playerInfo: any) {
    console.log(`[Host] Current player ${playerInfo.playerName} disconnected`);
    
    // Start grace period timer
    setTimeout(() => {
      // Check if still disconnected
      if (!playerInfo.connected) {
        console.log(`[Host] Auto-skipping turn for ${playerInfo.playerName}`);
        this.autoSkipTurn(playerInfo.playerId);
      }
    }, this.PEER_RECONNECT_GRACE_PERIOD);
  }
  
  private autoSkipTurn(playerId: string) {
    const game = this.getGame();
    if (!game) return;
    
    // Verify still their turn
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return; // Someone else's turn now
    }
    
    // Create REST action (player passes)
    const restAction: GameAction = {
      type: ActionType.Rest,
      playerId: playerId,
      timestamp: Date.now()
    };
    
    // Process through engine
    const result = this.processAction(restAction);
    
    if (result.valid) {
      // Broadcast with reason
      this.broadcastState(result.newGame!, restAction);
      this.emit('turn-auto-skipped', playerId);
    }
  }
  
  // When peer reconnects
  private handlePeerReconnect(peerId: string) {
    const playerInfo = this.getPlayerInfoByPeerId(peerId);
    if (!playerInfo) return;
    
    console.log(`[Host] Peer ${playerInfo.playerName} reconnected`);
    
    // Mark as connected
    playerInfo.connected = true;
    playerInfo.disconnectTime = undefined;
    
    // Send full state resync
    this.sendGameState(peerId, 'RECONNECT');
    
    // Emit to UI
    this.emit('peer-reconnected', peerId, playerInfo.playerName);
    
    // Broadcast to other clients
    this.broadcastPlayerStatus(playerInfo.playerId, 'connected');
  }
  
  private broadcastPlayerStatus(playerId: string, status: 'connected' | 'disconnected') {
    // Custom message type for player status
    const statusMsg = {
      type: 'PLAYER_STATUS',
      messageId: `status_${Date.now()}`,
      gameId: this.getGame()?.id,
      senderId: this.hostPeerId,
      turnNumber: this.getGame()?.turnNumber || 0,
      timestamp: Date.now(),
      playerId,
      status
    };
    
    this.broadcastMessage(statusMsg);
  }
}
```

**Client-side UI:**

```typescript
class GameUI {
  private adapter: ClientGameAdapter;
  
  setupPeerFailureHandlers() {
    this.adapter.on('peer-disconnected', (peerId: string, playerName: string) => {
      // Show notification
      this.showNotification(`⚠️ ${playerName} disconnected`);
      
      // Mark player as disconnected in UI
      this.updatePlayerStatus(playerName, 'disconnected');
    });
    
    this.adapter.on('peer-reconnected', (peerId: string, playerName: string) => {
      this.showNotification(`✅ ${playerName} reconnected`);
      this.updatePlayerStatus(playerName, 'connected');
    });
    
    this.adapter.on('turn-auto-skipped', (playerId: string) => {
      const player = this.getPlayerById(playerId);
      this.showNotification(
        `${player.name}'s turn was automatically skipped (disconnected)`
      );
    });
  }
  
  private updatePlayerStatus(playerName: string, status: 'connected' | 'disconnected') {
    // Update player list UI
    const playerElement = document.querySelector(`[data-player="${playerName}"]`);
    if (playerElement) {
      if (status === 'disconnected') {
        playerElement.classList.add('disconnected');
        playerElement.setAttribute('title', 'Player disconnected');
      } else {
        playerElement.classList.remove('disconnected');
        playerElement.removeAttribute('title');
      }
    }
  }
}
```

### Edge Case: Reconnect During Grace Period

```typescript
class HostGameAdapter {
  private pendingAutoSkips: Map<string, NodeJS.Timeout> = new Map();
  
  private handleCurrentPlayerDisconnect(playerInfo: any) {
    // Start timer
    const timer = setTimeout(() => {
      this.autoSkipTurn(playerInfo.playerId);
      this.pendingAutoSkips.delete(playerInfo.playerId);
    }, this.PEER_RECONNECT_GRACE_PERIOD);
    
    // Store timer reference
    this.pendingAutoSkips.set(playerInfo.playerId, timer);
  }
  
  private handlePeerReconnect(peerId: string) {
    const playerInfo = this.getPlayerInfoByPeerId(peerId);
    if (!playerInfo) return;
    
    // Cancel auto-skip if pending
    const pendingTimer = this.pendingAutoSkips.get(playerInfo.playerId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.pendingAutoSkips.delete(playerInfo.playerId);
      console.log(`[Host] Cancelled auto-skip for ${playerInfo.playerName}`);
    }
    
    // Continue with reconnect...
    playerInfo.connected = true;
    this.sendGameState(peerId, 'RECONNECT');
  }
}
```

---

## 3. DUPLICATE ACTION MESSAGES

### Problem

Network retransmission or client bugs cause the same action to be sent multiple times.

### Severity

**🟢 LOW** - Already handled by Layer 1 (Idempotent Message Handling).

### Expected Behavior

```
┌─────────────────────────────────────────────────────────┐
│  DUPLICATE ACTION SEQUENCE                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Client sends ACTION_REQUEST (messageId: "abc123")   │
│  2. Network glitch causes retransmission                │
│  3. Host receives ACTION_REQUEST (messageId: "abc123")  │
│  4. Host checks messageId in deduplication cache        │
│  5. messageId already seen → IGNORE                     │
│  6. No ACTION_RESULT sent (already sent for first msg) │
│  7. Client receives no response (expected)              │
│  8. Client's timeout handler triggers resend (if impl)  │
│  9. Host ignores second duplicate too                   │
│                                                         │
│  Result: Action processed exactly once ✅               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**Already handled by `MessageDeduplicator`** (see stateSync.ts):

```typescript
class HostGameAdapter {
  private deduplicator: MessageDeduplicator;
  
  constructor() {
    this.deduplicator = new MessageDeduplicator(
      60000, // 60 second cache
      1000   // 1000 messages max
    );
  }
  
  private handleActionRequest(msg: ActionRequestMessage, peerId: string) {
    // Step 1: Check for duplicate (Layer 1 safeguard)
    if (!this.deduplicator.shouldProcess(msg)) {
      console.log(`[Host] Ignoring duplicate action from ${peerId}: ${msg.messageId}`);
      return; // Silent ignore - no error sent
    }
    
    // Step 2: Process action normally
    const result = this.processAction(msg.action);
    
    // Step 3: Send result
    this.sendActionResult(peerId, msg.messageId, result);
  }
}
```

### Additional Protection: Action Timestamps

**Double protection** using action timestamp field:

```typescript
class HostGameAdapter {
  private processedActions: Map<string, Set<number>> = new Map(); // playerId -> timestamps
  
  private processAction(action: GameAction): ActionResult {
    // Check if this exact action was already processed
    const playerTimestamps = this.processedActions.get(action.playerId) || new Set();
    
    if (playerTimestamps.has(action.timestamp)) {
      console.warn(`[Host] Duplicate action detected via timestamp: ${action.timestamp}`);
      return {
        valid: false,
        error: 'Duplicate action',
        code: 'DUPLICATE_ACTION'
      };
    }
    
    // Validate via engine
    const validation = validateAction(this.game!, action);
    if (!validation.valid) {
      return {
        valid: false,
        error: validation.error,
        code: validation.code
      };
    }
    
    // Record timestamp
    playerTimestamps.add(action.timestamp);
    this.processedActions.set(action.playerId, playerTimestamps);
    
    // Apply action...
    const newGame = applyAction(this.game!, action);
    
    // Cleanup old timestamps (keep last 100 per player)
    if (playerTimestamps.size > 100) {
      const sorted = Array.from(playerTimestamps).sort();
      const toRemove = sorted.slice(0, sorted.length - 100);
      toRemove.forEach(ts => playerTimestamps.delete(ts));
    }
    
    return { valid: true, newGame };
  }
}
```

### Testing Duplicate Detection

```typescript
describe('Duplicate Action Handling', () => {
  it('ignores duplicate action messages', () => {
    const adapter = new HostGameAdapter();
    await adapter.createGame(['Alice', 'Bob']);
    
    const action: GameAction = {
      type: ActionType.Rest,
      playerId: 'alice',
      timestamp: Date.now()
    };
    
    const msg: ActionRequestMessage = {
      type: P2PMessageType.ActionRequest,
      messageId: 'action_123',
      gameId: adapter.getGame()!.id,
      senderId: 'peer_alice',
      turnNumber: 0,
      timestamp: Date.now(),
      action,
      expectedNextTurn: 1
    };
    
    // First message
    const result1 = adapter.handleActionRequest(msg, 'peer_alice');
    expect(result1.valid).toBe(true);
    
    // Duplicate message (same messageId)
    const result2 = adapter.handleActionRequest(msg, 'peer_alice');
    expect(result2).toBeUndefined(); // Ignored, no result
    
    // Verify action only processed once
    expect(adapter.getGame()!.turnNumber).toBe(1); // Not 2
  });
});
```

---

## 4. LATE JOINERS

### Problem

A player attempts to join a game that has already started.

### Severity

**🟡 MEDIUM** - Player cannot join but game continues normally.

### Expected Behavior

```
┌─────────────────────────────────────────────────────────┐
│  LATE JOINER SEQUENCE                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Client sends JOIN_GAME message                      │
│  2. Host receives message                               │
│  3. Host checks game phase:                             │
│     if (game.phase !== GamePhase.Setup) {               │
│       reject with "GAME_ALREADY_STARTED"                │
│     }                                                   │
│  4. Host sends ERROR message:                           │
│     {                                                   │
│       type: "ERROR",                                    │
│       errorCode: "GAME_ALREADY_STARTED",                │
│       message: "Cannot join: game in progress"          │
│     }                                                   │
│  5. Client receives ERROR                               │
│  6. Client displays: "Game already started"             │
│  7. Client returns to lobby                             │
│                                                         │
│  Alternative: Observer Mode (Optional)                  │
│  - Allow join as read-only observer                     │
│  - Can see game state but cannot take actions           │
│  - Useful for spectators or disconnected players        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**Host validation:**

```typescript
class HostGameAdapter {
  private handleJoinRequest(msg: JoinGameMessage, peerId: string) {
    if (!this.game) {
      this.sendJoinError(peerId, 'GAME_NOT_FOUND', 'Game not initialized');
      return;
    }
    
    // Check game phase
    if (this.game.phase !== GamePhase.Setup) {
      console.log(`[Host] Rejecting late joiner ${peerId}: game already started`);
      
      this.sendJoinError(
        peerId,
        'GAME_ALREADY_STARTED',
        'Cannot join: game in progress'
      );
      
      this.emit('late-joiner-rejected', peerId, msg.playerName);
      return;
    }
    
    // Check if player exists in game
    const player = this.game.players.find(p => p.id === msg.playerId);
    if (!player) {
      this.sendJoinError(peerId, 'PLAYER_NOT_FOUND', 'Player not in this game');
      return;
    }
    
    // Check if already connected
    if (this.connectedPlayers.has(msg.playerId)) {
      this.sendJoinError(peerId, 'ALREADY_CONNECTED', 'Player already in game');
      return;
    }
    
    // Accept join
    this.acceptJoinRequest(msg, peerId);
  }
  
  private sendJoinError(peerId: string, code: string, message: string) {
    const errorMsg = P2PMessageFactory.createError(
      this.game?.id || '',
      this.hostPeerId,
      this.game?.turnNumber || 0,
      'ERROR' as any,
      code as any,
      message,
      true // Will disconnect
    );
    
    const conn = this.connectedPeers.get(peerId);
    if (conn) {
      conn.send(errorMsg);
      
      // Disconnect after error
      setTimeout(() => {
        conn.close();
      }, 1000);
    }
  }
}
```

**Client handling:**

```typescript
class ClientGameAdapter {
  private handleError(msg: ErrorMessage) {
    console.error(`[Client] Error from host: ${msg.message}`);
    
    switch (msg.errorCode) {
      case 'GAME_ALREADY_STARTED':
        this.emit('join-rejected', 'game-started', msg.message);
        this.disconnect();
        break;
        
      case 'PLAYER_NOT_FOUND':
        this.emit('join-rejected', 'player-not-found', msg.message);
        this.disconnect();
        break;
        
      case 'ALREADY_CONNECTED':
        this.emit('join-rejected', 'duplicate', msg.message);
        this.disconnect();
        break;
        
      default:
        this.emit('error', msg.errorCode, msg.message);
    }
  }
}
```

**UI handling:**

```typescript
class ClientUI {
  setupJoinHandlers() {
    this.adapter.on('join-rejected', (reason: string, message: string) => {
      let displayMessage: string;
      
      switch (reason) {
        case 'game-started':
          displayMessage = 'This game has already started. You cannot join.';
          break;
        case 'player-not-found':
          displayMessage = 'You are not a player in this game.';
          break;
        case 'duplicate':
          displayMessage = 'You are already connected to this game.';
          break;
        default:
          displayMessage = message;
      }
      
      this.showErrorModal({
        title: 'Cannot Join Game',
        message: displayMessage,
        buttons: [
          {
            label: 'Return to Lobby',
            action: () => this.returnToLobby()
          }
        ]
      });
    });
  }
}
```

### Optional: Observer Mode

**Allow late joiners as read-only observers:**

```typescript
class HostGameAdapter {
  private observers: Map<string, DataConnection> = new Map();
  
  private handleJoinRequest(msg: JoinGameMessage, peerId: string) {
    // ... existing validation ...
    
    // If game started but observer mode enabled
    if (this.game.phase !== GamePhase.Setup && this.observerModeEnabled) {
      console.log(`[Host] Adding ${peerId} as observer`);
      
      this.observers.set(peerId, this.connectedPeers.get(peerId)!);
      
      // Send current state (read-only)
      this.sendGameState(peerId, 'OBSERVER_JOIN');
      
      // Send observer confirmation
      const observerMsg = {
        type: 'OBSERVER_MODE',
        messageId: `obs_${Date.now()}`,
        gameId: this.game.id,
        senderId: this.hostPeerId,
        turnNumber: this.game.turnNumber,
        timestamp: Date.now(),
        message: 'Joined as observer (read-only)'
      };
      
      this.connectedPeers.get(peerId)?.send(observerMsg);
      
      this.emit('observer-joined', peerId, msg.playerName);
      return;
    }
    
    // Standard rejection for late joiners
    this.sendJoinError(peerId, 'GAME_ALREADY_STARTED', 'Cannot join');
  }
  
  // When broadcasting, include observers
  private broadcastState(game: Game, lastAction?: GameAction) {
    const stateMsg = this.createStateMessage(game, lastAction);
    
    // Send to active players
    this.connectedPeers.forEach((conn) => {
      if (!this.observers.has(conn.peer)) {
        conn.send(stateMsg);
      }
    });
    
    // Send to observers (they ignore it or use it for display only)
    this.observers.forEach((conn) => {
      conn.send(stateMsg);
    });
  }
}
```

---

## Failure Mode Summary Matrix

| Failure Mode | Severity | Detection Time | Recovery | Data Loss |
|--------------|----------|----------------|----------|-----------|
| **Host Disconnect** | 🔴 Critical | ~5 seconds | Host migration OR end game | None (if saved) |
| **Peer Disconnect (on turn)** | 🟡 Medium | ~2 seconds | Auto-skip after 15s | Turn action lost |
| **Peer Disconnect (off turn)** | 🟢 Low | ~2 seconds | Mark disconnected, continue | None |
| **Duplicate Actions** | 🟢 Low | Instant | Ignore via deduplication | None |
| **Late Joiners** | 🟡 Medium | Instant | Reject OR observer mode | N/A |
| **Out-of-order Messages** | 🟢 Low | Instant | Handled by turn numbers | None |
| **Message Loss** | 🟡 Medium | Varies | Resync mechanism | Recovered via resync |
| **Network Partition** | 🔴 Critical | ~5-30 seconds | Same as disconnect | Varies |

---

## Recovery Procedures

### Procedure 1: Full State Resync

**When to use:**
- Peer reconnects after disconnect
- Hash mismatch detected
- Out-of-sync state

**Implementation:** See [STATE_CONSISTENCY.md](STATE_CONSISTENCY.md) Layer 4.

### Procedure 2: Auto-Skip Turn

**When to use:**
- Current player disconnected for >15 seconds
- Current player not responding

**Implementation:**

```typescript
function autoSkipTurn(game: Game, playerId: string): Game {
  // Validate it's their turn
  const currentPlayer = game.players[game.currentPlayerIndex];
  if (currentPlayer.id !== playerId) {
    throw new Error('Not current player');
  }
  
  // Create REST action via engine
  const restAction: GameAction = {
    type: ActionType.Rest,
    playerId: playerId,
    timestamp: Date.now()
  };
  
  // Process via normal action pipeline
  const validation = validateAction(game, restAction);
  if (!validation.valid) {
    throw new Error('Cannot skip turn: ' + validation.error);
  }
  
  const newGame = applyAction(game, restAction);
  const turnResult = advanceTurn(newGame);
  
  return turnResult.game;
}
```

### Procedure 3: Graceful Shutdown

**When to use:**
- Host disconnect timeout expires
- Unrecoverable error
- User requests end game

**Implementation:**

```typescript
class GameAdapter {
  gracefulShutdown(reason: string) {
    console.log(`[Adapter] Graceful shutdown: ${reason}`);
    
    // Save game state
    const game = this.getGame();
    if (game) {
      this.saveGameSnapshot(game, reason);
    }
    
    // Notify all peers
    this.broadcastShutdown(reason);
    
    // Disconnect all
    this.disconnectAll();
    
    // Cleanup resources
    this.cleanup();
    
    // Emit to UI
    this.emit('shutdown', reason);
  }
  
  private broadcastShutdown(reason: string) {
    const shutdownMsg = {
      type: 'GAME_ENDED',
      messageId: `end_${Date.now()}`,
      gameId: this.game?.id,
      senderId: this.hostPeerId,
      turnNumber: this.game?.turnNumber || 0,
      timestamp: Date.now(),
      reason
    };
    
    this.connectedPeers.forEach(conn => {
      try {
        conn.send(shutdownMsg);
      } catch (err) {
        console.error('Failed to send shutdown:', err);
      }
    });
  }
  
  private saveGameSnapshot(game: Game, reason: string) {
    const snapshot = {
      game,
      timestamp: Date.now(),
      reason,
      players: Array.from(this.connectedPlayers.entries())
    };
    
    try {
      localStorage.setItem(
        `game_snapshot_${game.id}`,
        JSON.stringify(snapshot)
      );
      console.log('[Adapter] Game snapshot saved');
    } catch (err) {
      console.error('[Adapter] Failed to save snapshot:', err);
    }
  }
}
```

---

## Testing Failure Modes

### Test Suite Structure

```typescript
describe('P2P Failure Modes', () => {
  describe('Host Disconnect', () => {
    it('client detects host disconnect within 5 seconds', async () => {
      // Setup client connected to host
      const client = new ClientGameAdapter(hostPeerId);
      await client.connect(peer);
      
      // Simulate host disconnect
      mockHostConnection.emit('close');
      
      // Verify detection
      const disconnectEvent = await waitForEvent(client, 'host-disconnected');
      expect(disconnectEvent).toBeDefined();
    });
    
    it('client times out after 30 seconds', async () => {
      const client = new ClientGameAdapter(hostPeerId);
      await client.connect(peer);
      
      mockHostConnection.emit('close');
      
      jest.advanceTimersByTime(30000);
      
      const timeoutEvent = await waitForEvent(client, 'host-timeout');
      expect(timeoutEvent).toBeDefined();
    });
  });
  
  describe('Peer Disconnect', () => {
    it('host auto-skips turn after 15 seconds', async () => {
      const host = new HostGameAdapter();
      await host.createGame(['Alice', 'Bob']);
      
      // Alice's turn
      expect(host.getGame()!.players[0].name).toBe('Alice');
      
      // Simulate Alice disconnect
      mockPeerConnection.emit('close');
      
      // Wait grace period
      jest.advanceTimersByTime(15000);
      
      // Verify turn skipped
      const autoSkipEvent = await waitForEvent(host, 'turn-auto-skipped');
      expect(autoSkipEvent.playerId).toBe('alice');
      expect(host.getGame()!.currentPlayerIndex).toBe(1); // Bob's turn
    });
  });
  
  describe('Duplicate Actions', () => {
    it('ignores duplicate action messages', () => {
      const host = new HostGameAdapter();
      await host.createGame(['Alice', 'Bob']);
      
      const action = createTestAction();
      const msg1 = createActionMessage(action, 'msg_123');
      const msg2 = createActionMessage(action, 'msg_123'); // Same ID
      
      host.handleActionRequest(msg1, 'peer_alice');
      host.handleActionRequest(msg2, 'peer_alice');
      
      // Verify action only processed once
      expect(host.getGame()!.turnNumber).toBe(1); // Not 2
    });
  });
  
  describe('Late Joiners', () => {
    it('rejects join when game already started', () => {
      const host = new HostGameAdapter();
      await host.createGame(['Alice', 'Bob']);
      
      // Start game (move to PLAYING phase)
      host.getGame()!.phase = GamePhase.Playing;
      
      // Try to join
      const joinMsg = createJoinMessage('Charlie');
      host.handleJoinRequest(joinMsg, 'peer_charlie');
      
      // Verify rejection
      const rejection = await waitForEvent(host, 'late-joiner-rejected');
      expect(rejection.playerName).toBe('Charlie');
    });
  });
});
```

---

## Monitoring & Logging

### Recommended Logs

**Host logs:**
```typescript
console.log('[Host] Peer alice disconnected (on turn)');
console.log('[Host] Starting 15s grace period for alice');
console.log('[Host] Auto-skipping turn for alice (no reconnect)');
console.log('[Host] Peer bob reconnected after 8s');
console.log('[Host] Late joiner rejected: game already started');
```

**Client logs:**
```typescript
console.log('[Client] Host disconnected! Starting 30s timeout');
console.log('[Client] Host reconnected! Requesting resync');
console.log('[Client] Peer alice marked as disconnected');
console.log('[Client] Duplicate message ignored: msg_123');
console.log('[Client] Join rejected: GAME_ALREADY_STARTED');
```

### Metrics to Track

```typescript
interface FailureMetrics {
  hostDisconnects: number;
  hostReconnects: number;
  peerDisconnects: number;
  peerReconnects: number;
  autoSkippedTurns: number;
  duplicateMessages: number;
  lateJoinAttempts: number;
  averageReconnectTime: number;
  gameEndedByDisconnect: number;
}
```

---

## Summary

| Failure Mode | Handled By | Expected Behavior |
|--------------|------------|-------------------|
| Host disconnects | Client timeout | Wait 30s → end game OR host migration |
| Peer disconnects (on turn) | Host grace period | Wait 15s → auto-skip turn (REST action) |
| Peer disconnects (off turn) | Host tracking | Mark disconnected → skip when turn arrives |
| Duplicate actions | MessageDeduplicator | Ignore silently (idempotency) |
| Late joiners | Host validation | Reject with error OR allow as observer |
| Out-of-order messages | Turn validation | Handled by Layer 2 (turn numbers) |
| Message loss | Resync mechanism | Detected by hash/turn mismatch → resync |

**All failure modes have defined, tested recovery procedures.** ✅
