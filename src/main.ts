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
let isHost: boolean = false;

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
      <h1>Century: Golem Edition</h1>
      <p class="subtitle">Peer-to-Peer Multiplayer - No Server Required</p>
      
      <div class="tabs">
        <button class="tab-btn active" data-tab="create">Create Room</button>
        <button class="tab-btn" data-tab="join">Join Room</button>
      </div>
      
      <div class="tab-content active" id="create-tab">
        <h2>Create a Game Room</h2>
        <form id="create-form">
          <div class="form-group">
            <label>Your Name:</label>
            <input type="text" id="host-name-input" placeholder="Enter your name" required />
          </div>
          <div class="form-group">
            <label>Number of Players:</label>
            <input type="number" id="player-count" min="2" max="5" value="3" />
          </div>
          <button type="submit" class="btn-primary">Create Room</button>
        </form>
        <div id="room-info" style="display:none;">
          <h3>Room Created</h3>
          <p class="text-secondary"><strong>Share this Room Code with other players:</strong></p>
          <div style="margin: 15px 0;">
            <div class="room-code" id="room-code-display"></div>
          </div>
          <div id="players-waiting" style="margin-top: 20px;">
            <h4>Players Connected: <span id="connected-count">1</span>/<span id="total-count">3</span></h4>
            <div id="player-list"></div>
            <p class="text-secondary" style="margin-top: 15px;">Game will start automatically when all players join.</p>
          </div>
        </div>
      </div>
      
      <div class="tab-content" id="join-tab">
        <h2>Join a Game Room</h2>
        <form id="join-form">
          <div class="form-group">
            <label>Room Code:</label>
            <input type="text" id="room-code-input" placeholder="e.g., A3F9K2" required />
          </div>
          <div class="form-group">
            <label>Your Name:</label>
            <input type="text" id="player-name-input" placeholder="Enter your name" required />
          </div>
          <button type="submit" class="btn-primary">Join Room</button>
        </form>
      </div>
      
      <div id="game-area" style="display:none;">
        <h2>Game in Progress</h2>
        
        <div id="player-identity" class="info-panel">
          <span style="font-size: 15px; font-weight: bold;">You are:</span> <span id="your-player-name" style="font-size: 16px; font-weight: bold;"></span>
          <span id="host-indicator" style="display:none;" class="badge-host">Host</span>
        </div>
        
        <div id="turn-status" class="info-panel turn-indicator">
          <span id="turn-message">Waiting...</span>
        </div>
        
        <div id="status-message" class="status-message"></div>
        
        <div id="game-status" class="game-meta"></div>
        
        <div id="game-state" class="game-state">
          <div class="player-section">
            <h4>Your Caravan</h4>
            <div id="player-caravan" class="caravan-display"></div>
          </div>
          <div class="player-section">
            <h4>Your Hand</h4>
            <div id="player-hand" class="card-display"></div>
          </div>
          <div class="player-section">
            <h4>Play Area</h4>
            <div id="player-play-area" class="card-display"></div>
          </div>
        </div>
        
        <div id="shared-board" class="shared-board">
          <div class="board-section">
            <h4>Merchant Cards</h4>
            <div id="merchant-row" class="merchant-display"></div>
          </div>
          <div class="board-section">
            <h4>Point Cards</h4>
            <div id="point-row" class="point-display"></div>
          </div>
        </div>
        
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
      
      <div id="card-modal" class="modal" style="display:none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="modal-title">Select Card</h3>
            <button class="modal-close" id="modal-close">&times;</button>
          </div>
          <div class="modal-body" id="modal-body"></div>
          <div class="modal-footer">
            <button class="btn-action" id="modal-cancel">Cancel</button>
          </div>
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
  
  const hostName = (document.getElementById('host-name-input') as HTMLInputElement).value.trim();
  const playerCount = parseInt((document.getElementById('player-count') as HTMLInputElement).value);
  
  if (!hostName) {
    alert('Please enter your name');
    return;
  }
  
  const roomInfo = document.getElementById('room-info');
  const codeDisplay = document.getElementById('room-code-display');
  
  if (!roomInfo || !codeDisplay) return;
  
  try {
    // Create P2P room
    gameRoom = new P2PGameRoom();
    
    // Set up event listeners
    gameRoom.on('room-created', ({ roomCode, hostPeerId, playerCount }) => {
      codeDisplay.textContent = roomCode;
      
      const totalCount = document.getElementById('total-count');
      if (totalCount) {
        totalCount.textContent = playerCount.toString();
      }
      
      // Host is automatically player_0 (first player)
      const game = (gameRoom as any).game;
      if (game && game.players && game.players.length > 0) {
        currentPlayerId = game.players[0].id;
        isHost = true;  // Mark that we are the host
        const playerNameEl = document.getElementById('your-player-name');
        if (playerNameEl) {
          playerNameEl.textContent = game.players[0].name;
        }
        const hostIndicator = document.getElementById('host-indicator');
        if (hostIndicator) {
          hostIndicator.style.display = 'inline-block';
        }
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
    
    // Generate player names (host is first player)
    const playerNames = [hostName, ...Array.from({ length: playerCount - 1 }, (_, i) => `Player ${i + 2}`)];
    
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
  
  playerList.innerHTML = game.players.map((player: any, index: number) => {
    const isConnected = connectedPlayerIds.has(player.id);
    const statusIcon = isConnected ? '✅' : '⏳';
    const statusText = isConnected ? 'Connected' : 'Waiting...';
    const hostLabel = index === 0 ? ' (Host)' : '';
    return `<div style="padding: 5px 0;">${statusIcon} ${player.name}${hostLabel} - ${statusText}</div>`;
  }).join('');
  
  connectedCount.textContent = connectedPlayerIds.size.toString();
}

async function handleJoinRoom(event: Event) {
  event.preventDefault();
  
  const roomCode = (document.getElementById('room-code-input') as HTMLInputElement).value.trim().toUpperCase();
  const playerName = (document.getElementById('player-name-input') as HTMLInputElement).value.trim();
  
  if (!roomCode || !playerName) {
    alert('Please fill in all fields');
    return;
  }
  
  // Derive peer ID from room code (same format as host)
  const hostPeerId = `boardgame-${roomCode.toLowerCase()}`;
  
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
      isHost = false;  // Mark that we are NOT the host
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

async function executeAction(action: GameAction) {
  if (isHost) {
    // Host processes action directly
    showStatusMessage('Processing action...', 'info');
    const result = (gameRoom as any).processAction(action);
    if (result.valid) {
      showStatusMessage('Action processed successfully', 'success');
      addActionToLog(action, currentPlayerId);
    } else {
      showStatusMessage(`Invalid action: ${result.error}`, 'error');
    }
    actionInProgress = false;
  } else {
    // Client sends action to host
    if (!gameClient) {
      showStatusMessage('Not connected to room', 'error');
      actionInProgress = false;
      return;
    }
    showStatusMessage('Sending action to host...', 'info');
    await gameClient.sendAction(action);
  }
}

async function handleGameAction(actionType: string) {
  if (actionInProgress) {
    return;
  }
  
  if (!currentPlayerId) {
    showStatusMessage('Player ID not set', 'error');
    return;
  }
  
  if (isHost && !gameRoom) {
    showStatusMessage('Host room not initialized', 'error');
    return;
  }
  
  if (!isHost && !gameClient) {
    showStatusMessage('Not connected to a room', 'error');
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
        await showCardSelectionModal('Play a card from your hand', 'hand', async (cardId: string) => {
          action = {
            type: ActionType.PlayMerchantCard,
            playerId: currentPlayerId,
            timestamp: Date.now(),
            cardId
          };
          await executeAction(action);
        });
        return;
        
      case 'take-merchant':
        await showCardSelectionModal('Acquire merchant card', 'merchant-row', async (cardIndex: string) => {
          const game = isHost ? (gameRoom as any).game : (gameClient as any)?.lastGameState;
          const idx = parseInt(cardIndex);
          const card = game?.merchantRow.cards[idx];
          if (!card) {
            showStatusMessage('Invalid card selection', 'error');
            actionInProgress = false;
            return;
          }
          action = {
            type: ActionType.AcquireMerchantCard,
            playerId: currentPlayerId,
            timestamp: Date.now(),
            rowIndex: idx,
            cardId: card.id
          };
          await executeAction(action);
        });
        return;
        
      case 'claim-vp':
        await showCardSelectionModal('Claim point card', 'point-row', async (cardIndex: string) => {
          const game = isHost ? (gameRoom as any).game : (gameClient as any)?.lastGameState;
          const idx = parseInt(cardIndex);
          const card = game?.pointCardRow.cards[idx];
          if (!card) {
            showStatusMessage('Invalid card selection', 'error');
            actionInProgress = false;
            return;
          }
          // Use the card's cost as payment (game engine will validate)
          action = {
            type: ActionType.ClaimPointCard,
            playerId: currentPlayerId,
            timestamp: Date.now(),
            rowIndex: idx,
            cardId: card.id,
            payment: card.cost
          };
          await executeAction(action);
        });
        return;
        
      default:
        showStatusMessage('Unknown action type', 'error');
        actionInProgress = false;
        return;
    }
    
    await executeAction(action);
    
  } catch (error) {
    showStatusMessage(`Failed to send action: ${(error as Error).message}`, 'error');
    actionInProgress = false;
  }
}

// Card selection modal
function showCardSelectionModal(title: string, source: string, onSelect: (selection: string) => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const modal = document.getElementById('card-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');
    
    if (!modal || !modalTitle || !modalBody || !modalClose || !modalCancel) {
      actionInProgress = false;
      resolve();
      return;
    }
    
    modalTitle.textContent = title;
    modalBody.innerHTML = '';
    
    // Get game state
    const game = isHost ? (gameRoom as any).game : (gameClient as any)?.lastGameState;
    if (!game) {
      showStatusMessage('Game state not available', 'error');
      actionInProgress = false;
      resolve();
      return;
    }
    
    const myPlayer = game.players.find((p: any) => p.id === currentPlayerId);
    if (!myPlayer) {
      showStatusMessage('Player not found', 'error');
      actionInProgress = false;
      resolve();
      return;
    }
    
    let items: any[] = [];
    
    if (source === 'hand') {
      items = myPlayer.hand;
    } else if (source === 'merchant-row') {
      items = game.merchantRow.cards.filter((c: any) => c !== null);
    } else if (source === 'point-row') {
      items = game.pointRow.cards.filter((c: any) => c !== null);
    }
    
    if (items.length === 0) {
      modalBody.innerHTML = '<p style="padding: 20px; text-align: center; color: #6B5D50;">No cards available</p>';
    } else {
      items.forEach((item, index) => {
        const button = document.createElement('button');
        const cardClass = getCardTypeClass(item);
        button.className = `btn-action card-select-btn ${cardClass}`;
        button.style.width = '100%';
        button.style.marginBottom = '10px';
        
        if (source === 'hand') {
          button.textContent = formatCardName(item);
          button.onclick = async () => {
            modal.style.display = 'none';
            await onSelect(item.id);
            resolve();
          };
        } else {
          const actualIndex = source === 'merchant-row' 
            ? game.merchantRow.cards.findIndex((c: any) => c && c.id === item.id)
            : game.pointRow.cards.findIndex((c: any) => c && c.id === item.id);
          button.textContent = formatCardName(item);
          button.onclick = async () => {
            modal.style.display = 'none';
            await onSelect(actualIndex.toString());
            resolve();
          };
        }
        
        modalBody.appendChild(button);
      });
    }
    
    const closeModal = () => {
      modal.style.display = 'none';
      actionInProgress = false;
      resolve();
    };
    
    modalClose.onclick = closeModal;
    modalCancel.onclick = closeModal;
    
    modal.style.display = 'flex';
  });
}

function formatCardName(card: any): string {
  if (card.type === 'PRODUCE') {
    const crystals = Object.entries(card.produces)
      .filter(([_, count]) => (count as number) > 0)
      .map(([color, count]) => `${count} ${color}`)
      .join(', ');
    return `Produce: ${crystals}`;
  } else if (card.type === 'UPGRADE') {
    return `Upgrade: ${card.upgrades.length} levels`;
  } else if (card.type === 'TRADE') {
    return 'Trade Card';
  } else if (card.points !== undefined) {
    return `<span class="card-points">${card.points} VP</span>`;
  }
  return 'Card';
}

function getCardTypeClass(card: any): string {
  if (card.points !== undefined) {
    return 'card-item point-card';
  } else if (card.type === 'PRODUCE') {
    return 'card-item merchant-card merchant-produce';
  } else if (card.type === 'UPGRADE') {
    return 'card-item merchant-card merchant-upgrade';
  } else if (card.type === 'TRADE') {
    return 'card-item merchant-card merchant-trade';
  }
  return 'card-item merchant-card';
}

function updatePlayerDisplay(game: any) {
  const myPlayer = game.players.find((p: any) => p.id === currentPlayerId);
  if (!myPlayer) return;
  
  // Update caravan
  const caravanEl = document.getElementById('player-caravan');
  if (caravanEl) {
    const crystals = Object.entries(myPlayer.caravan)
      .filter(([_, count]) => (count as number) > 0)
      .map(([color, count]) => `<span class="crystal crystal-${color.toLowerCase()}">${color}: ${count}</span>`)
      .join(' ');
    caravanEl.innerHTML = crystals || '<span style="color: #8B7355;">Empty</span>';
  }
  
  // Update hand
  const handEl = document.getElementById('player-hand');
  if (handEl) {
    if (myPlayer.hand.length === 0) {
      handEl.innerHTML = '<span style="color: #8B7355;">No cards</span>';
    } else {
      handEl.innerHTML = myPlayer.hand
        .map((card: any) => {
          const cardClass = getCardTypeClass(card);
          return `<div class="${cardClass} playable">${formatCardName(card)}</div>`;
        })
        .join('');
    }
  }
  
  // Update play area
  const playAreaEl = document.getElementById('player-play-area');
  if (playAreaEl) {
    if (myPlayer.playArea.length === 0) {
      playAreaEl.innerHTML = '<span style="color: #8B7355;">No cards played</span>';
    } else {
      playAreaEl.innerHTML = myPlayer.playArea
        .map((card: any) => {
          const cardClass = getCardTypeClass(card);
          return `<div class="${cardClass} unplayable">${formatCardName(card)}</div>`;
        })
        .join('');
    }
  }
  
  // Update merchant row
  const merchantRowEl = document.getElementById('merchant-row');
  if (merchantRowEl) {
    merchantRowEl.innerHTML = game.merchantRow.cards
      .map((card: any, i: number) => {
        if (card === null) {
          return `<div class="card-slot empty">Empty</div>`;
        }
        const cardClass = getCardTypeClass(card);
        return `<div class="${cardClass}">${formatCardName(card)}</div>`;
      })
      .join('');
  }
  
  // Update point row
  const pointRowEl = document.getElementById('point-row');
  if (pointRowEl) {
    pointRowEl.innerHTML = game.pointRow.cards
      .map((card: any, i: number) => {
        if (card === null) {
          return `<div class="card-slot empty">Empty</div>`;
        }
        return `<div class="card-item point-card"><span class="card-points">${card.points} VP</span></div>`;
      })
      .join('');
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
  
  // Update player display
  updatePlayerDisplay(game);
  
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
