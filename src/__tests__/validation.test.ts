import { createNewGame } from '../setup/gameSetup';
import { validateAction, validatePlayCard, validateAcquireCard, validateClaimPoint, validateRest, ValidationErrorCode } from '../engine/validation';
import { ActionType, CrystalColor, MerchantCardType, PlayCardAction, AcquireCardAction, ClaimPointAction, RestAction } from '../types/domain';
import {
  describe,
  test,
  assert,
  assertEqual,
  createTestPlayers,
  crystals,
  findPlayer,
  setPlayerCaravan,
  getCardByType
} from './testHelpers';

describe('Action Validation Tests', () => {

  // ========================================================================
  // TURN VALIDATION
  // ========================================================================

  test('Rejects action from wrong player', () => {
    const players = createTestPlayers(3);
    const game = createNewGame(players, 'validation-1');
    
    // Current player is player1, try action from player2
    const action: RestAction = {
      type: ActionType.Rest,
      playerId: 'player2',
      timestamp: Date.now()
    };
    
    const result = validateAction(game, action);
    assert(!result.valid, 'Should reject action from non-current player');
    if (!result.valid) {
      assertEqual(result.code, ValidationErrorCode.InvalidTurn);
    }
  });

  test('Accepts action from current player', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-2');
    
    // Give player1 a card in play area
    const player = findPlayer(game, 'player1');
    const cardToPlay = player.hand[0];
    game = setPlayerCaravan(game, 'player1', crystals(10, 0, 0, 0));
    game = {
      ...game,
      players: game.players.map(p => 
        p.id === 'player1' 
          ? { ...p, playArea: [cardToPlay], hand: p.hand.slice(1) }
          : p
      )
    };
    
    const action: RestAction = {
      type: ActionType.Rest,
      playerId: 'player1',
      timestamp: Date.now()
    };
    
    const result = validateAction(game, action);
    assert(result.valid, 'Should accept action from current player');
  });

  // ========================================================================
  // PLAY CARD VALIDATION
  // ========================================================================

  test('Rejects playing card not in hand', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'validation-3');
    
    const action: PlayCardAction = {
      type: ActionType.PlayMerchantCard,
      playerId: 'player1',
      cardId: 'nonexistent-card',
      timestamp: Date.now()
    };
    
    const result = validatePlayCard(game, action);
    assert(!result.valid, 'Should reject playing card not in hand');
    if (!result.valid) {
      assertEqual(result.code, ValidationErrorCode.CardNotInHand);
    }
  });

  test('Rejects produce that exceeds caravan capacity', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-4');
    
    // Set player caravan to 9 crystals
    game = setPlayerCaravan(game, 'player1', crystals(9, 0, 0, 0));
    
    const player = findPlayer(game, 'player1');
    const produceCard = getCardByType(player, MerchantCardType.Produce);
    
    if (produceCard) {
      const action: PlayCardAction = {
        type: ActionType.PlayMerchantCard,
        playerId: 'player1',
        cardId: produceCard.id,
        timestamp: Date.now()
      };
      
      const result = validatePlayCard(game, action);
      assert(!result.valid, 'Should reject produce that exceeds capacity');
      if (!result.valid) {
        assertEqual(result.code, ValidationErrorCode.CaravanCapacityExceeded);
      }
    }
  });

  test('Accepts produce within caravan capacity', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-5');
    
    // Set player caravan to 5 crystals
    game = setPlayerCaravan(game, 'player1', crystals(5, 0, 0, 0));
    
    const player = findPlayer(game, 'player1');
    const produceCard = getCardByType(player, MerchantCardType.Produce);
    
    if (produceCard) {
      const action: PlayCardAction = {
        type: ActionType.PlayMerchantCard,
        playerId: 'player1',
        cardId: produceCard.id,
        timestamp: Date.now()
      };
      
      const result = validatePlayCard(game, action);
      assert(result.valid, 'Should accept produce within capacity');
    }
  });

  test('Rejects upgrade without selection', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'validation-6');
    
    const player = findPlayer(game, 'player1');
    const upgradeCard = getCardByType(player, MerchantCardType.Upgrade);
    
    if (upgradeCard) {
      const action: PlayCardAction = {
        type: ActionType.PlayMerchantCard,
        playerId: 'player1',
        cardId: upgradeCard.id,
        timestamp: Date.now()
        // Missing upgradeSelection
      };
      
      const result = validatePlayCard(game, action);
      assert(!result.valid, 'Should reject upgrade without selection');
      if (!result.valid) {
        assertEqual(result.code, ValidationErrorCode.InvalidUpgradeSelection);
      }
    }
  });

  test('Rejects upgrade with invalid path', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-7');
    
    // Give player a red crystal
    game = setPlayerCaravan(game, 'player1', crystals(0, 0, 1, 0));
    
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
            { fromColor: CrystalColor.Red, toColor: CrystalColor.Yellow }, // Invalid: can't downgrade
            { fromColor: CrystalColor.Red, toColor: CrystalColor.Yellow }
          ]
        }
      };
      
      const result = validatePlayCard(game, action);
      assert(!result.valid, 'Should reject invalid upgrade path');
      if (!result.valid) {
        assertEqual(result.code, ValidationErrorCode.InvalidUpgradePath);
      }
    }
  });

  test('Accepts valid upgrade', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-8');
    
    // Give player yellow crystals
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
      
      const result = validatePlayCard(game, action);
      assert(result.valid, 'Should accept valid upgrade');
    }
  });

  test('Rejects upgrade with insufficient crystals', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-9');
    
    // Give player only 1 yellow crystal
    game = setPlayerCaravan(game, 'player1', crystals(1, 0, 0, 0));
    
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
            { fromColor: CrystalColor.Yellow, toColor: CrystalColor.Green } // Need 2, have 1
          ]
        }
      };
      
      const result = validatePlayCard(game, action);
      assert(!result.valid, 'Should reject upgrade with insufficient crystals');
      if (!result.valid) {
        assertEqual(result.code, ValidationErrorCode.InsufficientCrystals);
      }
    }
  });

  test('Rejects upgrade with wrong count', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-10');
    
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
            { fromColor: CrystalColor.Yellow, toColor: CrystalColor.Green }
            // Need 2, provided 1
          ]
        }
      };
      
      const result = validatePlayCard(game, action);
      assert(!result.valid, 'Should reject upgrade with wrong count');
      if (!result.valid) {
        assertEqual(result.code, ValidationErrorCode.UpgradeCountMismatch);
      }
    }
  });

  // ========================================================================
  // ACQUIRE CARD VALIDATION
  // ========================================================================

  test('Rejects acquiring with invalid row index', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'validation-11');
    
    const action: AcquireCardAction = {
      type: ActionType.AcquireMerchantCard,
      playerId: 'player1',
      rowIndex: 10, // Invalid
      cardId: 'some-card',
      timestamp: Date.now()
    };
    
    const result = validateAcquireCard(game, action);
    assert(!result.valid, 'Should reject invalid row index');
    if (!result.valid) {
      assertEqual(result.code, ValidationErrorCode.InvalidRowIndex);
    }
  });

  test('Rejects acquiring with insufficient yellow crystals', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-12');
    
    // Set player to have 0 yellow crystals
    game = setPlayerCaravan(game, 'player1', crystals(0, 5, 0, 0));
    
    const card = game.merchantRow.cards[2]; // Position 2 costs 2 yellow
    if (card) {
      const action: AcquireCardAction = {
        type: ActionType.AcquireMerchantCard,
        playerId: 'player1',
        rowIndex: 2,
        cardId: card.id,
        timestamp: Date.now()
      };
      
      const result = validateAcquireCard(game, action);
      assert(!result.valid, 'Should reject acquire with insufficient yellow');
      if (!result.valid) {
        assertEqual(result.code, ValidationErrorCode.InsufficientCrystals);
      }
    }
  });

  test('Accepts acquiring first card for free', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-13');
    
    // Even with 0 yellow, can take first card
    game = setPlayerCaravan(game, 'player1', crystals(0, 5, 0, 0));
    
    const card = game.merchantRow.cards[0]; // Position 0 costs 0
    if (card) {
      const action: AcquireCardAction = {
        type: ActionType.AcquireMerchantCard,
        playerId: 'player1',
        rowIndex: 0,
        cardId: card.id,
        timestamp: Date.now()
      };
      
      const result = validateAcquireCard(game, action);
      assert(result.valid, 'Should accept acquiring first card for free');
    }
  });

  test('Accepts acquiring with sufficient yellow crystals', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-14');
    
    game = setPlayerCaravan(game, 'player1', crystals(5, 0, 0, 0));
    
    const card = game.merchantRow.cards[3]; // Position 3 costs 3 yellow
    if (card) {
      const action: AcquireCardAction = {
        type: ActionType.AcquireMerchantCard,
        playerId: 'player1',
        rowIndex: 3,
        cardId: card.id,
        timestamp: Date.now()
      };
      
      const result = validateAcquireCard(game, action);
      assert(result.valid, 'Should accept acquire with sufficient yellow');
    }
  });

  // ========================================================================
  // CLAIM POINT VALIDATION
  // ========================================================================

  test('Rejects claiming with invalid row index', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'validation-15');
    
    const action: ClaimPointAction = {
      type: ActionType.ClaimPointCard,
      playerId: 'player1',
      rowIndex: 10,
      cardId: 'some-card',
      payment: crystals(0, 0, 0, 0),
      timestamp: Date.now()
    };
    
    const result = validateClaimPoint(game, action);
    assert(!result.valid, 'Should reject invalid row index');
    if (!result.valid) {
      assertEqual(result.code, ValidationErrorCode.InvalidRowIndex);
    }
  });

  test('Rejects claiming with incorrect payment', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-16');
    
    game = setPlayerCaravan(game, 'player1', crystals(5, 5, 5, 5));
    
    const card = game.pointCardRow.cards[0];
    if (card) {
      const action: ClaimPointAction = {
        type: ActionType.ClaimPointCard,
        playerId: 'player1',
        rowIndex: 0,
        cardId: card.id,
        payment: crystals(1, 1, 1, 1), // Wrong payment
        timestamp: Date.now()
      };
      
      const result = validateClaimPoint(game, action);
      assert(!result.valid, 'Should reject incorrect payment');
      if (!result.valid) {
        assertEqual(result.code, ValidationErrorCode.IncorrectPayment);
      }
    }
  });

  test('Rejects claiming with insufficient crystals', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-17');
    
    game = setPlayerCaravan(game, 'player1', crystals(1, 0, 0, 0));
    
    const card = game.pointCardRow.cards[0];
    if (card) {
      const action: ClaimPointAction = {
        type: ActionType.ClaimPointCard,
        playerId: 'player1',
        rowIndex: 0,
        cardId: card.id,
        payment: card.cost,
        timestamp: Date.now()
      };
      
      const result = validateClaimPoint(game, action);
      assert(!result.valid, 'Should reject claim with insufficient crystals');
      if (!result.valid) {
        assertEqual(result.code, ValidationErrorCode.InsufficientCrystals);
      }
    }
  });

  test('Accepts claiming with correct payment', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-18');
    
    // Set player caravan with crystals that match first point card cost
    const card = game.pointCardRow.cards[0];
    if (card) {
      // Give player exactly the cost crystals (total should be <= 10)
      const playerCrystals = crystals(
        card.cost.YELLOW + 1,
        card.cost.GREEN + 1,
        card.cost.RED,
        card.cost.BLUE
      );
      game = setPlayerCaravan(game, 'player1', playerCrystals);
      
      const action: ClaimPointAction = {
        type: ActionType.ClaimPointCard,
        playerId: 'player1',
        rowIndex: 0,
        cardId: card.id,
        payment: card.cost,
        timestamp: Date.now()
      };
      
      const result = validateClaimPoint(game, action);
      assert(result.valid, 'Should accept claim with correct payment');
    }
  });

  // ========================================================================
  // REST VALIDATION
  // ========================================================================

  test('Rejects rest with no cards in play', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'validation-19');
    
    const action: RestAction = {
      type: ActionType.Rest,
      playerId: 'player1',
      timestamp: Date.now()
    };
    
    const result = validateRest(game, action);
    assert(!result.valid, 'Should reject rest with no cards in play');
    if (!result.valid) {
      assertEqual(result.code, ValidationErrorCode.NoCardsToRest);
    }
  });

  test('Accepts rest with cards in play', () => {
    const players = createTestPlayers(2);
    let game = createNewGame(players, 'validation-20');
    
    // Move a card to play area
    const player = findPlayer(game, 'player1');
    const cardToPlay = player.hand[0];
    game = {
      ...game,
      players: game.players.map(p => 
        p.id === 'player1' 
          ? { ...p, playArea: [cardToPlay], hand: p.hand.slice(1) }
          : p
      )
    };
    
    const action: RestAction = {
      type: ActionType.Rest,
      playerId: 'player1',
      timestamp: Date.now()
    };
    
    const result = validateRest(game, action);
    assert(result.valid, 'Should accept rest with cards in play');
  });
});
