# P2P State Consistency Safeguards

## Overview

This document describes the state consistency mechanisms for peer-to-peer LAN gameplay. These safeguards ensure all players see the same game state despite network delays, packet loss, and potential desyncs.

**Golden Rule:** Host state always wins. When in doubt, clients request full state.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    State Sync Layers                         │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Idempotent Message Handling                        │
│          └─ Deduplicates messages by messageId              │
│                                                              │
│ Layer 2: Turn Number Validation                             │
│          └─ Rejects stale messages, detects missed updates  │
│                                                              │
│ Layer 3: State Hash Verification                            │
│          └─ Detects desyncs by comparing state hashes       │
│                                                              │
│ Layer 4: Re-sync Mechanism                                  │
│          └─ Requests full state when mismatch detected      │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Idempotent Message Handling

**Purpose:** Ensure each message is processed exactly once, even if received multiple times.

### Implementation

```typescript
import { MessageDeduplicator } from './stateSync';

const deduplicator = new MessageDeduplicator();

function handleMessage(message: P2PMessage) {
  // Check if we've seen this message before
  if (!deduplicator.shouldProcess(message)) {
    console.log('Duplicate message ignored');
    return; // Ignore duplicate
  }
  
  // Process message...
}
```

### How It Works

1. Each message has unique `messageId` (format: `timestamp_randomstring`)
2. `MessageDeduplicator` maintains Set of seen IDs
3. Messages older than 60 seconds automatically cleaned up
4. Max 1000 messages cached to prevent memory leaks

### Configuration

```typescript
// Custom retention settings
const deduplicator = new MessageDeduplicator(
  120000, // maxAge: 2 minutes
  2000    // maxSize: 2000 messages
);
```

---

## Layer 2: Turn Number Validation

**Purpose:** Detect stale messages and missed updates by comparing turn numbers.

### Rules

| Message Turn | Current Turn | Action | Reason |
|--------------|--------------|--------|--------|
| Same | N | ✅ Accept | Exact match |
| N-1 | N | ✅ Accept | Tolerate minor lag |
| < N-1 | N | ❌ Ignore | Too stale |
| > N | N | 🔄 Resync | Missed updates |

### Implementation

```typescript
import { validateTurnNumber } from './stateSync';

const result = validateTurnNumber(message.turnNumber, currentGame.turnNumber);

if (!result.valid) {
  if (result.action === 'ignore') {
    console.log('Ignoring stale message:', result.reason);
    return;
  }
  
  if (result.action === 'resync') {
    console.warn('Missed updates, requesting resync:', result.reason);
    requestFullState();
    return;
  }
}

// Process message...
```

### Example Scenarios

**Scenario 1: Network Lag (Tolerated)**
```
Client turn: 10
Message turn: 9
Result: Accept (one turn behind is OK)
```

**Scenario 2: Packet Loss (Resync Needed)**
```
Client turn: 10
Message turn: 13
Result: Resync (missed turns 11, 12, 13)
```

**Scenario 3: Stale Message (Ignored)**
```
Client turn: 20
Message turn: 15
Result: Ignore (too old)
```

---

## Layer 3: State Hash Verification

**Purpose:** Detect subtle desyncs by comparing cryptographic hashes of game state.

### Hash Calculation

The hash includes:
- Game ID, phase, turn number
- Current player index
- All player data (cards, spices, points)
- Market row state
- Victory row state
- Deck sizes
- Caravan positions

The hash **excludes**:
- Timestamps
- Message IDs
- Player names (UI only)
- Deck contents (security)

### Implementation

```typescript
import { calculateStateHash, verifyGameState } from './stateSync';

// Host: Calculate hash when sending state
const stateHash = calculateStateHash(game);
const message: GameStateMessage = {
  ...baseMessage,
  game,
  stateHash, // Include in message
};

// Client: Verify received state
const verification = verifyGameState(message, localGame, hostPeerId);

if (!verification.valid) {
  console.error('State mismatch detected!');
  console.error(`Local hash:  ${verification.localHash}`);
  console.error(`Remote hash: ${verification.remoteHash}`);
  
  // Request full state resync
  requestFullState();
}
```

### When Hash Verification Triggers

1. **Same turn, different hash** → Desync detected, request resync
2. **Different turn, different hash** → Expected (state changed)
3. **Same turn, same hash** → Perfect sync ✅

### Example

```typescript
// Turn 15, Host state
Host Hash: "a3f2d8c1"

// Turn 15, Client A state  
Client Hash: "a3f2d8c1" ✅ Synced

// Turn 15, Client B state
Client Hash: "b2e4f1a0" ❌ DESYNC! Request resync
```

---

## Layer 4: Re-sync Mechanism

**Purpose:** Recover from detected inconsistencies by requesting full authoritative state from host.

### Resync Triggers

```typescript
export enum ResyncReason {
  HashMismatch = 'HASH_MISMATCH',           // Layer 3 detected desync
  MissedUpdates = 'MISSED_UPDATES',         // Layer 2 detected gap
  TurnMismatch = 'TURN_MISMATCH',           // Turn order violated
  ConnectionRecovered = 'CONNECTION_RECOVERED', // Reconnect after drop
  ManualRequest = 'MANUAL_REQUEST'          // User requested sync
}
```

### Client-Side Resync

```typescript
import { ClientResyncManager, createResyncRequest } from './stateSync';

const resyncManager = new ClientResyncManager();

// Detect inconsistency
if (hashMismatch || missedUpdates) {
  // Check rate limits
  if (resyncManager.shouldRequestResync()) {
    resyncManager.markResyncRequested();
    
    // Create request message
    const request = createResyncRequest(
      gameId,
      myPeerId,
      ResyncReason.HashMismatch,
      localGame,
      lastReceivedTurn
    );
    
    // Send to host
    hostConnection.send(request);
  }
}

// When response received
resyncManager.markResyncCompleted();
localGame = response.game; // HOST STATE WINS
```

### Host-Side Resync Handler

```typescript
import { HostResyncManager } from './stateSync';

const hostManager = new HostResyncManager();

function handleResyncRequest(request: ResyncRequestMessage, clientPeerId: string) {
  // Rate limiting (max 10 resyncs/minute per client)
  if (!hostManager.canClientResync(clientPeerId)) {
    console.warn('Client exceeded resync rate limit');
    return;
  }
  
  hostManager.recordResync(clientPeerId);
  
  // Log diagnostic info
  console.log(`Resync request from ${clientPeerId}:`);
  console.log(`  Reason: ${request.reason}`);
  console.log(`  Client turn: ${request.clientTurnNumber}`);
  console.log(`  Host turn: ${currentGame.turnNumber}`);
  console.log(`  Client hash: ${request.clientStateHash}`);
  console.log(`  Host hash: ${calculateStateHash(currentGame)}`);
  
  // Send full authoritative state
  const response: ResyncResponseMessage = {
    type: P2PMessageType.GameState,
    messageId: generateMessageId(),
    gameId,
    senderId: hostPeerId,
    turnNumber: currentGame.turnNumber,
    timestamp: Date.now(),
    game: currentGame, // Full state
    reason: 'RESYNC_RESPONSE',
    stateHash: calculateStateHash(currentGame),
    isResyncResponse: true,
    resyncRequestId: request.messageId
  };
  
  sendToClient(clientPeerId, response);
}
```

### Resync Rate Limiting

**Client-Side:**
- Minimum 2 seconds between resync requests
- Prevents resync spam on temporary network issues

**Host-Side:**
- Maximum 10 resyncs per minute per client
- Protects against malicious clients
- Counters reset every 60 seconds

---

## Complete Message Flow

### Normal Operation (No Issues)

```
Client                          Host
  │                              │
  │  ACTION_REQUEST (turn 10)    │
  ├─────────────────────────────►│
  │                              │ Apply action
  │                              │ Calculate hash: "abc123"
  │                              │
  │  GAME_STATE (turn 11)        │
  │  hash: "abc123"              │
  │◄─────────────────────────────┤
  │                              │
  │  Verify:                     │
  │  - Turn 11 > 10 ✅           │
  │  - Hash matches ✅           │
  │  Apply state                 │
  │                              │
```

### Desync Detection & Recovery

```
Client                          Host
  │                              │
  │  GAME_STATE (turn 15)        │
  │  hash: "def456"              │
  │◄─────────────────────────────┤
  │                              │
  │  Verify:                     │
  │  - Turn matches ✅           │
  │  - Hash: "xyz789" ≠ "def456" ❌
  │  DESYNC DETECTED!            │
  │                              │
  │  RESYNC_REQUEST              │
  │  reason: HASH_MISMATCH       │
  │  clientHash: "xyz789"        │
  ├─────────────────────────────►│
  │                              │ Check rate limit ✅
  │                              │ Log mismatch
  │                              │
  │  GAME_STATE (turn 15)        │
  │  isResyncResponse: true      │
  │  hash: "def456"              │
  │◄─────────────────────────────┤
  │                              │
  │  Accept (HOST WINS)          │
  │  localGame = response.game   │
  │  Synced ✅                   │
  │                              │
```

### Missed Updates Detection

```
Client (at turn 10)             Host (at turn 15)
  │                              │
  │  GAME_STATE (turn 15)        │
  │◄─────────────────────────────┤
  │                              │
  │  Verify:                     │
  │  - Turn 15 > 10 (gap!)       │
  │  MISSED UPDATES DETECTED     │
  │                              │
  │  RESYNC_REQUEST              │
  │  reason: MISSED_UPDATES      │
  │  clientTurn: 10              │
  │  lastReceived: 9             │
  ├─────────────────────────────►│
  │                              │
  │  GAME_STATE (full state)     │
  │◄─────────────────────────────┤
  │                              │
  │  Catch up: 10 → 15           │
  │  Synced ✅                   │
  │                              │
```

---

## Integration Guide

### Step 1: Add State Hash to Protocol

```typescript
// Already updated in protocol.ts
export interface GameStateMessage extends BaseP2PMessage {
  // ... existing fields
  stateHash?: string; // Add this field
}
```

### Step 2: Initialize Sync Components

```typescript
import {
  ClientStateSyncHandler,
  HostStateSyncHandler,
  calculateStateHash
} from './p2p/stateSync';

// Client
const clientSync = new ClientStateSyncHandler(hostPeerId);

// Host
const hostSync = new HostStateSyncHandler(currentGame);
```

### Step 3: Client Handles Incoming State

```typescript
// In client's WebRTC 'data' event handler
conn.on('data', (data) => {
  const message = data as P2PMessage;
  
  if (message.type === P2PMessageType.GameState) {
    const result = clientSync.handleGameState(message as GameStateMessage);
    
    switch (result) {
      case 'applied':
        console.log('State updated successfully');
        updateUI(clientSync.getLocalGame());
        break;
        
      case 'resync_needed':
        console.warn('Desync detected, waiting for resync...');
        showResyncNotification();
        break;
        
      case 'ignored':
        console.log('Duplicate message ignored');
        break;
    }
  }
  
  if (message.type === 'RESYNC_REQUEST') {
    // Client should not receive this (host-only)
    console.error('Received RESYNC_REQUEST on client - protocol violation!');
  }
});
```

### Step 4: Host Handles Resync Requests

```typescript
// In host's WebRTC 'data' event handler
conn.on('data', (data) => {
  const message = data as P2PMessage;
  
  if (message.type === 'RESYNC_REQUEST') {
    const request = message as ResyncRequestMessage;
    const response = hostSync.handleResyncRequest(request, conn.peer);
    
    if (response) {
      conn.send(response);
    } else {
      console.warn('Resync rejected (rate limit)');
    }
  }
});
```

### Step 5: Host Broadcasts State with Hash

```typescript
// After applying action
const newGame = resolveAction(currentGame, action);
const stateHash = hostSync.updateGame(newGame);

const stateMessage: GameStateMessage = {
  type: P2PMessageType.GameState,
  messageId: generateMessageId(),
  gameId: newGame.id,
  senderId: hostPeerId,
  turnNumber: newGame.turnNumber,
  timestamp: Date.now(),
  game: newGame,
  reason: GameStateReason.ActionApplied,
  lastAction: action,
  stateHash // Include hash for verification
};

// Broadcast to all clients
broadcastToAllClients(stateMessage);
```

---

## Testing & Validation

### Unit Tests

```typescript
import { calculateStateHash, validateTurnNumber } from './stateSync';

test('Hash is deterministic', () => {
  const game1 = createTestGame();
  const game2 = JSON.parse(JSON.stringify(game1)); // Deep clone
  
  expect(calculateStateHash(game1)).toBe(calculateStateHash(game2));
});

test('Turn validation rejects stale messages', () => {
  const result = validateTurnNumber(5, 10); // Message at 5, current at 10
  expect(result.valid).toBe(false);
  expect(result.action).toBe('ignore');
});

test('Turn validation detects missed updates', () => {
  const result = validateTurnNumber(15, 10); // Message at 15, current at 10
  expect(result.valid).toBe(false);
  expect(result.action).toBe('resync');
});
```

### Integration Tests

```typescript
test('Client detects hash mismatch and requests resync', async () => {
  const client = new ClientStateSyncHandler(hostPeerId);
  
  // Apply valid state
  const state1: GameStateMessage = {
    /* valid state at turn 5 */
    stateHash: 'abc123'
  };
  client.handleGameState(state1);
  
  // Simulate desync: same turn, different hash
  const state2: GameStateMessage = {
    /* corrupted state at turn 5 */
    stateHash: 'xyz789' // Different hash!
  };
  
  const result = client.handleGameState(state2);
  expect(result).toBe('resync_needed');
});
```

### Simulating Network Issues

```typescript
// Simulate packet loss
function sendWithPacketLoss(message: P2PMessage, lossRate: number = 0.1) {
  if (Math.random() > lossRate) {
    connection.send(message);
  } else {
    console.log('Simulated packet loss');
  }
}

// Simulate message reordering
function sendWithDelay(message: P2PMessage, maxDelay: number = 500) {
  const delay = Math.random() * maxDelay;
  setTimeout(() => {
    connection.send(message);
  }, delay);
}
```

---

## Monitoring & Debugging

### Client-Side Logs

```typescript
// Enable detailed sync logging
localStorage.setItem('DEBUG_STATE_SYNC', 'true');

// Logs include:
// - [Dedup] Duplicate message detected
// - [StateSync] Hash mismatch at turn X
// - [Resync] Requesting full state: HASH_MISMATCH
// - [StateSync] Applied state at turn X, hash: abc123
```

### Host-Side Metrics

Track these metrics for monitoring:

```typescript
interface HostMetrics {
  totalResyncs: number;
  resyncsByReason: Record<ResyncReason, number>;
  resyncsPerClient: Map<string, number>;
  averageHashMismatchRate: number;
  lastResyncTimestamp: number;
}
```

### Alert Conditions

**Warning:** Frequent resyncs from same client
```typescript
if (resyncsPerClient.get(clientId) > 5 in 1 minute) {
  console.warn(`Client ${clientId} resyncing too often - network issues?`);
}
```

**Critical:** Host-wide hash mismatches
```typescript
if (totalHashMismatches > 10 in 1 minute) {
  console.error('CRITICAL: Widespread desync detected - engine bug?');
}
```

---

## Performance Considerations

### Hash Calculation Cost

- **Single hash:** ~1-2ms for typical game state
- **Recommendation:** Calculate only when broadcasting (not on every frame)
- **Optimization:** Cache hash between broadcasts if state unchanged

### Memory Usage

- **MessageDeduplicator:** ~50 KB for 1000 messages
- **ResyncManager:** Negligible (<1 KB)
- **Cleanup:** Automatic every 60 seconds

### Network Overhead

- **State hash:** +8 bytes per GAME_STATE message
- **Resync request:** ~200 bytes
- **Resync response:** Same as full GAME_STATE

---

## Troubleshooting

### Issue: Frequent Hash Mismatches

**Possible Causes:**
1. Non-deterministic code in engine (timestamps, random)
2. Floating-point precision differences
3. Message reordering causing actions applied out of order

**Solution:**
- Verify engine is pure/deterministic
- Use integer math instead of floats
- Enforce strict turn ordering

### Issue: Client Stuck in Resync Loop

**Possible Causes:**
1. Host sending stale state
2. Network partitioning host from client
3. Rate limiting preventing resync

**Solution:**
- Check host logs for errors
- Verify WebRTC connection health
- Temporarily increase rate limits

### Issue: Resync Requests Rejected

**Cause:** Rate limit exceeded (>10 resyncs/minute)

**Solution:**
1. Fix underlying cause (network/engine issues)
2. Manually reset rate limits: `hostManager.resetCounters()`
3. Increase limit in production if needed

---

## Security Considerations

### Malicious Clients Cannot:
- ❌ Send fake GAME_STATE (only host can)
- ❌ DOS host with resync spam (rate limited)
- ❌ Forge message IDs (timestamp + random)
- ❌ Inject actions without validation

### Host Must:
- ✅ Validate all ACTION_REQUEST messages
- ✅ Rate limit resync requests
- ✅ Log suspicious activity
- ✅ Disconnect misbehaving clients

---

## Summary

| Layer | Purpose | Detection | Recovery |
|-------|---------|-----------|----------|
| **Idempotency** | Prevent duplicate processing | messageId Set | Ignore duplicates |
| **Turn Number** | Detect stale/missed updates | Compare turns | Request resync |
| **State Hash** | Detect subtle desyncs | Compare hashes | Request resync |
| **Resync** | Recover from any mismatch | Layers 2-3 | Full state from host |

**Golden Rule:** When in doubt, request full state. Host state always wins.
