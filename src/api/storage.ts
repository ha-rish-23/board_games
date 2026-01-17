/**
 * GAME STORAGE ABSTRACTION
 * 
 * This module provides an abstract storage interface for game state persistence.
 * Implementation shown uses in-memory storage for simplicity.
 * 
 * Production implementations could use:
 * - PostgreSQL with JSONB columns
 * - MongoDB documents
 * - Redis for fast read/write
 * - DynamoDB with JSON documents
 * 
 * ASYNC SAFETY:
 * - All operations are async to support real databases
 * - State is serialized/deserialized as JSON
 * - No references to in-memory objects are kept
 */

import { Game, GameAction } from '../types/domain';

// ============================================================================
// STORAGE INTERFACE
// ============================================================================

export interface GameStorage {
  /**
   * Create a new game record.
   * @throws If game ID already exists
   */
  createGame(game: Game): Promise<void>;
  
  /**
   * Retrieve a game by ID.
   * @returns Game state or null if not found
   */
  getGame(gameId: string): Promise<Game | null>;
  
  /**
   * Update game state atomically.
   * @throws If game doesn't exist
   */
  updateGame(game: Game): Promise<void>;
  
  /**
   * Check if an action has already been processed (idempotency).
   * @returns true if action was already processed
   */
  isActionProcessed(gameId: string, playerId: string, timestamp: number): Promise<boolean>;
  
  /**
   * Record that an action has been processed.
   */
  recordAction(gameId: string, action: GameAction): Promise<void>;
}

// ============================================================================
// IN-MEMORY IMPLEMENTATION
// ============================================================================

/**
 * Simple in-memory storage for development/testing.
 * 
 * CAUTION: Data is lost on server restart.
 * Use a real database in production.
 */
export class InMemoryGameStorage implements GameStorage {
  private games: Map<string, Game> = new Map();
  private processedActions: Map<string, Set<string>> = new Map();
  
  async createGame(game: Game): Promise<void> {
    if (this.games.has(game.id)) {
      throw new Error(`Game ${game.id} already exists`);
    }
    
    // Deep clone to prevent external mutations
    this.games.set(game.id, JSON.parse(JSON.stringify(game)));
  }
  
  async getGame(gameId: string): Promise<Game | null> {
    const game = this.games.get(gameId);
    if (!game) return null;
    
    // Deep clone to prevent external mutations
    return JSON.parse(JSON.stringify(game));
  }
  
  async updateGame(game: Game): Promise<void> {
    if (!this.games.has(game.id)) {
      throw new Error(`Game ${game.id} not found`);
    }
    
    // Deep clone to prevent external mutations
    this.games.set(game.id, JSON.parse(JSON.stringify(game)));
  }
  
  async isActionProcessed(
    gameId: string,
    playerId: string,
    timestamp: number
  ): Promise<boolean> {
    const key = this.getActionKey(gameId);
    const actions = this.processedActions.get(key);
    if (!actions) return false;
    
    const actionId = this.getActionId(playerId, timestamp);
    return actions.has(actionId);
  }
  
  async recordAction(gameId: string, action: GameAction): Promise<void> {
    const key = this.getActionKey(gameId);
    
    if (!this.processedActions.has(key)) {
      this.processedActions.set(key, new Set());
    }
    
    const actionId = this.getActionId(action.playerId, action.timestamp);
    this.processedActions.get(key)!.add(actionId);
  }
  
  private getActionKey(gameId: string): string {
    return `game:${gameId}:actions`;
  }
  
  private getActionId(playerId: string, timestamp: number): string {
    return `${playerId}:${timestamp}`;
  }
}

// ============================================================================
// STORAGE FACTORY
// ============================================================================

/**
 * Create storage instance based on configuration.
 * Extend this to support multiple storage backends.
 */
export function createStorage(): GameStorage {
  // In production, read from environment:
  // const storageType = process.env.STORAGE_TYPE || 'memory';
  // switch (storageType) {
  //   case 'postgres': return new PostgresGameStorage();
  //   case 'mongo': return new MongoGameStorage();
  //   default: return new InMemoryGameStorage();
  // }
  
  return new InMemoryGameStorage();
}
