/**
 * Main Entry Point for Vite
 * 
 * This file is the entry point referenced by index.html.
 * Vite will compile and bundle this TypeScript into browser-compatible JavaScript.
 */

import './main.css';

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
        <div id="game-status"></div>
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
      switchTab(tabName);
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
  
  const playerCount = (document.getElementById('player-count') as HTMLInputElement).value;
  
  // For now, just show a placeholder
  const roomInfo = document.getElementById('room-info');
  const codeDisplay = document.getElementById('room-code-display');
  const peerDisplay = document.getElementById('peer-id-display');
  
  if (roomInfo && codeDisplay && peerDisplay) {
    // Generate placeholder room code
    const roomCode = generateRoomCode();
    const peerId = `host_${roomCode}_${Date.now()}`;
    
    codeDisplay.textContent = roomCode;
    peerDisplay.textContent = peerId;
    roomInfo.style.display = 'block';
    
    console.log('Room created:', { playerCount, roomCode, peerId });
    alert(`Room created!\nCode: ${roomCode}\nShare the code and peer ID with other players.`);
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
  
  console.log('Joining room:', { roomCode, hostPeerId, playerName });
  alert(`Joining room ${roomCode} as ${playerName}...\n(P2P connection not yet implemented)`);
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
