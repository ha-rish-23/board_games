/**
 * REST API CONTROLLERS
 * 
 * These are framework-agnostic controller functions that can be adapted
 * to any HTTP framework (Express, Fastify, Koa, etc.)
 * 
 * Each controller:
 * - Parses request data
 * - Calls service layer
 * - Formats response
 * - Handles errors
 */

import { GameService, ServiceError } from './gameService';
import { 
  CreateGameRequest, 
  SubmitActionRequest,
  GameResponse,
  ErrorResponse,
  ApiErrorCode 
} from './types';

// ============================================================================
// CONTROLLER CLASS
// ============================================================================

export class GameController {
  constructor(private service: GameService) {}
  
  /**
   * POST /games
   * Create a new game.
   */
  async createGame(request: CreateGameRequest): Promise<GameResponse | ErrorResponse> {
    try {
      const game = await this.service.createNewGame(
        request.playerCount,
        request.playerNames,
        request.seed
      );
      
      return {
        success: true,
        game
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
  
  /**
   * GET /games/:id
   * Retrieve game state.
   */
  async getGame(gameId: string): Promise<GameResponse | ErrorResponse> {
    try {
      const game = await this.service.getGame(gameId);
      
      return {
        success: true,
        game
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
  
  /**
   * POST /games/:id/actions
   * Submit a player action.
   */
  async submitAction(
    gameId: string,
    request: SubmitActionRequest
  ): Promise<GameResponse | ErrorResponse> {
    try {
      const game = await this.service.submitAction(gameId, request.action);
      
      return {
        success: true,
        game
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
  
  /**
   * Convert errors to API error responses.
   */
  private handleError(error: unknown): ErrorResponse {
    // Service layer errors (business logic)
    if (error instanceof ServiceError) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        details: error.details
      };
    }
    
    // Storage errors
    if (error instanceof Error && error.message.includes('not found')) {
      return {
        success: false,
        error: error.message,
        code: ApiErrorCode.GameNotFound
      };
    }
    
    // Generic errors
    if (error instanceof Error) {
      return {
        success: false,
        error: error.message,
        code: ApiErrorCode.InternalError
      };
    }
    
    // Unknown errors
    return {
      success: false,
      error: 'An unexpected error occurred',
      code: ApiErrorCode.InternalError,
      details: error
    };
  }
}
