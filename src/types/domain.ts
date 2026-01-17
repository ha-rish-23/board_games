/**
 * CENTURY: GOLEM EDITION - DOMAIN TYPES
 * 
 * ASYNC MULTIPLAYER SAFETY:
 * This file defines the complete game state structure designed for
 * server-authoritative async multiplayer gameplay.
 * 
 * Key Design Principles:
 * 1. FULL SERIALIZABILITY: All types are JSON-serializable (no functions, classes, or symbols)
 * 2. IMMUTABILITY: State transitions create new objects, never mutate existing state
 * 3. DETERMINISM: Same action + same state = same result (no randomness after setup)
 * 4. IDEMPOTENCY: Action timestamps enable deduplication at API layer
 * 5. RESUMABILITY: Game can be saved/loaded at any point without state loss
 * 
 * Actions are Commands (not Events):
 * - Each action contains all data needed to execute (no external lookups)
 * - Actions are validated before application
 * - One action = one atomic state transition
 * - No reliance on timing or order (except turn-based validation)
 * 
 * State Management:
 * - `Game` type represents complete game state snapshot
 * - `timestamp` fields (createdAt, updatedAt) are milliseconds since epoch
 * - All IDs are strings for easy serialization and comparison
 * - Null represents explicit absence (e.g., empty card slots)
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum CrystalColor {
  Yellow = 'YELLOW',
  Green = 'GREEN',
  Red = 'RED',
  Blue = 'BLUE'
}

export enum GamePhase {
  Setup = 'SETUP',
  Playing = 'PLAYING',
  Finished = 'FINISHED'
}

export enum ActionType {
  PlayMerchantCard = 'PLAY_MERCHANT_CARD',
  AcquireMerchantCard = 'ACQUIRE_MERCHANT_CARD',
  ClaimPointCard = 'CLAIM_POINT_CARD',
  Rest = 'REST'
}

export enum MerchantCardType {
  Produce = 'PRODUCE',
  Upgrade = 'UPGRADE',
  Trade = 'TRADE'
}

// ============================================================================
// CRYSTALS
// ============================================================================

export type CrystalSet = {
  [CrystalColor.Yellow]: number;
  [CrystalColor.Green]: number;
  [CrystalColor.Red]: number;
  [CrystalColor.Blue]: number;
};

// ============================================================================
// MERCHANT CARDS
// ============================================================================

export type ProduceMerchantCard = {
  id: string;
  type: MerchantCardType.Produce;
  produces: CrystalSet;
};

export type UpgradeMerchantCard = {
  id: string;
  type: MerchantCardType.Upgrade;
  upgrades: Array<{
    count: number;
    times: number;
  }>;
};

export type TradeMerchantCard = {
  id: string;
  type: MerchantCardType.Trade;
  gives: CrystalSet;
  receives: CrystalSet;
};

export type MerchantCard = ProduceMerchantCard | UpgradeMerchantCard | TradeMerchantCard;

// ============================================================================
// POINT CARDS
// ============================================================================

export type PointCard = {
  id: string;
  points: number;
  cost: CrystalSet;
  bonusCrystals: CrystalSet;
};

// ============================================================================
// PLAYER
// ============================================================================

export type Player = {
  id: string;
  name: string;
  hand: MerchantCard[];
  playArea: MerchantCard[];
  caravan: CrystalSet;
  pointCards: PointCard[];
  score: number;
  isFirstPlayer: boolean;
};

// ============================================================================
// GAME STATE
// ============================================================================

export type MerchantCardRow = {
  cards: (MerchantCard | null)[];
  maxSize: number;
};

export type PointCardRow = {
  cards: (PointCard | null)[];
  maxSize: number;
};

/**
 * Complete game state - fully serializable and resumable.
 * 
 * ASYNC SAFETY NOTES:
 * - This is the ONLY source of truth for game state
 * - All fields are primitives, arrays, or nested serializable objects
 * - timestamps are Unix epoch milliseconds (number, not Date objects)
 * - Can be JSON.stringify'd and restored without data loss
 * - No circular references or non-serializable types
 */
export type Game = {
  id: string;
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  merchantDeck: MerchantCard[];
  merchantRow: MerchantCardRow;
  pointCardDeck: PointCard[];
  pointCardRow: PointCardRow;
  turnNumber: number;
  endGameTriggered: boolean;
  endGameTriggerPlayerIndex: number | null;
  finalRoundComplete: boolean;
  winnerId: string | null;
  createdAt: number;
  updatedAt: number;
};

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Base action interface - all actions must identify the player.
 * 
 * ASYNC MULTIPLAYER SAFETY:
 * - `timestamp`: Used for idempotency checks at API layer
 *   (server can reject duplicate actions with same playerId + timestamp)
 * - `playerId`: Links action to player for authorization and validation
 * - `type`: Discriminator for TypeScript union type narrowing
 * 
 * Actions are self-contained commands:
 * - Include ALL data needed to execute (cardId, payment, etc.)
 * - No server-side lookups or external state dependencies
 * - Can be queued, retried, or replayed without side effects
 */
export type BaseAction = {
  type: ActionType;
  playerId: string;
  timestamp: number;
};

/**
 * Play a merchant card from hand to the play area.
 * 
 * For Produce cards: No additional data needed.
 * For Trade cards: Crystals to give are specified by card definition.
 * For Upgrade cards: Must specify which crystals to upgrade.
 */
export type PlayCardAction = {
  type: ActionType.PlayMerchantCard;
  playerId: string;
  timestamp: number;
  cardId: string;
  upgradeSelection?: CrystalUpgradeSelection;
};

/**
 * Specifies which crystals to upgrade and to what color.
 * Required when playing an Upgrade card.
 */
export type CrystalUpgradeSelection = {
  upgrades: Array<{
    fromColor: CrystalColor;
    toColor: CrystalColor;
  }>;
};

/**
 * Acquire a merchant card from the market row.
 * 
 * Cost: Place 1 yellow crystal on each card to the left of the acquired card.
 * The acquired card goes to the player's hand.
 */
export type AcquireCardAction = {
  type: ActionType.AcquireMerchantCard;
  playerId: string;
  timestamp: number;
  rowIndex: number;
  cardId: string;
};

/**
 * Claim a point card from the market row.
 * 
 * Must pay the exact cost in crystals.
 * Receives bonus crystals if specified on the card.
 */
export type ClaimPointAction = {
  type: ActionType.ClaimPointCard;
  playerId: string;
  timestamp: number;
  rowIndex: number;
  cardId: string;
  payment: CrystalSet;
};

/**
 * Rest action - pick up all played merchant cards back into hand.
 * 
 * This is the only way to reuse merchant cards that have been played.
 * No cost or additional data required.
 */
export type RestAction = {
  type: ActionType.Rest;
  playerId: string;
  timestamp: number;
};

/**
 * Discriminated union of all possible game actions.
 * 
 * ASYNC MULTIPLAYER GUARANTEES:
 * 1. DETERMINISTIC: Same action applied to same state always produces same result
 * 2. ATOMIC: Each action is a single state transition (no partial updates)
 * 3. VALIDATABLE: Can check if action is legal before applying
 * 4. SERIALIZABLE: All action data is JSON-safe (no functions or classes)
 * 5. IDEMPOTENT: Server can detect and reject duplicate submissions via timestamp
 * 
 * Action Processing Flow:
 * 1. Client sends action to server
 * 2. Server validates action against current game state
 * 3. If valid, server applies action (pure function, no side effects)
 * 4. Server stores new state and broadcasts to all players
 * 5. Clients update local state when they receive broadcast
 * 
 * No Race Conditions:
 * - Server processes actions sequentially per game
 * - Turn-based validation ensures only current player can act
 * - Failed actions don't modify state (validation before application)
 */
export type GameAction = 
  | PlayCardAction 
  | AcquireCardAction 
  | ClaimPointAction 
  | RestAction;

// ============================================================================
// GAME CONFIGURATION
// ============================================================================

export type GameConfig = {
  playerCount: number;
  caravanCapacity: number;
  merchantRowSize: number;
  pointCardRowSize: number;
  pointCardsToTriggerEnd: number;
};

// ============================================================================
// ACTION RESULT
// ============================================================================

export type ActionResult = {
  success: boolean;
  error?: string;
  updatedGame?: Game;
};
