# REST API Examples

This document provides example HTTP requests and responses for the Century: Golem Edition game API.

---

## Base URL

```
http://localhost:3000/api
```

---

## 1. Create New Game

### Endpoint
```
POST /games
```

### Request Body
```json
{
  "playerCount": 3,
  "playerNames": ["Alice", "Bob", "Charlie"],
  "seed": 42
}
```

**Fields:**
- `playerCount` (number, required): Number of players (2-5)
- `playerNames` (string[], required): Array of player names (length must equal playerCount)
- `seed` (number, optional): Seed for deterministic game setup (useful for testing)

### Success Response (201 Created)
```json
{
  "success": true,
  "game": {
    "id": "game_abc123xyz",
    "phase": "PLAYING",
    "players": [
      {
        "id": "player_1",
        "name": "Alice",
        "hand": [
          {
            "id": "start-player_1-1",
            "type": "PRODUCE",
            "produces": { "YELLOW": 2, "GREEN": 0, "RED": 0, "BLUE": 0 }
          },
          {
            "id": "start-player_1-2",
            "type": "UPGRADE",
            "upgrades": [{ "count": 2, "times": 1 }]
          }
        ],
        "playArea": [],
        "caravan": { "YELLOW": 3, "GREEN": 0, "RED": 0, "BLUE": 0 },
        "pointCards": [],
        "score": 0,
        "isFirstPlayer": true
      },
      {
        "id": "player_2",
        "name": "Bob",
        "hand": [...],
        "playArea": [],
        "caravan": { "YELLOW": 3, "GREEN": 0, "RED": 0, "BLUE": 0 },
        "pointCards": [],
        "score": 0,
        "isFirstPlayer": false
      },
      {
        "id": "player_3",
        "name": "Charlie",
        "hand": [...],
        "playArea": [],
        "caravan": { "YELLOW": 3, "GREEN": 0, "RED": 0, "BLUE": 0 },
        "pointCards": [],
        "score": 0,
        "isFirstPlayer": false
      }
    ],
    "currentPlayerIndex": 0,
    "merchantDeck": [...],
    "merchantRow": {
      "cards": [
        { "id": "m8", "type": "PRODUCE", "produces": {...} },
        { "id": "m15", "type": "UPGRADE", "upgrades": [...] },
        { "id": "m23", "type": "TRADE", "gives": {...}, "receives": {...} },
        { "id": "m31", "type": "TRADE", "gives": {...}, "receives": {...} },
        { "id": "m42", "type": "PRODUCE", "produces": {...} },
        { "id": "m7", "type": "UPGRADE", "upgrades": [...] }
      ],
      "maxSize": 6
    },
    "pointCardDeck": [...],
    "pointCardRow": {
      "cards": [
        { "id": "p1", "points": 6, "cost": {...}, "bonusCrystals": {...} },
        { "id": "p2", "points": 7, "cost": {...}, "bonusCrystals": {...} },
        { "id": "p3", "points": 8, "cost": {...}, "bonusCrystals": {...} },
        { "id": "p4", "points": 9, "cost": {...}, "bonusCrystals": {...} },
        { "id": "p5", "points": 10, "cost": {...}, "bonusCrystals": {...} }
      ],
      "maxSize": 5
    },
    "turnNumber": 1,
    "endGameTriggered": false,
    "endGameTriggerPlayerIndex": null,
    "finalRoundComplete": false,
    "winnerId": null,
    "createdAt": 1737216000000,
    "updatedAt": 1737216000000
  }
}
```

### Error Response (400 Bad Request)
```json
{
  "success": false,
  "error": "Player count must be between 2 and 5",
  "code": "INVALID_REQUEST"
}
```

---

## 2. Get Game State

### Endpoint
```
GET /games/:id
```

### Request
```
GET /games/game_abc123xyz
```

### Success Response (200 OK)
```json
{
  "success": true,
  "game": {
    "id": "game_abc123xyz",
    "phase": "PLAYING",
    "players": [...],
    "currentPlayerIndex": 1,
    "merchantDeck": [...],
    "merchantRow": {...},
    "pointCardDeck": [...],
    "pointCardRow": {...},
    "turnNumber": 5,
    "endGameTriggered": false,
    "endGameTriggerPlayerIndex": null,
    "finalRoundComplete": false,
    "winnerId": null,
    "createdAt": 1737216000000,
    "updatedAt": 1737216120000
  }
}
```

### Error Response (404 Not Found)
```json
{
  "success": false,
  "error": "Game game_abc123xyz not found",
  "code": "GAME_NOT_FOUND"
}
```

---

## 3. Submit Action

### Endpoint
```
POST /games/:id/actions
```

---

### Example 3.1: Play Produce Card

**Request:**
```json
{
  "action": {
    "type": "PLAY_MERCHANT_CARD",
    "playerId": "player_1",
    "timestamp": 1737216060000,
    "cardId": "start-player_1-1"
  }
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "game": {
    "id": "game_abc123xyz",
    "phase": "PLAYING",
    "players": [
      {
        "id": "player_1",
        "name": "Alice",
        "hand": [
          {
            "id": "start-player_1-2",
            "type": "UPGRADE",
            "upgrades": [{ "count": 2, "times": 1 }]
          }
        ],
        "playArea": [
          {
            "id": "start-player_1-1",
            "type": "PRODUCE",
            "produces": { "YELLOW": 2, "GREEN": 0, "RED": 0, "BLUE": 0 }
          }
        ],
        "caravan": { "YELLOW": 5, "GREEN": 0, "RED": 0, "BLUE": 0 },
        "pointCards": [],
        "score": 0,
        "isFirstPlayer": true
      },
      ...
    ],
    "currentPlayerIndex": 0,
    "turnNumber": 1,
    "updatedAt": 1737216060000
  }
}
```

---

### Example 3.2: Play Upgrade Card

**Request:**
```json
{
  "action": {
    "type": "PLAY_MERCHANT_CARD",
    "playerId": "player_2",
    "timestamp": 1737216090000,
    "cardId": "start-player_2-2",
    "upgradeSelection": {
      "upgrades": [
        { "fromColor": "YELLOW", "toColor": "GREEN" },
        { "fromColor": "YELLOW", "toColor": "GREEN" }
      ]
    }
  }
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "game": {
    "id": "game_abc123xyz",
    "players": [
      ...,
      {
        "id": "player_2",
        "name": "Bob",
        "caravan": { "YELLOW": 1, "GREEN": 2, "RED": 0, "BLUE": 0 },
        "playArea": [
          {
            "id": "start-player_2-2",
            "type": "UPGRADE",
            "upgrades": [{ "count": 2, "times": 1 }]
          }
        ],
        ...
      }
    ],
    "updatedAt": 1737216090000
  }
}
```

---

### Example 3.3: Acquire Merchant Card

**Request:**
```json
{
  "action": {
    "type": "ACQUIRE_MERCHANT_CARD",
    "playerId": "player_1",
    "timestamp": 1737216120000,
    "rowIndex": 0,
    "cardId": "m8"
  }
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "game": {
    "id": "game_abc123xyz",
    "players": [
      {
        "id": "player_1",
        "name": "Alice",
        "hand": [
          { "id": "start-player_1-2", "type": "UPGRADE", ... },
          { "id": "m8", "type": "PRODUCE", "produces": {...} }
        ],
        "caravan": { "YELLOW": 5, "GREEN": 0, "RED": 0, "BLUE": 0 },
        ...
      }
    ],
    "merchantRow": {
      "cards": [
        { "id": "m15", "type": "UPGRADE", ... },
        { "id": "m23", "type": "TRADE", ... },
        { "id": "m31", "type": "TRADE", ... },
        { "id": "m42", "type": "PRODUCE", ... },
        { "id": "m7", "type": "UPGRADE", ... },
        { "id": "m19", "type": "TRADE", ... }
      ],
      "maxSize": 6
    },
    "updatedAt": 1737216120000
  }
}
```

---

### Example 3.4: Claim Point Card

**Request:**
```json
{
  "action": {
    "type": "CLAIM_POINT_CARD",
    "playerId": "player_3",
    "timestamp": 1737216150000,
    "rowIndex": 0,
    "cardId": "p1",
    "payment": { "YELLOW": 0, "GREEN": 2, "RED": 1, "BLUE": 0 }
  }
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "game": {
    "id": "game_abc123xyz",
    "players": [
      ...,
      {
        "id": "player_3",
        "name": "Charlie",
        "caravan": { "YELLOW": 0, "GREEN": 1, "RED": 0, "BLUE": 0 },
        "pointCards": [
          { 
            "id": "p1", 
            "points": 6, 
            "cost": { "YELLOW": 0, "GREEN": 2, "RED": 1, "BLUE": 0 },
            "bonusCrystals": { "YELLOW": 0, "GREEN": 0, "RED": 0, "BLUE": 0 }
          }
        ],
        "score": 6,
        ...
      }
    ],
    "pointCardRow": {
      "cards": [
        { "id": "p2", "points": 7, ... },
        { "id": "p3", "points": 8, ... },
        { "id": "p4", "points": 9, ... },
        { "id": "p5", "points": 10, ... },
        { "id": "p6", "points": 11, ... }
      ],
      "maxSize": 5
    },
    "updatedAt": 1737216150000
  }
}
```

---

### Example 3.5: Rest (Recover Cards)

**Request:**
```json
{
  "action": {
    "type": "REST",
    "playerId": "player_1",
    "timestamp": 1737216180000
  }
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "game": {
    "id": "game_abc123xyz",
    "players": [
      {
        "id": "player_1",
        "name": "Alice",
        "hand": [
          { "id": "start-player_1-2", "type": "UPGRADE", ... },
          { "id": "m8", "type": "PRODUCE", ... },
          { "id": "start-player_1-1", "type": "PRODUCE", ... }
        ],
        "playArea": [],
        "caravan": { "YELLOW": 5, "GREEN": 0, "RED": 0, "BLUE": 0 },
        ...
      }
    ],
    "updatedAt": 1737216180000
  }
}
```

---

## Error Responses

### 3.6: Wrong Turn

**Request:**
```json
{
  "action": {
    "type": "PLAY_MERCHANT_CARD",
    "playerId": "player_3",
    "timestamp": 1737216210000,
    "cardId": "start-player_3-1"
  }
}
```

**Error Response (403 Forbidden):**
```json
{
  "success": false,
  "error": "Not your turn. Current player: Alice",
  "code": "NOT_YOUR_TURN",
  "details": {
    "currentPlayerId": "player_1",
    "currentPlayerName": "Alice",
    "attemptedPlayerId": "player_3"
  }
}
```

---

### 3.7: Validation Failed

**Request:**
```json
{
  "action": {
    "type": "ACQUIRE_MERCHANT_CARD",
    "playerId": "player_1",
    "timestamp": 1737216240000,
    "rowIndex": 2,
    "cardId": "m23"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "Insufficient yellow crystals to acquire card. Need 2, have 0",
  "code": "VALIDATION_FAILED",
  "details": {
    "validationCode": "INSUFFICIENT_CRYSTALS"
  }
}
```

---

### 3.8: Duplicate Action (Idempotency)

**Request:**
```json
{
  "action": {
    "type": "REST",
    "playerId": "player_1",
    "timestamp": 1737216180000
  }
}
```

**Error Response (409 Conflict):**
```json
{
  "success": false,
  "error": "Action already processed (duplicate submission)",
  "code": "DUPLICATE_ACTION"
}
```

---

### 3.9: Invalid Card ID

**Request:**
```json
{
  "action": {
    "type": "PLAY_MERCHANT_CARD",
    "playerId": "player_1",
    "timestamp": 1737216270000,
    "cardId": "nonexistent-card-99"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "Card nonexistent-card-99 not found in hand",
  "code": "VALIDATION_FAILED",
  "details": {
    "validationCode": "CARD_NOT_IN_HAND"
  }
}
```

---

### 3.10: Game Finished

**Request:**
```json
{
  "action": {
    "type": "PLAY_MERCHANT_CARD",
    "playerId": "player_1",
    "timestamp": 1737216300000,
    "cardId": "start-player_1-1"
  }
}
```

**Error Response (403 Forbidden):**
```json
{
  "success": false,
  "error": "Game is in FINISHED phase, cannot accept actions",
  "code": "GAME_NOT_PLAYING"
}
```

---

## API Guarantees

### Idempotency
- Actions are identified by `playerId + timestamp`
- Submitting the same action twice returns `409 DUPLICATE_ACTION`
- Clients can retry safely on network failures

### Turn Enforcement
- Only the current player can submit actions
- Other players receive `403 NOT_YOUR_TURN`
- Turn order is maintained server-side

### Atomicity
- Actions either fully succeed or fully fail
- No partial state updates
- State is consistent after every action

### Determinism
- Same actions always produce same results
- Game state is fully serializable
- Can be saved/restored at any point

---

## Client Integration Example

```typescript
class GameClient {
  private baseUrl = 'http://localhost:3000/api';
  
  async createGame(
    playerCount: number,
    playerNames: string[]
  ): Promise<Game> {
    const response = await fetch(`${this.baseUrl}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerCount, playerNames })
    });
    
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.game;
  }
  
  async getGame(gameId: string): Promise<Game> {
    const response = await fetch(`${this.baseUrl}/games/${gameId}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.game;
  }
  
  async submitAction(
    gameId: string,
    action: GameAction
  ): Promise<Game> {
    // Add timestamp for idempotency
    const actionWithTimestamp = {
      ...action,
      timestamp: Date.now()
    };
    
    const response = await fetch(
      `${this.baseUrl}/games/${gameId}/actions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionWithTimestamp })
      }
    );
    
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.game;
  }
}
```

---

## Testing with cURL

### Create Game
```bash
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{
    "playerCount": 2,
    "playerNames": ["Alice", "Bob"]
  }'
```

### Get Game
```bash
curl http://localhost:3000/api/games/game_abc123xyz
```

### Submit Action
```bash
curl -X POST http://localhost:3000/api/games/game_abc123xyz/actions \
  -H "Content-Type: application/json" \
  -d '{
    "action": {
      "type": "PLAY_MERCHANT_CARD",
      "playerId": "player_1",
      "timestamp": 1737216000000,
      "cardId": "start-player_1-1"
    }
  }'
```
