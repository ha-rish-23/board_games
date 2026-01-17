# Century: Golem Edition - Game Engine

A rules-accurate, async, server-authoritative digital implementation of the board game Century: Golem Edition (2024).

## Architecture

- **Pure TypeScript** - No UI, no dependencies, fully testable
- **Server-authoritative** - All validation happens server-side
- **Deterministic** - Same seed = same game state
- **Async-ready** - Supports turn-based play with explicit state transitions
- **Immutable** - All state updates return new objects

## Async Multiplayer Architecture

This engine is specifically designed for **server-authoritative async multiplayer** games.

### Key Guarantees

1. **Full Serializability**
   - All game state is JSON-serializable (no functions, classes, or symbols)
   - Can be stored in any database and transmitted over network
   - Timestamps are Unix epoch milliseconds (not Date objects)

2. **State Resumability**
   - Game can be saved at any point and resumed later
   - No loss of state information
   - Players can disconnect and reconnect without issues

3. **Deterministic Execution**
   - Same action + same state = same result (always)
   - No randomness after initial setup
   - Reproducible for testing and replay

4. **Atomic State Transitions**
   - One action = one complete state transition
   - No partial updates or intermediate states
   - Failed validations don't modify state

5. **Idempotency Support**
   - Actions include timestamp for deduplication
   - Server can detect and reject duplicate submissions
   - Safe to retry failed requests

### No Race Conditions

- **Turn-based**: Only current player can act (validated server-side)
- **Sequential processing**: Server handles actions one at a time per game
- **No timing dependencies**: Turns don't auto-advance or expire
- **Explicit state**: All game state is in the `Game` object

### Server Integration Pattern

```typescript
// Typical server endpoint for action submission
async function handlePlayerAction(gameId: string, action: GameAction) {
  // 1. Load current state from database
  const currentState = await db.loadGame(gameId);
  
  // 2. Check for duplicate action (idempotency)
  if (await db.hasAction(action.playerId, action.timestamp)) {
    return { error: 'Duplicate action' };
  }
  
  // 3. Validate action against current state
  const validation = validateAction(currentState, action);
  if (!validation.valid) {
    return { error: validation.error, code: validation.code };
  }
  
  // 4. Apply action (pure function, no side effects)
  let newState = applyAction(currentState, action);
  
  // 5. Advance turn and check endgame
  const turnResult = advanceTurn(newState);
  newState = turnResult.game;
  
  if (turnResult.gameFinished) {
    newState = finalizeGame(newState);
  }
  
  // 6. Save new state atomically
  await db.saveGame(newState);
  await db.recordAction(action);
  
  // 7. Broadcast to all players
  await broadcast(gameId, { type: 'STATE_UPDATE', state: newState });
  
  return { success: true, state: newState };
}
```

### Client-Server Communication

**Client → Server:**
```json
{
  "type": "PLAY_MERCHANT_CARD",
  "playerId": "alice",
  "cardId": "m42",
  "timestamp": 1705584000000
}
```

**Server → Clients (broadcast):**
```json
{
  "type": "STATE_UPDATE",
  "game": { /* complete game state */ }
}
```

Clients don't need to maintain game logic - server sends complete state updates.

## Project Structure

```
src/
├── types/
│   └── domain.ts           # Complete type definitions
├── setup/
│   └── gameSetup.ts        # Game initialization & deck creation
├── engine/
│   ├── turnSystem.ts       # Turn validation & advancement
│   ├── validation.ts       # Action validation (pure functions)
│   ├── actionResolver.ts   # Action resolution (pure functions)
│   └── endgame.ts          # Scoring & winner determination
└── __tests__/
    ├── testHelpers.ts      # Test utilities
    ├── gameSetup.test.ts   # Setup tests
    ├── validation.test.ts  # Validation tests
    ├── actionResolution.test.ts  # Action tests
    └── comprehensive.test.ts     # Integration tests
```

## Core Concepts

### Game State
The entire game is represented as a single `Game` object containing:
- Player states (cards, crystals, score)
- Market rows (merchant & point cards)
- Decks
- Turn tracking
- Endgame state

### Actions
All player actions are strongly-typed and validated:
- `PlayCardAction` - Play merchant card from hand
- `AcquireCardAction` - Take card from market
- `ClaimPointAction` - Purchase point card
- `RestAction` - Recover played cards

### Validation → Resolution Flow
1. Client sends action
2. Server validates with `validateAction(game, action)`
3. If valid, server applies with `applyAction(game, action)`
4. Server advances turn with `advanceTurn(game)`
5. Server broadcasts new state to clients

## Key Rules Implemented

### Setup
- 2-5 players
- Each player starts with 2 merchant cards (Produce 2Y, Upgrade 2)
- First player gets 3Y, others get 4Y
- 6 merchant cards revealed
- 5 point cards revealed with coin bonuses

### Gameplay
- Turn order: clockwise
- Caravan capacity: 10 crystals
- Upgrade paths: Yellow → Green → Red → Blue
- Acquiring cards costs 1Y per card to the left
- Rest action recovers all played cards

### Endgame
- Triggers at 6 point cards (2-3 players) or 5 point cards (4-5 players)
- All players get one final turn
- Scoring: Point cards + (Green/Red/Blue crystals × 1pt)
- Tiebreakers: Score → Crystals → Merchant cards → Turn order

## Usage Example

```typescript
import { createNewGame } from './setup/gameSetup';
import { validateAction, applyAction, advanceTurn } from './engine';

// Create game
const players = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' }
];
let game = createNewGame(players, 'unique-seed-123');

// Player takes action
const action = {
  type: ActionType.PlayMerchantCard,
  playerId: 'alice',
  cardId: 'start-alice-1',
  timestamp: Date.now()
};

// Validate
const validation = validateAction(game, action);
if (!validation.valid) {
  console.error(validation.error);
  return;
}

// Apply
game = applyAction(game, action);

// Advance turn
const turnResult = advanceTurn(game);
game = turnResult.game;

if (turnResult.gameFinished) {
  console.log(`Winner: ${game.winnerId}`);
}
```

## Testing

All tests are deterministic and use no mocks:

```bash
# Build TypeScript
npm run build

# Run tests (requires TypeScript compilation)
npm test
```

### Test Coverage
- ✅ Game setup correctness
- ✅ Deterministic shuffling
- ✅ All action types
- ✅ Illegal action rejection
- ✅ Caravan overflow
- ✅ Upgrade chains & validation
- ✅ Trade mechanics
- ✅ Endgame trigger timing
- ✅ Tie-breaking logic
- ✅ Full state serialization

## Design Principles

### No Mutations
```typescript
// ❌ Wrong
function applyAction(game: Game, action: GameAction) {
  game.players[0].caravan.YELLOW += 2; // Mutation!
  return game;
}

// ✅ Correct
function applyAction(game: Game, action: GameAction): Game {
  return {
    ...game,
    players: game.players.map(p => 
      p.id === action.playerId
        ? { ...p, caravan: { ...p.caravan, YELLOW: p.caravan.YELLOW + 2 } }
        : p
    )
  };
}
```

### Validation Before Resolution
```typescript
// Always validate first
const validation = validateAction(game, action);
if (!validation.valid) {
  // Handle error
  return;
}

// Then apply (resolution assumes validation passed)
const newGame = applyAction(game, action);
```

### Determinism
```typescript
// Same seed = same game
const game1 = createNewGame(players, 'seed-123');
const game2 = createNewGame(players, 'seed-123');
// game1 and game2 are identical
```

## API Reference

### Setup
- `createNewGame(players, seed)` - Initialize complete game state

### Turn System
- `validateTurn(game, playerId)` - Check if player can act
- `advanceTurn(game)` - Move to next player
- `getCurrentPlayer(game)` - Get active player
- `isInFinalRound(game)` - Check endgame status

### Validation
- `validateAction(game, action)` - Validate any action
- `validatePlayCard(game, action)` - Validate play card
- `validateAcquireCard(game, action)` - Validate acquire
- `validateClaimPoint(game, action)` - Validate claim
- `validateRest(game, action)` - Validate rest

### Resolution
- `applyAction(game, action)` - Apply validated action
- `applyPlayCard(game, action)` - Apply play card
- `applyAcquireCard(game, action)` - Apply acquire
- `applyClaimPoint(game, action)` - Apply claim
- `applyRest(game, action)` - Apply rest

### Endgame
- `checkEndGameTrigger(game)` - Check if endgame triggered
- `finalizeGame(game)` - Calculate scores & winner
- `calculateScore(player)` - Calculate player score
- `determineWinner(players)` - Determine winner with tiebreaks
- `getScoreBreakdown(player)` - Get detailed score info

## REST API Wrapper

A complete async-safe REST API is provided in `src/api/`:

```bash
# Install Express
npm install express @types/express

# Start server
npx ts-node -e "
import { createServer } from './src/api/expressAdapter';
const server = createServer();
server.listen(3000, () => console.log('Server on :3000'));
"
```

**Endpoints:**
- `POST /api/games` - Create game
- `GET /api/games/:id` - Get state
- `POST /api/games/:id/actions` - Submit action

**Features:**
- Server-authoritative validation
- Turn enforcement
- Idempotency checks
- Full state persistence

**Documentation:**
- [API_QUICKREF.md](API_QUICKREF.md) - Quick reference
- [API_EXAMPLES.md](API_EXAMPLES.md) - Full examples
- [src/api/README.md](src/api/README.md) - Architecture
- [P2P_ARCHITECTURE.md](P2P_ARCHITECTURE.md) - Peer-to-peer design
- [src/p2p/PROTOCOL.md](src/p2p/PROTOCOL.md) - P2P message protocol
- [src/p2p/STATE_CONSISTENCY.md](src/p2p/STATE_CONSISTENCY.md) - P2P state safeguards
- [src/p2p/HOST_UI.md](src/p2p/HOST_UI.md) - Host UI responsibilities & adapter pattern
- [src/p2p/FAILURE_MODES.md](src/p2p/FAILURE_MODES.md) - LAN failure modes & recovery
- [src/p2p/BROWSER_ROOM.md](src/p2p/BROWSER_ROOM.md) - Browser-only P2P room creation
- [src/p2p/actionFlow.ts](src/p2p/actionFlow.ts) - Complete action flow examples
- [CODE_REVIEW.md](CODE_REVIEW.md) - Code quality review

## P2P State Consistency

For LAN multiplayer, the engine includes 4 layers of state consistency safeguards:

1. **Idempotent Message Handling** - Deduplicate messages by messageId
2. **Turn Number Validation** - Detect stale messages and missed updates
3. **State Hash Verification** - Detect subtle desyncs via cryptographic hash
4. **Re-sync Mechanism** - Request full state when mismatch detected

**Golden Rule:** Host state always wins. Clients request full state on any mismatch.

```typescript
import { ClientStateSyncHandler } from './p2p/stateSync';

// Client automatically handles all safeguards
const syncHandler = new ClientStateSyncHandler(hostPeerId);
const result = syncHandler.handleGameState(message);
// result: 'applied' | 'resync_needed' | 'ignored'
```

See [src/p2p/STATE_CONSISTENCY.md](src/p2p/STATE_CONSISTENCY.md) for full details.

## License

MIT
