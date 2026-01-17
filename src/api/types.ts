/**
 * API REQUEST/RESPONSE TYPES
 * 
 * These types define the HTTP contract between clients and server.
 * All types are JSON-serializable for REST API compatibility.
 */

import { Game, GameAction } from '../types/domain';

// ============================================================================
// REQUEST TYPES
// ============================================================================

/**
 * Request to create a new game.
 */
export type CreateGameRequest = {
  playerCount: number;
  playerNames: string[];
  seed?: number;  // Optional: for deterministic setup testing
};

/**
 * Request to submit an action.
 * Contains the action and optional idempotency key.
 */
export type SubmitActionRequest = {
  action: GameAction;
};

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Successful response with game state.
 */
export type GameResponse = {
  success: true;
  game: Game;
};

/**
 * Error response with details.
 */
export type ErrorResponse = {
  success: false;
  error: string;
  code: string;
  details?: any;
};

/**
 * Action submission result.
 */
export type ActionResponse = GameResponse | ErrorResponse;

// ============================================================================
// ERROR CODES
// ============================================================================

export enum ApiErrorCode {
  // Resource errors
  GameNotFound = 'GAME_NOT_FOUND',
  PlayerNotFound = 'PLAYER_NOT_FOUND',
  
  // Validation errors
  InvalidRequest = 'INVALID_REQUEST',
  ValidationFailed = 'VALIDATION_FAILED',
  
  // Authorization errors
  NotYourTurn = 'NOT_YOUR_TURN',
  GameNotPlaying = 'GAME_NOT_PLAYING',
  
  // Idempotency errors
  DuplicateAction = 'DUPLICATE_ACTION',
  
  // Server errors
  InternalError = 'INTERNAL_ERROR',
  StorageError = 'STORAGE_ERROR'
}
