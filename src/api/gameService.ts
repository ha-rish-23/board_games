/**
 * GAME SERVICE LAYER
 * 
 * This is the bridge between HTTP controllers and the pure game engine.
 * 
 * RESPONSIBILITIES:
 * - Coordinate storage operations
 * - Enforce turn-based authorization
 * - Check action idempotency
 * - Validate actions using engine validators
 * - Apply actions using engine pure functions
 * - Persist state after each action
 * 
 * DOES NOT:
 * - Contain game logic (delegates to engine)
 * - Handle HTTP concerns (delegates to controllers)
 * - Mutate state (uses pure engine functions)
 */

import { Game, GameAction, GamePhase } from '../types/domain';
import { createNewGame } from '../setup/gameSetup';
import { validateAction } from '../engine/validation';
import { applyAction } from '../engine/actionResolver';
import { GameStorage } from './storage';
import { ApiErrorCode } from './types';

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class GameService {
  constructor(private storage: GameStorage) {}
  
  /**
   * Create a new game.
   * 
   * @param playerCount - Number of players (2-5)
   * @param playerNames - Array of player names
   * @param seed - Optional seed for deterministic setup
   * @returns Newly created game
   */
  async createNewGame(
    playerCount: number,
    playerNames: string[],
    seed?: number
  ): Promise<Game> {
    // Validate input
    if (playerCount < 2 || playerCount > 5) {
      throw new ServiceError(
        'Player count must be between 2 and 5',
        ApiErrorCode.InvalidRequest
      );
    }
    
    if (playerNames.length !== playerCount) {
      throw new ServiceError(
        `Expected ${playerCount} player names, got ${playerNames.length}`,
        ApiErrorCode.InvalidRequest
      );
    }
    
    // Create game using engine
    const playerInputs = playerNames.map((name, index) => ({
      id: `player_${index + 1}`,
      name
    }));
    const seedStr = seed !== undefined ? seed.toString() : undefined;
    const game = createNewGame(playerInputs, seedStr!);
    
    // Persist to storage
    await this.storage.createGame(game);
    
    return game;
  }
  
  /**
   * Get game state by ID.
   * 
   * @param gameId - Game identifier
   * @returns Game state
   * @throws If game not found
   */
  async getGame(gameId: string): Promise<Game> {
    const game = await this.storage.getGame(gameId);
    
    if (!game) {
      throw new ServiceError(
        `Game ${gameId} not found`,
        ApiErrorCode.GameNotFound
      );
    }
    
    return game;
  }
  
  /**
   * Submit and process a player action.
   * 
   * This is the core method for game progression:
   * 1. Load current game state
   * 2. Check idempotency (reject duplicates)
   * 3. Validate action (turn ownership, game rules)
   * 4. Apply action (pure state transition)
   * 5. Persist new state
   * 6. Record action as processed
   * 
   * ATOMIC: Either all steps succeed or none do.
   * 
   * @param gameId - Game identifier
   * @param action - Player action to process
   * @returns Updated game state
   */
  async submitAction(gameId: string, action: GameAction): Promise<Game> {
    // 1. Load current state
    const game = await this.getGame(gameId);
    
    // 2. Check idempotency
    const alreadyProcessed = await this.storage.isActionProcessed(
      gameId,
      action.playerId,
      action.timestamp
    );
    
    if (alreadyProcessed) {
      throw new ServiceError(
        'Action already processed (duplicate submission)',
        ApiErrorCode.DuplicateAction
      );
    }
    
    // 3. Validate game phase
    if (game.phase !== GamePhase.Playing) {
      throw new ServiceError(
        `Game is in ${game.phase} phase, cannot accept actions`,
        ApiErrorCode.GameNotPlaying
      );
    }
    
    // 4. Validate turn ownership
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (action.playerId !== currentPlayer.id) {
      throw new ServiceError(
        `Not your turn. Current player: ${currentPlayer.name}`,
        ApiErrorCode.NotYourTurn,
        { 
          currentPlayerId: currentPlayer.id,
          currentPlayerName: currentPlayer.name,
          attemptedPlayerId: action.playerId
        }
      );
    }
    
    // 5. Validate action using engine validator
    const validation = validateAction(game, action);
    if (!validation.valid) {
      throw new ServiceError(
        validation.error,
        ApiErrorCode.ValidationFailed,
        { validationCode: validation.code }
      );
    }
    
    // 6. Apply action using engine (pure function)
    const newGame = applyAction(game, action);
    
    // 7. Persist new state
    await this.storage.updateGame(newGame);
    
    // 8. Record action as processed (idempotency)
    await this.storage.recordAction(gameId, action);
    
    return newGame;
  }
}

// ============================================================================
// SERVICE ERROR
// ============================================================================

/**
 * Service layer error with API error code.
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: ApiErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
