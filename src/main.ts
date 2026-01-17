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
          <h3>Room Created!</h3>
          <p>Share this room code with other players:</p>
          <div class="room-code" id="room-code-display"></div>
          <p>Share this peer ID:</p>
          <div class="peer-id" id="peer-id-display"></div>
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
        <div id="game-status" style="margin-bottom: 20px;"></div>
        
        <div id="game-actions" style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn-primary" id="action-play-card">Play Card</button>
          <button class="btn-primary" id="action-take-merchant">Take Merchant Card</button>
          <button class="btn-primary" id="action-claim-vp">Claim Victory Points</button>
          <button class="btn-primary" id="action-rest">Rest (Take All Cards)</button>
        </div>
        
        <div id="action-result" style="margin-top: 20px; padding: 10px; border-radius: 4px; display:none;"></div>
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
  
  // Game action buttons
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
    gameRoom.on('room-created', ({ roomCode, hostPeerId }) => {
      codeDisplay.textContent = roomCode;
      peerDisplay.textContent = hostPeerId;
      roomInfo.style.display = 'block';
    });
    
    gameRoom.on('peer-connected', ({ peerId, playerName }) => {
      alert(`Player ${playerName} joined the room!`);
    });
    
    gameRoom.on('game-state-updated', (game) => {
      // Host also sees game updates
      const gameArea = document.getElementById('game-area');
      if (gameArea && game.phase !== 'SETUP') {
        gameArea.style.display = 'block';
        updateGameUI(game);
      }
    });
    
    gameRoom.on('action-processed', (action, success) => {
      if (success) {
        showActionResult('Action processed successfully', 'success');
      } else {
        showActionResult('Action processing failed', 'error');
      }
    });
    
    gameRoom.on('room-error', (error: Error) => {
      console.error('Room error:', error);
      alert(`Error: ${error.message}`);
    });
    
    // Generate player names
    const playerNames = Array.from({ length: playerCount }, (_, i) => `Player ${i + 1}`);
    
    // Create room
    await gameRoom.createRoom(playerNames);
    
  } catch (error) {
    console.error('Failed to create room:', error);
    alert(`Failed to create room: ${(error as Error).message}`);
  }
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
      alert(`Successfully joined room ${roomCode}!`);
      // Hide forms, show game area
      document.getElementById('create-tab')!.style.display = 'none';
      document.getElementById('join-tab')!.style.display = 'none';
      const gameArea = document.getElementById('game-area');
      if (gameArea) {
        gameArea.style.display = 'block';
        document.getElementById('game-status')!.textContent = `Connected as ${playerName}`;
      }
    });
    
    gameClient.on('disconnected', () => {
      alert('Disconnected from room');
    });
    
    gameClient.on('game-state-received', (game) => {
      updateGameUI(game);
    });
    
    gameClient.on('action-accepted', (action) => {
      showActionResult('Action accepted! Waiting for state update...', 'success');
    });
    
    gameClient.on('action-rejected', (action, error) => {
      showActionResult(`Action rejected: ${error}`, 'error');
    });
    
    gameClient.on('error', (error: Error) => {
      console.error('Client error:', error);
      alert(`Error: ${error.message}`);
    });
    
    // Generate player ID and store it
    currentPlayerId = `player_${Date.now()}`;
    
    // Join room
    await gameClient.joinRoomWithPeerId(roomCode, hostPeerId, currentPlayerId, playerName);
    
  } catch (error) {
    console.error('Failed to join room:', error);
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
async function handleGameAction(actionType: string) {
  if (!gameClient) {
    showActionResult('Not connected to a room', 'error');
    return;
  }
  
  if (!currentPlayerId) {
    showActionResult('Player ID not set', 'error');
    return;
  }
  
  try {
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
        // For demo: play first card in hand
        showActionResult('Select a card to play (UI not implemented)', 'error');
        return;
        
      case 'take-merchant':
        // For demo: take first available merchant card
        showActionResult('Select a merchant card (UI not implemented)', 'error');
        return;
        
      case 'claim-vp':
        // For demo: claim first available victory point card
        showActionResult('Select a victory point card (UI not implemented)', 'error');
        return;
        
      default:
        showActionResult('Unknown action type', 'error');
        return;
    }
    
    // Send action to host via P2P
    showActionResult('Sending action to host...', 'info');
    await gameClient.sendAction(action);
    
  } catch (error) {
    showActionResult(`Failed to send action: ${(error as Error).message}`, 'error');
  }
}

// Update UI with game state
function updateGameUI(game: any) {
  const statusEl = document.getElementById('game-status');
  if (statusEl) {
    const currentPlayer = game.players[game.currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === currentPlayerId;
    
    statusEl.innerHTML = `
      <div><strong>Turn:</strong> ${game.turnNumber} | <strong>Phase:</strong> ${game.phase}</div>
      <div><strong>Current Player:</strong> ${currentPlayer?.name || 'Unknown'} ${isMyTurn ? '(YOUR TURN)' : ''}</div>
      <div><strong>Players:</strong> ${game.players.length}</div>
    `;
  }
  
  // Enable/disable action buttons based on turn
  const isMyTurn = game.players[game.currentPlayerIndex]?.id === currentPlayerId;
  const actionButtons = document.querySelectorAll('#game-actions button');
  actionButtons.forEach((btn: any) => {
    btn.disabled = !isMyTurn;
    btn.style.opacity = isMyTurn ? '1' : '0.5';
  });
}

// Show action result feedback
function showActionResult(message: string, type: 'success' | 'error' | 'info') {
  const resultEl = document.getElementById('action-result');
  if (!resultEl) return;
  
  resultEl.textContent = message;
  resultEl.style.display = 'block';
  
  // Color coding
  if (type === 'success') {
    resultEl.style.backgroundColor = '#4caf50';
    resultEl.style.color = 'white';
  } else if (type === 'error') {
    resultEl.style.backgroundColor = '#f44336';
    resultEl.style.color = 'white';
  } else {
    resultEl.style.backgroundColor = '#2196f3';
    resultEl.style.color = 'white';
  }
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (resultEl) {
      resultEl.style.display = 'none';
    }
  }, 5000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
