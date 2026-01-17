/**
 * Complete Action Flow Example
 * 
 * Demonstrates the full peer-to-peer action flow:
 * 1. Client clicks button
 * 2. Client sends action to host
 * 3. Host validates via engine
 * 4. Host applies via engine
 * 5. Host broadcasts new state to all peers
 * 
 * Rules Enforced:
 * - Only host applies game logic
 * - Invalid actions return error
 * - State is always replaced (never patched)
 */

import { P2PGameRoom } from './browserRoom';
import { P2PGameClient } from './browserClient';
import {
  Game,
  GameAction,
  ActionType,
  MerchantCard,
  PointCard,
  CrystalColor
} from '../types/domain';

// ============================================================================
// HOST ACTION HANDLING (Already implemented in browserRoom.ts)
// ============================================================================

/**
 * Host receives action request and processes it.
 * 
 * Flow in browserRoom.ts:
 * 1. handleActionRequest() receives ACTION_REQUEST message
 * 2. processAction() validates via validateAction()
 * 3. processAction() applies via applyAction()
 * 4. processAction() advances turn via advanceTurn()
 * 5. broadcastGameState() sends new state to all peers
 * 6. sendActionResult() sends ACK to requester
 * 
 * NO GAME LOGIC IN HOST CODE - all in engine!
 */

// Example from browserRoom.ts (already implemented):
/*
private handleActionRequest(msg: ActionRequestMessage, peerId: string): void {
  if (!this.game) {
    this.sendActionResult(peerId, msg.messageId, false, 'Game not found');
    return;
  }
  
  // Process via engine (NOT local logic)
  const result = this.processAction(msg.action);
  
  // Send result
  this.sendActionResult(peerId, msg.messageId, result.valid, result.error);
  
  // Emit event
  this.emit('action-processed', msg.action, result.valid);
}

private processAction(action: GameAction): { valid: boolean; error?: string } {
  if (!this.game) {
    return { valid: false, error: 'Game not initialized' };
  }
  
  // Step 1: Validate via ENGINE
  const validation = validateAction(this.game, action);
  if (!validation.valid) {
    return { valid: false, error: validation.error };
  }
  
  // Step 2: Apply via ENGINE
  let newGame = applyAction(this.game, action);
  
  // Step 3: Advance turn via ENGINE
  const turnResult = advanceTurn(newGame);
  newGame = turnResult.game;
  
  // Step 4: Check endgame via ENGINE
  if (turnResult.gameFinished) {
    newGame = finalizeGame(newGame);
  }
  
  // Step 5: Replace state (NEVER PATCH)
  this.game = newGame;
  
  // Step 6: Broadcast to ALL peers
  this.broadcastGameState(newGame, action);
  
  return { valid: true };
}
*/

// ============================================================================
// CLIENT ACTION SENDING (Already implemented in browserClient.ts)
// ============================================================================

/**
 * Client sends action request and waits for state update.
 * 
 * Flow in browserClient.ts:
 * 1. sendAction() creates ACTION_REQUEST message
 * 2. Sends to host via WebRTC
 * 3. Waits for ACTION_RESULT (10s timeout)
 * 4. Receives GAME_STATE with new state
 * 5. Emits 'game-state-received' event
 * 
 * CLIENT NEVER MUTATES STATE LOCALLY!
 */

// Example from browserClient.ts (already implemented):
/*
async sendAction(action: GameAction): Promise<boolean> {
  if (!this.connected || !this.game) {
    throw new Error('Not connected to room');
  }
  
  return new Promise((resolve, reject) => {
    const requestMsg = P2PMessageFactory.createActionRequest(
      this.game!.id,
      this.clientPeerId,
      this.game!.turnNumber,
      action
    );
    
    // Store pending action
    this.pendingActions.set(requestMsg.messageId, {
      action,
      resolve,
      reject,
      timestamp: Date.now()
    });
    
    // Send to host
    this.sendToHost(requestMsg);
  });
}
*/

// ============================================================================
// UI INTEGRATION EXAMPLES
// ============================================================================

/**
 * Example: Client UI with action buttons
 */
export class GameClientUI {
  private client: P2PGameClient;
  private currentGame: Game | null = null;
  private myPlayerId: string;
  
  constructor(client: P2PGameClient, playerId: string) {
    this.client = client;
    this.myPlayerId = playerId;
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    // Receive state updates (READ-ONLY)
    this.client.on('game-state-received', (game: Game) => {
      console.log('[UI] State update received, turn:', game.turnNumber);
      
      // Replace state (NEVER PATCH)
      this.currentGame = game;
      
      // Re-render entire UI
      this.render();
    });
    
    // Action accepted
    this.client.on('action-accepted', (action: GameAction) => {
      console.log('[UI] Action accepted:', action.type);
      this.showNotification('Action accepted!', 'success');
    });
    
    // Action rejected
    this.client.on('action-rejected', (action: GameAction, error: string) => {
      console.error('[UI] Action rejected:', error);
      this.showNotification(`Action rejected: ${error}`, 'error');
    });
  }
  
  /**
   * Example: Play merchant card button clicked
   */
  async onPlayCardClick(cardId: string): Promise<void> {
    if (!this.currentGame) {
      alert('Game not loaded');
      return;
    }
    
    console.log('[UI] User clicked play card:', cardId);
    
    // Disable buttons while processing
    this.disableAllButtons();
    
    try {
      // Create action object
      const action: GameAction = {
        type: ActionType.PlayMerchantCard,
        playerId: this.myPlayerId,
        cardId: cardId,
        timestamp: Date.now()
      };
      
      console.log('[UI] Sending action to host:', action);
      
      // Send to host (NO LOCAL MUTATION)
      const success = await this.client.sendAction(action);
      
      if (success) {
        console.log('[UI] Action accepted, waiting for state update...');
        // State update will arrive via 'game-state-received' event
        // UI will re-render automatically
      } else {
        console.log('[UI] Action rejected by host');
      }
      
    } catch (error) {
      console.error('[UI] Failed to send action:', error);
      alert('Failed to send action: ' + (error as Error).message);
      
    } finally {
      // Re-enable buttons when state arrives
      // (or after timeout)
    }
  }
  
  /**
   * Example: Acquire merchant card button clicked
   */
  async onAcquireCardClick(cardIndex: number): Promise<void> {
    if (!this.currentGame) return;
    
    // Get the card from merchant row
    const card = this.currentGame.merchantRow.cards[cardIndex];
    if (!card) {
      alert('No card at that position');
      return;
    }
    
    const action: GameAction = {
      type: ActionType.AcquireMerchantCard,
      playerId: this.myPlayerId,
      rowIndex: cardIndex,
      cardId: card.id,
      timestamp: Date.now()
    };
    
    try {
      await this.client.sendAction(action);
    } catch (error) {
      alert('Failed: ' + (error as Error).message);
    }
  }
  
  /**
   * Example: Claim point card button clicked
   */
  async onClaimPointCardClick(cardIndex: number): Promise<void> {
    if (!this.currentGame) return;
    
    // Get the card from point card row
    const card = this.currentGame.pointCardRow.cards[cardIndex];
    if (!card) {
      alert('No card at that position');
      return;
    }
    
    // Get my player to check caravan
    const myPlayer = this.currentGame.players.find(p => p.id === this.myPlayerId);
    if (!myPlayer) return;
    
    const action: GameAction = {
      type: ActionType.ClaimPointCard,
      playerId: this.myPlayerId,
      rowIndex: cardIndex,
      cardId: card.id,
      payment: myPlayer.caravan, // Use current caravan as payment
      timestamp: Date.now()
    };
    
    try {
      await this.client.sendAction(action);
    } catch (error) {
      alert('Failed: ' + (error as Error).message);
    }
  }
  
  /**
   * Example: Rest button clicked
   */
  async onRestClick(): Promise<void> {
    if (!this.currentGame) return;
    
    const action: GameAction = {
      type: ActionType.Rest,
      playerId: this.myPlayerId,
      timestamp: Date.now()
    };
    
    try {
      await this.client.sendAction(action);
    } catch (error) {
      alert('Failed: ' + (error as Error).message);
    }
  }
  
  /**
   * Render UI based on current state (READ-ONLY)
   */
  private render(): void {
    if (!this.currentGame) return;
    
    console.log('[UI] Rendering game state...');
    
    // Find my player
    const myPlayer = this.currentGame.players.find(p => p.id === this.myPlayerId);
    if (!myPlayer) {
      console.error('[UI] Player not found in game');
      return;
    }
    
    // Check if it's my turn
    const currentPlayer = this.currentGame.players[this.currentGame.currentPlayerIndex];
    const isMyTurn = currentPlayer.id === this.myPlayerId;
    
    // Render turn indicator
    this.renderTurnIndicator(currentPlayer.name, isMyTurn);
    
    // Render my hand (only enable buttons if my turn)
    this.renderHand(myPlayer.hand, isMyTurn);
    
    // Render merchant row
    this.renderMerchantRow(this.currentGame.merchantRow.cards, isMyTurn);
    
    // Render point card row
    this.renderPointCardRow(this.currentGame.pointCardRow.cards, isMyTurn);
    
    // Render rest button
    this.renderRestButton(isMyTurn);
    
    // Render my caravan
    this.renderCaravan(myPlayer.caravan);
    
    // Render my point cards
    this.renderPointCards(myPlayer.pointCards);
    
    // Render other players
    this.renderOtherPlayers(this.currentGame.players, this.myPlayerId);
  }
  
  private renderTurnIndicator(currentPlayerName: string, isMyTurn: boolean): void {
    const indicator = document.getElementById('turn-indicator');
    if (indicator) {
      if (isMyTurn) {
        indicator.textContent = 'Your Turn!';
        indicator.style.color = 'green';
      } else {
        indicator.textContent = `${currentPlayerName}'s Turn`;
        indicator.style.color = 'gray';
      }
    }
  }
  
  private renderHand(hand: MerchantCard[], enabled: boolean): void {
    const handDiv = document.getElementById('hand');
    if (!handDiv) return;
    
    handDiv.innerHTML = '<h3>Your Hand</h3>';
    
    hand.forEach((card, index) => {
      const cardDiv = document.createElement('div');
      cardDiv.className = 'merchant-card';
      cardDiv.textContent = this.formatMerchantCard(card);
      
      const playBtn = document.createElement('button');
      playBtn.textContent = 'Play';
      playBtn.disabled = !enabled;
      playBtn.onclick = () => this.onPlayCardClick(card.id);
      
      cardDiv.appendChild(playBtn);
      handDiv.appendChild(cardDiv);
    });
  }
  
  private renderMerchantRow(cards: (MerchantCard | null)[], enabled: boolean): void {
    const rowDiv = document.getElementById('merchant-row');
    if (!rowDiv) return;
    
    rowDiv.innerHTML = '<h3>Merchant Cards</h3>';
    
    cards.forEach((card, index) => {
      const slotDiv = document.createElement('div');
      slotDiv.className = 'merchant-slot';
      
      if (card) {
        slotDiv.textContent = this.formatMerchantCard(card);
        
        const acquireBtn = document.createElement('button');
        acquireBtn.textContent = `Acquire (${index} Yellow)`;
        acquireBtn.disabled = !enabled;
        acquireBtn.onclick = () => this.onAcquireCardClick(index);
        
        slotDiv.appendChild(acquireBtn);
      } else {
        slotDiv.textContent = 'Empty';
        slotDiv.style.opacity = '0.3';
      }
      
      rowDiv.appendChild(slotDiv);
    });
  }
  
  private renderPointCardRow(cards: (PointCard | null)[], enabled: boolean): void {
    const rowDiv = document.getElementById('point-card-row');
    if (!rowDiv) return;
    
    rowDiv.innerHTML = '<h3>Point Cards</h3>';
    
    cards.forEach((card, index) => {
      const slotDiv = document.createElement('div');
      slotDiv.className = 'point-card-slot';
      
      if (card) {
        slotDiv.textContent = this.formatPointCard(card);
        
        const claimBtn = document.createElement('button');
        claimBtn.textContent = 'Claim';
        claimBtn.disabled = !enabled;
        claimBtn.onclick = () => this.onClaimPointCardClick(index);
        
        slotDiv.appendChild(claimBtn);
      } else {
        slotDiv.textContent = 'Empty';
        slotDiv.style.opacity = '0.3';
      }
      
      rowDiv.appendChild(slotDiv);
    });
  }
  
  private renderRestButton(enabled: boolean): void {
    const restBtn = document.getElementById('rest-btn') as HTMLButtonElement;
    if (restBtn) {
      restBtn.disabled = !enabled;
      restBtn.onclick = () => this.onRestClick();
    }
  }
  
  private renderCaravan(caravan: { [key in CrystalColor]: number }): void {
    const caravanDiv = document.getElementById('caravan');
    if (!caravanDiv) return;
    
    caravanDiv.innerHTML = '<h3>Your Caravan</h3>';
    const crystals = Object.entries(caravan)
      .map(([color, count]) => `${color}: ${count}`)
      .join(', ');
    caravanDiv.innerHTML += `<p>${crystals}</p>`;
  }
  
  private renderPointCards(pointCards: PointCard[]): void {
    const div = document.getElementById('my-point-cards');
    if (!div) return;
    
    div.innerHTML = '<h3>Your Point Cards</h3>';
    div.innerHTML += `<p>Total: ${pointCards.length} cards</p>`;
  }
  
  private renderOtherPlayers(players: any[], myPlayerId: string): void {
    const div = document.getElementById('other-players');
    if (!div) return;
    
    div.innerHTML = '<h3>Other Players</h3>';
    
    players
      .filter(p => p.id !== myPlayerId)
      .forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'other-player';
        playerDiv.textContent = `${player.name}: ${player.pointCards.length} points`;
        div.appendChild(playerDiv);
      });
  }
  
  private formatMerchantCard(card: MerchantCard): string {
    // Simple formatter - customize as needed
    return `Card ${card.id.slice(-4)}`;
  }
  
  private formatPointCard(card: PointCard): string {
    return `${card.points} points`;
  }
  
  private disableAllButtons(): void {
    document.querySelectorAll('button').forEach(btn => {
      (btn as HTMLButtonElement).disabled = true;
    });
  }
  
  private showNotification(message: string, type: 'success' | 'error'): void {
    // Simple notification - customize as needed
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    notif.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px;
      background: ${type === 'success' ? '#4CAF50' : '#f44336'};
      color: white;
      border-radius: 4px;
      z-index: 1000;
    `;
    
    document.body.appendChild(notif);
    
    setTimeout(() => {
      notif.remove();
    }, 3000);
  }
}

// ============================================================================
// COMPLETE HTML EXAMPLE
// ============================================================================

export const CLIENT_HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <title>Century P2P Client</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    #turn-indicator {
      font-size: 24px;
      font-weight: bold;
      padding: 10px;
      text-align: center;
      background: #f0f0f0;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    
    .section {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }
    
    .merchant-card, .point-card-slot {
      display: inline-block;
      border: 1px solid #999;
      border-radius: 4px;
      padding: 10px;
      margin: 5px;
      min-width: 100px;
    }
    
    button {
      margin: 5px;
      padding: 8px 15px;
      font-size: 14px;
      border: none;
      border-radius: 4px;
      background: #2196F3;
      color: white;
      cursor: pointer;
    }
    
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    
    button:hover:not(:disabled) {
      background: #1976D2;
    }
    
    #rest-btn {
      background: #FF9800;
      font-size: 16px;
      padding: 10px 20px;
    }
  </style>
</head>
<body>
  <h1>Century: Golem Edition - P2P Client</h1>
  
  <!-- Join Room -->
  <div id="join-section">
    <h2>Join Game</h2>
    <input id="room-code" placeholder="Room Code" />
    <input id="host-peer-id" placeholder="Host Peer ID" />
    <input id="player-id" placeholder="Player ID" value="player_1" />
    <input id="player-name" placeholder="Your Name" value="Alice" />
    <button id="join-btn">Join Room</button>
  </div>
  
  <!-- Game Display (hidden until connected) -->
  <div id="game-section" style="display:none;">
    <div id="turn-indicator"></div>
    
    <!-- Your Hand -->
    <div class="section" id="hand"></div>
    
    <!-- Merchant Row -->
    <div class="section" id="merchant-row"></div>
    
    <!-- Point Card Row -->
    <div class="section" id="point-card-row"></div>
    
    <!-- Rest Button -->
    <div class="section">
      <button id="rest-btn">Rest (Recover All Cards)</button>
    </div>
    
    <!-- Your Caravan -->
    <div class="section" id="caravan"></div>
    
    <!-- Your Point Cards -->
    <div class="section" id="my-point-cards"></div>
    
    <!-- Other Players -->
    <div class="section" id="other-players"></div>
  </div>
  
  <script type="module">
    import { P2PGameClient } from './p2p/browserClient.js';
    import { GameClientUI } from './p2p/actionFlow.js';
    
    let client = null;
    let ui = null;
    
    document.getElementById('join-btn').addEventListener('click', async () => {
      const roomCode = document.getElementById('room-code').value;
      const hostPeerId = document.getElementById('host-peer-id').value;
      const playerId = document.getElementById('player-id').value;
      const playerName = document.getElementById('player-name').value;
      
      try {
        // Create client
        client = new P2PGameClient();
        
        // Join room
        await client.joinRoomWithPeerId(roomCode, hostPeerId, playerId, playerName);
        
        // Create UI
        ui = new GameClientUI(client, playerId);
        
        // Hide join, show game
        document.getElementById('join-section').style.display = 'none';
        document.getElementById('game-section').style.display = 'block';
        
        alert('Connected!');
        
      } catch (error) {
        alert('Failed to join: ' + error.message);
      }
    });
  </script>
</body>
</html>
`;

// ============================================================================
// ACTION FLOW DIAGRAM
// ============================================================================

export const ACTION_FLOW_DOCUMENTATION = `
# Complete Action Flow

## 1. Client Clicks Button

User clicks "Play Card" button in UI.

\`\`\`typescript
<button onclick="onPlayCardClick('card123')">Play Card</button>
\`\`\`

## 2. Client Sends Action to Host

Client creates GameAction object and sends via WebRTC:

\`\`\`typescript
const action: GameAction = {
  type: ActionType.PlayMerchantCard,
  playerId: 'player_1',
  cardId: 'card123',
  timestamp: Date.now()
};

// Send to host (NO local mutation)
const success = await client.sendAction(action);
\`\`\`

Protocol message sent:
\`\`\`typescript
{
  type: 'ACTION_REQUEST',
  messageId: 'act_1234567890',
  gameId: 'game-abc',
  senderId: 'client_player_1_...',
  turnNumber: 5,
  timestamp: 1234567890,
  action: {
    type: ActionType.PlayMerchantCard,
    playerId: 'player_1',
    cardId: 'card123',
    timestamp: 1234567890
  }
}
\`\`\`

## 3. Host Validates Action

Host receives ACTION_REQUEST and validates via game engine:

\`\`\`typescript
// In browserRoom.ts
handleActionRequest(msg: ActionRequestMessage, peerId: string) {
  // Validate via ENGINE (not local logic)
  const validation = validateAction(this.game, msg.action);
  
  if (!validation.valid) {
    // Send error response
    this.sendActionResult(peerId, msg.messageId, false, validation.error);
    return;
  }
  
  // Continue to step 4...
}
\`\`\`

## 4. Host Applies Action

If valid, host applies action via game engine:

\`\`\`typescript
// Apply via ENGINE
let newGame = applyAction(this.game, action);

// Advance turn via ENGINE
const turnResult = advanceTurn(newGame);
newGame = turnResult.game;

// Check endgame via ENGINE
if (turnResult.gameFinished) {
  newGame = finalizeGame(newGame);
}

// REPLACE state (never patch)
this.game = newGame;
\`\`\`

## 5. Host Broadcasts New State

Host sends updated game state to ALL peers:

\`\`\`typescript
// Send to requester
this.sendActionResult(peerId, msg.messageId, true);

// Broadcast to ALL peers
this.broadcastGameState(newGame, action);
\`\`\`

Protocol message broadcast:
\`\`\`typescript
{
  type: 'GAME_STATE',
  messageId: 'state_1234567891',
  gameId: 'game-abc',
  senderId: 'host_ABC123_...',
  turnNumber: 6,  // Incremented
  timestamp: 1234567891,
  game: { ...newGame },  // Complete state
  reason: 'ACTION_APPLIED',
  lastAction: { ...action },
  stateHash: 'abc12345'
}
\`\`\`

## 6. All Clients Receive State

Every connected peer receives the new state:

\`\`\`typescript
// In browserClient.ts
handleGameState(message: GameStateMessage) {
  // Validate via sync handler
  const result = this.syncHandler.handleGameState(message);
  
  if (result === 'applied') {
    // REPLACE state (never patch)
    this.game = message.game;
    
    // Emit event
    this.emit('game-state-received', message.game);
  }
}
\`\`\`

## 7. UI Re-renders

UI receives 'game-state-received' event and re-renders:

\`\`\`typescript
client.on('game-state-received', (game: Game) => {
  // Replace local state
  this.currentGame = game;
  
  // Re-render entire UI
  this.render();
});
\`\`\`

## Error Flow

If action is invalid:

\`\`\`typescript
// Host sends error
{
  type: 'ACTION_RESULT',
  requestMessageId: 'act_1234567890',
  success: false,
  errorMessage: 'Not your turn',
  errorCode: 'WRONG_PLAYER'
}

// Client receives rejection
client.on('action-rejected', (action, error) => {
  showNotification('Action rejected: ' + error, 'error');
});
\`\`\`

## Key Principles

1. **Client never mutates state** - Only sends action requests
2. **Host validates everything** - Uses existing game engine validators
3. **Host applies via engine** - No game logic in host code
4. **State is replaced** - Never patched incrementally
5. **All peers receive state** - Broadcast ensures consistency
6. **UI re-renders on state** - React to 'game-state-received' event

## Sequence Diagram

\`\`\`
Client                    Host                    Engine
  |                         |                         |
  | 1. Click button        |                         |
  |----------------------->|                         |
  |                         |                         |
  | 2. Send ACTION_REQUEST |                         |
  |----------------------->|                         |
  |                         |                         |
  |                         | 3. validateAction()   |
  |                         |----------------------->|
  |                         |<-----------------------|
  |                         | valid: true            |
  |                         |                         |
  |                         | 4. applyAction()      |
  |                         |----------------------->|
  |                         |<-----------------------|
  |                         | newGame               |
  |                         |                         |
  | 5. ACTION_RESULT       |                         |
  |<-----------------------|                         |
  | success: true          |                         |
  |                         |                         |
  | 6. GAME_STATE          |                         |
  |<-----------------------|                         |
  | game: { ...newGame }   |                         |
  |                         |                         |
  | 7. Re-render UI        |                         |
  |----------------------->|                         |
\`\`\`

## Timeline Example

\`\`\`
T=0ms:   Client clicks "Play Card"
T=5ms:   Client sends ACTION_REQUEST
T=15ms:  Host receives message
T=16ms:  Host validates via validateAction()
T=17ms:  Host applies via applyAction()
T=18ms:  Host advances turn via advanceTurn()
T=19ms:  Host replaces this.game = newGame
T=20ms:  Host sends ACTION_RESULT to requester
T=21ms:  Host broadcasts GAME_STATE to all peers
T=30ms:  All clients receive GAME_STATE
T=31ms:  All clients validate state hash
T=32ms:  All clients replace local state
T=33ms:  All UIs re-render with new state
\`\`\`

Total latency: ~35ms (LAN) or ~100-500ms (Internet)
`;

export default GameClientUI;
