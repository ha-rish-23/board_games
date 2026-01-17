# Browser P2P Room Creation & Join

**Pure client-side multiplayer using PeerJS - No backend required!**

## Overview

This module provides both **host** and **client** implementations for browser-only P2P multiplayer:

- **`P2PGameRoom`** (Host) - Creates rooms, validates actions, broadcasts state
- **`P2PGameClient`** (Client) - Joins rooms, receives state, sends action requests

The host stores the authoritative game state in memory and coordinates all game actions through the existing game engine. Clients receive read-only state and can only send action requests.

## Key Features

✅ **Zero Backend** - Runs entirely in the browser  
✅ **Short Room Codes** - 6-character codes (e.g., "A3F9K2")  
✅ **Authoritative Host** - Host validates all actions via game engine  
✅ **PeerJS WebRTC** - Direct peer-to-peer connections  
✅ **State Consistency** - Uses existing 4-layer safeguard system  
✅ **Auto-Recovery** - Handles disconnects with grace periods  
✅ **Observer Mode** - Optional read-only spectators  

## Quick Start

### Host: Create a Room

```typescript
import { P2PGameRoom } from './p2p/browserRoom';

// Create room instance
const room = new P2PGameRoom();

// Listen to events
room.on('room-created', (info) => {
  console.log('Room Code:', info.roomCode);
  console.log('Host Peer ID:', info.hostPeerId);
  
  // Share BOTH room code AND peer ID with players
  displayRoomInfo(info.roomCode, info.hostPeerId);
});

room.on('peer-connected', (player) => {
  console.log('Player joined:', player.playerName);
});

// Create room (host becomes authoritative)
const roomInfo = await room.createRoom(
  ['Alice', 'Bob', 'Charlie'],  // Player names
  undefined,                      // Optional seed
  true                            // Enable observer mode
);
```

### Client: Join a Room

```typescript
import { P2PGameClient } from './p2p/browserClient';

// Create client instance
const client = new P2PGameClient();

// Listen to events
client.on('connected', (info) => {
  console.log('Connected to room:', info.roomCode);
});

client.on('game-state-received', (game) => {
  console.log('Game state updated, turn:', game.turnNumber);
  renderGame(game); // Render read-only
});

client.on('action-accepted', (action) => {
  console.log('Action accepted:', action.type);
});

// Join room (provide room code + host peer ID)
await client.joinRoomWithPeerId(
  'A3F9K2',                       // Room code from host
  'host_A3F9K2_1234567890',      // Host peer ID from host
  'player_1',                     // Your player ID
  'Alice'                         // Your player name
);

// Send action request (client does NOT mutate state)
const success = await client.sendAction({
  type: ActionType.PlayMerchantCard,
  playerId: 'player_1',
  cardId: 'card123',
  timestamp: Date.now()
});

if (success) {
  console.log('Action accepted, waiting for state update...');
  // State update will arrive via 'game-state-received' event
}
```

```html
<!DOCTYPE html>
<html>
<head>
  <title>Century P2P Host</title>
</head>
<body>
  <div id="create-room">
    <h1>Create Game</h1>
    <input id="player1" placeholder="Player 1" value="Alice" />
    <input id="player2" placeholder="Player 2" value="Bob" />
    <input id="player3" placeholder="Player 3" value="Charlie" />
    <button id="create-btn">Create Room</button>
  </div>

  <div id="room-display" style="display:none;">
    <h2>Room Code</h2>
    <div id="room-code" style="font-size:48px; font-weight:bold;"></div>
    <h3>Players</h3>
    <div id="players-list"></div>
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

## JavaScript Integration

### Host Implementation

```typescript
import { P2PGameRoom } from './p2p/browserRoom';
import type { Game } from './types/domain';

let room: P2PGameRoom | null = null;

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
    // Create room
    room = new P2PGameRoom();
    
    // Set up event handlers
    setupHostEventHandlers(room);
    
    // Create room (browser becomes host)
    const roomInfo = await room.createRoom(playerNames);
    
    // Show room info
    document.getElementById('room-code')!.textContent = roomInfo.roomCode;
    document.getElementById('host-peer-id')!.textContent = roomInfo.hostPeerId;
    document.getElementById('create-room')!.style.display = 'none';
    document.getElementById('room-display')!.style.display = 'block';
    
  } catch (error) {
    alert('Failed to create room: ' + (error as Error).message);
  }
});

function setupHostEventHandlers(room: P2PGameRoom) {
  // Player connected
  room.on('peer-connected', (player) => {
    const playersList = document.getElementById('players-list')!;
    const div = document.createElement('div');
    div.id = `player-${player.playerId}`;
    div.textContent = `✓ ${player.playerName} (connected)`;
    div.style.color = 'green';
    playersList.appendChild(div);
  });
  
  // Player disconnected
  room.on('peer-disconnected', (peerId, playerName) => {
    const playerDiv = Array.from(document.querySelectorAll('#players-list div'))
      .find(el => el.textContent?.includes(playerName));
    if (playerDiv) {
      playerDiv.textContent = `✗ ${playerName} (disconnected)`;
      (playerDiv as HTMLElement).style.color = 'red';
    }
  });
  
  // Game state updated
  room.on('game-state-updated', (game: Game) => {
    updateGameUI(game);
  });
}
```

### Client Implementation

```typescript
import { P2PGameClient } from './p2p/browserClient';
import type { Game, GameAction, ActionType } from './types/domain';

let client: P2PGameClient | null = null;

document.getElementById('join-btn')?.addEventListener('click', async () => {
  const roomCode = (document.getElementById('room-code') as HTMLInputElement).value;
  const hostPeerId = (document.getElementById('host-peer-id') as HTMLInputElement).value;
  const playerId = (document.getElementById('player-id') as HTMLInputElement).value;
  const playerName = (document.getElementById('player-name') as HTMLInputElement).value;
  
  if (!roomCode || !hostPeerId || !playerId || !playerName) {
    alert('Please fill in all fields');
    return;
  }
  
  try {
    // Create client
    client = new P2PGameClient();
    
    // Set up event handlers
    setupClientEventHandlers(client);
    
    // Join room
    await client.joinRoomWithPeerId(roomCode, hostPeerId, playerId, playerName);
    
    // Show game UI
    document.getElementById('current-room-code')!.textContent = roomCode;
    document.getElementById('join-room')!.style.display = 'none';
    document.getElementById('game-display')!.style.display = 'block';
    
  } catch (error) {
    alert('Failed to join room: ' + (error as Error).message);
  }
});

function setupClientEventHandlers(client: P2PGameClient) {
  // Connected
  client.on('connected', (info) => {
    console.log('Connected:', info);
    showNotification('Connected to room!', 'success');
  });
  
  // Disconnected
  client.on('disconnected', (reason) => {
    console.log('Disconnected:', reason);
    showNotification('Disconnected: ' + reason, 'error');
  });
  
  // Game state received (READ-ONLY)
  client.on('game-state-received', (game: Game) => {
    console.log('Game state:', game.turnNumber);
    renderGameState(game); // Render UI (no local mutation)
    
    // Enable/disable actions based on whose turn it is
    const isMyTurn = game.players[game.currentPlayerIndex].id === 
                     client.getClientInfo()?.playerId;
    updateActionButtons(isMyTurn);
  });
  
  // Action accepted
  client.on('action-accepted', (action) => {
    console.log('Action accepted:', action.type);
    showNotification('Action accepted!', 'success');
  });
  
  // Action rejected
  client.on('action-rejected', (action, error) => {
    console.error('Action rejected:', error);
    showNotification('Action rejected: ' + error, 'error');
  });
  
  // Host disconnected
  client.on('host-disconnected', () => {
    showNotification('Host disconnected. Waiting...', 'warning');
  });
  
  // Reconnected
  client.on('reconnected', () => {
    showNotification('Reconnected!', 'success');
  });
}

function renderGameState(game: Game) {
  // Render game state (READ-ONLY - no mutations!)
  const stateDiv = document.getElementById('game-state')!;
  stateDiv.innerHTML = `
    <p>Turn: ${game.turnNumber}</p>
    <p>Phase: ${game.phase}</p>
    <p>Current Player: ${game.players[game.currentPlayerIndex].name}</p>
  `;
}

function updateActionButtons(enabled: boolean) {
  const actionPanel = document.getElementById('action-panel')!;
  
  if (enabled) {
    actionPanel.innerHTML = `
      <button onclick="sendPlayCardAction()">Play Card</button>
      <button onclick="sendRestAction()">Rest</button>
    `;
  } else {
    actionPanel.innerHTML = '<p>Waiting for other players...</p>';
  }
}

// Example action sender
async function sendPlayCardAction() {
  if (!client) return;
  
  const game = client.getGame();
  if (!game) return;
  
  const myPlayer = game.players.find(p => 
    p.id === client.getClientInfo()?.playerId
  );
  if (!myPlayer) return;
  
  // Get first card in hand
  const card = myPlayer.hand[0];
  if (!card) {
    alert('No cards in hand');
    return;
  }
  
  // Send action request (NO LOCAL MUTATION)
  try {
    const success = await client.sendAction({
      type: 'PLAY_MERCHANT_CARD' as ActionType,
      playerId: myPlayer.id,
      cardId: card.id,
      timestamp: Date.now()
    });
    
    if (!success) {
      alert('Action rejected by host');
    }
    // If successful, state update will arrive via 'game-state-received'
  } catch (error) {
    alert('Failed to send action: ' + (error as Error).message);
  }
}

function showNotification(message: string, type: 'success' | 'error' | 'warning') {
  // Your notification UI logic
  console.log(`[${type}] ${message}`);
}
```

## API Reference

### P2PGameRoom (Host)

#### Constructor

```typescript
const room = new P2PGameRoom();
```

### Methods

#### `createRoom(playerNames, seed?, observerMode?)`

Creates a new game room. Returns `Promise<RoomInfo>`.

**Parameters:**
- `playerNames: string[]` - Array of 2-5 player names
- `seed?: string` - Optional seed for deterministic setup
- `observerMode?: boolean` - Allow late joiners as observers (default: false)

**Returns:**
```typescript
interface RoomInfo {
  roomCode: string;          // 6-character room code
  gameId: string;            // Game UUID
  hostPeerId: string;        // PeerJS peer ID
  createdAt: number;         // Timestamp
  playerCount: number;       // Total players
  connectedPlayers: number;  // Currently connected
  gamePhase: GamePhase;      // Current phase
}
```

**Example:**
```typescript
const info = await room.createRoom(['Alice', 'Bob'], 'seed123', true);
console.log('Share code:', info.roomCode);
```

#### `getRoomCode()`

Returns the room code as a string.

#### `getHostPeerId()`

Returns the PeerJS peer ID for this host.

#### `getGame()`

Returns the current `Game` state (read-only).

#### `getRoomInfo()`

Returns current room information or `null`.

#### `getConnectedPlayers()`

Returns array of `ConnectedPlayer` objects.

#### `close()`

Closes the room and disconnects all peers.

### Events

Subscribe to events using `room.on(event, callback)`:

#### `room-created`

Fired when room is successfully created.

```typescript
room.on('room-created', (info: RoomInfo) => {
  console.log('Room code:', info.roomCode);
});
```

#### `peer-connected`

Fired when a player connects.

```typescript
room.on('peer-connected', (player: ConnectedPlayer) => {
  console.log('Player joined:', player.playerName);
});
```

#### `peer-disconnected`

Fired when a player disconnects.

```typescript
room.on('peer-disconnected', (peerId: string, playerName: string) => {
  console.log('Player left:', playerName);
});
```

#### `peer-reconnected`

Fired when a player reconnects.

```typescript
room.on('peer-reconnected', (peerId: string, playerName: string) => {
  console.log('Player rejoined:', playerName);
});
```

#### `turn-auto-skipped`

Fired when a disconnected player's turn is auto-skipped.

```typescript
room.on('turn-auto-skipped', (playerId: string, playerName: string) => {
  alert(`${playerName}'s turn was skipped (disconnected)`);
});
```

#### `action-processed`

Fired when an action is validated and applied.

```typescript
room.on('action-processed', (action: GameAction, success: boolean) => {
  console.log('Action:', action.type, 'Success:', success);
});
```

#### `game-state-updated`

Fired whenever the game state changes.

```typescript
room.on('game-state-updated', (game: Game) => {
  updateUI(game);
});
```

#### `late-joiner-rejected`

Fired when a player tries to join after game starts (observer mode disabled).

```typescript
room.on('late-joiner-rejected', (peerId: string, playerName: string) => {
  console.log('Rejected late joiner:', playerName);
});
```

#### `room-error`

Fired on room creation errors.

```typescript
room.on('room-error', (error: Error) => {
  console.error('Room error:', error.message);
});
```

---

### P2PGameClient (Client)

#### Constructor

```typescript
const client = new P2PGameClient();
```

#### Methods

##### `joinRoom(roomCode, playerId, playerName, timeout?)`

Join a room by room code (requires cached host peer ID).

**Parameters:**
- `roomCode: string` - 6-character room code
- `playerId: string` - Your player ID (must match host's player list)
- `playerName: string` - Your display name
- `timeout?: number` - Connection timeout in ms (default: 30000)

**Returns:** `Promise<ClientRoomInfo>`

**Example:**
```typescript
await client.joinRoom('A3F9K2', 'player_1', 'Alice');
```

##### `joinRoomWithPeerId(roomCode, hostPeerId, playerId, playerName, timeout?)`

Join a room with explicit host peer ID (recommended).

**Parameters:**
- `roomCode: string` - 6-character room code
- `hostPeerId: string` - Host's PeerJS peer ID
- `playerId: string` - Your player ID
- `playerName: string` - Your display name
- `timeout?: number` - Connection timeout in ms (default: 30000)

**Returns:** `Promise<ClientRoomInfo>`

**Example:**
```typescript
await client.joinRoomWithPeerId(
  'A3F9K2',
  'host_A3F9K2_1234567890',
  'player_1',
  'Alice'
);
```

##### `sendAction(action)`

Send action request to host. **Client does NOT mutate state locally.**

**Parameters:**
- `action: GameAction` - Action to request

**Returns:** `Promise<boolean>` - True if accepted, false if rejected

**Example:**
```typescript
const success = await client.sendAction({
  type: ActionType.PlayMerchantCard,
  playerId: 'player_1',
  cardId: 'card123',
  timestamp: Date.now()
});

if (success) {
  // Wait for state update via 'game-state-received' event
}
```

##### `getGame()`

Get current game state (read-only).

**Returns:** `Game | null`

##### `isConnected()`

Check connection status.

**Returns:** `boolean`

##### `getClientInfo()`

Get client connection info.

**Returns:** `ClientRoomInfo | null`

##### `disconnect()`

Disconnect from room.

#### Client Events

Subscribe using `client.on(event, callback)`:

##### `connected`

Fired when successfully connected to room.

```typescript
client.on('connected', (info: ClientRoomInfo) => {
  console.log('Connected to:', info.roomCode);
});
```

##### `disconnected`

Fired when disconnected from room.

```typescript
client.on('disconnected', (reason: string) => {
  console.log('Disconnected:', reason);
});
```

##### `game-state-received`

Fired when game state is received from host. **This is the ONLY way client updates state.**

```typescript
client.on('game-state-received', (game: Game) => {
  renderGame(game); // Render read-only
});
```

##### `action-accepted`

Fired when an action request is accepted by host.

```typescript
client.on('action-accepted', (action: GameAction) => {
  console.log('Action accepted:', action.type);
});
```

##### `action-rejected`

Fired when an action request is rejected by host.

```typescript
client.on('action-rejected', (action: GameAction, error: string) => {
  console.error('Action rejected:', error);
});
```

##### `host-disconnected`

Fired when host disconnects.

```typescript
client.on('host-disconnected', () => {
  console.warn('Host disconnected');
});
```

##### `reconnecting`

Fired when attempting to reconnect.

```typescript
client.on('reconnecting', () => {
  console.log('Reconnecting...');
});
```

##### `reconnected`

Fired when successfully reconnected.

```typescript
client.on('reconnected', () => {
  console.log('Reconnected!');
});
```

##### `resync-complete`

Fired when full state resync completes.

```typescript
client.on('resync-complete', (game: Game) => {
  console.log('State resynced');
});
```

##### `player-status-changed`

Fired when another player connects/disconnects.

```typescript
client.on('player-status-changed', (playerId: string, status: 'connected' | 'disconnected') => {
  console.log('Player', playerId, status);
});
```

##### `error`

Fired on client errors.

```typescript
client.on('error', (error: Error) => {
  console.error('Client error:', error.message);
});
```

---

## Architecture

### Complete Action Flow

The action flow between peers follows a strict protocol:

1. **Client clicks button** → UI handler called
2. **Client creates action** → `GameAction` object with all required fields
3. **Client sends to host** → `client.sendAction(action)` via WebRTC
4. **Host receives request** → `handleActionRequest()` in browserRoom.ts
5. **Host validates** → `validateAction(game, action)` via game engine
6. **Host applies** → `applyAction(game, action)` via game engine
7. **Host advances turn** → `advanceTurn(game)` via game engine
8. **Host replaces state** → `this.game = newGame` (never patch)
9. **Host broadcasts** → `broadcastGameState(newGame, action)` to ALL peers
10. **All clients receive** → `handleGameState(message)` in browserClient.ts
11. **All clients validate** → State hash verification
12. **All clients replace** → `this.game = message.game` (never patch)
13. **All UIs re-render** → React to `game-state-received` event

**Key Principles:**
- Client **never** mutates state locally
- Host validates **everything** via game engine
- State is **always replaced**, never patched
- All peers receive **complete state**, not diffs

See [actionFlow.ts](./actionFlow.ts) for complete examples.

### Room Code Generation

Room codes are **6 uppercase alphanumeric characters** that avoid confusing characters:
- **Allowed**: A-Z (except O, I, L), 2-9 (except 0, 1)
- **Example**: `A3F9K2`, `M7P8R4`

### PeerJS Configuration

The host creates a PeerJS instance with ID: `host_{roomCode}_{timestamp}`

**Default Configuration:**
```typescript
new Peer(hostPeerId, {
  debug: 2  // Debug level
  // Defaults to free PeerJS cloud server
  // For LAN-only, run your own PeerServer
});
```

**Custom PeerServer (Optional):**
```typescript
new Peer(hostPeerId, {
  host: '192.168.1.100',
  port: 9000,
  path: '/myapp',
  secure: false
});
```

### Message Flow

1. **Host creates room** → Generates room code
2. **Host initializes PeerJS** → Listens for connections
3. **Peer connects** → Sends `JOIN_GAME` message
4. **Host validates player** → Sends initial `GAME_STATE`
5. **Peer sends actions** → Host validates via engine
6. **Host broadcasts state** → All peers receive updates

### State Consistency

Uses the existing 4-layer safeguard system:

1. **Layer 1**: MessageDeduplicator (idempotency)
2. **Layer 2**: Turn number validation
3. **Layer 3**: State hash verification
4. **Layer 4**: Full state resync on mismatch

See [STATE_CONSISTENCY.md](./STATE_CONSISTENCY.md) for details.

### Disconnect Handling

**Peer Disconnects:**
- 15-second grace period for reconnection
- If peer's turn: Auto-skip after grace period (via REST action)
- If not peer's turn: Mark disconnected, skip when turn arrives

**Auto-Skip Implementation:**
```typescript
// Host creates REST action and processes via engine
const restAction: GameAction = {
  type: 'REST',
  playerId: disconnectedPlayerId,
  timestamp: Date.now()
};

const result = processAction(restAction);  // Uses game engine
if (result.valid) {
  broadcastGameState(newGame, restAction);
}
```

See [FAILURE_MODES.md](./FAILURE_MODES.md) for full details.

## Security Considerations

### Trust Model

- **Host is authoritative** - All validation happens on host
- **Peers are untrusted** - Host validates every action
- **No server verification** - Trust is placed on host browser

### Attack Vectors

1. **Malicious Host**: Host can cheat (modify game state)
   - **Mitigation**: Social trust, game is casual/friends-only
   
2. **Malicious Peer**: Peer sends invalid actions
   - **Mitigation**: Host validates all actions via engine
   
3. **Network Spoofing**: Peer impersonates another player
   - **Mitigation**: PeerJS connection authentication

### Recommendations

For **casual games with friends**: Current implementation is sufficient.

For **competitive/ranked games**: Add server-side verification:
- Host sends game log to server
- Server validates all actions were legal
- Catches cheating hosts

## Limitations

1. **Host Required**: Game stops if host disconnects (see host migration in FAILURE_MODES.md)
2. **No Server Persistence**: Game state lost if host closes browser
3. **PeerJS Dependency**: Requires PeerJS signaling server for initial connection
4. **NAT Traversal**: May fail on restrictive networks (use TURN server)
5. **Browser Storage**: localStorage used for recovery (limited to ~5MB)

## Best Practices

### 1. Save Game State

```typescript
room.on('game-state-updated', (game) => {
  // Periodically save to localStorage
  localStorage.setItem('game_backup', JSON.stringify(game));
});
```

### 2. Handle Reconnections

```typescript
room.on('peer-disconnected', (peerId, playerName) => {
  // Show notification
  showNotification(`${playerName} disconnected. Waiting...`);
});

room.on('peer-reconnected', (peerId, playerName) => {
  showNotification(`${playerName} reconnected!`);
});
```

### 3. Monitor Connection Quality

```typescript
room.on('action-processed', (action, success) => {
  if (!success) {
    console.warn('Action rejected - possible network issue');
  }
});
```

### 4. Graceful Shutdown

```typescript
window.addEventListener('beforeunload', () => {
  if (room) {
    room.close();  // Notifies all peers
  }
});
```

## Testing

### Local Testing (Same Computer)

Open multiple browser tabs:

```typescript
// Tab 1 (Host)
const room = new P2PGameRoom();
await room.createRoom(['Alice', 'Bob']);
console.log('Code:', room.getRoomCode());

// Tab 2, 3, etc. (Clients)
// Use the room code to connect
```

### LAN Testing (Different Computers)

1. Ensure all devices on same network
2. Host creates room
3. Share room code (write on paper, send via chat)
4. Clients connect using code

## Troubleshooting

### "Cannot find module 'peerjs'"

```bash
npm install peerjs @types/peerjs
```

### "PeerJS error: peer-unavailable"

- Check internet connection (PeerJS needs signaling server)
- Try reconnecting after a few seconds
- Verify peer ID is correct

### "localStorage not available"

- Check browser privacy settings
- Ensure not in private/incognito mode
- Use alternative storage (sessionStorage, IndexedDB)

### Peers can't connect

- Check firewall settings
- Ensure WebRTC not blocked by browser
- Try different network (mobile hotspot)
- Configure TURN server for NAT traversal

## Related Documentation

- [P2P_ARCHITECTURE.md](./P2P_ARCHITECTURE.md) - Overall P2P design
- [PROTOCOL.md](./PROTOCOL.md) - Message protocol reference
- [STATE_CONSISTENCY.md](./STATE_CONSISTENCY.md) - State sync safeguards
- [HOST_UI.md](./HOST_UI.md) - Host responsibilities
- [FAILURE_MODES.md](./FAILURE_MODES.md) - Disconnect handling

## Future Enhancements

- [ ] Host migration (automatic failover)
- [ ] Replay/spectator mode
- [ ] Game state encryption
- [ ] Voice chat integration
- [ ] Mobile browser support
- [ ] PWA offline capabilities
