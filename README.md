# Century: Golem Edition - Game Engine

A rules-accurate, async, server-authoritative digital implementation of the board game Century: Golem Edition (2024).

## Architecture

- **Pure TypeScript** - No UI, no dependencies, fully testable
- **Server-authoritative** - All validation happens server-side
- **Deterministic** - Same seed = same game state
- **Async-ready** - Supports turn-based play with explicit state transitions
- **Immutable** - All state updates return new objects

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

## License

MIT
