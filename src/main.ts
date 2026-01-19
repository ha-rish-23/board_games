/**
 * Main Entry Point for Vite
 * 
 * This file is the entry point referenced by index.html.
 * Vite will compile and bundle this TypeScript into browser-compatible JavaScript.
 */

import './main.css';
import { P2PGameRoom } from './p2p/browserRoom';
import { P2PGameClient } from './p2p/browserClient';
import { ActionType, GameAction } from './types/domain';

// Global instances
let gameRoom: P2PGameRoom | null = null;
let gameClient: P2PGameClient | null = null;
let currentPlayerId: string = '';

// Main application initialization
function initApp() {
  const app = document.getElementById('app');
  
  if (!app) {
    console.error('App mount point not found');
    return;
  }
  
  // Render UI
  app.innerHTML = `
    <div class="container">
      <h1>🎮 Century: Golem Edition</h1>
      <p class="subtitle">Peer-to-Peer Multiplayer - No Server Required</p>
      
      <div class="tabs">
        <button class="tab-btn active" data-tab="create">Create Room</button>
        <button class="tab-btn" data-tab="join">Join Room</button>
      </div>
      
      <div class="tab-content active" id="create-tab">
        <h2>Create a Game Room</h2>
        <form id="create-form">
          <div class="form-group">
            <label>Number of Players:</label>
            <input type="number" id="player-count" min="2" max="5" value="3" />
          </div>
          <button type="submit" class="btn-primary">Create Room</button>
        </form>
        <div id="room-info" style="display:none;">
          <h3>✅ Room Created!</h3>
          <p><strong>Share these with other players:</strong></p>
          <div style="margin: 15px 0;">
            <label>Room Code:</label>
            <div class="room-code" id="room-code-display"></div>
          </div>
          <div style="margin: 15px 0;">
            <label>Host Peer ID:</label>
            <div class="peer-id" id="peer-id-display"></div>
          </div>
          <div id="players-waiting" style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 4px;">
            <h4>Players Connected: <span id="connected-count">1</span>/<span id="total-count">3</span></h4>
            <div id="player-list"></div>
            <p style="margin-top: 15px; opacity: 0.8; font-size: 0.9em;">Game will start automatically when all players join.</p>
          </div>
        </div>
      </div>
      
      <div class="tab-content" id="join-tab">
        <h2>Join a Game Room</h2>
        <form id="join-form">
          <div class="form-group">
            <label>Room Code:</label>
            <input type="text" id="room-code-input" placeholder="e.g., A3F9K2" />
          </div>
          <div class="form-group">
            <label>Host Peer ID:</label>
            <input type="text" id="host-peer-id-input" placeholder="Provided by host" />
          </div>
          <div class="form-group">
            <label>Your Name:</label>
            <input type="text" id="player-name-input" placeholder="Enter your name" />
          </div>
          <button type="submit" class="btn-primary">Join Room</button>
        </form>
      </div>
      
      <div id="game-area" style="display:none;">
        <h2>Game in Progress</h2>
        
        <div id="player-identity" class="info-panel">
          <strong>You are:</strong> <span id="your-player-name"></span>
          <span id="host-indicator" style="display:none;" class="badge-host">HOST</span>
        </div>
        
        <div id="turn-status" class="info-panel turn-indicator">
          <strong id="turn-message">Waiting...</strong>
        </div>
        
        <div id="status-message" class="status-message"></div>
        
        <div id="game-status" class="game-meta"></div>
        
        <div id="game-actions" class="action-buttons">
          <button class="btn-action" id="action-play-card" disabled>Play Card</button>
          <button class="btn-action" id="action-take-merchant" disabled>Take Merchant</button>
          <button class="btn-action" id="action-claim-vp" disabled>Claim Points</button>
          <button class="btn-action" id="action-rest" disabled>Rest</button>
        </div>
        
        <div id="action-log" class="action-log">
          <h3>Action Log</h3>
          <div id="action-log-content"></div>
        </div>
      </div>
    </div>
  `;
  
  setupEventListeners();
}

function setupEventListeners() {
  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      if (tabName) {
        switchTab(tabName);
      }
    });
  });
  
  // Create room form
  const createForm = document.getElementById('create-form');
  createForm?.addEventListener('submit', handleCreateRoom);
  
  // Join room form
  const joinForm = document.getElementById('join-form');
  joinForm?.addEventListener('submit', handleJoinRoom);
  
  // Game action buttons with debounce
  document.getElementById('action-play-card')?.addEventListener('click', () => handleGameAction('play-card'));
  document.getElementById('action-take-merchant')?.addEventListener('click', () => handleGameAction('take-merchant'));
  document.getElementById('action-claim-vp')?.addEventListener('click', () => handleGameAction('claim-vp'));
  document.getElementById('action-rest')?.addEventListener('click', () => handleGameAction('rest'));
}

function switchTab(tabName: string) {
  // Update buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
  
  // Update content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabName}-tab`)?.classList.add('active');
}

async function handleCreateRoom(event: Event) {
  event.preventDefault();
  
  const playerCount = parseInt((document.getElementById('player-count') as HTMLInputElement).value);
  const roomInfo = document.getElementById('room-info');
  const codeDisplay = document.getElementById('room-code-display');
  const peerDisplay = document.getElementById('peer-id-display');
  
  if (!roomInfo || !codeDisplay || !peerDisplay) return;
  
  try {
    // Create P2P room
    gameRoom = new P2PGameRoom();
    
    // Set up event listeners
    gameRoom.on('room-created', ({ roomCode, hostPeerId, playerCount }) => {
      codeDisplay.textContent = roomCode;
      peerDisplay.textContent = hostPeerId;
      
      const totalCount = document.getElementById('total-count');
      if (totalCount) {
        totalCount.textContent = playerCount.toString();
      }
      
      updatePlayerList();
      roomInfo.style.display = 'block';
    });
    
    gameRoom.on('peer-connected', ({ playerName }) => {
      updatePlayerList();
    });
    
    gameRoom.on('game-state-updated', (game) => {
      // Host also sees game updates
      const gameArea = document.getElementById('game-area');
      if (gameArea && game.phase === 'PLAYING') {
        // Hide room info, show game
        const roomInfo = document.getElementById('room-info');
        if (roomInfo) {
          roomInfo.style.display = 'none';
        }
        gameArea.style.display = 'block';
        
        // Set host identity on first game state
        if (!currentPlayerId) {
          currentPlayerId = game.players[0].id; // Host is first player
          const playerNameEl = document.getElementById('your-player-name');
          if (playerNameEl) {
            playerNameEl.textContent = game.players[0].name;
          }
          const hostIndicator = document.getElementById('host-indicator');
          if (hostIndicator) {
            hostIndicator.style.display = 'inline';
          }
        }
        
        updateGameUI(game);
      }
    });
    
    gameRoom.on('action-processed', (action, success) => {
      if (success) {
        showStatusMessage('Action processed successfully', 'success');
        addActionToLog(action, currentPlayerId);
      } else {
        showStatusMessage('Action processing failed', 'error');
      }
    });
    
    gameRoom.on('room-error', (error: Error) => {
      showStatusMessage(`Error: ${error.message}`, 'error');
    });
    
    // Generate player names
    const playerNames = Array.from({ length: playerCount }, (_, i) => `Player ${i + 1}`);
    
    // Create room
    await gameRoom.createRoom(playerNames);
    
  } catch (error) {
    alert(`Failed to create room: ${(error as Error).message}`);
  }
}

function updatePlayerList() {
  if (!gameRoom) return;
  
  const playerList = document.getElementById('player-list');
  const connectedCount = document.getElementById('connected-count');
  
  if (!playerList || !connectedCount) return;
  
  const game = (gameRoom as any).game;
  const connections = (gameRoom as any).playerConnections;
  
  if (!game) return;
  
  const connectedPlayerIds = new Set(
    Array.from(connections.values()).map((conn: any) => conn.playerId)
  );
  
  playerList.innerHTML = game.players.map((player: any) => {
    const isConnected = connectedPlayerIds.has(player.id);
    const statusIcon = isConnected ? '✅' : '⏳';
    const statusText = isConnected ? 'Connected' : 'Waiting...';
    return `<div style="padding: 5px 0;">${statusIcon} ${player.name} - ${statusText}</div>`;
  }).join('');
  
  connectedCount.textContent = connectedPlayerIds.size.toString();
}

async function handleJoinRoom(event: Event) {
  event.preventDefault();
  
  const roomCode = (document.getElementById('room-code-input') as HTMLInputElement).value;
  const hostPeerId = (document.getElementById('host-peer-id-input') as HTMLInputElement).value;
  const playerName = (document.getElementById('player-name-input') as HTMLInputElement).value;
  
  if (!roomCode || !hostPeerId || !playerName) {
    alert('Please fill in all fields');
    return;
  }
  
  try {
    // Create P2P client
    gameClient = new P2PGameClient();
    
    // Set up event listeners
    gameClient.on('connected', () => {
      // Hide forms, show game area
      document.getElementById('create-tab')!.style.display = 'none';
      document.getElementById('join-tab')!.style.display = 'none';
      const gameArea = document.getElementById('game-area');
      if (gameArea) {
        gameArea.style.display = 'block';
        // Set player identity
        const playerNameEl = document.getElementById('your-player-name');
        if (playerNameEl) {
          playerNameEl.textContent = playerName;
        }
        showStatusMessage(`Connected to room ${roomCode}`, 'success');
      }
    });
    
    gameClient.on('disconnected', () => {
      showStatusMessage('Disconnected from room', 'error');
    });
    
    gameClient.on('host-disconnected', () => {
      const gameArea = document.getElementById('game-area');
      if (gameArea) {
        gameArea.innerHTML = `
          <h2>Game Ended</h2>
          <p style="padding: 20px; background: rgba(244, 67, 54, 0.2); border-radius: 8px;">
            <strong>Host disconnected.</strong><br><br>
            The host has closed their browser or lost connection.<br>
            The game cannot continue without the host.<br><br>
            Please refresh to start a new game.
          </p>
        `;
      }
    });
    
    gameClient.on('game-state-received', (game) => {
      updateGameUI(game);
      addActionToLog(null, currentPlayerId);
    });
    
    gameClient.on('action-accepted', (action) => {
      showStatusMessage('Sending action to host...', 'info');
    });
    
    gameClient.on('action-rejected', (action, error) => {
      showStatusMessage(`Invalid action: ${error}`, 'error');
    });
    
    gameClient.on('error', (error: Error) => {
      showStatusMessage(`Error: ${error.message}`, 'error');
    });
    
    // Generate player ID and store it
    currentPlayerId = `player_${Date.now()}`;
    
    // Join room
    await gameClient.joinRoomWithPeerId(roomCode, hostPeerId, currentPlayerId, playerName);
    
  } catch (error) {
    alert(`Failed to join room: ${(error as Error).message}`);
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Game action handler
let actionInProgress = false;

async function handleGameAction(actionType: string) {
  if (actionInProgress) {
    return;
  }
  
  if (!gameClient) {
    showStatusMessage('Not connected to a room', 'error');
    return;
  }
  
  if (!currentPlayerId) {
    showStatusMessage('Player ID not set', 'error');
    return;
  }
  
  try {
    actionInProgress = true;
    disableAllActionButtons();
    
    let action: GameAction;
    
    switch (actionType) {
      case 'rest':
        action = {
          type: ActionType.Rest,
          playerId: currentPlayerId,
          timestamp: Date.now()
        };
        break;
        
      case 'play-card':
        showStatusMessage('Select a card to play (UI not implemented)', 'error');
        actionInProgress = false;
        return;
        
      case 'take-merchant':
        showStatusMessage('Select a merchant card (UI not implemented)', 'error');
        actionInProgress = false;
        return;
        
      case 'claim-vp':
        showStatusMessage('Select a victory point card (UI not implemented)', 'error');
        actionInProgress = false;
        return;
        
      default:
        showStatusMessage('Unknown action type', 'error');
        actionInProgress = false;
        return;
    }
    
    showStatusMessage('Sending action to host...', 'info');
    await gameClient.sendAction(action);
    
  } catch (error) {
    showStatusMessage(`Failed to send action: ${(error as Error).message}`, 'error');
    actionInProgress = false;
  }
}

// Update UI with game state
function updateGameUI(game: any) {
  const currentPlayer = game.players[game.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === currentPlayerId;
  const myPlayer = game.players.find((p: any) => p.id === currentPlayerId);
  const gameEnded = game.phase === 'FINISHED';
  
  // Update turn status message
  const turnMessage = document.getElementById('turn-message');
  const turnStatus = document.getElementById('turn-status');
  if (turnMessage && turnStatus) {
    if (gameEnded) {
      turnMessage.textContent = 'Game Over';
      turnStatus.className = 'info-panel turn-indicator turn-ended';
    } else if (isMyTurn) {
      turnMessage.textContent = 'YOUR TURN';
      turnStatus.className = 'info-panel turn-indicator turn-active';
    } else {
      turnMessage.textContent = `Waiting for ${currentPlayer?.name || 'opponent'}`;
      turnStatus.className = 'info-panel turn-indicator turn-waiting';
    }
  }
  
  // Update game status details
  const statusEl = document.getElementById('game-status');
  if (statusEl) {
    statusEl.textContent = `Turn ${game.turnNumber} • ${game.phase} • ${game.players.length} players`;
  }
  
  // Enable/disable action buttons based on turn and game state
  updateActionButtons(isMyTurn, gameEnded);
  
  // Clear action in progress flag when state updates
  actionInProgress = false;
}

function updateActionButtons(isMyTurn: boolean, gameEnded: boolean) {
  const actionButtons = document.querySelectorAll<HTMLButtonElement>('#game-actions button');
  const canAct = isMyTurn && !gameEnded && !actionInProgress;
  
  actionButtons.forEach((btn) => {
    btn.disabled = !canAct;
    if (canAct) {
      btn.classList.remove('btn-disabled');
    } else {
      btn.classList.add('btn-disabled');
    }
  });
}

function disableAllActionButtons() {
  const actionButtons = document.querySelectorAll<HTMLButtonElement>('#game-actions button');
  actionButtons.forEach((btn) => {
    btn.disabled = true;
    btn.classList.add('btn-disabled');
  });
}

// Show status message feedback
function showStatusMessage(message: string, type: 'success' | 'error' | 'info') {
  const statusEl = document.getElementById('status-message');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status-message status-${type}`;
  statusEl.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (statusEl) {
      statusEl.style.display = 'none';
    }
  }, 5000);
}

// Action log management
const actionLogEntries: string[] = [];
const MAX_LOG_ENTRIES = 10;

function addActionToLog(action: GameAction | null, playerId: string) {
  if (!gameRoom) return;
  
  const game = (gameRoom as any).game;
  if (!game) return;
  
  if (action) {
    const player = game.players.find((p: any) => p.id === action.playerId);
    const actionText = formatActionForLog(action, player?.name || 'Unknown');
    
    actionLogEntries.unshift(actionText);
    if (actionLogEntries.length > MAX_LOG_ENTRIES) {
      actionLogEntries.pop();
    }
    
    renderActionLog();
  }
}

function formatActionForLog(action: GameAction, playerName: string): string {
  const timestamp = new Date(action.timestamp).toLocaleTimeString();
  let actionDesc = '';
  
  switch (action.type) {
    case ActionType.Rest:
      actionDesc = 'rested and took all cards back';
      break;
    case ActionType.PlayMerchantCard:
      actionDesc = 'played a merchant card';
      break;
    case ActionType.AcquireMerchantCard:
      actionDesc = 'acquired a merchant card';
      break;
    case ActionType.ClaimPointCard:
      actionDesc = 'claimed a point card';
      break;
    default:
      actionDesc = 'performed an action';
  }
  
  return `[${timestamp}] ${playerName} ${actionDesc}`;
}

function renderActionLog() {
  const logContent = document.getElementById('action-log-content');
  if (!logContent) return;
  
  if (actionLogEntries.length === 0) {
    logContent.innerHTML = '<div class="log-empty">No actions yet</div>';
  } else {
    logContent.innerHTML = actionLogEntries
      .map(entry => `<div class="log-entry">${entry}</div>`)
      .join('');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
