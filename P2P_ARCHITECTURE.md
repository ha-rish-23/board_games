# Host-Authoritative Peer-to-Peer Architecture

## Overview

This document describes a **host-authoritative peer-to-peer (P2P) architecture** for the Century: Golem Edition game engine. One peer acts as the authoritative host, while other peers connect as clients.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Game Session                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌───────────────┐                                           │
│  │  HOST PEER    │  ← Authoritative game state             │
│  │  (Player 1)   │                                           │
│  ├───────────────┤                                           │
│  │ • Game state  │                                           │
│  │ • Validation  │                                           │
│  │ • Resolution  │                                           │
│  │ • Broadcast   │                                           │
│  └───────┬───────┘                                           │
│          │                                                    │
│          │ WebRTC/WebSocket                                  │
│          │                                                    │
│    ┌─────┴──────┬────────────┬────────────┐                 │
│    │            │            │            │                  │
│    ▼            ▼            ▼            ▼                  │
│  ┌────┐      ┌────┐      ┌────┐      ┌────┐                │
│  │ P2 │      │ P3 │      │ P4 │      │ P5 │                │
│  └────┘      └────┘      └────┘      └────┘                │
│  Client      Client      Client      Client                 │
│                                                               │
│  • Submit actions                                            │
│  • Receive state updates                                     │
│  • Render UI                                                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Core Principles

### 1. Host Authority
- **Host** holds the single source of truth (Game state)
- **Host** validates all actions using existing engine validators
- **Host** applies actions using existing engine resolvers
- **Host** broadcasts updated state to all peers
- **Clients** trust host's state (no local validation)

### 2. Existing Engine Integration
```typescript
// Host uses existing pure engine functions
import { validateAction } from './engine/validation';
import { applyAction } from './engine/actionResolver';
import { advanceTurn } from './engine/turnSystem';

// On host receiving action from peer
function onPeerAction(action: GameAction) {
  // 1. Validate using engine
  const validation = validateAction(currentGame, action);
  if (!validation.valid) {
    sendError(action.playerId, validation.error);
    return;
  }
  
  // 2. Apply using engine (pure function)
  let newGame = applyAction(currentGame, action);
  
  // 3. Advance turn
  const turnResult = advanceTurn(newGame);
  newGame = turnResult.game;
  
  // 4. Update local state
  currentGame = newGame;
  
  // 5. Broadcast to all peers
  broadcastState(newGame);
}
```

### 3. No State Divergence
- Clients don't maintain authoritative state
- Clients only track "last known state from host"
- All mutations happen on host
- Clients optimistically show UI but wait for host confirmation

---

## Host Selection

### Initial Selection

#### Option 1: First Player is Host (Simplest)
```typescript
interface GameSession {
  hostPeerId: string;
  players: Player[];
}

function createSession(playerNames: string[]): GameSession {
  const game = createNewGame(
    playerNames.map((name, i) => ({ id: `player_${i+1}`, name })),
    Date.now().toString()
  );
  
  return {
    hostPeerId: game.players[0].id,  // First player = host
    game
  };
}
```

**Pros:**
- Simple, deterministic
- No negotiation needed
- Clear from game start

**Cons:**
- First player has networking advantage
- No choice if first player has poor connection

#### Option 2: Host by Connection Quality (Recommended)
```typescript
interface PeerInfo {
  peerId: string;
  latency: number;
  isStable: boolean;
}

async function selectHost(peers: PeerInfo[]): Promise<string> {
  // Measure latency to all peers
  const measurements = await Promise.all(
    peers.map(async peer => ({
      peerId: peer.peerId,
      avgLatency: await measureLatency(peer.peerId),
      packetLoss: await measurePacketLoss(peer.peerId)
    }))
  );
  
  // Select peer with lowest average latency to all others
  const scores = measurements.map(peer => {
    const latencyToOthers = measurements
      .filter(p => p.peerId !== peer.peerId)
      .reduce((sum, p) => sum + p.avgLatency, 0);
    
    return {
      peerId: peer.peerId,
      score: latencyToOthers / (measurements.length - 1)
    };
  });
  
  scores.sort((a, b) => a.score - b.score);
  return scores[0].peerId;  // Best connected peer
}
```

**Pros:**
- Better game experience (lower latency)
- Adapts to network conditions

**Cons:**
- Requires initial negotiation phase
- More complex setup

#### Option 3: Explicit Host Selection
```typescript
interface LobbySettings {
  hostPeerId: string;  // Set by room creator
  allowHostMigration: boolean;
}

// Creator picks a player to be host (usually themselves)
function createLobby(creatorPeerId: string): LobbySettings {
  return {
    hostPeerId: creatorPeerId,
    allowHostMigration: true
  };
}
```

**Pros:**
- User control
- Clear responsibility

**Cons:**
- May pick poor host if user doesn't understand

### Host Identity Communication

#### Signaling Server Pattern
```typescript
// All peers connect to lightweight signaling server first
interface SignalingMessage {
  type: 'HOST_ANNOUNCEMENT' | 'PEER_JOIN' | 'HOST_CHANGED';
  hostPeerId: string;
  gameId: string;
}

// Signaling server broadcasts host identity
signalingServer.on('game-created', (gameId, hostPeerId) => {
  broadcastToGame(gameId, {
    type: 'HOST_ANNOUNCEMENT',
    hostPeerId,
    gameId
  });
});

// Peers learn who the host is
peer.on('host-announcement', (msg) => {
  if (msg.hostPeerId === peer.id) {
    becomeHost();
  } else {
    connectToHost(msg.hostPeerId);
  }
});
```

#### WebRTC Signaling
```typescript
// Using WebRTC data channels
interface RTCSignal {
  from: string;
  to: string;
  type: 'offer' | 'answer' | 'ice-candidate';
  payload: any;
  hostId?: string;  // Include host ID in every signal
}

// Non-host peers connect only to host
if (peerId !== hostId) {
  const connection = new RTCPeerConnection();
  const offer = await connection.createOffer();
  
  sendSignal({
    from: peerId,
    to: hostId,
    type: 'offer',
    payload: offer,
    hostId: hostId  // Confirm host identity
  });
}
```

---

## Host Identity Persistence

### 1. In-Memory (Session Only)
```typescript
class GameSessionManager {
  private sessions: Map<string, GameSession> = new Map();
  
  createSession(gameId: string, hostPeerId: string): GameSession {
    const session: GameSession = {
      gameId,
      hostPeerId,
      game: null,
      peers: new Map(),
      createdAt: Date.now()
    };
    
    this.sessions.set(gameId, session);
    return session;
  }
  
  getHost(gameId: string): string | null {
    return this.sessions.get(gameId)?.hostPeerId ?? null;
  }
}
```

**Pros:**
- Simple
- No external dependencies

**Cons:**
- Lost on server restart
- Can't rejoin after disconnect

### 2. Distributed Storage (Recommended)
```typescript
interface GameMetadata {
  gameId: string;
  hostPeerId: string;
  hostBackupPeerId: string | null;  // For migration
  playerIds: string[];
  createdAt: number;
  lastActiveAt: number;
}

// Store in Redis, DynamoDB, or similar
class DistributedGameRegistry {
  async registerGame(metadata: GameMetadata): Promise<void> {
    await redis.setex(
      `game:${metadata.gameId}`,
      3600,  // 1 hour TTL
      JSON.stringify(metadata)
    );
  }
  
  async getHost(gameId: string): Promise<string | null> {
    const data = await redis.get(`game:${gameId}`);
    if (!data) return null;
    
    const metadata: GameMetadata = JSON.parse(data);
    return metadata.hostPeerId;
  }
  
  async updateHost(gameId: string, newHostPeerId: string): Promise<void> {
    const data = await redis.get(`game:${gameId}`);
    if (!data) throw new Error('Game not found');
    
    const metadata: GameMetadata = JSON.parse(data);
    metadata.hostBackupPeerId = metadata.hostPeerId;  // Store old host
    metadata.hostPeerId = newHostPeerId;
    metadata.lastActiveAt = Date.now();
    
    await redis.setex(
      `game:${metadata.gameId}`,
      3600,
      JSON.stringify(metadata)
    );
  }
}
```

**Pros:**
- Survives restarts
- Enables reconnection
- Supports host migration

**Cons:**
- Requires infrastructure
- More complex

### 3. Blockchain/IPFS (Decentralized)
```typescript
// For fully decentralized games
interface GameContract {
  gameId: string;
  hostAddress: string;  // Ethereum address or IPFS peer ID
  stateHash: string;    // Hash of current game state
  lastUpdate: number;
}

// Smart contract manages host identity
class Web3GameRegistry {
  async registerGame(gameId: string, hostAddress: string): Promise<void> {
    await contract.methods.createGame(gameId, hostAddress).send({
      from: hostAddress
    });
  }
  
  async getHost(gameId: string): Promise<string> {
    return await contract.methods.getHost(gameId).call();
  }
  
  async proposeHostMigration(
    gameId: string,
    newHost: string,
    signatures: string[]
  ): Promise<void> {
    // Requires majority of players to sign
    await contract.methods.migrateHost(
      gameId,
      newHost,
      signatures
    ).send({ from: newHost });
  }
}
```

**Pros:**
- Fully decentralized
- Tamper-proof
- No central authority

**Cons:**
- High complexity
- Transaction costs
- Slower updates

---

## Peer Disconnection Handling

### Non-Host Peer Disconnects

#### Scenario: Player 3 disconnects mid-game

```typescript
class HostPeerManager {
  private game: Game;
  private connections: Map<string, PeerConnection>;
  
  onPeerDisconnect(peerId: string): void {
    console.log(`Peer ${peerId} disconnected`);
    
    // 1. Mark player as disconnected (don't remove from game)
    const player = this.game.players.find(p => p.id === peerId);
    if (!player) return;
    
    // 2. Check if it's their turn
    if (this.game.players[this.game.currentPlayerIndex].id === peerId) {
      // Pause game or skip turn after timeout
      this.handleDisconnectedPlayerTurn(peerId);
    }
    
    // 3. Notify other peers
    this.broadcastToAll({
      type: 'PEER_DISCONNECTED',
      peerId,
      playerName: player.name,
      currentPlayerIndex: this.game.currentPlayerIndex
    });
    
    // 4. Store state for potential reconnection
    this.saveDisconnectionSnapshot(peerId);
  }
  
  private handleDisconnectedPlayerTurn(peerId: string): void {
    // Option 1: Wait with timeout
    setTimeout(() => {
      if (!this.connections.has(peerId)) {
        // Still disconnected - skip their turn
        const skipAction: RestAction = {
          type: ActionType.Rest,
          playerId: peerId,
          timestamp: Date.now()
        };
        
        // Auto-rest to pass turn
        this.game = applyAction(this.game, skipAction);
        const turnResult = advanceTurn(this.game);
        this.game = turnResult.game;
        
        this.broadcastState(this.game);
      }
    }, 30000);  // 30 second timeout
    
    // Option 2: Ask remaining players to vote skip
    this.requestTurnSkipVote(peerId);
    
    // Option 3: Pause game until reconnect
    this.pauseGame(peerId);
  }
  
  onPeerReconnect(peerId: string, connection: PeerConnection): void {
    console.log(`Peer ${peerId} reconnected`);
    
    // 1. Re-establish connection
    this.connections.set(peerId, connection);
    
    // 2. Send current game state
    connection.send({
      type: 'STATE_SYNC',
      game: this.game,
      message: 'Welcome back!'
    });
    
    // 3. Notify other peers
    this.broadcastToAll({
      type: 'PEER_RECONNECTED',
      peerId,
      playerName: this.game.players.find(p => p.id === peerId)?.name
    });
    
    // 4. Resume game if paused
    if (this.isPaused && this.pausedForPeer === peerId) {
      this.resumeGame();
    }
  }
}
```

**Strategies:**

1. **Wait and Skip (Recommended)**
   - Wait 30-60 seconds for reconnection
   - Auto-skip turn if still disconnected
   - Game continues for other players

2. **Pause Game**
   - Pause until player reconnects
   - Good for small groups, bad for large games
   - Risk of game never resuming

3. **AI Takeover**
   - Simple AI plays disconnected player's turn
   - Maintains game flow
   - Complex to implement fairly

4. **Vote to Continue**
   - Remaining players vote to skip or wait
   - Democratic but slows game

### Host Disconnects (Critical!)

#### Scenario: Host (Player 1) disconnects

This is the **most critical failure mode** in P2P architecture.

```typescript
class PeerConnection {
  private hostConnection: RTCDataChannel;
  private isHost: boolean;
  private hostHeartbeatInterval: NodeJS.Timer;
  
  startHostMonitoring(): void {
    if (this.isHost) return;  // Don't monitor ourselves
    
    // Send heartbeat to host every 5 seconds
    this.hostHeartbeatInterval = setInterval(() => {
      this.sendToHost({ type: 'HEARTBEAT', from: this.peerId });
    }, 5000);
    
    // Detect missed heartbeats
    this.hostConnection.on('close', () => {
      console.error('Host connection lost!');
      this.initiateHostMigration();
    });
  }
  
  private async initiateHostMigration(): Promise<void> {
    console.log('Initiating host migration...');
    
    // 1. Elect new host among remaining peers
    const newHost = await this.electNewHost();
    
    if (newHost === this.peerId) {
      // We are the new host!
      await this.promoteToHost();
    } else {
      // Someone else is new host - connect to them
      await this.connectToNewHost(newHost);
    }
  }
}
```

#### Host Migration Strategy

```typescript
interface HostMigrationProtocol {
  // 1. Detection Phase
  detectHostFailure(): boolean;
  
  // 2. Election Phase
  electNewHost(): Promise<string>;
  
  // 3. State Transfer Phase
  transferGameState(): Promise<Game>;
  
  // 4. Reconnection Phase
  establishNewHostConnections(): Promise<void>;
  
  // 5. Confirmation Phase
  confirmMigrationComplete(): Promise<boolean>;
}

class HostMigrationManager implements HostMigrationProtocol {
  detectHostFailure(): boolean {
    const missedHeartbeats = 3;
    const lastHeartbeat = Date.now() - this.lastHostPing;
    
    return lastHeartbeat > (missedHeartbeats * 5000);
  }
  
  async electNewHost(): Promise<string> {
    // Simple deterministic election: lowest player ID becomes host
    const activePeers = Array.from(this.peers.keys())
      .filter(id => id !== this.oldHostId)
      .sort();
    
    // Or use Raft/Paxos-style voting
    const votes = await this.collectVotes(activePeers);
    const winner = this.countVotes(votes);
    
    return activePeers[0];  // Simplest: first active peer
  }
  
  async transferGameState(): Promise<Game> {
    // Each peer stores last known game state
    // New host requests state from all peers
    const states = await this.requestStatesFromPeers();
    
    // Pick the state with highest turn number (most recent)
    const mostRecent = states.reduce((latest, current) => {
      return current.turnNumber > latest.turnNumber ? current : latest;
    });
    
    return mostRecent;
  }
  
  async promoteToHost(): Promise<void> {
    console.log('Promoted to host!');
    
    this.isHost = true;
    
    // 1. Get most recent game state
    const game = await this.transferGameState();
    this.game = game;
    
    // 2. Update registry
    await gameRegistry.updateHost(this.gameId, this.peerId);
    
    // 3. Accept connections from other peers
    this.startHostServer();
    
    // 4. Broadcast new host announcement
    this.broadcastToAll({
      type: 'NEW_HOST_ANNOUNCEMENT',
      newHostId: this.peerId,
      gameState: this.game
    });
  }
  
  async establishNewHostConnections(): Promise<void> {
    // All non-host peers connect to new host
    if (this.isHost) return;
    
    console.log(`Connecting to new host: ${this.newHostId}`);
    
    this.hostConnection = await this.createPeerConnection(this.newHostId);
    
    // Request current state
    this.sendToHost({
      type: 'STATE_REQUEST',
      from: this.peerId,
      lastKnownTurn: this.game.turnNumber
    });
  }
}
```

#### State Consistency After Migration

```typescript
class StateReconciliation {
  reconcileAfterMigration(
    newHostState: Game,
    clientStates: Map<string, Game>
  ): Game {
    // 1. Verify all clients have consistent state
    const turnNumbers = Array.from(clientStates.values())
      .map(g => g.turnNumber);
    
    const allConsistent = turnNumbers.every(t => t === newHostState.turnNumber);
    
    if (allConsistent) {
      // Easy case: everyone agrees
      return newHostState;
    }
    
    // 2. Handle inconsistency
    const maxTurn = Math.max(...turnNumbers, newHostState.turnNumber);
    
    // Find the peer with most recent state
    const mostRecentState = Array.from(clientStates.values())
      .concat([newHostState])
      .find(g => g.turnNumber === maxTurn);
    
    // 3. Roll back any conflicting actions
    // (This is why actions should be idempotent!)
    
    return mostRecentState!;
  }
  
  handleStateConflict(
    hostState: Game,
    clientState: Game
  ): Game {
    // If client has newer state than new host, something went wrong
    if (clientState.turnNumber > hostState.turnNumber) {
      console.error('Client has newer state than host!');
      
      // Options:
      // 1. Trust client (risky)
      // 2. Trust host (may lose progress)
      // 3. Ask all peers to vote
      
      return this.resolveByVote(hostState, clientState);
    }
    
    return hostState;
  }
}
```

---

## Complete Host Implementation

```typescript
import { Game, GameAction } from './types/domain';
import { validateAction } from './engine/validation';
import { applyAction } from './engine/actionResolver';
import { advanceTurn } from './engine/turnSystem';

interface PeerMessage {
  type: 'ACTION' | 'STATE_REQUEST' | 'HEARTBEAT' | 'DISCONNECT';
  from: string;
  payload?: any;
}

class HostPeer {
  private game: Game;
  private peers: Map<string, RTCDataChannel> = new Map();
  private actionHistory: GameAction[] = [];
  
  constructor(initialGame: Game) {
    this.game = initialGame;
  }
  
  // Handle incoming peer messages
  onPeerMessage(peerId: string, message: PeerMessage): void {
    switch (message.type) {
      case 'ACTION':
        this.handlePeerAction(peerId, message.payload);
        break;
      
      case 'STATE_REQUEST':
        this.sendStateToPeer(peerId);
        break;
      
      case 'HEARTBEAT':
        this.updatePeerHeartbeat(peerId);
        break;
      
      case 'DISCONNECT':
        this.handlePeerDisconnect(peerId);
        break;
    }
  }
  
  private handlePeerAction(peerId: string, action: GameAction): void {
    // 1. Verify it's the correct player's turn
    const currentPlayer = this.game.players[this.game.currentPlayerIndex];
    if (action.playerId !== currentPlayer.id) {
      this.sendError(peerId, 'Not your turn');
      return;
    }
    
    // 2. Validate action using engine
    const validation = validateAction(this.game, action);
    if (!validation.valid) {
      this.sendError(peerId, validation.error);
      return;
    }
    
    // 3. Apply action using engine (pure function)
    let newGame = applyAction(this.game, action);
    
    // 4. Advance turn
    const turnResult = advanceTurn(newGame);
    newGame = turnResult.game;
    
    // 5. Check if game finished
    if (turnResult.gameFinished) {
      const finalGame = finalizeGame(newGame);
      newGame = finalGame;
    }
    
    // 6. Update local state
    this.game = newGame;
    this.actionHistory.push(action);
    
    // 7. Broadcast to all peers
    this.broadcastState();
  }
  
  private broadcastState(): void {
    const message = {
      type: 'STATE_UPDATE',
      game: this.game,
      timestamp: Date.now()
    };
    
    this.peers.forEach((channel, peerId) => {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify(message));
      }
    });
  }
  
  private sendStateToPeer(peerId: string): void {
    const channel = this.peers.get(peerId);
    if (!channel) return;
    
    channel.send(JSON.stringify({
      type: 'STATE_SYNC',
      game: this.game,
      actionHistory: this.actionHistory,
      timestamp: Date.now()
    }));
  }
  
  private sendError(peerId: string, error: string): void {
    const channel = this.peers.get(peerId);
    if (!channel) return;
    
    channel.send(JSON.stringify({
      type: 'ERROR',
      error,
      timestamp: Date.now()
    }));
  }
}
```

---

## Complete Client Implementation

```typescript
class ClientPeer {
  private hostConnection: RTCDataChannel;
  private localGameState: Game | null = null;
  private pendingActions: GameAction[] = [];
  
  constructor(hostPeerId: string) {
    this.connectToHost(hostPeerId);
  }
  
  private async connectToHost(hostPeerId: string): Promise<void> {
    // Establish WebRTC connection to host
    const connection = new RTCPeerConnection();
    const channel = connection.createDataChannel('game');
    
    channel.onopen = () => {
      console.log('Connected to host');
      this.requestInitialState();
    };
    
    channel.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleHostMessage(message);
    };
    
    channel.onclose = () => {
      console.error('Lost connection to host!');
      this.initiateHostMigration();
    };
    
    this.hostConnection = channel;
  }
  
  private handleHostMessage(message: any): void {
    switch (message.type) {
      case 'STATE_SYNC':
      case 'STATE_UPDATE':
        this.updateLocalState(message.game);
        break;
      
      case 'ERROR':
        console.error('Host rejected action:', message.error);
        this.onActionRejected(message.error);
        break;
      
      case 'NEW_HOST_ANNOUNCEMENT':
        this.connectToHost(message.newHostId);
        break;
    }
  }
  
  // Client submits action to host
  submitAction(action: GameAction): void {
    if (!this.hostConnection || this.hostConnection.readyState !== 'open') {
      console.error('Not connected to host');
      return;
    }
    
    // Store for potential retry
    this.pendingActions.push(action);
    
    // Send to host
    this.hostConnection.send(JSON.stringify({
      type: 'ACTION',
      from: this.peerId,
      payload: action
    }));
    
    // Optimistically update UI (will be corrected if rejected)
    this.optimisticallyApplyAction(action);
  }
  
  private updateLocalState(newGame: Game): void {
    this.localGameState = newGame;
    
    // Clear confirmed pending actions
    this.pendingActions = [];
    
    // Notify UI to re-render
    this.onStateUpdated(newGame);
  }
  
  private optimisticallyApplyAction(action: GameAction): void {
    if (!this.localGameState) return;
    
    // Show predicted result immediately (better UX)
    // Will be overwritten when host broadcasts real state
    try {
      const predicted = applyAction(this.localGameState, action);
      this.onOptimisticUpdate(predicted);
    } catch (e) {
      // Prediction failed - wait for host
    }
  }
}
```

---

## Comparison: P2P vs Client-Server

| Aspect | Host-Auth P2P | Client-Server REST API |
|--------|---------------|------------------------|
| **Infrastructure** | None (or minimal signaling) | Server required |
| **Scalability** | Limited (host bandwidth) | Unlimited (server scales) |
| **Latency** | Low (direct connections) | Medium (extra hop) |
| **Host failure** | Complex migration needed | No single point of failure |
| **Cheating risk** | Medium (malicious host) | Low (trusted server) |
| **Cost** | Free (P2P) | Server hosting costs |
| **NAT traversal** | Required (complex) | Not needed |
| **Best for** | Small games, LAN, friends | Public games, tournaments |

---

## Recommended Hybrid Architecture

For production, consider **hybrid approach**:

```typescript
// Lightweight server for coordination only
class SignalingServer {
  // 1. Match making
  createGame(hostId: string): string;
  
  // 2. Host registry
  registerHost(gameId: string, hostPeerId: string): void;
  getHost(gameId: string): string;
  
  // 3. WebRTC signaling
  forwardSignal(from: string, to: string, signal: any): void;
  
  // 4. Host migration coordination
  coordinateHostMigration(gameId: string): void;
  
  // 5. (Optional) State backup
  backupGameState(gameId: string, state: Game): void;
}

// Peers handle actual gameplay via P2P
// Server only coordinates, doesn't validate game logic
```

**Benefits:**
- ✅ Low server costs (no game logic)
- ✅ Low latency (P2P gameplay)
- ✅ Reliable host selection
- ✅ State backup for recovery
- ✅ NAT traversal assistance

---

## Summary

### Host Selection
1. **First player** - Simplest
2. **Best connection** - Best performance
3. **Explicit choice** - User control

### Host Identity Persistence
1. **In-memory** - Simple, ephemeral
2. **Distributed storage** - Robust, resumable
3. **Blockchain** - Decentralized, expensive

### Non-Host Disconnect
- Wait 30-60 seconds for reconnection
- Auto-skip turn if still disconnected
- Notify other peers
- Game continues

### Host Disconnect (Critical!)
1. **Detect** - Missed heartbeats
2. **Elect** - Deterministic selection
3. **Migrate** - Transfer state to new host
4. **Reconnect** - All peers connect to new host
5. **Reconcile** - Ensure state consistency

### Integration with Existing Engine
The engine's **pure functional design** makes P2P integration trivial:
- Host calls same functions as REST server
- Clients trust host's validation
- State broadcasts are just JSON serialization
- No engine modifications needed!

The existing engine is **perfectly suited** for host-authoritative P2P architecture. All validation and resolution logic is pure, making it safe to run on any peer designated as host.
