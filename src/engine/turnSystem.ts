import { Game, GamePhase } from '../types/domain';

// ============================================================================
// TURN VALIDATION
// ============================================================================

export type TurnValidationResult = {
  valid: boolean;
  error?: string;
};

/**
 * Validates if a player can take an action on their turn.
 * 
 * Checks:
 * - Game must be in Playing phase
 * - Player must exist in the game
 * - Player must be the current active player
 * - Game must not be finished
 * 
 * @param game - Current game state
 * @param playerId - ID of player attempting to act
 * @returns Validation result with error message if invalid
 */
export function validateTurn(game: Game, playerId: string): TurnValidationResult {
  // Check game phase
  if (game.phase === GamePhase.Setup) {
    return {
      valid: false,
      error: 'Game is still in setup phase'
    };
  }

  if (game.phase === GamePhase.Finished) {
    return {
      valid: false,
      error: 'Game has already finished'
    };
  }

  // Verify player exists
  const player = game.players.find(p => p.id === playerId);
  if (!player) {
    return {
      valid: false,
      error: `Player ${playerId} not found in game`
    };
  }

  // Check if it's the player's turn
  const currentPlayer = game.players[game.currentPlayerIndex];
  if (currentPlayer.id !== playerId) {
    return {
      valid: false,
      error: `Not ${player.name}'s turn. Current turn: ${currentPlayer.name}`
    };
  }

  // All checks passed
  return { valid: true };
}

// ============================================================================
// TURN ADVANCEMENT
// ============================================================================

export type TurnAdvancementResult = {
  game: Game;
  turnEnded: boolean;
  roundCompleted: boolean;
  endGameTriggered: boolean;
  gameFinished: boolean;
};

/**
 * Advances the game to the next player's turn.
 * 
 * Turn order:
 * - Moves clockwise through players array
 * - Wraps back to player 0 after last player
 * - Increments turn number on each advancement
 * - Tracks rounds (one round = all players take one turn)
 * 
 * End game logic:
 * - Triggers when a player reaches the required number of point cards
 * - Does NOT immediately end the game
 * - All players get one final turn after trigger
 * - Game ends when returning to the trigger player
 * 
 * @param game - Current game state
 * @returns New game state with advanced turn and metadata about what changed
 */
export function advanceTurn(game: Game): TurnAdvancementResult {
  // Cannot advance turn if game is not in playing phase
  if (game.phase !== GamePhase.Playing) {
    return {
      game,
      turnEnded: false,
      roundCompleted: false,
      endGameTriggered: false,
      gameFinished: false
    };
  }

  // Move to next player (clockwise)
  const nextPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  const roundCompleted = nextPlayerIndex === 0;

  // Check if we're triggering end game
  const currentPlayer = game.players[game.currentPlayerIndex];
  const shouldTriggerEndGame = 
    !game.endGameTriggered && 
    currentPlayer.pointCards.length >= getPointCardsToTriggerEnd(game.players.length);

  // Check if game should finish
  // Game finishes when we return to the player who triggered the end game
  const shouldFinishGame = 
    game.endGameTriggered && 
    game.endGameTriggerPlayerIndex !== null &&
    nextPlayerIndex === game.endGameTriggerPlayerIndex;

  // Create updated game state
  const updatedGame: Game = {
    ...game,
    currentPlayerIndex: nextPlayerIndex,
    turnNumber: game.turnNumber + 1,
    endGameTriggered: game.endGameTriggered || shouldTriggerEndGame,
    endGameTriggerPlayerIndex: shouldTriggerEndGame 
      ? game.currentPlayerIndex 
      : game.endGameTriggerPlayerIndex,
    finalRoundComplete: shouldFinishGame,
    phase: shouldFinishGame ? GamePhase.Finished : game.phase,
    updatedAt: Date.now()
  };

  // Calculate final scores if game is finished
  if (shouldFinishGame) {
    const playersWithScores = calculateFinalScores(updatedGame);
    const winner = determineWinner(playersWithScores);

    return {
      game: {
        ...updatedGame,
        players: playersWithScores,
        winnerId: winner.id
      },
      turnEnded: true,
      roundCompleted,
      endGameTriggered: false,
      gameFinished: true
    };
  }

  return {
    game: updatedGame,
    turnEnded: true,
    roundCompleted,
    endGameTriggered: shouldTriggerEndGame,
    gameFinished: false
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Returns the number of point cards required to trigger end game.
 * 
 * Rules:
 * - 2-3 players: 4 point cards
 * - 4-5 players: 5 point cards
 */
function getPointCardsToTriggerEnd(playerCount: number): number {
  return playerCount >= 4 ? 5 : 4;
}

/**
 * Calculates final scores for all players.
 * 
 * Score components:
 * - Points from claimed point cards (including coin bonuses)
 * - Bonus points from remaining crystals (1 point per 3 crystals)
 * 
 * @param game - Game state at end
 * @returns Players with updated score values
 */
function calculateFinalScores(game: Game): Game['players'] {
  return game.players.map(player => {
    // Sum points from all point cards
    const pointCardScore = player.pointCards.reduce((sum, card) => sum + card.points, 0);

    // Calculate bonus points from remaining crystals
    const totalCrystals = 
      player.caravan.YELLOW +
      player.caravan.GREEN +
      player.caravan.RED +
      player.caravan.BLUE;
    const crystalBonus = Math.floor(totalCrystals / 3);

    const finalScore = pointCardScore + crystalBonus;

    return {
      ...player,
      score: finalScore
    };
  });
}

/**
 * Determines the winner from a list of players.
 * 
 * Tiebreaker rules (in order):
 * 1. Highest score
 * 2. Most crystals remaining
 * 3. Most merchant cards in hand
 * 4. Player who went later in turn order (higher index)
 * 
 * @param players - Array of players with calculated scores
 * @returns The winning player
 */
function determineWinner(players: Game['players']): Game['players'][0] {
  let winner = players[0];

  for (let i = 1; i < players.length; i++) {
    const challenger = players[i];

    // Compare scores
    if (challenger.score > winner.score) {
      winner = challenger;
      continue;
    }
    if (challenger.score < winner.score) {
      continue;
    }

    // Tie on score - check crystal count
    const winnerCrystals = 
      winner.caravan.YELLOW + 
      winner.caravan.GREEN + 
      winner.caravan.RED + 
      winner.caravan.BLUE;
    const challengerCrystals = 
      challenger.caravan.YELLOW + 
      challenger.caravan.GREEN + 
      challenger.caravan.RED + 
      challenger.caravan.BLUE;

    if (challengerCrystals > winnerCrystals) {
      winner = challenger;
      continue;
    }
    if (challengerCrystals < winnerCrystals) {
      continue;
    }

    // Tie on crystals - check merchant card count
    const winnerMerchantCount = winner.hand.length + winner.playArea.length;
    const challengerMerchantCount = challenger.hand.length + challenger.playArea.length;

    if (challengerMerchantCount > winnerMerchantCount) {
      winner = challenger;
      continue;
    }
    if (challengerMerchantCount < winnerMerchantCount) {
      continue;
    }

    // Tie on merchant cards - player who went later wins (higher turn order)
    // Since we're iterating forward, challenger automatically wins this tiebreaker
    winner = challenger;
  }

  return winner;
}

// ============================================================================
// TURN STATE QUERIES
// ============================================================================

/**
 * Gets the current active player from game state.
 * 
 * @param game - Current game state
 * @returns The player whose turn it is, or null if game is not in Playing phase
 */
export function getCurrentPlayer(game: Game): Game['players'][0] | null {
  if (game.phase !== GamePhase.Playing) {
    return null;
  }
  return game.players[game.currentPlayerIndex];
}

/**
 * Checks if the game is in the final round (end game triggered but not finished).
 * 
 * @param game - Current game state
 * @returns True if in final round, false otherwise
 */
export function isInFinalRound(game: Game): boolean {
  return game.endGameTriggered && !game.finalRoundComplete;
}

/**
 * Gets the number of turns remaining before game ends.
 * Returns null if end game has not been triggered.
 * 
 * @param game - Current game state
 * @returns Number of turns until game ends, or null if not in final round
 */
export function getTurnsUntilGameEnd(game: Game): number | null {
  if (!game.endGameTriggered || game.endGameTriggerPlayerIndex === null) {
    return null;
  }

  // Calculate how many players need to take their final turn
  const triggerIndex = game.endGameTriggerPlayerIndex;
  const currentIndex = game.currentPlayerIndex;
  
  if (currentIndex <= triggerIndex) {
    return triggerIndex - currentIndex;
  } else {
    // Wrapped around
    return game.players.length - currentIndex + triggerIndex;
  }
}
