/**
 * EXPRESS ADAPTER
 * 
 * This file shows how to integrate the framework-agnostic controllers
 * with Express.js. The same pattern can be adapted for any HTTP framework.
 * 
 * NOTE: Express types are referenced but not imported to avoid compilation errors
 * when Express is not installed. Install Express to use this adapter:
 * 
 * npm install express @types/express
 * 
 * USAGE:
 * ```typescript
 * import express from 'express';
 * import { createGameRouter } from './api/expressAdapter';
 * 
 * const app = express();
 * app.use(express.json());
 * app.use('/api', createGameRouter());
 * app.listen(3000);
 * ```
 */

// Types are used for documentation only - no runtime Express dependency
import { GameController } from './controllers';
import { GameService } from './gameService';
import { createStorage } from './storage';
import { CreateGameRequest, SubmitActionRequest } from './types';

// Express types (for reference - requires @types/express)
type Request = any;
type Response = any;
type Router = any;

// ============================================================================
// ROUTER FACTORY
// ============================================================================

/**
 * Create Express router with all game endpoints.
 * 
 * NOTE: Requires Express to be installed:
 * npm install express @types/express
 */
export function createGameRouter(): any {
  // Dynamically require Express to avoid compilation error when not installed
  let Router: any;
  try {
    Router = require('express').Router;
  } catch (e) {
    throw new Error(
      'Express is not installed. Run: npm install express @types/express'
    );
  }
  
  const router = Router();
  
  // Initialize service and controller
  const storage = createStorage();
  const service = new GameService(storage);
  const controller = new GameController(service);
  
  // POST /games - Create new game
  router.post('/games', async (req: Request, res: Response) => {
    const request: CreateGameRequest = req.body;
    const response = await controller.createGame(request);
    
    const status = response.success ? 201 : getErrorStatus(response.code);
    res.status(status).json(response);
  });
  
  // GET /games/:id - Get game state
  router.get('/games/:id', async (req: Request, res: Response) => {
    const gameId = req.params.id;
    const response = await controller.getGame(gameId);
    
    const status = response.success ? 200 : getErrorStatus(response.code);
    res.status(status).json(response);
  });
  
  // POST /games/:id/actions - Submit action
  router.post('/games/:id/actions', async (req: Request, res: Response) => {
    const gameId = req.params.id;
    const request: SubmitActionRequest = req.body;
    const response = await controller.submitAction(gameId, request);
    
    const status = response.success ? 200 : getErrorStatus(response.code);
    res.status(status).json(response);
  });
  
  return router;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map API error codes to HTTP status codes.
 */
function getErrorStatus(code: string): number {
  switch (code) {
    case 'GAME_NOT_FOUND':
    case 'PLAYER_NOT_FOUND':
      return 404;
    
    case 'INVALID_REQUEST':
    case 'VALIDATION_FAILED':
      return 400;
    
    case 'NOT_YOUR_TURN':
    case 'GAME_NOT_PLAYING':
      return 403;
    
    case 'DUPLICATE_ACTION':
      return 409;
    
    case 'INTERNAL_ERROR':
    case 'STORAGE_ERROR':
    default:
      return 500;
  }
}

// ============================================================================
// EXAMPLE SERVER SETUP
// ============================================================================

/**
 * Example of complete Express server setup.
 * 
 * USAGE:
 * ```typescript
 * import { createServer } from './api/expressAdapter';
 * 
 * const server = createServer();
 * server.listen(3000, () => {
 *   console.log('Server running on port 3000');
 * });
 * ```
 */
export function createServer() {
  // Note: This requires Express to be installed
  // npm install express @types/express
  
  const express = require('express');
  const app = express();
  
  // Middleware
  app.use(express.json());
  
  // CORS (for development)
  app.use((req: Request, res: Response, next: Function) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
  
  // Mount game API
  app.use('/api', createGameRouter());
  
  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });
  
  return app;
}
