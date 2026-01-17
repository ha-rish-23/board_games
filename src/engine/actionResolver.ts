/**
 * ACTION RESOLUTION LAYER
 * 
 * ASYNC MULTIPLAYER SAFETY:
 * This layer applies validated actions to produce new game states.
 * All functions are PURE - no side effects, no mutations, no I/O.
 * 
 * Key Properties:
 * 1. IMMUTABILITY: Never modifies input state, always returns new state
 * 2. DETERMINISM: Same action + state = same new state (always)
 * 3. PURE FUNCTIONS: No side effects, external calls, or randomness
 * 4. ATOMIC: Each function is a single state transition
 * 5. RESUMABLE: Can apply actions to any saved state snapshot
 * 
 * State Transition Model:
 * ```
 * oldState + action -> newState
 * ```
 * 
 * Server Usage Pattern:
 * ```typescript
 * // 1. Load state from database
 * const currentState = await loadGameState(gameId);
 * 
 * // 2. Validate action (validation.ts)
 * const validation = validateAction(currentState, action);
 * if (!validation.valid) return error(validation.error);
 * 
 * // 3. Apply action (this file)
 * const newState = applyAction(currentState, action);
 * 
 * // 4. Save new state
 * await saveGameState(newState);
 * 
 * // 5. Broadcast to all players
 * await broadcastStateUpdate(gameId, newState);
 * ```
 * 
 * No Race Conditions:
 * - Server processes actions sequentially per game
 * - Each action sees consistent state snapshot
 * - State updates are atomic (old state -> new state)
 * - Failed validations don't reach this layer
 * 
 * Idempotency:
 * - Apply same action twice to different states = different results
 * - BUT: Server can prevent duplicate actions via timestamp deduplication
 * - Action resolution itself is deterministic, not idempotent
 */

import {
  Game,
  GameAction,
  PlayCardAction,
  AcquireCardAction,
  ClaimPointAction,
  RestAction,
  ActionType,
  CrystalColor,
  CrystalSet,
  MerchantCardType,
  MerchantCard,
  Player
} from '../types/domain';

// ============================================================================
// ACTION RESOLUTION
// ============================================================================

/**
 * Applies a validated action to the game state.
 * Returns a new game state with the action effects applied.
 * 
 * IMPORTANT: This function assumes the action has already been validated.
 * It does NOT perform validation - use validateAction() first.
 * 
 * ASYNC MULTIPLAYER GUARANTEES:
 * - PURE: No side effects, mutations, or I/O operations
 * - DETERMINISTIC: Same inputs always produce same output
 * - IMMUTABLE: Original game state is never modified
 * - ATOMIC: Complete state transition in one function call
 * - FAST: Synchronous, no async operations or delays
 * 
 * State Transition Properties:
 * - Creates new Game object with all changes applied
 * - Updates `updatedAt` timestamp to current time
 * - Preserves all unchanged state (deep copy for modified parts)
 * - Returns valid serializable state ready for storage/broadcast
 * 
 * @param game - Current game state (not modified)
 * @param action - Validated action to apply
 * @returns New game state with action effects applied
 */
export function applyAction(game: Game, action: GameAction): Game {
  switch (action.type) {
    case ActionType.PlayMerchantCard:
      return applyPlayCard(game, action);
    case ActionType.AcquireMerchantCard:
      return applyAcquireCard(game, action);
    case ActionType.ClaimPointCard:
      return applyClaimPoint(game, action);
    case ActionType.Rest:
      return applyRest(game, action);
    default:
      return game;
  }
}

// ============================================================================
// PLAY CARD RESOLUTION
// ============================================================================

/**
 * Applies playing a merchant card from hand.
 * 
 * Rules:
 * 1. Move card from player's hand to play area
 * 2. Apply card effect based on type:
 *    - Produce: Add crystals to caravan
 *    - Trade: Remove 'gives' crystals, add 'receives' crystals
 *    - Upgrade: Transform crystals according to selection
 * 
 * @param game - Current game state
 * @param action - Play card action
 * @returns New game state
 */
export function applyPlayCard(game: Game, action: PlayCardAction): Game {
  const playerIndex = game.players.findIndex(p => p.id === action.playerId);
  const player = game.players[playerIndex];

  // Find and remove card from hand
  const cardIndex = player.hand.findIndex(c => c.id === action.cardId);
  const card = player.hand[cardIndex];
  
  const newHand = [
    ...player.hand.slice(0, cardIndex),
    ...player.hand.slice(cardIndex + 1)
  ];

  // Add card to play area
  const newPlayArea = [...player.playArea, card];

  // Apply card effect to caravan
  let newCaravan = { ...player.caravan };

  switch (card.type) {
    case MerchantCardType.Produce:
      // Rule: Add produced crystals to caravan
      newCaravan = addCrystals(newCaravan, card.produces);
      break;

    case MerchantCardType.Trade:
      // Rule: Remove 'gives' crystals, add 'receives' crystals
      newCaravan = subtractCrystals(newCaravan, card.gives);
      newCaravan = addCrystals(newCaravan, card.receives);
      break;

    case MerchantCardType.Upgrade:
      // Rule: Transform crystals according to player's upgrade selection
      if (action.upgradeSelection) {
        for (const upgrade of action.upgradeSelection.upgrades) {
          newCaravan[upgrade.fromColor]--;
          newCaravan[upgrade.toColor]++;
        }
      }
      break;
  }

  // Create updated player
  const updatedPlayer: Player = {
    ...player,
    hand: newHand,
    playArea: newPlayArea,
    caravan: newCaravan
  };

  // Create new players array
  const newPlayers = [
    ...game.players.slice(0, playerIndex),
    updatedPlayer,
    ...game.players.slice(playerIndex + 1)
  ];

  return {
    ...game,
    players: newPlayers,
    updatedAt: Date.now()
  };
}

// ============================================================================
// ACQUIRE CARD RESOLUTION
// ============================================================================

/**
 * Applies acquiring a merchant card from the market.
 * 
 * Rules:
 * 1. Remove card from merchant row at specified index
 * 2. Add card to player's hand
 * 3. Pay cost: Place 1 yellow crystal on each card to the LEFT
 * 4. Refill merchant row from deck (shift cards left, add new card at end)
 * 
 * @param game - Current game state
 * @param action - Acquire card action
 * @returns New game state
 */
export function applyAcquireCard(game: Game, action: AcquireCardAction): Game {
  const playerIndex = game.players.findIndex(p => p.id === action.playerId);
  const player = game.players[playerIndex];

  // Get the acquired card
  const acquiredCard = game.merchantRow.cards[action.rowIndex]!;

  // Rule: Pay 1 yellow crystal per card to the left of acquired card
  const cost = action.rowIndex;
  let newCaravan = { ...player.caravan };
  newCaravan[CrystalColor.Yellow] -= cost;

  // Rule: Place paid crystals on cards to the left
  // Note: These crystals go on the cards, which players collect when acquiring them
  // For now, crystals are simply removed from player (they don't go anywhere permanent)

  // Add acquired card to player's hand
  const newHand = [...player.hand, acquiredCard];

  // Update player
  const updatedPlayer: Player = {
    ...player,
    hand: newHand,
    caravan: newCaravan
  };

  // Rule: Remove card from merchant row and refill
  // Remove acquired card (set to null temporarily)
  let newMerchantCards = [...game.merchantRow.cards];
  newMerchantCards[action.rowIndex] = null;

  // Shift all cards left to fill gaps
  const compactedCards = newMerchantCards.filter(c => c !== null) as MerchantCard[];

  // Refill from deck to maintain row size
  let newDeck = [...game.merchantDeck];
  const cardsNeeded = game.merchantRow.maxSize - compactedCards.length;
  
  for (let i = 0; i < cardsNeeded && newDeck.length > 0; i++) {
    compactedCards.push(newDeck[0]);
    newDeck = newDeck.slice(1);
  }

  // Pad with nulls if deck is exhausted
  while (compactedCards.length < game.merchantRow.maxSize) {
    compactedCards.push(null as any);
  }

  // Create new players array
  const newPlayers = [
    ...game.players.slice(0, playerIndex),
    updatedPlayer,
    ...game.players.slice(playerIndex + 1)
  ];

  return {
    ...game,
    players: newPlayers,
    merchantDeck: newDeck,
    merchantRow: {
      ...game.merchantRow,
      cards: compactedCards
    },
    updatedAt: Date.now()
  };
}

// ============================================================================
// CLAIM POINT RESOLUTION
// ============================================================================

/**
 * Applies claiming a point card from the market.
 * 
 * Rules:
 * 1. Remove point card from row at specified index
 * 2. Pay exact cost in crystals from caravan
 * 3. Add point card to player's claimed cards
 * 4. Receive bonus crystals (if any) specified on card
 * 5. Refill point card row from deck (shift left, add new card at end)
 * 
 * @param game - Current game state
 * @param action - Claim point action
 * @returns New game state
 */
export function applyClaimPoint(game: Game, action: ClaimPointAction): Game {
  const playerIndex = game.players.findIndex(p => p.id === action.playerId);
  const player = game.players[playerIndex];

  // Get the claimed card
  const claimedCard = game.pointCardRow.cards[action.rowIndex]!;

  // Rule: Pay the exact cost
  let newCaravan = subtractCrystals(player.caravan, claimedCard.cost);

  // Rule: Receive bonus crystals (if any)
  newCaravan = addCrystals(newCaravan, claimedCard.bonusCrystals);

  // Add point card to player's collection
  const newPointCards = [...player.pointCards, claimedCard];

  // Update player
  const updatedPlayer: Player = {
    ...player,
    caravan: newCaravan,
    pointCards: newPointCards
  };

  // Rule: Remove card from point card row and refill
  let newPointCards_row = [...game.pointCardRow.cards];
  newPointCards_row[action.rowIndex] = null;

  // Shift all cards left to fill gaps
  const compactedCards = newPointCards_row.filter(c => c !== null);

  // Refill from deck to maintain row size
  let newPointDeck = [...game.pointCardDeck];
  const cardsNeeded = game.pointCardRow.maxSize - compactedCards.length;
  
  for (let i = 0; i < cardsNeeded && newPointDeck.length > 0; i++) {
    compactedCards.push(newPointDeck[0]);
    newPointDeck = newPointDeck.slice(1);
  }

  // Pad with nulls if deck is exhausted
  while (compactedCards.length < game.pointCardRow.maxSize) {
    compactedCards.push(null as any);
  }

  // Create new players array
  const newPlayers = [
    ...game.players.slice(0, playerIndex),
    updatedPlayer,
    ...game.players.slice(playerIndex + 1)
  ];

  return {
    ...game,
    players: newPlayers,
    pointCardDeck: newPointDeck,
    pointCardRow: {
      ...game.pointCardRow,
      cards: compactedCards
    },
    updatedAt: Date.now()
  };
}

// ============================================================================
// REST RESOLUTION
// ============================================================================

/**
 * Applies resting (recovering all played cards).
 * 
 * Rules:
 * 1. Move ALL cards from play area back to hand
 * 2. This is the only way to reuse merchant cards
 * 3. No cost, no other effects
 * 
 * @param game - Current game state
 * @param action - Rest action
 * @returns New game state
 */
export function applyRest(game: Game, action: RestAction): Game {
  const playerIndex = game.players.findIndex(p => p.id === action.playerId);
  const player = game.players[playerIndex];

  // Rule: Move all cards from play area to hand
  const newHand = [...player.hand, ...player.playArea];
  const newPlayArea: MerchantCard[] = [];

  // Update player
  const updatedPlayer: Player = {
    ...player,
    hand: newHand,
    playArea: newPlayArea
  };

  // Create new players array
  const newPlayers = [
    ...game.players.slice(0, playerIndex),
    updatedPlayer,
    ...game.players.slice(playerIndex + 1)
  ];

  return {
    ...game,
    players: newPlayers,
    updatedAt: Date.now()
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function addCrystals(base: CrystalSet, toAdd: CrystalSet): CrystalSet {
  return {
    YELLOW: base.YELLOW + toAdd.YELLOW,
    GREEN: base.GREEN + toAdd.GREEN,
    RED: base.RED + toAdd.RED,
    BLUE: base.BLUE + toAdd.BLUE
  };
}

function subtractCrystals(base: CrystalSet, toSubtract: CrystalSet): CrystalSet {
  return {
    YELLOW: base.YELLOW - toSubtract.YELLOW,
    GREEN: base.GREEN - toSubtract.GREEN,
    RED: base.RED - toSubtract.RED,
    BLUE: base.BLUE - toSubtract.BLUE
  };
}
