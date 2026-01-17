# REST API Quick Reference

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/games` | Create new game |
| GET | `/games/:id` | Get game state |
| POST | `/games/:id/actions` | Submit player action |

---

## Create Game

```http
POST /api/games
Content-Type: application/json

{
  "playerCount": 3,
  "playerNames": ["Alice", "Bob", "Charlie"]
}
```

**Response (201):**
```json
{
  "success": true,
  "game": {
    "id": "game_abc123",
    "phase": "PLAYING",
    "players": [...],
    "currentPlayerIndex": 0,
    ...
  }
}
```

---

## Get Game State

```http
GET /api/games/game_abc123
```

**Response (200):**
```json
{
  "success": true,
  "game": { ... }
}
```

---

## Submit Action

### Play Produce Card
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

### Play Upgrade Card
```json
{
  "action": {
    "type": "PLAY_MERCHANT_CARD",
    "playerId": "player_1",
    "timestamp": 1737216000000,
    "cardId": "start-player_1-2",
    "upgradeSelection": {
      "upgrades": [
        { "fromColor": "YELLOW", "toColor": "GREEN" },
        { "fromColor": "YELLOW", "toColor": "GREEN" }
      ]
    }
  }
}
```

### Acquire Merchant Card
```json
{
  "action": {
    "type": "ACQUIRE_MERCHANT_CARD",
    "playerId": "player_1",
    "timestamp": 1737216000000,
    "rowIndex": 0,
    "cardId": "m8"
  }
}
```

### Claim Point Card
```json
{
  "action": {
    "type": "CLAIM_POINT_CARD",
    "playerId": "player_1",
    "timestamp": 1737216000000,
    "rowIndex": 0,
    "cardId": "p1",
    "payment": { "YELLOW": 0, "GREEN": 2, "RED": 1, "BLUE": 0 }
  }
}
```

### Rest (Recover Cards)
```json
{
  "action": {
    "type": "REST",
    "playerId": "player_1",
    "timestamp": 1737216000000
  }
}
```

---

## Error Responses

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `INVALID_REQUEST` | Malformed request |
| 400 | `VALIDATION_FAILED` | Action violates rules |
| 403 | `NOT_YOUR_TURN` | Not current player |
| 404 | `GAME_NOT_FOUND` | Game doesn't exist |
| 409 | `DUPLICATE_ACTION` | Already processed |
| 500 | `INTERNAL_ERROR` | Server error |

**Example:**
```json
{
  "success": false,
  "error": "Not your turn. Current player: Alice",
  "code": "NOT_YOUR_TURN"
}
```

---

## Server Setup

```typescript
import { createServer } from './api/expressAdapter';

const server = createServer();
server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

---

## Client Example

```typescript
async function playGame() {
  const baseUrl = 'http://localhost:3000/api';
  
  // 1. Create game
  const createRes = await fetch(`${baseUrl}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerCount: 2,
      playerNames: ['Alice', 'Bob']
    })
  });
  const { game } = await createRes.json();
  
  // 2. Play card
  const actionRes = await fetch(`${baseUrl}/games/${game.id}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: {
        type: 'PLAY_MERCHANT_CARD',
        playerId: game.players[0].id,
        timestamp: Date.now(),
        cardId: game.players[0].hand[0].id
      }
    })
  });
  const { game: updatedGame } = await actionRes.json();
  
  console.log('Card played!', updatedGame);
}
```

---

## Architecture

```
Client → Express → Controller → Service → Engine
                                    ↓
                                 Storage
```

**Key Points:**
- Server is authoritative
- Engine functions are pure (no mutations)
- Actions validated before application
- State persisted after every action
- Idempotency via timestamp deduplication
- Turn ownership enforced server-side

---

## Files

- `src/api/types.ts` - Request/response types
- `src/api/storage.ts` - State persistence
- `src/api/gameService.ts` - Business logic
- `src/api/controllers.ts` - Request handlers
- `src/api/expressAdapter.ts` - Express integration
- `API_EXAMPLES.md` - Full examples with curl
