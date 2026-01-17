/**
 * ENDGAME SYSTEM - Game completion and scoring
 * 
 * ASYNC MULTIPLAYER SAFETY:
 * This module handles game ending conditions and final scoring.
 * All calculations are deterministic and based on game state only.
 * 
 * Key Properties:
 * 1. DETERMINISTIC: Scoring is purely mathematical (no randomness)
 * 2. STATELESS: Only depends on game state, no external data
 * 3. FAIR: Tiebreaker rules ensure clear winner
 * 4. TRANSPARENT: All scoring rules visible in code
 * 5. FINAL: Game phase = Finished means no more actions accepted
 * 
 * Endgame Flow:
 * 1. Player claims N-th point card -> endgame triggered
 * 2. All other players get one final turn
 * 3. finalizeGame() calculates scores and determines winner
 * 4. Game phase set to Finished
 * 5. No more actions accepted (validation will reject)
 * 
 * Async Safety:
 * - Endgame detection happens during state transition
 * - Server tracks endGameTriggered flag
 * - Final turn enforcement via turnNumber comparison
 * - Winner determination is pure calculation
 * - Once Finished, state is immutable (validation rejects actions)
 * 
 * Server Usage:
 * ```typescript
 * // After applying ClaimPoint action:
 * const trigger = checkEndGameTrigger(newState);
 * if (trigger.triggered && !newState.endGameTriggered) {
 *   newState.endGameTriggered = true;
 *   newState.endGameTriggerPlayerIndex = trigger.playerIndex;
 * }
 * 
 * // After each turn in endgame:
 * if (isInFinalRound(newState) && nextPlayerIsTriggerer) {
 *   newState = finalizeGame(newState);
 * }
 * ```
 */

import { Game, Player, CrystalColor } from '../types/domain';

// ============================================================================
// ENDGAME CONSTANTS
// ============================================================================

/**
 * Number of point cards required to trigger endgame based on player count.
 */
const POINT_CARDS_TO_TRIGGER_END = {
  2: 6,
  3: 6,
  4: 5,
  5: 5
} as const;

/**
 * Point values for coins collected on point cards.
 */
const COIN_VALUES = {
  COPPER: 3,
  SILVER: 1
} as const;

/**
 * Point value for each non-yellow crystal at game end.
 */
const CRYSTAL_POINT_VALUE = 1;

// ============================================================================
// ENDGAME TRIGGER CHECK
// ============================================================================

/**
 * Checks if any player has triggered the endgame condition.
 * 
 * Rules:
 * - 4-5 players: Game ends when a player claims their 5th point card
 * - 2-3 players: Game ends when a player claims their 6th point card
 * - After trigger, all players get one final turn
 * 
 * @param game - Current game state
 * @returns Object with trigger status and triggering player if any
 */
export function checkEndGameTrigger(game: Game): {
  triggered: boolean;
  playerIndex: number | null;
  playerName: string | null;
} {
  const requiredCards = getRequiredPointCards(game.players.length);

  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    if (player.pointCards.length >= requiredCards) {
      return {
        triggered: true,
        playerIndex: i,
        playerName: player.name
      };
    }
  }

  return {
    triggered: false,
    playerIndex: null,
    playerName: null
  };
}

/**
 * Gets the number of point cards required to trigger endgame.
 * 
 * @param playerCount - Number of players in the game
 * @returns Number of point cards needed to trigger end
 */
function getRequiredPointCards(playerCount: number): number {
  return POINT_CARDS_TO_TRIGGER_END[playerCount as keyof typeof POINT_CARDS_TO_TRIGGER_END] || 6;
}

// ============================================================================
// SCORE CALCULATION
// ============================================================================

/**
 * Calculates the final score for a player.
 * 
 * Scoring components:
 * 1. Points from claimed point cards (base value)
 * 2. Copper coins: 3 points each
 * 3. Silver coins: 1 point each
 * 4. Non-yellow crystals: 1 point each (green, red, blue)
 * 5. Yellow crystals: 0 points
 * 
 * Note: Coins are already added to point card values during setup/claiming.
 * This function recalculates from the point card's base points.
 * 
 * @param player - Player to calculate score for
 * @returns Total score
 */
export function calculateScore(player: Player): number {
  // Sum points from all claimed point cards
  const pointCardScore = player.pointCards.reduce((sum, card) => {
    return sum + card.points;
  }, 0);

  // Rule: Count non-yellow crystals (green, red, blue = 1 point each)
  const crystalScore = 
    player.caravan[CrystalColor.Green] +
    player.caravan[CrystalColor.Red] +
    player.caravan[CrystalColor.Blue];
  // Yellow crystals are worth 0 points

  return pointCardScore + crystalScore;
}

/**
 * Calculates scores for all players and updates their score field.
 * 
 * @param game - Game state at end
 * @returns Players array with updated scores
 */
export function calculateAllScores(game: Game): Player[] {
  return game.players.map(player => ({
    ...player,
    score: calculateScore(player)
  }));
}

// ============================================================================
// GAME FINALIZATION
// ============================================================================

/**
 * Finalizes the game by calculating scores and determining the winner.
 * 
 * Rules:
 * 1. Calculate final scores for all players
 * 2. Determine winner using tiebreaker rules
 * 3. Mark game as finished
 * 
 * Tiebreaker rules (in order):
 * 1. Highest score
 * 2. Most total crystals remaining
 * 3. Most merchant cards (hand + play area)
 * 4. Last player in turn order wins (went later in final round)
 * 
 * @param game - Game state after final round completes
 * @returns Final game state with winner determined
 */
export function finalizeGame(game: Game): Game {
  // Calculate scores for all players
  const playersWithScores = calculateAllScores(game);

  // Determine winner using tiebreaker rules
  const winner = determineWinner(playersWithScores);

  return {
    ...game,
    players: playersWithScores,
    winnerId: winner.id,
    finalRoundComplete: true,
    updatedAt: Date.now()
  };
}

/**
 * Determines the winner from players with calculated scores.
 * 
 * Tiebreaker rules (in order):
 * 1. Highest score
 * 2. Most crystals remaining (all colors)
 * 3. Most merchant cards (hand + play area combined)
 * 4. Player who went later in turn order (higher array index)
 * 
 * @param players - Array of players with calculated scores
 * @returns The winning player
 */
export function determineWinner(players: Player[]): Player {
  // Create array with player indices for tie-breaking
  const playersWithIndex = players.map((player, index) => ({
    player,
    index
  }));

  // Sort by tiebreaker rules
  playersWithIndex.sort((a, b) => {
    // Rule 1: Highest score wins
    if (a.player.score !== b.player.score) {
      return b.player.score - a.player.score;
    }

    // Rule 2: Most crystals wins
    const aCrystals = getTotalCrystals(a.player);
    const bCrystals = getTotalCrystals(b.player);
    if (aCrystals !== bCrystals) {
      return bCrystals - aCrystals;
    }

    // Rule 3: Most merchant cards wins
    const aMerchantCards = a.player.hand.length + a.player.playArea.length;
    const bMerchantCards = b.player.hand.length + b.player.playArea.length;
    if (aMerchantCards !== bMerchantCards) {
      return bMerchantCards - aMerchantCards;
    }

    // Rule 4: Player who went later (higher index) wins
    return b.index - a.index;
  });

  return playersWithIndex[0].player;
}

// ============================================================================
// ENDGAME QUERIES
// ============================================================================

/**
 * Checks if the game is in the final round.
 * 
 * @param game - Current game state
 * @returns True if endgame triggered but not yet complete
 */
export function isInFinalRound(game: Game): boolean {
  return game.endGameTriggered && !game.finalRoundComplete;
}

/**
 * Gets the number of turns remaining until game ends.
 * 
 * @param game - Current game state
 * @returns Number of turns remaining, or null if endgame not triggered
 */
export function getRemainingTurns(game: Game): number | null {
  if (!game.endGameTriggered || game.endGameTriggerPlayerIndex === null) {
    return null;
  }

  const triggerIndex = game.endGameTriggerPlayerIndex;
  const currentIndex = game.currentPlayerIndex;
  const playerCount = game.players.length;

  // Calculate turns until we return to trigger player
  if (currentIndex <= triggerIndex) {
    return triggerIndex - currentIndex;
  } else {
    return playerCount - currentIndex + triggerIndex;
  }
}

/**
 * Gets endgame status summary.
 * 
 * @param game - Current game state
 * @returns Endgame status information
 */
export function getEndGameStatus(game: Game): {
  triggered: boolean;
  inFinalRound: boolean;
  complete: boolean;
  triggerPlayer: string | null;
  turnsRemaining: number | null;
  winner: string | null;
} {
  return {
    triggered: game.endGameTriggered,
    inFinalRound: isInFinalRound(game),
    complete: game.finalRoundComplete,
    triggerPlayer: game.endGameTriggerPlayerIndex !== null
      ? game.players[game.endGameTriggerPlayerIndex].name
      : null,
    turnsRemaining: getRemainingTurns(game),
    winner: game.winnerId
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Counts total crystals in a player's caravan.
 * 
 * @param player - Player to count crystals for
 * @returns Total number of crystals
 */
function getTotalCrystals(player: Player): number {
  return (
    player.caravan[CrystalColor.Yellow] +
    player.caravan[CrystalColor.Green] +
    player.caravan[CrystalColor.Red] +
    player.caravan[CrystalColor.Blue]
  );
}

/**
 * Gets a breakdown of a player's score for display.
 * Useful for showing score details to players.
 * 
 * @param player - Player to get score breakdown for
 * @returns Object with score component breakdown
 */
export function getScoreBreakdown(player: Player): {
  pointCards: number;
  crystals: number;
  total: number;
  crystalBreakdown: {
    yellow: number;
    green: number;
    red: number;
    blue: number;
  };
} {
  const pointCardScore = player.pointCards.reduce((sum, card) => sum + card.points, 0);
  
  const crystalBreakdown = {
    yellow: player.caravan[CrystalColor.Yellow],
    green: player.caravan[CrystalColor.Green],
    red: player.caravan[CrystalColor.Red],
    blue: player.caravan[CrystalColor.Blue]
  };

  const crystalScore = crystalBreakdown.green + crystalBreakdown.red + crystalBreakdown.blue;

  return {
    pointCards: pointCardScore,
    crystals: crystalScore,
    total: pointCardScore + crystalScore,
    crystalBreakdown
  };
}
