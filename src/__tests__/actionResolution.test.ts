import { createNewGame } from '../setup/gameSetup';
import { applyAction, applyPlayCard, applyAcquireCard, applyClaimPoint, applyRest } from '../engine/actionResolver';
import { ActionType, CrystalColor, MerchantCardType, PlayCardAction, AcquireCardAction, ClaimPointAction, RestAction } from '../types/domain';
import {
  describe,
  test,
  assert,
  assertEqual,
  createTestPlayers,
  crystals,
  assertCrystalsEqual,
  findPlayer,
  setPlayerCaravan,
  getCardByType
} from './testHelpers';

describe('Action Resolution Tests', () => {

  // ========================================================================
  // PLAY CARD RESOLUTION
  // ========================================================================

  test('Playing produce card adds crystals to caravan', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-1');
    
    const player = findPlayer(game, 'player1');
    const produceCard = getCardByType(player, MerchantCardType.Produce);
    
    if (produceCard && produceCard.type === MerchantCardType.Produce) {
      const initialCaravan = player.caravan;
      
      const action: PlayCardAction = {
        type: ActionType.PlayMerchantCard,
        playerId: 'player1',
        cardId: produceCard.id,
        timestamp: Date.now()
      };
      
      const newGame = applyPlayCard(game, action);
      const updatedPlayer = findPlayer(newGame, 'player1');
      
      // Check crystals were added
      assertEqual(
        updatedPlayer.caravan.YELLOW,
        initialCaravan.YELLOW + produceCard.produces.YELLOW,
        'Should add produced crystals'
      );
      
      // Check card moved to play area
      assertEqual(updatedPlayer.playArea.length, 1, 'Card should be in play area');
      assertEqual(updatedPlayer.hand.length, player.hand.length - 1, 'Card should be removed from hand');
      assertEqual(updatedPlayer.playArea[0].id, produceCard.id, 'Correct card in play area');
    }
  });

  test('Playing upgrade card transforms crystals', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-2');
    
    game = setPlayerCaravan(game, 'player1', crystals(5, 0, 0, 0));
    
    const player = findPlayer(game, 'player1');
    const upgradeCard = getCardByType(player, MerchantCardType.Upgrade);
    
    if (upgradeCard) {
      const action: PlayCardAction = {
        type: ActionType.PlayMerchantCard,
        playerId: 'player1',
        cardId: upgradeCard.id,
        timestamp: Date.now(),
        upgradeSelection: {
          upgrades: [
            { fromColor: CrystalColor.Yellow, toColor: CrystalColor.Green },
            { fromColor: CrystalColor.Yellow, toColor: CrystalColor.Green }
          ]
        }
      };
      
      const newGame = applyPlayCard(game, action);
      const updatedPlayer = findPlayer(newGame, 'player1');
      
      // Check crystals were transformed
      assertEqual(updatedPlayer.caravan.YELLOW, 3, 'Should have 2 fewer yellow');
      assertEqual(updatedPlayer.caravan.GREEN, 2, 'Should have 2 green');
    }
  });

  test('Playing upgrade maintains total crystal count', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-3');
    
    game = setPlayerCaravan(game, 'player1', crystals(3, 2, 1, 0));
    const player = findPlayer(game, 'player1');
    const initialTotal = 3 + 2 + 1 + 0;
    
    const upgradeCard = getCardByType(player, MerchantCardType.Upgrade);
    
    if (upgradeCard) {
      const action: PlayCardAction = {
        type: ActionType.PlayMerchantCard,
        playerId: 'player1',
        cardId: upgradeCard.id,
        timestamp: Date.now(),
        upgradeSelection: {
          upgrades: [
            { fromColor: CrystalColor.Green, toColor: CrystalColor.Red },
            { fromColor: CrystalColor.Green, toColor: CrystalColor.Red }
          ]
        }
      };
      
      const newGame = applyPlayCard(game, action);
      const updatedPlayer = findPlayer(newGame, 'player1');
      
      const finalTotal = 
        updatedPlayer.caravan.YELLOW +
        updatedPlayer.caravan.GREEN +
        updatedPlayer.caravan.RED +
        updatedPlayer.caravan.BLUE;
      
      assertEqual(finalTotal, initialTotal, 'Total crystal count should be unchanged');
    }
  });

  test('Card played remains in play area', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-4');
    
    const player = findPlayer(game, 'player1');
    const card = player.hand[0];
    
    const action: PlayCardAction = {
      type: ActionType.PlayMerchantCard,
      playerId: 'player1',
      cardId: card.id,
      timestamp: Date.now()
    };
    
    const newGame = applyPlayCard(game, action);
    const updatedPlayer = findPlayer(newGame, 'player1');
    
    assert(
      updatedPlayer.playArea.some(c => c.id === card.id),
      'Card should be in play area'
    );
    assert(
      !updatedPlayer.hand.some(c => c.id === card.id),
      'Card should not be in hand'
    );
  });

  // ========================================================================
  // ACQUIRE CARD RESOLUTION
  // ========================================================================

  test('Acquiring card removes it from merchant row', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-5');
    
    game = setPlayerCaravan(game, 'player1', crystals(10, 0, 0, 0));
    
    const cardToAcquire = game.merchantRow.cards[2];
    if (cardToAcquire) {
      const action: AcquireCardAction = {
        type: ActionType.AcquireMerchantCard,
        playerId: 'player1',
        rowIndex: 2,
        cardId: cardToAcquire.id,
        timestamp: Date.now()
      };
      
      const newGame = applyAcquireCard(game, action);
      
      // Card should not be at that position anymore
      const cardStillThere = newGame.merchantRow.cards.some(c => c?.id === cardToAcquire.id);
      assert(!cardStillThere, 'Card should be removed from merchant row');
    }
  });

  test('Acquiring card adds it to hand', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-6');
    
    game = setPlayerCaravan(game, 'player1', crystals(10, 0, 0, 0));
    
    const player = findPlayer(game, 'player1');
    const initialHandSize = player.hand.length;
    const cardToAcquire = game.merchantRow.cards[1];
    
    if (cardToAcquire) {
      const action: AcquireCardAction = {
        type: ActionType.AcquireMerchantCard,
        playerId: 'player1',
        rowIndex: 1,
        cardId: cardToAcquire.id,
        timestamp: Date.now()
      };
      
      const newGame = applyAcquireCard(game, action);
      const updatedPlayer = findPlayer(newGame, 'player1');
      
      assertEqual(updatedPlayer.hand.length, initialHandSize + 1, 'Hand should have one more card');
      assert(
        updatedPlayer.hand.some(c => c.id === cardToAcquire.id),
        'Acquired card should be in hand'
      );
    }
  });

  test('Acquiring card deducts yellow crystals correctly', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-7');
    
    game = setPlayerCaravan(game, 'player1', crystals(10, 0, 0, 0));
    
    const cardToAcquire = game.merchantRow.cards[3]; // Costs 3 yellow
    
    if (cardToAcquire) {
      const action: AcquireCardAction = {
        type: ActionType.AcquireMerchantCard,
        playerId: 'player1',
        rowIndex: 3,
        cardId: cardToAcquire.id,
        timestamp: Date.now()
      };
      
      const newGame = applyAcquireCard(game, action);
      const updatedPlayer = findPlayer(newGame, 'player1');
      
      assertEqual(updatedPlayer.caravan.YELLOW, 7, 'Should deduct 3 yellow (10-3=7)');
    }
  });

  test('Acquiring first card is free', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-8');
    
    game = setPlayerCaravan(game, 'player1', crystals(5, 0, 0, 0));
    
    const cardToAcquire = game.merchantRow.cards[0]; // Costs 0
    
    if (cardToAcquire) {
      const action: AcquireCardAction = {
        type: ActionType.AcquireMerchantCard,
        playerId: 'player1',
        rowIndex: 0,
        cardId: cardToAcquire.id,
        timestamp: Date.now()
      };
      
      const newGame = applyAcquireCard(game, action);
      const updatedPlayer = findPlayer(newGame, 'player1');
      
      assertEqual(updatedPlayer.caravan.YELLOW, 5, 'Should not deduct any yellow');
    }
  });

  test('Merchant row refills after acquisition', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-9');
    
    game = setPlayerCaravan(game, 'player1', crystals(10, 0, 0, 0));
    
    const initialDeckSize = game.merchantDeck.length;
    const cardToAcquire = game.merchantRow.cards[2];
    
    if (cardToAcquire) {
      const action: AcquireCardAction = {
        type: ActionType.AcquireMerchantCard,
        playerId: 'player1',
        rowIndex: 2,
        cardId: cardToAcquire.id,
        timestamp: Date.now()
      };
      
      const newGame = applyAcquireCard(game, action);
      
      // Row should still have max cards (if deck not empty)
      const nonNullCards = newGame.merchantRow.cards.filter(c => c !== null);
      if (initialDeckSize > 0) {
        assertEqual(nonNullCards.length, game.merchantRow.maxSize, 'Row should be refilled');
        assertEqual(newGame.merchantDeck.length, initialDeckSize - 1, 'Deck should have one fewer card');
      }
    }
  });

  // ========================================================================
  // CLAIM POINT RESOLUTION
  // ========================================================================

  test('Claiming point card removes it from row', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-10');
    
    game = setPlayerCaravan(game, 'player1', crystals(5, 5, 5, 5));
    
    const cardToClaim = game.pointCardRow.cards[0];
    
    if (cardToClaim) {
      const action: ClaimPointAction = {
        type: ActionType.ClaimPointCard,
        playerId: 'player1',
        rowIndex: 0,
        cardId: cardToClaim.id,
        payment: cardToClaim.cost,
        timestamp: Date.now()
      };
      
      const newGame = applyClaimPoint(game, action);
      
      const cardStillThere = newGame.pointCardRow.cards.some(c => c?.id === cardToClaim.id);
      assert(!cardStillThere, 'Point card should be removed from row');
    }
  });

  test('Claiming point card adds it to player collection', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-11');
    
    game = setPlayerCaravan(game, 'player1', crystals(5, 5, 5, 5));
    
    const player = findPlayer(game, 'player1');
    const initialPointCards = player.pointCards.length;
    const cardToClaim = game.pointCardRow.cards[0];
    
    if (cardToClaim) {
      const action: ClaimPointAction = {
        type: ActionType.ClaimPointCard,
        playerId: 'player1',
        rowIndex: 0,
        cardId: cardToClaim.id,
        payment: cardToClaim.cost,
        timestamp: Date.now()
      };
      
      const newGame = applyClaimPoint(game, action);
      const updatedPlayer = findPlayer(newGame, 'player1');
      
      assertEqual(updatedPlayer.pointCards.length, initialPointCards + 1, 'Should have one more point card');
      assert(
        updatedPlayer.pointCards.some(c => c.id === cardToClaim.id),
        'Claimed card should be in collection'
      );
    }
  });

  test('Claiming point card deducts cost from caravan', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-12');
    
    game = setPlayerCaravan(game, 'player1', crystals(2, 3, 2, 1));
    
    const cardToClaim = game.pointCardRow.cards[0];
    
    if (cardToClaim) {
      const action: ClaimPointAction = {
        type: ActionType.ClaimPointCard,
        playerId: 'player1',
        rowIndex: 0,
        cardId: cardToClaim.id,
        payment: cardToClaim.cost,
        timestamp: Date.now()
      };
      
      const newGame = applyClaimPoint(game, action);
      const updatedPlayer = findPlayer(newGame, 'player1');
      
      // Check each crystal was deducted correctly
      assertEqual(
        updatedPlayer.caravan.YELLOW,
        2 - cardToClaim.cost.YELLOW,
        'Yellow should be deducted'
      );
      assertEqual(
        updatedPlayer.caravan.GREEN,
        3 - cardToClaim.cost.GREEN,
        'Green should be deducted'
      );
      assertEqual(
        updatedPlayer.caravan.RED,
        2 - cardToClaim.cost.RED,
        'Red should be deducted'
      );
      assertEqual(
        updatedPlayer.caravan.BLUE,
        1 - cardToClaim.cost.BLUE,
        'Blue should be deducted'
      );
    }
  });

  test('Claiming point card adds bonus crystals', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-13');
    
    game = setPlayerCaravan(game, 'player1', crystals(5, 5, 5, 5));
    
    // Find a card with bonus crystals
    let cardWithBonus = null;
    let cardIndex = 0;
    for (let i = 0; i < game.pointCardRow.cards.length; i++) {
      const card = game.pointCardRow.cards[i];
      if (card && (card.bonusCrystals.YELLOW > 0 || card.bonusCrystals.GREEN > 0 || 
                   card.bonusCrystals.RED > 0 || card.bonusCrystals.BLUE > 0)) {
        cardWithBonus = card;
        cardIndex = i;
        break;
      }
    }
    
    if (cardWithBonus) {
      const initialCaravan = findPlayer(game, 'player1').caravan;
      
      const action: ClaimPointAction = {
        type: ActionType.ClaimPointCard,
        playerId: 'player1',
        rowIndex: cardIndex,
        cardId: cardWithBonus.id,
        payment: cardWithBonus.cost,
        timestamp: Date.now()
      };
      
      const newGame = applyClaimPoint(game, action);
      const updatedPlayer = findPlayer(newGame, 'player1');
      
      // Expected caravan = initial - cost + bonus
      const expectedYellow = initialCaravan.YELLOW - cardWithBonus.cost.YELLOW + cardWithBonus.bonusCrystals.YELLOW;
      assertEqual(updatedPlayer.caravan.YELLOW, expectedYellow, 'Should add bonus yellow');
    }
  });

  test('Point card row refills after claiming', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-14');
    
    game = setPlayerCaravan(game, 'player1', crystals(5, 5, 5, 5));
    
    const initialDeckSize = game.pointCardDeck.length;
    const cardToClaim = game.pointCardRow.cards[1];
    
    if (cardToClaim) {
      const action: ClaimPointAction = {
        type: ActionType.ClaimPointCard,
        playerId: 'player1',
        rowIndex: 1,
        cardId: cardToClaim.id,
        payment: cardToClaim.cost,
        timestamp: Date.now()
      };
      
      const newGame = applyClaimPoint(game, action);
      
      // Row should still have max cards (if deck not empty)
      const nonNullCards = newGame.pointCardRow.cards.filter(c => c !== null);
      if (initialDeckSize > 0) {
        assertEqual(nonNullCards.length, game.pointCardRow.maxSize, 'Point row should be refilled');
        assertEqual(newGame.pointCardDeck.length, initialDeckSize - 1, 'Point deck should have one fewer card');
      }
    }
  });

  // ========================================================================
  // REST RESOLUTION
  // ========================================================================

  test('Resting moves all cards from play area to hand', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-15');
    
    // Move both starting cards to play area
    const player = findPlayer(game, 'player1');
    game = {
      ...game,
      players: game.players.map(p =>
        p.id === 'player1'
          ? { ...p, playArea: [...player.hand], hand: [] }
          : p
      )
    };
    
    const action: RestAction = {
      type: ActionType.Rest,
      playerId: 'player1',
      timestamp: Date.now()
    };
    
    const newGame = applyRest(game, action);
    const updatedPlayer = findPlayer(newGame, 'player1');
    
    assertEqual(updatedPlayer.playArea.length, 0, 'Play area should be empty');
    assertEqual(updatedPlayer.hand.length, 2, 'Hand should have all cards back');
  });

  test('Resting preserves card identity', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-16');
    
    const player = findPlayer(game, 'player1');
    const cardIds = player.hand.map(c => c.id);
    
    // Move cards to play area
    game = {
      ...game,
      players: game.players.map(p =>
        p.id === 'player1'
          ? { ...p, playArea: [...player.hand], hand: [] }
          : p
      )
    };
    
    const action: RestAction = {
      type: ActionType.Rest,
      playerId: 'player1',
      timestamp: Date.now()
    };
    
    const newGame = applyRest(game, action);
    const updatedPlayer = findPlayer(newGame, 'player1');
    
    // All original cards should be in hand
    for (const cardId of cardIds) {
      assert(
        updatedPlayer.hand.some(c => c.id === cardId),
        `Card ${cardId} should be back in hand`
      );
    }
  });

  test('Resting does not affect caravan', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'resolution-17');
    
    game = setPlayerCaravan(game, 'player1', crystals(3, 2, 1, 0));
    
    const player = findPlayer(game, 'player1');
    const initialCaravan = { ...player.caravan };
    
    // Move cards to play area
    game = {
      ...game,
      players: game.players.map(p =>
        p.id === 'player1'
          ? { ...p, playArea: [player.hand[0]], hand: player.hand.slice(1) }
          : p
      )
    };
    
    const action: RestAction = {
      type: ActionType.Rest,
      playerId: 'player1',
      timestamp: Date.now()
    };
    
    const newGame = applyRest(game, action);
    const updatedPlayer = findPlayer(newGame, 'player1');
    
    assertCrystalsEqual(updatedPlayer.caravan, initialCaravan);
  });
});
