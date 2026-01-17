/**
 * GAME SETUP - Initial state creation
 * 
 * ASYNC MULTIPLAYER SAFETY:
 * This is the ONLY place where randomness occurs in the entire game.
 * After setup completes, the game is fully deterministic.
 * 
 * Key Properties:
 * 1. DETERMINISTIC: Same seed + players = identical game state
 * 2. REPRODUCIBLE: Can recreate exact game for testing/replay
 * 3. ATOMIC: Setup creates complete initial state in one call
 * 4. SERIALIZABLE: Resulting state is fully JSON-safe
 * 5. SEED-BASED: Randomness controlled by seed parameter
 * 
 * Why Seeded Randomness:
 * - Enables game replay/debugging (use same seed)
 * - Allows fair tournaments (everyone gets same card distribution)
 * - Server can verify game setup integrity
 * - Clients can't manipulate randomness
 * - Tests are reproducible and reliable
 * 
 * Async Usage Pattern:
 * ```typescript
 * // Server creates new game:
 * const seed = generateSecureSeed(); // e.g., UUID or timestamp
 * const players = [{id: 'p1', name: 'Alice'}, {id: 'p2', name: 'Bob'}];
 * const initialState = createNewGame(players, seed);
 * 
 * // Save to database:
 * await saveGameState(initialState);
 * 
 * // Broadcast to all players:
 * await notifyPlayers(initialState.players, initialState);
 * ```
 * 
 * After Setup:
 * - All randomness is exhausted (cards shuffled, coins placed)
 * - Game proceeds deterministically based on player actions
 * - No more random events (dice, draws from shuffled deck are deterministic)
 * - State can be saved/loaded/replayed without randomness concerns
 */

import {
  Game,
  Player,
  MerchantCard,
  PointCard,
  CrystalColor,
  GamePhase,
  MerchantCardType,
  CrystalSet,
  GameConfig
} from '../types/domain';

// ============================================================================
// TYPES
// ============================================================================

export type PlayerInput = {
  id: string;
  name: string;
};

// ============================================================================
// GAME CONSTANTS
// ============================================================================

// Standard game configuration for 2-5 players
const DEFAULT_CONFIG: GameConfig = {
  playerCount: 2,
  caravanCapacity: 10,
  merchantRowSize: 6,
  pointCardRowSize: 5,
  pointCardsToTriggerEnd: 5 // 4 in 2-3 player, 5 in 4+ player
};

// Coin values placed on point cards during setup
const COPPER_COIN_VALUE = 1;
const SILVER_COIN_VALUE = 3;

// ============================================================================
// DETERMINISTIC SHUFFLE
// ============================================================================

/**
 * Simple LCG-based PRNG for deterministic shuffling.
 * Uses seed string to generate reproducible random sequence.
 */
function createSeededRandom(seed: string): () => number {
  let state = 0;
  for (let i = 0; i < seed.length; i++) {
    state = ((state << 5) - state + seed.charCodeAt(i)) | 0;
  }
  state = Math.abs(state);

  return function() {
    state = (state * 1664525 + 1013904223) | 0;
    return Math.abs(state) / 2147483648;
  };
}

/**
 * Fisher-Yates shuffle using seeded random generator.
 */
function shuffleArray<T>(array: T[], random: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// CARD CREATION
// ============================================================================

/**
 * Creates the full merchant deck according to the rulebook.
 * 
 * Assumptions based on Century: Golem Edition rulebook:
 * - Produce cards: Various combinations producing 1-4 yellow/green crystals
 * - Upgrade cards: Single and double upgrades, various configurations
 * - Trade cards: Various exchange patterns
 */
function createMerchantDeck(): MerchantCard[] {
  const cards: MerchantCard[] = [];
  let idCounter = 1;

  const emptyCrystals = (): CrystalSet => ({
    [CrystalColor.Yellow]: 0,
    [CrystalColor.Green]: 0,
    [CrystalColor.Red]: 0,
    [CrystalColor.Blue]: 0
  });

  // PRODUCE CARDS (8 cards)
  // 2 yellow
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Produce,
    produces: { ...emptyCrystals(), [CrystalColor.Yellow]: 2 }
  });
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Produce,
    produces: { ...emptyCrystals(), [CrystalColor.Yellow]: 2 }
  });
  
  // 3 yellow
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Produce,
    produces: { ...emptyCrystals(), [CrystalColor.Yellow]: 3 }
  });
  
  // 4 yellow
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Produce,
    produces: { ...emptyCrystals(), [CrystalColor.Yellow]: 4 }
  });
  
  // 1 green
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Produce,
    produces: { ...emptyCrystals(), [CrystalColor.Green]: 1 }
  });
  
  // 2 green
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Produce,
    produces: { ...emptyCrystals(), [CrystalColor.Green]: 2 }
  });
  
  // 1 yellow, 1 green
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Produce,
    produces: { ...emptyCrystals(), [CrystalColor.Yellow]: 1, [CrystalColor.Green]: 1 }
  });
  
  // 2 yellow, 1 green
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Produce,
    produces: { ...emptyCrystals(), [CrystalColor.Yellow]: 2, [CrystalColor.Green]: 1 }
  });

  // UPGRADE CARDS (14 cards)
  // Upgrade 2 once
  for (let i = 0; i < 5; i++) {
    cards.push({
      id: `m${idCounter++}`,
      type: MerchantCardType.Upgrade,
      upgrades: [{ count: 2, times: 1 }]
    });
  }
  
  // Upgrade 3 once
  for (let i = 0; i < 4; i++) {
    cards.push({
      id: `m${idCounter++}`,
      type: MerchantCardType.Upgrade,
      upgrades: [{ count: 3, times: 1 }]
    });
  }
  
  // Upgrade 1 twice
  for (let i = 0; i < 3; i++) {
    cards.push({
      id: `m${idCounter++}`,
      type: MerchantCardType.Upgrade,
      upgrades: [{ count: 1, times: 2 }]
    });
  }
  
  // Upgrade 2 twice
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Upgrade,
    upgrades: [{ count: 2, times: 2 }]
  });
  
  // Upgrade 1 three times
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Upgrade,
    upgrades: [{ count: 1, times: 3 }]
  });

  // TRADE CARDS (20 cards)
  // 2Y -> 2G
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: `m${idCounter++}`,
      type: MerchantCardType.Trade,
      gives: { ...emptyCrystals(), [CrystalColor.Yellow]: 2 },
      receives: { ...emptyCrystals(), [CrystalColor.Green]: 2 }
    });
  }
  
  // 3Y -> 3G
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Trade,
    gives: { ...emptyCrystals(), [CrystalColor.Yellow]: 3 },
    receives: { ...emptyCrystals(), [CrystalColor.Green]: 3 }
  });
  
  // 2Y -> 1R
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: `m${idCounter++}`,
      type: MerchantCardType.Trade,
      gives: { ...emptyCrystals(), [CrystalColor.Yellow]: 2 },
      receives: { ...emptyCrystals(), [CrystalColor.Red]: 1 }
    });
  }
  
  // 3Y -> 2R
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Trade,
    gives: { ...emptyCrystals(), [CrystalColor.Yellow]: 3 },
    receives: { ...emptyCrystals(), [CrystalColor.Red]: 2 }
  });
  
  // 2G -> 2R
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: `m${idCounter++}`,
      type: MerchantCardType.Trade,
      gives: { ...emptyCrystals(), [CrystalColor.Green]: 2 },
      receives: { ...emptyCrystals(), [CrystalColor.Red]: 2 }
    });
  }
  
  // 3G -> 3R
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Trade,
    gives: { ...emptyCrystals(), [CrystalColor.Green]: 3 },
    receives: { ...emptyCrystals(), [CrystalColor.Red]: 3 }
  });
  
  // 3Y -> 1B
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Trade,
    gives: { ...emptyCrystals(), [CrystalColor.Yellow]: 3 },
    receives: { ...emptyCrystals(), [CrystalColor.Blue]: 1 }
  });
  
  // 2G -> 1B
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: `m${idCounter++}`,
      type: MerchantCardType.Trade,
      gives: { ...emptyCrystals(), [CrystalColor.Green]: 2 },
      receives: { ...emptyCrystals(), [CrystalColor.Blue]: 1 }
    });
  }
  
  // 3G -> 2B
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Trade,
    gives: { ...emptyCrystals(), [CrystalColor.Green]: 3 },
    receives: { ...emptyCrystals(), [CrystalColor.Blue]: 2 }
  });
  
  // 2R -> 2B
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: `m${idCounter++}`,
      type: MerchantCardType.Trade,
      gives: { ...emptyCrystals(), [CrystalColor.Red]: 2 },
      receives: { ...emptyCrystals(), [CrystalColor.Blue]: 2 }
    });
  }
  
  // 3R -> 3B
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Trade,
    gives: { ...emptyCrystals(), [CrystalColor.Red]: 3 },
    receives: { ...emptyCrystals(), [CrystalColor.Blue]: 3 }
  });
  
  // Mixed trades
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Trade,
    gives: { ...emptyCrystals(), [CrystalColor.Yellow]: 2, [CrystalColor.Green]: 1 },
    receives: { ...emptyCrystals(), [CrystalColor.Red]: 3 }
  });
  
  cards.push({
    id: `m${idCounter++}`,
    type: MerchantCardType.Trade,
    gives: { ...emptyCrystals(), [CrystalColor.Yellow]: 1, [CrystalColor.Green]: 2 },
    receives: { ...emptyCrystals(), [CrystalColor.Blue]: 2 }
  });

  return cards;
}

/**
 * Creates the full point card deck according to the rulebook.
 * 
 * Assumptions: Point values and costs based on Century: Golem Edition.
 * Cards range from 6-20 points with varying crystal costs.
 * Some cards provide bonus crystals when claimed.
 */
function createPointCardDeck(): PointCard[] {
  const cards: PointCard[] = [];
  let idCounter = 1;

  const emptyCrystals = (): CrystalSet => ({
    [CrystalColor.Yellow]: 0,
    [CrystalColor.Green]: 0,
    [CrystalColor.Red]: 0,
    [CrystalColor.Blue]: 0
  });

  // Low value cards (6-10 points)
  cards.push({
    id: `p${idCounter++}`,
    points: 6,
    cost: { ...emptyCrystals(), [CrystalColor.Green]: 2, [CrystalColor.Red]: 1 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 7,
    cost: { ...emptyCrystals(), [CrystalColor.Yellow]: 2, [CrystalColor.Red]: 2 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 8,
    cost: { ...emptyCrystals(), [CrystalColor.Green]: 3, [CrystalColor.Red]: 1 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 9,
    cost: { ...emptyCrystals(), [CrystalColor.Yellow]: 3, [CrystalColor.Green]: 1, [CrystalColor.Red]: 1 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 10,
    cost: { ...emptyCrystals(), [CrystalColor.Green]: 2, [CrystalColor.Red]: 2 },
    bonusCrystals: emptyCrystals()
  });

  // Medium value cards (11-14 points)
  cards.push({
    id: `p${idCounter++}`,
    points: 11,
    cost: { ...emptyCrystals(), [CrystalColor.Yellow]: 2, [CrystalColor.Green]: 2, [CrystalColor.Red]: 1 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 12,
    cost: { ...emptyCrystals(), [CrystalColor.Green]: 3, [CrystalColor.Red]: 2 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 13,
    cost: { ...emptyCrystals(), [CrystalColor.Yellow]: 3, [CrystalColor.Green]: 2, [CrystalColor.Red]: 1 },
    bonusCrystals: { ...emptyCrystals(), [CrystalColor.Yellow]: 1 }
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 14,
    cost: { ...emptyCrystals(), [CrystalColor.Red]: 3, [CrystalColor.Blue]: 1 },
    bonusCrystals: emptyCrystals()
  });

  // High value cards (15-17 points)
  cards.push({
    id: `p${idCounter++}`,
    points: 15,
    cost: { ...emptyCrystals(), [CrystalColor.Green]: 3, [CrystalColor.Red]: 2, [CrystalColor.Blue]: 1 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 16,
    cost: { ...emptyCrystals(), [CrystalColor.Yellow]: 2, [CrystalColor.Red]: 3, [CrystalColor.Blue]: 1 },
    bonusCrystals: { ...emptyCrystals(), [CrystalColor.Green]: 1 }
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 17,
    cost: { ...emptyCrystals(), [CrystalColor.Green]: 4, [CrystalColor.Red]: 2, [CrystalColor.Blue]: 1 },
    bonusCrystals: emptyCrystals()
  });

  // Premium value cards (18-20 points)
  cards.push({
    id: `p${idCounter++}`,
    points: 18,
    cost: { ...emptyCrystals(), [CrystalColor.Red]: 4, [CrystalColor.Blue]: 2 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 19,
    cost: { ...emptyCrystals(), [CrystalColor.Green]: 3, [CrystalColor.Red]: 3, [CrystalColor.Blue]: 2 },
    bonusCrystals: { ...emptyCrystals(), [CrystalColor.Yellow]: 2 }
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 20,
    cost: { ...emptyCrystals(), [CrystalColor.Red]: 3, [CrystalColor.Blue]: 3 },
    bonusCrystals: emptyCrystals()
  });

  // Additional variety cards
  cards.push({
    id: `p${idCounter++}`,
    points: 11,
    cost: { ...emptyCrystals(), [CrystalColor.Yellow]: 4, [CrystalColor.Green]: 2 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 12,
    cost: { ...emptyCrystals(), [CrystalColor.Yellow]: 2, [CrystalColor.Red]: 2, [CrystalColor.Blue]: 1 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 13,
    cost: { ...emptyCrystals(), [CrystalColor.Green]: 2, [CrystalColor.Red]: 2, [CrystalColor.Blue]: 1 },
    bonusCrystals: emptyCrystals()
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 14,
    cost: { ...emptyCrystals(), [CrystalColor.Yellow]: 3, [CrystalColor.Red]: 3 },
    bonusCrystals: { ...emptyCrystals(), [CrystalColor.Green]: 1 }
  });
  
  cards.push({
    id: `p${idCounter++}`,
    points: 15,
    cost: { ...emptyCrystals(), [CrystalColor.Yellow]: 2, [CrystalColor.Green]: 3, [CrystalColor.Blue]: 1 },
    bonusCrystals: emptyCrystals()
  });

  return cards;
}

// ============================================================================
// STARTING CARDS
// ============================================================================

/**
 * Creates the two starting merchant cards every player receives.
 * Card 1: Produce 2 yellow crystals
 * Card 2: Upgrade 2 crystals once
 */
function createStartingMerchantCards(playerId: string): MerchantCard[] {
  const emptyCrystals = (): CrystalSet => ({
    [CrystalColor.Yellow]: 0,
    [CrystalColor.Green]: 0,
    [CrystalColor.Red]: 0,
    [CrystalColor.Blue]: 0
  });

  return [
    {
      id: `start-${playerId}-1`,
      type: MerchantCardType.Produce,
      produces: { ...emptyCrystals(), [CrystalColor.Yellow]: 2 }
    },
    {
      id: `start-${playerId}-2`,
      type: MerchantCardType.Upgrade,
      upgrades: [{ count: 2, times: 1 }]
    }
  ];
}

// ============================================================================
// MAIN SETUP FUNCTION
// ============================================================================

/**
 * Creates a new game with complete setup following the official rulebook.
 * 
 * Setup order:
 * 1. Validate player count (2-5)
 * 2. Shuffle Point deck deterministically
 * 3. Reveal 5 Point cards in a row
 * 4. Place copper coins on rightmost 2 cards, silver on rightmost 1
 * 5. Assign starting Merchant cards to each player
 * 6. Shuffle remaining Merchant deck
 * 7. Reveal 6 Merchant cards in a row
 * 8. Give each player a Caravan card (10 capacity)
 * 9. Determine first player (player[0] by convention)
 * 10. Give starting crystals: 3Y to player 1, 4Y to others
 * 
 * @param players - Array of player inputs with id and name
 * @param seed - String seed for deterministic shuffling
 * @returns Complete Game state ready to play
 * @throws Error if player count is invalid
 */
export function createNewGame(players: PlayerInput[], seed: string): Game {
  // Validate player count
  if (players.length < 2 || players.length > 5) {
    throw new Error(`Invalid player count: ${players.length}. Must be between 2 and 5.`);
  }

  // Validate unique player IDs
  const idSet = new Set(players.map(p => p.id));
  if (idSet.size !== players.length) {
    throw new Error('Player IDs must be unique');
  }

  // Create seeded random generator
  const random = createSeededRandom(seed);

  const emptyCrystals = (): CrystalSet => ({
    [CrystalColor.Yellow]: 0,
    [CrystalColor.Green]: 0,
    [CrystalColor.Red]: 0,
    [CrystalColor.Blue]: 0
  });

  // STEP 1-2: Create and shuffle Point deck
  const allPointCards = createPointCardDeck();
  const shuffledPointCards = shuffleArray(allPointCards, random);

  // STEP 3-4: Reveal 5 Point cards and place coins
  const pointCardRowSize = 5;
  const pointCardRow = shuffledPointCards.slice(0, pointCardRowSize).map((card, index) => {
    // Coins on rightmost cards: positions 3 and 4 get copper, position 4 gets silver too
    if (index === 3) {
      return { ...card, points: card.points + COPPER_COIN_VALUE };
    } else if (index === 4) {
      return { ...card, points: card.points + SILVER_COIN_VALUE };
    }
    return card;
  });

  const pointCardDeck = shuffledPointCards.slice(pointCardRowSize);

  // STEP 5: Create Merchant deck (excluding starting cards)
  const merchantDeck = createMerchantDeck();

  // STEP 6: Shuffle Merchant deck
  const shuffledMerchantCards = shuffleArray(merchantDeck, random);

  // STEP 7: Reveal 6 Merchant cards
  const merchantRowSize = 6;
  const merchantRow = shuffledMerchantCards.slice(0, merchantRowSize);
  const remainingMerchantDeck = shuffledMerchantCards.slice(merchantRowSize);

  // STEP 8-10: Create players with starting cards and crystals
  const gamePlayers: Player[] = players.map((playerInput, index) => {
    const isFirst = index === 0;
    
    // Starting crystals: first player gets 3Y, others get 4Y
    const startingCrystals = emptyCrystals();
    startingCrystals[CrystalColor.Yellow] = isFirst ? 3 : 4;

    return {
      id: playerInput.id,
      name: playerInput.name,
      hand: createStartingMerchantCards(playerInput.id),
      playArea: [],
      caravan: startingCrystals,
      pointCards: [],
      score: 0,
      isFirstPlayer: isFirst
    };
  });

  // Determine end game trigger based on player count
  const config: GameConfig = {
    ...DEFAULT_CONFIG,
    playerCount: players.length,
    pointCardsToTriggerEnd: players.length >= 4 ? 5 : 4
  };

  // Create complete game state
  // Note: Start in Setup phase - host will transition to Playing when all players connected
  const now = Date.now();
  const game: Game = {
    id: `game-${now}-${seed.substring(0, 8)}`,
    phase: GamePhase.Setup,
    players: gamePlayers,
    currentPlayerIndex: 0,
    merchantDeck: remainingMerchantDeck,
    merchantRow: {
      cards: merchantRow,
      maxSize: merchantRowSize
    },
    pointCardDeck,
    pointCardRow: {
      cards: pointCardRow,
      maxSize: pointCardRowSize
    },
    turnNumber: 1,
    endGameTriggered: false,
    endGameTriggerPlayerIndex: null,
    finalRoundComplete: false,
    winnerId: null,
    createdAt: now,
    updatedAt: now
  };

  return game;
}
