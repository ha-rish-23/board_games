# P2P Message Protocol Quick Reference

## Message Types

| Type | Sender | Receiver | Purpose |
|------|--------|----------|---------|
| `JOIN_GAME` | Client | Host | Request to join game |
| `GAME_STATE` | **Host Only** ⚠️ | Client(s) | Sync authoritative state |
| `ACTION_REQUEST` | Client | Host | Submit action for validation |
| `ACTION_RESULT` | Host | Client | Acknowledge action processed |
| `ERROR` | Any | Any | Report error or issue |

---

## Required Fields (All Messages)

```typescript
{
  messageId: string;      // Unique ID for deduplication
  gameId: string;         // Game session ID
  senderId: string;       // Peer ID of sender
  turnNumber: number;     // Current turn for ordering
  timestamp: number;      // Unix epoch milliseconds
  type: P2PMessageType;   // Message type discriminator
}
```

---

## Message Examples

### 1. JOIN_GAME (Client → Host)

```json
{
  "type": "JOIN_GAME",
  "messageId": "1737216000000_abc123",
  "gameId": "game_xyz",
  "senderId": "peer_client1",
  "turnNumber": 0,
  "timestamp": 1737216000000,
  "playerId": "player_2",
  "playerName": "Bob",
  "clientVersion": "1.0.0",
  "lastKnownTurn": null
}
```

**Response:** Host sends `GAME_STATE` with current state or `ERROR` if rejected.

---

### 2. GAME_STATE (Host → Client) ⚠️ Host Only

```json
{
  "type": "GAME_STATE",
  "messageId": "1737216001000_def456",
  "gameId": "game_xyz",
  "senderId": "peer_host",
  "turnNumber": 5,
  "timestamp": 1737216001000,
  "game": {
    "id": "game_xyz",
    "phase": "PLAYING",
    "players": [...],
    "currentPlayerIndex": 1,
    "turnNumber": 5,
    ...
  },
  "reason": "ACTION_APPLIED",
  "lastAction": {
    "type": "PLAY_MERCHANT_CARD",
    "playerId": "player_1",
    ...
  }
}
```

**Security:** Clients MUST verify `senderId === hostPeerId` before processing!

---

### 3. ACTION_REQUEST (Client → Host)

```json
{
  "type": "ACTION_REQUEST",
  "messageId": "1737216002000_ghi789",
  "gameId": "game_xyz",
  "senderId": "peer_client1",
  "turnNumber": 5,
  "timestamp": 1737216002000,
  "action": {
    "type": "PLAY_MERCHANT_CARD",
    "playerId": "player_2",
    "timestamp": 1737216002000,
    "cardId": "start-player_2-1"
  },
  "expectedNextTurn": 6
}
```

**Response:** Host sends `ACTION_RESULT` to requester, then `GAME_STATE` to all if valid.

---

### 4. ACTION_RESULT (Host → Client)

```json
{
  "type": "ACTION_RESULT",
  "messageId": "1737216002100_jkl012",
  "gameId": "game_xyz",
  "senderId": "peer_host",
  "turnNumber": 5,
  "timestamp": 1737216002100,
  "requestMessageId": "1737216002000_ghi789",
  "success": true,
  "newTurnNumber": 6
}
```

**On Failure:**
```json
{
  "type": "ACTION_RESULT",
  ...
  "success": false,
  "errorMessage": "Not your turn. Current player: Alice",
  "errorCode": "NOT_YOUR_TURN"
}
```

---

### 5. ERROR (Any → Any)

```json
{
  "type": "ERROR",
  "messageId": "1737216003000_mno345",
  "gameId": "game_xyz",
  "senderId": "peer_host",
  "turnNumber": 5,
  "timestamp": 1737216003000,
  "severity": "ERROR",
  "errorCode": "STALE_TURN",
  "message": "Turn number too old. Expected >= 5, got 3",
  "causedByMessageId": "1737216001500_old123",
  "details": {
    "expectedTurn": 5,
    "receivedTurn": 3
  },
  "willDisconnect": false
}
```

---

## Message Flow Examples

### Normal Action Flow

```
Client                          Host                         All Clients
  │                              │                                │
  │  ACTION_REQUEST              │                                │
  ├────────────────────────────► │                                │
  │                              │ (validate)                     │
  │                              │ (apply)                        │
  │  ACTION_RESULT (ack)         │                                │
  │ ◄────────────────────────────┤                                │
  │                              │  GAME_STATE (broadcast)        │
  │ ◄────────────────────────────┼──────────────────────────────► │
  │                              │                                │
```

### Client Joins Game

```
Client                          Host
  │                              │
  │  JOIN_GAME                   │
  ├────────────────────────────► │
  │                              │ (verify player)
  │                              │
  │  GAME_STATE (initial sync)   │
  │ ◄────────────────────────────┤
  │                              │
```

### Invalid Action

```
Client                          Host
  │                              │
  │  ACTION_REQUEST              │
  ├────────────────────────────► │
  │                              │ (validation fails)
  │                              │
  │  ACTION_RESULT (failure)     │
  │ ◄────────────────────────────┤
  │                              │
  │  (no GAME_STATE sent)        │
  │                              │
```

---

## Security Rules

### ⚠️ CRITICAL: GAME_STATE Validation

```typescript
// ALWAYS validate before processing GAME_STATE
function handleMessage(msg: P2PMessage, hostPeerId: string) {
  if (msg.type === P2PMessageType.GameState) {
    if (msg.senderId !== hostPeerId) {
      console.error('SECURITY VIOLATION: Non-host sent GAME_STATE!');
      disconnect(msg.senderId);
      return;
    }
  }
  
  // Process message...
}
```

### Message Deduplication

```typescript
const seenMessages = new Set<string>();

function handleMessage(msg: P2PMessage) {
  if (seenMessages.has(msg.messageId)) {
    console.log('Duplicate message ignored:', msg.messageId);
    return;
  }
  
  seenMessages.add(msg.messageId);
  processMessage(msg);
}
```

### Turn Number Validation

```typescript
function validateTurnNumber(msg: P2PMessage, currentTurn: number) {
  if (msg.turnNumber < currentTurn - 1) {
    // Message too old
    sendError(ProtocolErrorCode.StaleTurn);
    return false;
  }
  
  if (msg.turnNumber > currentTurn + 1) {
    // Message too new (missed updates)
    requestStateResync();
    return false;
  }
  
  return true;
}
```

---

## Error Codes

### Action Error Codes
- `NOT_YOUR_TURN` - Action submitted out of turn
- `INVALID_ACTION` - Action doesn't match game state
- `RULE_VIOLATION` - Action violates game rules
- `GAME_NOT_PLAYING` - Game not in PLAYING phase
- `PLAYER_NOT_FOUND` - Player ID not in game
- `TURN_MISMATCH` - Stale turn number
- `DUPLICATE_ACTION` - Same messageId seen before
- `HOST_BUSY` - Host processing another action

### Protocol Error Codes
- `INVALID_MESSAGE` - Malformed JSON or missing fields
- `UNAUTHORIZED_GAME_STATE` - Non-host sent GAME_STATE
- `UNKNOWN_SENDER` - Sender not recognized
- `GAME_ID_MISMATCH` - Wrong game ID
- `STALE_TURN` - Turn too old
- `FUTURE_TURN` - Turn too new
- `VERSION_MISMATCH` - Incompatible client version
- `PEER_DISCONNECTED` - Peer connection lost
- `HOST_MIGRATING` - Host migrating to another peer
- `CONNECTION_FAILED` - WebRTC failure
- `MESSAGE_TOO_LARGE` - Exceeds size limit
- `RATE_LIMIT_EXCEEDED` - Too many messages

---

## Usage with Message Factory

```typescript
import { P2PMessageFactory, P2PMessageType } from './p2p/protocol';

// Client: Join game
const joinMsg = P2PMessageFactory.createJoinGame(
  gameId,
  myPeerId,
  myPlayerId,
  'Alice',
  '1.0.0'
);
hostConnection.send(JSON.stringify(joinMsg));

// Host: Broadcast state
const stateMsg = P2PMessageFactory.createGameState(
  gameId,
  hostPeerId,
  updatedGame,
  GameStateReason.ActionApplied,
  lastAction
);
broadcastToAll(stateMsg);

// Client: Send action
const actionMsg = P2PMessageFactory.createActionRequest(
  gameId,
  myPeerId,
  currentTurnNumber,
  action
);
hostConnection.send(JSON.stringify(actionMsg));

// Host: Send result
const resultMsg = P2PMessageFactory.createActionResult(
  gameId,
  hostPeerId,
  currentTurnNumber,
  requestMessageId,
  true, // success
  newTurnNumber
);
sendToPeer(clientPeerId, resultMsg);

// Any: Send error
const errorMsg = P2PMessageFactory.createError(
  gameId,
  myPeerId,
  currentTurnNumber,
  ErrorSeverity.Error,
  ProtocolErrorCode.StaleTurn,
  'Turn number mismatch',
  false // willDisconnect
);
sendToPeer(otherPeerId, errorMsg);
```

---

## Message Size Limits

Recommended limits for WebRTC data channels:

- **Individual message:** < 16 KB
- **GAME_STATE:** < 50 KB (typical)
- **ACTION_REQUEST:** < 2 KB
- **ERROR:** < 1 KB

If GAME_STATE exceeds limit:
1. Use compression (gzip)
2. Send incremental diffs instead of full state
3. Chunk large messages

---

## Protocol Version

Current version: **1.0.0**

Include in `clientVersion` field of JOIN_GAME message.

Host should validate version compatibility:
```typescript
function isCompatible(clientVersion: string): boolean {
  const [major] = clientVersion.split('.');
  const [hostMajor] = HOST_VERSION.split('.');
  return major === hostMajor; // Same major version required
}
```

---

## WebRTC / PeerJS Integration

```typescript
import Peer from 'peerjs';
import { P2PMessage, isValidP2PMessage } from './p2p/protocol';

// Create peer
const peer = new Peer('my-peer-id');

// Connect to host
const conn = peer.connect('host-peer-id');

conn.on('open', () => {
  // Send join message
  const joinMsg = P2PMessageFactory.createJoinGame(...);
  conn.send(joinMsg); // PeerJS auto-serializes to JSON
});

conn.on('data', (data) => {
  // Receive message
  const msg = data as P2PMessage;
  
  if (!isValidP2PMessage(msg)) {
    console.error('Invalid message received');
    return;
  }
  
  handleMessage(msg);
});
```

---

## See Also

- [P2P_ARCHITECTURE.md](../P2P_ARCHITECTURE.md) - Full P2P design
- [src/p2p/protocol.ts](../src/p2p/protocol.ts) - TypeScript types
- [PeerJS Documentation](https://peerjs.com/docs/) - WebRTC library
