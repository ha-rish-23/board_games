# REST API Architecture

## Overview

This API provides a **server-authoritative, async-safe** REST wrapper around the pure game engine. All game logic remains in the engine; the API layer handles HTTP concerns, persistence, and multiplayer coordination.

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────────┐
│   Express       │  (Framework adapter)
│   Adapter       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Controllers    │  (Request/Response handling)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  GameService    │  (Business logic coordination)
├─────────────────┤
│ • Idempotency   │
│ • Authorization │
│ • Validation    │
│ • Persistence   │
└────┬───────┬────┘
     │       │
     │       └─────────┐
     ▼                 ▼
┌─────────┐      ┌──────────┐
│ Storage │      │  Engine  │  (Pure game logic)
│         │      │          │
│ • State │      │ • Setup  │
│ • Actions│     │ • Validate│
└─────────┘      │ • Resolve│
                 │ • Turn   │
                 │ • Endgame│
                 └──────────┘
```

## Key Design Principles

### 1. Server Authority
- Server is source of truth for all game state
- Clients submit actions, server validates and applies
- No client-side game logic (prevents cheating)

### 2. Pure Engine Integration
- Controllers delegate to engine functions
- No game logic in API layer
- Engine remains framework-agnostic and testable

### 3. Idempotency
- Actions identified by `playerId + timestamp`
- Duplicate submissions safely rejected
- Clients can retry on network failures

### 4. Turn Enforcement
- Only current player can submit actions
- Server validates turn ownership before applying
- Prevents out-of-turn moves

### 5. State Persistence
- Full game state saved after every action
- State is JSON-serializable
- Can resume from any saved state

## API Endpoints

### `POST /games`
Create a new game with specified players.

**Request:**
```json
{
  "playerCount": 3,
  "playerNames": ["Alice", "Bob", "Charlie"]
}
```

**Response:**
```json
{
  "success": true,
  "game": { ...full game state... }
}
```

### `GET /games/:id`
Retrieve current game state.

**Response:**
```json
{
  "success": true,
  "game": { ...full game state... }
}
```

### `POST /games/:id/actions`
Submit a player action.

**Request:**
```json
{
  "action": {
    "type": "PLAY_MERCHANT_CARD",
    "playerId": "player_1",
    "timestamp": 1737216000000,
    "cardId": "start-player_1-1"
  }
}
```

**Response:**
```json
{
  "success": true,
  "game": { ...updated game state... }
}
```

## File Structure

```
src/api/
├── types.ts           # API request/response types
├── storage.ts         # Game state persistence (abstracted)
├── gameService.ts     # Business logic layer
├── controllers.ts     # Framework-agnostic controllers
└── expressAdapter.ts  # Express.js integration example
```

## Integration with Engine

The API layer uses the engine's pure functions:

```typescript
// From engine
import { createGame } from '../setup/gameSetup';
import { validateAction } from '../engine/validation';
import { applyAction } from '../engine/actionResolver';

// In service layer
async submitAction(gameId: string, action: GameAction): Promise<Game> {
  const game = await this.storage.getGame(gameId);
  
  // Use engine validator (pure function)
  const validation = validateAction(game, action);
  if (!validation.valid) throw new Error(validation.error);
  
  // Use engine resolver (pure function)
  const newGame = applyAction(game, action);
  
  // Persist result
  await this.storage.updateGame(newGame);
  return newGame;
}
```

## Running the Server

### Development (In-Memory Storage)

```bash
# Install Express (if not already installed)
npm install express @types/express

# Create server entry point
# src/server.ts
import { createServer } from './api/expressAdapter';

const server = createServer();
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

# Run with ts-node
npx ts-node src/server.ts

# Or build and run
npm run build
node dist/server.js
```

### Production (Database Storage)

Implement the `GameStorage` interface for your database:

```typescript
// src/api/postgresStorage.ts
export class PostgresGameStorage implements GameStorage {
  async createGame(game: Game): Promise<void> {
    await db.query(
      'INSERT INTO games (id, state) VALUES ($1, $2)',
      [game.id, JSON.stringify(game)]
    );
  }
  
  async getGame(gameId: string): Promise<Game | null> {
    const result = await db.query(
      'SELECT state FROM games WHERE id = $1',
      [gameId]
    );
    return result.rows[0]?.state || null;
  }
  
  // ... implement other methods
}
```

## Error Handling

All errors are returned with consistent structure:

```json
{
  "success": false,
  "error": "Not your turn. Current player: Alice",
  "code": "NOT_YOUR_TURN",
  "details": {
    "currentPlayerId": "player_1",
    "attemptedPlayerId": "player_3"
  }
}
```

**Error Codes:**
- `GAME_NOT_FOUND` (404): Game doesn't exist
- `INVALID_REQUEST` (400): Malformed request
- `VALIDATION_FAILED` (400): Action violates game rules
- `NOT_YOUR_TURN` (403): Not current player
- `DUPLICATE_ACTION` (409): Action already processed
- `INTERNAL_ERROR` (500): Server error

## Testing

The API can be tested using the existing game engine tests plus integration tests:

```typescript
// Example integration test
import { GameService } from './api/gameService';
import { InMemoryGameStorage } from './api/storage';

test('Complete game flow', async () => {
  const storage = new InMemoryGameStorage();
  const service = new GameService(storage);
  
  // Create game
  const game = await service.createNewGame(2, ['Alice', 'Bob']);
  
  // Alice plays card
  const action1 = {
    type: ActionType.PlayMerchantCard,
    playerId: game.players[0].id,
    timestamp: Date.now(),
    cardId: game.players[0].hand[0].id
  };
  const updated1 = await service.submitAction(game.id, action1);
  
  // Verify state changed
  expect(updated1.players[0].playArea).toHaveLength(1);
  
  // Try duplicate - should fail
  await expect(
    service.submitAction(game.id, action1)
  ).rejects.toThrow('already processed');
});
```

## Security Considerations

### Authentication (Not Implemented)
Add authentication middleware to verify player identity:

```typescript
// Example with JWT
router.post('/games/:id/actions', 
  authenticateJWT,  // Verify token
  authorizePlayer,  // Check playerId matches token
  async (req, res) => {
    // ... handle action
  }
);
```

### Rate Limiting
Add rate limiting to prevent abuse:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 60               // 60 actions per minute
});

app.use('/api', limiter);
```

### Input Validation
Validate request bodies with a schema validator:

```typescript
import Joi from 'joi';

const createGameSchema = Joi.object({
  playerCount: Joi.number().min(2).max(5).required(),
  playerNames: Joi.array().items(Joi.string()).required()
});
```

## Scaling Considerations

### Horizontal Scaling
- Use external storage (PostgreSQL, MongoDB)
- Share storage across multiple API servers
- Add Redis for caching frequently accessed games

### Real-Time Updates
- Add WebSocket support for live game updates
- Broadcast state changes to all players
- Keep REST API for action submission

```typescript
// Example with Socket.io
io.on('connection', (socket) => {
  socket.on('join-game', (gameId) => {
    socket.join(gameId);
  });
});

// After action applied
io.to(gameId).emit('game-updated', newGame);
```

## See Also

- [API_EXAMPLES.md](../API_EXAMPLES.md) - Full request/response examples
- [CODE_REVIEW.md](../CODE_REVIEW.md) - Engine code quality review
- [README.md](../README.md) - Game engine documentation
