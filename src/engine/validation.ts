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
  Player
} from '../types/domain';
import { validateTurn } from './turnSystem';

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export type ValidationSuccess = {
  valid: true;
};

export type ValidationError = {
  valid: false;
  error: string;
  code: ValidationErrorCode;
};

export type ValidationResult = ValidationSuccess | ValidationError;

export enum ValidationErrorCode {
  // Turn validation
  InvalidTurn = 'INVALID_TURN',
  GameNotPlaying = 'GAME_NOT_PLAYING',
  
  // Card validation
  CardNotFound = 'CARD_NOT_FOUND',
  CardNotInHand = 'CARD_NOT_IN_HAND',
  InvalidRowIndex = 'INVALID_ROW_INDEX',
  
  // Resource validation
  InsufficientCrystals = 'INSUFFICIENT_CRYSTALS',
  CaravanCapacityExceeded = 'CARAVAN_CAPACITY_EXCEEDED',
  IncorrectPayment = 'INCORRECT_PAYMENT',
  
  // Action-specific validation
  InvalidUpgradeSelection = 'INVALID_UPGRADE_SELECTION',
  NoCardsToRest = 'NO_CARDS_TO_REST',
  InvalidUpgradePath = 'INVALID_UPGRADE_PATH',
  UpgradeCountMismatch = 'UPGRADE_COUNT_MISMATCH',
  
  // General
  InvalidActionType = 'INVALID_ACTION_TYPE'
}

// ============================================================================
// MAIN VALIDATION DISPATCHER
// ============================================================================

/**
 * Validates any game action against the current game state.
 * Routes to specific validator based on action type.
 * 
 * ASYNC MULTIPLAYER SAFETY:
 * - PURE FUNCTION: No side effects, reads game state only
 * - DETERMINISTIC: Same state + action = same result always
 * - THREAD-SAFE: Can be called concurrently for different games
 * - FAST: Returns immediately without async operations
 * 
 * Server should call this BEFORE applying action:
 * ```
 * const validation = validateAction(currentState, clientAction);
 * if (!validation.valid) {
 *   return error(validation.error, validation.code);
 * }
 * const newState = applyAction(currentState, clientAction);
 * await saveGameState(newState);
 * ```
 * 
 * This ensures:
 * - Invalid actions never corrupt game state
 * - Clients get immediate feedback on action legality
 * - Server maintains single source of truth
 * 
 * @param game - Current game state (not modified)
 * @param action - Action to validate
 * @returns Validation result with error details if invalid
 */
export function validateAction(game: Game, action: GameAction): ValidationResult {
  // First validate turn ownership
  const turnValidation = validateTurn(game, action.playerId);
  if (!turnValidation.valid) {
    return {
      valid: false,
      error: turnValidation.error!,
      code: ValidationErrorCode.InvalidTurn
    };
  }

  // Route to specific validator
  switch (action.type) {
    case ActionType.PlayMerchantCard:
      return validatePlayCard(game, action);
    case ActionType.AcquireMerchantCard:
      return validateAcquireCard(game, action);
    case ActionType.ClaimPointCard:
      return validateClaimPoint(game, action);
    case ActionType.Rest:
      return validateRest(game, action);
    default:
      return {
        valid: false,
        error: 'Unknown action type',
        code: ValidationErrorCode.InvalidActionType
      };
  }
}

// ============================================================================
// PLAY CARD VALIDATION
// ============================================================================

/**
 * Validates playing a merchant card from hand.
 * 
 * Rules:
 * - Card must be in player's hand
 * - For Produce: Check caravan capacity after production
 * - For Trade: Must have required crystals, check capacity after trade
 * - For Upgrade: Must have valid upgrade selection matching card requirements
 * 
 * @param game - Current game state
 * @param action - Play card action
 * @returns Validation result
 */
export function validatePlayCard(game: Game, action: PlayCardAction): ValidationResult {
  const player = getPlayer(game, action.playerId);
  if (!player) {
    return error('Player not found', ValidationErrorCode.CardNotFound);
  }

  // Check card is in hand
  const card = player.hand.find(c => c.id === action.cardId);
  if (!card) {
    return error(
      `Card ${action.cardId} not found in player's hand`,
      ValidationErrorCode.CardNotInHand
    );
  }

  // Validate based on card type
  switch (card.type) {
    case MerchantCardType.Produce:
      return validateProduceCard(player, card.produces);
    
    case MerchantCardType.Trade:
      return validateTradeCard(player, card.gives, card.receives);
    
    case MerchantCardType.Upgrade:
      return validateUpgradeCard(player, card, action.upgradeSelection);
    
    default:
      return error('Unknown card type', ValidationErrorCode.InvalidActionType);
  }
}

/**
 * Validates producing crystals.
 * Checks if caravan has capacity for produced crystals.
 */
function validateProduceCard(player: Player, produces: CrystalSet): ValidationResult {
  const currentTotal = countTotalCrystals(player.caravan);
  const producedTotal = countTotalCrystals(produces);
  
  if (currentTotal + producedTotal > 10) {
    return error(
      `Cannot produce ${producedTotal} crystals. Caravan capacity: ${currentTotal}/10`,
      ValidationErrorCode.CaravanCapacityExceeded
    );
  }

  return success();
}

/**
 * Validates trading crystals.
 * Checks player has crystals to give and capacity for received crystals.
 */
function validateTradeCard(
  player: Player,
  gives: CrystalSet,
  receives: CrystalSet
): ValidationResult {
  // Check player has crystals to give
  if (!hasEnoughCrystals(player.caravan, gives)) {
    return error(
      `Insufficient crystals to trade. Required: ${formatCrystalSet(gives)}`,
      ValidationErrorCode.InsufficientCrystals
    );
  }

  // Calculate resulting caravan after trade
  const afterTrade = subtractCrystals(player.caravan, gives);
  const finalCaravan = addCrystals(afterTrade, receives);
  const finalTotal = countTotalCrystals(finalCaravan);

  if (finalTotal > 10) {
    return error(
      `Trade would exceed caravan capacity. Result: ${finalTotal}/10`,
      ValidationErrorCode.CaravanCapacityExceeded
    );
  }

  return success();
}

/**
 * Validates upgrading crystals.
 * 
 * Rules:
 * - Must provide upgrade selection for upgrade cards
 * - Number of upgrades must match card requirements
 * - Each upgrade must follow valid color progression (Y→G→R→B)
 * - Player must have the crystals being upgraded
 * - Cannot exceed caravan capacity (shouldn't happen with upgrades)
 */
function validateUpgradeCard(
  player: Player,
  card: { upgrades: Array<{ count: number; times: number }> },
  selection?: { upgrades: Array<{ fromColor: CrystalColor; toColor: CrystalColor }> }
): ValidationResult {
  if (!selection || !selection.upgrades) {
    return error(
      'Upgrade selection required for upgrade cards',
      ValidationErrorCode.InvalidUpgradeSelection
    );
  }

  // Calculate total upgrades required by card
  const totalUpgradesRequired = card.upgrades.reduce(
    (sum, upgrade) => sum + (upgrade.count * upgrade.times),
    0
  );

  if (selection.upgrades.length !== totalUpgradesRequired) {
    return error(
      `Upgrade count mismatch. Required: ${totalUpgradesRequired}, provided: ${selection.upgrades.length}`,
      ValidationErrorCode.UpgradeCountMismatch
    );
  }

  // Validate each upgrade is valid
  const caravan = { ...player.caravan };
  
  for (const upgrade of selection.upgrades) {
    // Check valid upgrade path
    if (!isValidUpgradePath(upgrade.fromColor, upgrade.toColor)) {
      return error(
        `Invalid upgrade path: ${upgrade.fromColor} → ${upgrade.toColor}`,
        ValidationErrorCode.InvalidUpgradePath
      );
    }

    // Check player has crystal to upgrade
    if (caravan[upgrade.fromColor] <= 0) {
      return error(
        `Insufficient ${upgrade.fromColor} crystals to upgrade`,
        ValidationErrorCode.InsufficientCrystals
      );
    }

    // Apply upgrade to temporary caravan for validation
    caravan[upgrade.fromColor]--;
    caravan[upgrade.toColor]++;
  }

  return success();
}

/**
 * Checks if an upgrade path is valid.
 * Valid paths: Yellow→Green, Green→Red, Red→Blue
 */
function isValidUpgradePath(from: CrystalColor, to: CrystalColor): boolean {
  const validPaths: Record<CrystalColor, CrystalColor[]> = {
    [CrystalColor.Yellow]: [CrystalColor.Green],
    [CrystalColor.Green]: [CrystalColor.Red],
    [CrystalColor.Red]: [CrystalColor.Blue],
    [CrystalColor.Blue]: []
  };

  return validPaths[from]?.includes(to) ?? false;
}

// ============================================================================
// ACQUIRE CARD VALIDATION
// ============================================================================

/**
 * Validates acquiring a merchant card from the market.
 * 
 * Rules:
 * - Row index must be valid (0 to merchantRow.maxSize - 1)
 * - Card must exist at that position
 * - Card ID must match (validation cross-check)
 * - Player must have enough yellow crystals for cost (1 per card to the left)
 * 
 * @param game - Current game state
 * @param action - Acquire card action
 * @returns Validation result
 */
export function validateAcquireCard(game: Game, action: AcquireCardAction): ValidationResult {
  const player = getPlayer(game, action.playerId);
  if (!player) {
    return error('Player not found', ValidationErrorCode.CardNotFound);
  }

  // Validate row index
  if (action.rowIndex < 0 || action.rowIndex >= game.merchantRow.maxSize) {
    return error(
      `Invalid row index: ${action.rowIndex}. Must be 0-${game.merchantRow.maxSize - 1}`,
      ValidationErrorCode.InvalidRowIndex
    );
  }

  // Check card exists at position
  const card = game.merchantRow.cards[action.rowIndex];
  if (!card) {
    return error(
      `No card at position ${action.rowIndex}`,
      ValidationErrorCode.CardNotFound
    );
  }

  // Verify card ID matches
  if (card.id !== action.cardId) {
    return error(
      `Card ID mismatch at position ${action.rowIndex}`,
      ValidationErrorCode.CardNotFound
    );
  }

  // Calculate cost: 1 yellow crystal per card to the left
  const cost = action.rowIndex;
  if (player.caravan[CrystalColor.Yellow] < cost) {
    return error(
      `Insufficient yellow crystals. Required: ${cost}, have: ${player.caravan[CrystalColor.Yellow]}`,
      ValidationErrorCode.InsufficientCrystals
    );
  }

  return success();
}

// ============================================================================
// CLAIM POINT VALIDATION
// ============================================================================

/**
 * Validates claiming a point card from the market.
 * 
 * Rules:
 * - Row index must be valid (0 to pointCardRow.maxSize - 1)
 * - Card must exist at that position
 * - Card ID must match (validation cross-check)
 * - Payment must exactly match card cost
 * - Player must have the crystals to pay
 * - After payment, player still within caravan capacity (bonus crystals)
 * 
 * @param game - Current game state
 * @param action - Claim point action
 * @returns Validation result
 */
export function validateClaimPoint(game: Game, action: ClaimPointAction): ValidationResult {
  const player = getPlayer(game, action.playerId);
  if (!player) {
    return error('Player not found', ValidationErrorCode.CardNotFound);
  }

  // Validate row index
  if (action.rowIndex < 0 || action.rowIndex >= game.pointCardRow.maxSize) {
    return error(
      `Invalid row index: ${action.rowIndex}. Must be 0-${game.pointCardRow.maxSize - 1}`,
      ValidationErrorCode.InvalidRowIndex
    );
  }

  // Check card exists at position
  const card = game.pointCardRow.cards[action.rowIndex];
  if (!card) {
    return error(
      `No card at position ${action.rowIndex}`,
      ValidationErrorCode.CardNotFound
    );
  }

  // Verify card ID matches
  if (card.id !== action.cardId) {
    return error(
      `Card ID mismatch at position ${action.rowIndex}`,
      ValidationErrorCode.CardNotFound
    );
  }

  // Verify payment matches cost exactly
  if (!crystalSetsEqual(action.payment, card.cost)) {
    return error(
      `Payment does not match cost. Required: ${formatCrystalSet(card.cost)}, provided: ${formatCrystalSet(action.payment)}`,
      ValidationErrorCode.IncorrectPayment
    );
  }

  // Check player has crystals to pay
  if (!hasEnoughCrystals(player.caravan, card.cost)) {
    return error(
      `Insufficient crystals to pay. Required: ${formatCrystalSet(card.cost)}`,
      ValidationErrorCode.InsufficientCrystals
    );
  }

  // Check caravan capacity after payment and receiving bonus
  const afterPayment = subtractCrystals(player.caravan, card.cost);
  const afterBonus = addCrystals(afterPayment, card.bonusCrystals);
  const finalTotal = countTotalCrystals(afterBonus);

  if (finalTotal > 10) {
    return error(
      `Would exceed caravan capacity after bonus crystals. Result: ${finalTotal}/10`,
      ValidationErrorCode.CaravanCapacityExceeded
    );
  }

  return success();
}

// ============================================================================
// REST VALIDATION
// ============================================================================

/**
 * Validates resting (picking up played cards).
 * 
 * Rules:
 * - Player must have at least one card in play area
 * 
 * @param game - Current game state
 * @param action - Rest action
 * @returns Validation result
 */
export function validateRest(game: Game, action: RestAction): ValidationResult {
  const player = getPlayer(game, action.playerId);
  if (!player) {
    return error('Player not found', ValidationErrorCode.CardNotFound);
  }

  if (player.playArea.length === 0) {
    return error(
      'No cards in play area to rest',
      ValidationErrorCode.NoCardsToRest
    );
  }

  return success();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getPlayer(game: Game, playerId: string): Player | undefined {
  return game.players.find(p => p.id === playerId);
}

function success(): ValidationSuccess {
  return { valid: true };
}

function error(message: string, code: ValidationErrorCode): ValidationError {
  return { valid: false, error: message, code };
}

function countTotalCrystals(crystals: CrystalSet): number {
  return crystals.YELLOW + crystals.GREEN + crystals.RED + crystals.BLUE;
}

function hasEnoughCrystals(caravan: CrystalSet, required: CrystalSet): boolean {
  return (
    caravan.YELLOW >= required.YELLOW &&
    caravan.GREEN >= required.GREEN &&
    caravan.RED >= required.RED &&
    caravan.BLUE >= required.BLUE
  );
}

function crystalSetsEqual(a: CrystalSet, b: CrystalSet): boolean {
  return (
    a.YELLOW === b.YELLOW &&
    a.GREEN === b.GREEN &&
    a.RED === b.RED &&
    a.BLUE === b.BLUE
  );
}

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

function formatCrystalSet(crystals: CrystalSet): string {
  const parts: string[] = [];
  if (crystals.YELLOW > 0) parts.push(`${crystals.YELLOW}Y`);
  if (crystals.GREEN > 0) parts.push(`${crystals.GREEN}G`);
  if (crystals.RED > 0) parts.push(`${crystals.RED}R`);
  if (crystals.BLUE > 0) parts.push(`${crystals.BLUE}B`);
  return parts.length > 0 ? parts.join(', ') : 'none';
}
