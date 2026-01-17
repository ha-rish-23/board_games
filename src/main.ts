/**
 * Main Entry Point for Vite
 * 
 * This file is the entry point referenced by index.html.
 * Vite will compile and bundle this TypeScript into browser-compatible JavaScript.
 */

import './main.css';
import { P2PGameRoom } from './p2p/browserRoom';
import { P2PGameClient } from './p2p/browserClient';

// Global instances
let gameRoom: P2PGameRoom | null = null;
let gameClient: P2PGameClient | null = null;

// Main application initialization
function initApp() {
  console.log('initApp called');
  const app = document.getElementById('app');
  
  if (!app) {
    console.error('App mount point not found');
    return;
  }
  
  console.log('App element found, rendering UI...');
  
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
        <div id="game-status"></div>
      </div>
    </div>
  `;
  
  console.log('UI rendered, setting up listeners...');
  setupEventListeners();
  console.log('App initialized successfully!');
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
      console.log('Room created:', roomCode, hostPeerId);
      codeDisplay.textContent = roomCode;
      peerDisplay.textContent = hostPeerId;
      roomInfo.style.display = 'block';
    });
    
    gameRoom.on('peer-connected', ({ peerId, playerName }) => {
      console.log('Peer connected:', peerId, playerName);
      alert(`Player ${playerName} joined the room!`);
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
      console.log('Connected to room');
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
      console.log('Disconnected from room');
      alert('Disconnected from room');
    });
    
    gameClient.on('game-state-received', (game) => {
      console.log('Game state received:', game);
      const statusEl = document.getElementById('game-status');
      if (statusEl) {
        statusEl.textContent = `Game Turn: ${game.turnNumber} | Phase: ${game.phase}`;
      }
    });
    
    gameClient.on('error', (error: Error) => {
      console.error('Client error:', error);
      alert(`Error: ${error.message}`);
    });
    
    // Generate player ID
    const playerId = `player_${Date.now()}`;
    
    // Join room
    console.log('Joining room:', { roomCode, hostPeerId, playerId, playerName });
    await gameClient.joinRoomWithPeerId(roomCode, hostPeerId, playerId, playerName);
    
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

// Initialize when DOM is ready
console.log('Script loaded, readyState:', document.readyState);

if (document.readyState === 'loading') {
  console.log('Waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired');
    initApp();
  });
} else {
  console.log('DOM already ready, initializing...');
  initApp();
}
