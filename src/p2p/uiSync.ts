/**
 * UI State Synchronization
 * 
 * Demonstrates correct UI state management for P2P multiplayer:
 * 1. UI re-renders ONLY from received Game state
 * 2. NO local assumptions about turn or legality
 * 3. Buttons disabled when not player's turn
 * 4. Clear error messages from host
 * 
 * CORRECTNESS RULES:
 * - Never predict state changes
 * - Never assume actions will succeed
 * - Always wait for host confirmation
 * - Re-render entire UI on every state update
 */

import { P2PGameClient } from './browserClient';
import {
  Game,
  GameAction,
  ActionType,
  Player,
  MerchantCard,
  PointCard,
  CrystalColor,
  CrystalSet
} from '../types/domain';

// ============================================================================
// SYNCHRONIZED UI STATE MANAGER
// ============================================================================

/**
 * Manages UI state based ONLY on received game state.
 * 
 * Key principles:
 * - UI state = game state (no local predictions)
 * - Buttons enabled = isMyTurn && connected
 * - All actions go through host validation
 * - UI updates ONLY after receiving new state from host
 */
export class SynchronizedGameUI {
  private client: P2PGameClient;
  private myPlayerId: string;
  
  // Current state (received from host)
  private currentGame: Game | null = null;
  private connected: boolean = false;
  
  // UI state (derived from game state, never predicted)
  private isMyTurn: boolean = false;
  private myPlayer: Player | null = null;
  
  // Action feedback
  private pendingAction: boolean = false;
  private lastError: string | null = null;
  
  // Host disconnect state
  private hostDisconnected: boolean = false;
  
  constructor(client: P2PGameClient, playerId: string) {
    this.client = client;
    this.myPlayerId = playerId;
    this.setupEventListeners();
  }
  
  // ==========================================================================
  // EVENT LISTENERS (State Updates)
  // ==========================================================================
  
  private setupEventListeners(): void {
    // Connected to room
    this.client.on('connected', () => {
      this.connected = true;
      this.updateUIState();
    });
    
    // Disconnected from room
    this.client.on('disconnected', () => {
      this.connected = false;
      this.updateUIState();
    });
    
    // GAME STATE RECEIVED - This is the ONLY source of truth
    this.client.on('game-state-received', (game: Game) => {
      console.log('[UI] Received game state, turn:', game.turnNumber);
      
      // Replace entire state (never patch)
      this.currentGame = game;
      
      // Derive UI state from game state
      this.deriveUIState();
      
      // Re-render entire UI
      this.render();
      
      // Clear pending action flag
      this.pendingAction = false;
    });
    
    // Action accepted by host
    this.client.on('action-accepted', (action: GameAction) => {
      console.log('[UI] Action accepted:', action.type);
      this.lastError = null;
      this.showMessage('Action accepted. Waiting for state update...', 'info');
      // DO NOT modify state here - wait for game-state-received
    });
    
    // Action rejected by host
    this.client.on('action-rejected', (action: GameAction, error: string) => {
      console.error('[UI] Action rejected:', error);
      this.lastError = error;
      this.pendingAction = false;
      this.showMessage(`Action rejected: ${error}`, 'error');
      this.updateUIState(); // Re-enable buttons
    });
    
    // Host disconnected - Game ends immediately
    this.client.on('host-disconnected', () => {
      console.log('[UI] Host disconnected - ending game');
      this.hostDisconnected = true;
      this.connected = false;
      this.currentGame = null;
      this.showMessage('Host disconnected. Game ended.', 'error');
      this.updateUIState();
    });
    
    // Reconnected (should not happen after host disconnect, but handle it)
    this.client.on('reconnected', () => {
      console.log('[UI] Reconnected to host');
      this.showMessage('Reconnected to host!', 'success');
      this.connected = true;
      this.hostDisconnected = false;
      this.updateUIState();
    });
  }
  
  // ==========================================================================
  // STATE DERIVATION (Never Predict, Only Derive)
  // ==========================================================================
  
  /**
   * Derive UI state from game state.
   * NO predictions, NO assumptions.
   */
  private deriveUIState(): void {
    if (!this.currentGame) {
      this.isMyTurn = false;
      this.myPlayer = null;
      return;
    }
    
    // Find my player in game state
    this.myPlayer = this.currentGame.players.find(p => p.id === this.myPlayerId) || null;
    
    if (!this.myPlayer) {
      console.error('[UI] Player not found in game state');
      this.isMyTurn = false;
      return;
    }
    
    // Determine if it's my turn (from game state, not predicted)
    const currentPlayer = this.currentGame.players[this.currentGame.currentPlayerIndex];
    this.isMyTurn = currentPlayer.id === this.myPlayerId;
    
    console.log('[UI] Turn:', this.currentGame.turnNumber, 
                'Current player:', currentPlayer.name,
                'Is my turn:', this.isMyTurn);
  }
  
  /**
   * Update UI elements based on current state.
   * Called after state derivation or connection changes.
   */
  private updateUIState(): void {
    this.render();
  }
  
  // ==========================================================================
  // ACTION HANDLERS (Send to Host, Wait for Confirmation)
  // ==========================================================================
  
  /**
   * Play merchant card from hand.
   * 
   * CORRECTNESS:
   * - Does NOT apply action locally
   * - Does NOT predict next state
   * - Waits for host to send new state
   */
  async playCard(cardId: string): Promise<void> {
    if (!this.canSendAction()) return;
    
    console.log('[UI] User requested: play card', cardId);
    
    this.pendingAction = true;
    this.updateUIState(); // Disable buttons while pending
    
    try {
      const action: GameAction = {
        type: ActionType.PlayMerchantCard,
        playerId: this.myPlayerId,
        cardId: cardId,
        timestamp: Date.now()
      };
      
      // Send to host (NO local mutation)
      await this.client.sendAction(action);
      
      // Success only means request was sent
      // Actual result comes via 'action-accepted' or 'action-rejected'
      // New state comes via 'game-state-received'
      
    } catch (error) {
      console.error('[UI] Failed to send action:', error);
      this.showMessage('Failed to send action: ' + (error as Error).message, 'error');
      this.pendingAction = false;
      this.updateUIState();
    }
  }
  
  /**
   * Acquire merchant card from market row.
   */
  async acquireCard(rowIndex: number): Promise<void> {
    if (!this.canSendAction() || !this.currentGame) return;
    
    const card = this.currentGame.merchantRow.cards[rowIndex];
    if (!card) {
      this.showMessage('No card at that position', 'error');
      return;
    }
    
    console.log('[UI] User requested: acquire card at index', rowIndex);
    
    this.pendingAction = true;
    this.updateUIState();
    
    try {
      const action: GameAction = {
        type: ActionType.AcquireMerchantCard,
        playerId: this.myPlayerId,
        rowIndex: rowIndex,
        cardId: card.id,
        timestamp: Date.now()
      };
      
      await this.client.sendAction(action);
      
    } catch (error) {
      console.error('[UI] Failed to send action:', error);
      this.showMessage('Failed to send action: ' + (error as Error).message, 'error');
      this.pendingAction = false;
      this.updateUIState();
    }
  }
  
  /**
   * Claim point card from market row.
   */
  async claimPointCard(rowIndex: number): Promise<void> {
    if (!this.canSendAction() || !this.currentGame || !this.myPlayer) return;
    
    const card = this.currentGame.pointCardRow.cards[rowIndex];
    if (!card) {
      this.showMessage('No card at that position', 'error');
      return;
    }
    
    console.log('[UI] User requested: claim point card at index', rowIndex);
    
    this.pendingAction = true;
    this.updateUIState();
    
    try {
      const action: GameAction = {
        type: ActionType.ClaimPointCard,
        playerId: this.myPlayerId,
        rowIndex: rowIndex,
        cardId: card.id,
        payment: { ...this.myPlayer.caravan }, // Current caravan from state
        timestamp: Date.now()
      };
      
      await this.client.sendAction(action);
      
    } catch (error) {
      console.error('[UI] Failed to send action:', error);
      this.showMessage('Failed to send action: ' + (error as Error).message, 'error');
      this.pendingAction = false;
      this.updateUIState();
    }
  }
  
  /**
   * Rest action (recover all played cards).
   */
  async rest(): Promise<void> {
    if (!this.canSendAction()) return;
    
    console.log('[UI] User requested: rest');
    
    this.pendingAction = true;
    this.updateUIState();
    
    try {
      const action: GameAction = {
        type: ActionType.Rest,
        playerId: this.myPlayerId,
        timestamp: Date.now()
      };
      
      await this.client.sendAction(action);
      
    } catch (error) {
      console.error('[UI] Failed to send action:', error);
      this.showMessage('Failed to send action: ' + (error as Error).message, 'error');
      this.pendingAction = false;
      this.updateUIState();
    }
  }
  
  /**
   * Check if we can send an action.
   * 
   * CORRECTNESS: Only checks current state, no predictions.
   */
  private canSendAction(): boolean {
    if (this.hostDisconnected) {
      this.showMessage('Host disconnected. Game ended.', 'error');
      return false;
    }
    
    if (!this.connected) {
      this.showMessage('Not connected to room', 'error');
      return false;
    }
    
    if (!this.currentGame) {
      this.showMessage('Game not loaded', 'error');
      return false;
    }
    
    if (!this.isMyTurn) {
      this.showMessage('Not your turn', 'error');
      return false;
    }
    
    if (this.pendingAction) {
      this.showMessage('Action in progress, please wait', 'warning');
      return false;
    }
    
    return true;
  }
  
  // ==========================================================================
  // RENDERING (From State, Never Predicted)
  // ==========================================================================
  
  /**
   * Render entire UI from current state.
   * 
   * CORRECTNESS:
   * - Renders ONLY what exists in currentGame
   * - Buttons enabled ONLY if isMyTurn && connected && !pendingAction
   * - No optimistic updates
   */
  private render(): void {
    if (!this.currentGame) {
      this.renderNoGame();
      return;
    }
    
    if (!this.myPlayer) {
      this.renderPlayerNotFound();
      return;
    }
    
    // Render all sections
    this.renderConnectionStatus();
    this.renderTurnIndicator();
    this.renderMyHand();
    this.renderMerchantRow();
    this.renderPointCardRow();
    this.renderRestButton();
    this.renderMyCaravan();
    this.renderMyPointCards();
    this.renderOtherPlayers();
    this.renderGameInfo();
  }
  
  private renderNoGame(): void {
    if (this.hostDisconnected) {
      this.setHTML('game-display', '<p>Host disconnected. Game ended.</p>');
    } else {
      this.setHTML('game-display', '<p>Waiting for game state...</p>');
    }
  }
  
  private renderPlayerNotFound(): void {
    this.setHTML('game-display', '<p>Error: Player not found in game</p>');
  }
  
  private renderConnectionStatus(): void {
    const statusEl = this.getElement('connection-status');
    if (!statusEl) return;
    
    if (this.connected) {
      statusEl.textContent = 'Connected';
      statusEl.className = 'connected';
    } else {
      statusEl.textContent = 'Disconnected';
      statusEl.className = 'disconnected';
    }
  }
  
  private renderTurnIndicator(): void {
    const indicatorEl = this.getElement('turn-indicator');
    if (!indicatorEl || !this.currentGame) return;
    
    const currentPlayer = this.currentGame.players[this.currentGame.currentPlayerIndex];
    
    if (this.isMyTurn) {
      indicatorEl.textContent = `Your Turn (Turn ${this.currentGame.turnNumber})`;
      indicatorEl.className = 'my-turn';
    } else {
      indicatorEl.textContent = `${currentPlayer.name}'s Turn (Turn ${this.currentGame.turnNumber})`;
      indicatorEl.className = 'not-my-turn';
    }
    
    if (this.pendingAction) {
      indicatorEl.textContent += ' - Action in progress...';
    }
  }
  
  private renderMyHand(): void {
    const handEl = this.getElement('my-hand');
    if (!handEl || !this.myPlayer) return;
    
    handEl.innerHTML = '<h3>Your Hand</h3>';
    
    if (this.myPlayer.hand.length === 0) {
      handEl.innerHTML += '<p>No cards in hand</p>';
      return;
    }
    
    this.myPlayer.hand.forEach((card) => {
      const cardDiv = document.createElement('div');
      cardDiv.className = 'card';
      cardDiv.innerHTML = `
        <div>Card: ${card.id.substring(0, 8)}</div>
        <div>Type: ${card.type}</div>
      `;
      
      const playBtn = document.createElement('button');
      playBtn.textContent = 'Play Card';
      playBtn.disabled = !this.canInteract();
      playBtn.onclick = () => this.playCard(card.id);
      
      cardDiv.appendChild(playBtn);
      handEl.appendChild(cardDiv);
    });
  }
  
  private renderMerchantRow(): void {
    const rowEl = this.getElement('merchant-row');
    if (!rowEl || !this.currentGame) return;
    
    rowEl.innerHTML = '<h3>Merchant Cards (Market)</h3>';
    
    this.currentGame.merchantRow.cards.forEach((card, index) => {
      const slotDiv = document.createElement('div');
      slotDiv.className = 'card-slot';
      
      if (card) {
        slotDiv.innerHTML = `
          <div>Card: ${card.id.substring(0, 8)}</div>
          <div>Type: ${card.type}</div>
          <div>Cost: ${index} Yellow</div>
        `;
        
        const acquireBtn = document.createElement('button');
        acquireBtn.textContent = 'Acquire';
        acquireBtn.disabled = !this.canInteract();
        acquireBtn.onclick = () => this.acquireCard(index);
        
        slotDiv.appendChild(acquireBtn);
      } else {
        slotDiv.innerHTML = '<div>Empty slot</div>';
      }
      
      rowEl.appendChild(slotDiv);
    });
  }
  
  private renderPointCardRow(): void {
    const rowEl = this.getElement('point-card-row');
    if (!rowEl || !this.currentGame) return;
    
    rowEl.innerHTML = '<h3>Point Cards</h3>';
    
    this.currentGame.pointCardRow.cards.forEach((card, index) => {
      const slotDiv = document.createElement('div');
      slotDiv.className = 'card-slot';
      
      if (card) {
        slotDiv.innerHTML = `
          <div>Points: ${card.points}</div>
          <div>Cost: ${this.formatCrystalSet(card.cost)}</div>
        `;
        
        const claimBtn = document.createElement('button');
        claimBtn.textContent = 'Claim';
        claimBtn.disabled = !this.canInteract();
        claimBtn.onclick = () => this.claimPointCard(index);
        
        slotDiv.appendChild(claimBtn);
      } else {
        slotDiv.innerHTML = '<div>Empty slot</div>';
      }
      
      rowEl.appendChild(slotDiv);
    });
  }
  
  private renderRestButton(): void {
    const btnEl = this.getElement('rest-button') as HTMLButtonElement;
    if (!btnEl) return;
    
    btnEl.textContent = 'Rest (Recover All Cards)';
    btnEl.disabled = !this.canInteract();
    btnEl.onclick = () => this.rest();
  }
  
  private renderMyCaravan(): void {
    const caravanEl = this.getElement('my-caravan');
    if (!caravanEl || !this.myPlayer) return;
    
    caravanEl.innerHTML = '<h3>Your Caravan</h3>';
    caravanEl.innerHTML += `<p>${this.formatCrystalSet(this.myPlayer.caravan)}</p>`;
  }
  
  private renderMyPointCards(): void {
    const pointCardsEl = this.getElement('my-point-cards');
    if (!pointCardsEl || !this.myPlayer) return;
    
    pointCardsEl.innerHTML = '<h3>Your Point Cards</h3>';
    pointCardsEl.innerHTML += `
      <p>Total: ${this.myPlayer.pointCards.length} cards</p>
      <p>Score: ${this.myPlayer.score} points</p>
    `;
  }
  
  private renderOtherPlayers(): void {
    const playersEl = this.getElement('other-players');
    if (!playersEl || !this.currentGame) return;
    
    playersEl.innerHTML = '<h3>Other Players</h3>';
    
    this.currentGame.players
      .filter(p => p.id !== this.myPlayerId)
      .forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-info';
        playerDiv.innerHTML = `
          <div>${player.name}</div>
          <div>Score: ${player.score}</div>
          <div>Point Cards: ${player.pointCards.length}</div>
          <div>Hand: ${player.hand.length} cards</div>
        `;
        playersEl.appendChild(playerDiv);
      });
  }
  
  private renderGameInfo(): void {
    const infoEl = this.getElement('game-info');
    if (!infoEl || !this.currentGame) return;
    
    infoEl.innerHTML = `
      <h3>Game Info</h3>
      <p>Phase: ${this.currentGame.phase}</p>
      <p>Turn: ${this.currentGame.turnNumber}</p>
      <p>Players: ${this.currentGame.players.length}</p>
    `;
  }
  
  /**
   * Check if user can interact with buttons.
   * 
   * CORRECTNESS: Based ONLY on current state, no predictions.
   */
  private canInteract(): boolean {
    return !this.hostDisconnected &&
           this.connected && 
           this.isMyTurn && 
           !this.pendingAction &&
           this.currentGame !== null;
  }
  
  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  private formatCrystalSet(crystals: CrystalSet): string {
    const parts: string[] = [];
    
    if (crystals[CrystalColor.Yellow] > 0) parts.push(`${crystals[CrystalColor.Yellow]} Yellow`);
    if (crystals[CrystalColor.Green] > 0) parts.push(`${crystals[CrystalColor.Green]} Green`);
    if (crystals[CrystalColor.Red] > 0) parts.push(`${crystals[CrystalColor.Red]} Red`);
    if (crystals[CrystalColor.Blue] > 0) parts.push(`${crystals[CrystalColor.Blue]} Blue`);
    
    return parts.length > 0 ? parts.join(', ') : 'Empty';
  }
  
  private getElement(id: string): HTMLElement | null {
    return document.getElementById(id);
  }
  
  private setHTML(id: string, html: string): void {
    const el = this.getElement(id);
    if (el) el.innerHTML = html;
  }
  
  private showMessage(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
    console.log(`[UI ${type.toUpperCase()}]`, message);
    
    const messageEl = this.getElement('message-display');
    if (messageEl) {
      messageEl.textContent = message;
      messageEl.className = `message ${type}`;
      messageEl.style.display = 'block';
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        if (messageEl.textContent === message) {
          messageEl.style.display = 'none';
        }
      }, 5000);
    }
  }
}

// ============================================================================
// HTML TEMPLATE (Structure Only, No Styling)
// ============================================================================

export const HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <title>Century P2P Client</title>
  <meta charset="UTF-8">
</head>
<body>
  <h1>Century: Golem Edition - P2P Client</h1>
  
  <!-- Connection Status -->
  <div id="connection-status">Disconnected</div>
  
  <!-- Message Display -->
  <div id="message-display" style="display:none;"></div>
  
  <!-- Join Room Form -->
  <div id="join-form">
    <h2>Join Game</h2>
    <label>Room Code: <input id="input-room-code" type="text" /></label><br>
    <label>Host Peer ID: <input id="input-host-peer-id" type="text" /></label><br>
    <label>Player ID: <input id="input-player-id" type="text" value="player_1" /></label><br>
    <label>Your Name: <input id="input-player-name" type="text" value="Alice" /></label><br>
    <button id="btn-join">Join Room</button>
  </div>
  
  <!-- Game Display (hidden until connected) -->
  <div id="game-display" style="display:none;">
    
    <!-- Turn Indicator -->
    <div id="turn-indicator"></div>
    
    <!-- My Hand -->
    <div id="my-hand"></div>
    
    <!-- Merchant Row -->
    <div id="merchant-row"></div>
    
    <!-- Point Card Row -->
    <div id="point-card-row"></div>
    
    <!-- Rest Button -->
    <div>
      <button id="rest-button" disabled>Rest</button>
    </div>
    
    <!-- My Caravan -->
    <div id="my-caravan"></div>
    
    <!-- My Point Cards -->
    <div id="my-point-cards"></div>
    
    <!-- Other Players -->
    <div id="other-players"></div>
    
    <!-- Game Info -->
    <div id="game-info"></div>
    
  </div>
  
  <script type="module">
    import { P2PGameClient } from './p2p/browserClient.js';
    import { SynchronizedGameUI } from './p2p/uiSync.js';
    
    let client = null;
    let ui = null;
    
    document.getElementById('btn-join').addEventListener('click', async () => {
      const roomCode = document.getElementById('input-room-code').value;
      const hostPeerId = document.getElementById('input-host-peer-id').value;
      const playerId = document.getElementById('input-player-id').value;
      const playerName = document.getElementById('input-player-name').value;
      
      if (!roomCode || !hostPeerId || !playerId || !playerName) {
        alert('Please fill in all fields');
        return;
      }
      
      try {
        // Create client
        client = new P2PGameClient();
        
        // Create UI (will set up event listeners)
        ui = new SynchronizedGameUI(client, playerId);
        
        // Join room
        await client.joinRoomWithPeerId(roomCode, hostPeerId, playerId, playerName);
        
        // Hide join form, show game
        document.getElementById('join-form').style.display = 'none';
        document.getElementById('game-display').style.display = 'block';
        
      } catch (error) {
        alert('Failed to join room: ' + error.message);
      }
    });
  </script>
</body>
</html>
`;

export default SynchronizedGameUI;
