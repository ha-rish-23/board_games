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
