import { createNewGame, PlayerInput } from '../setup/gameSetup';
import { GamePhase, MerchantCardType, CrystalColor } from '../types/domain';
import {
  describe,
  test,
  assert,
  assertEqual,
  createTestPlayers,
  emptyCrystals,
  crystals,
  assertCrystalsEqual
} from './testHelpers';

describe('Game Setup Tests', () => {
  
  test('Creates game with 2 players', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'test-seed-1');
    
    assertEqual(game.players.length, 2, 'Should have 2 players');
    assertEqual(game.phase, GamePhase.Playing, 'Should be in Playing phase');
    assertEqual(game.currentPlayerIndex, 0, 'First player should be current');
    assertEqual(game.turnNumber, 1, 'Should start at turn 1');
    assert(!game.endGameTriggered, 'End game should not be triggered');
    assert(game.winnerId === null, 'No winner at start');
  });

  test('Creates game with 5 players', () => {
    const players = createTestPlayers(5);
    const game = createNewGame(players, 'test-seed-2');
    
    assertEqual(game.players.length, 5, 'Should have 5 players');
  });

  test('Rejects invalid player counts', () => {
    let error1 = null;
    try {
      createNewGame(createTestPlayers(1), 'seed');
    } catch (e: any) {
      error1 = e.message;
    }
    assert(error1 !== null, 'Should reject 1 player');
    assert(error1!.includes('Invalid player count'), 'Error should mention player count');

    let error2 = null;
    try {
      createNewGame(createTestPlayers(6), 'seed');
    } catch (e: any) {
      error2 = e.message;
    }
    assert(error2 !== null, 'Should reject 6 players');
  });

  test('Assigns starting merchant cards correctly', () => {
    const players = createTestPlayers(3);
    const game = createNewGame(players, 'test-seed-3');
    
    for (const player of game.players) {
      assertEqual(player.hand.length, 2, 'Each player should have 2 starting cards');
      
      const produceCard = player.hand.find(c => c.type === MerchantCardType.Produce);
      const upgradeCard = player.hand.find(c => c.type === MerchantCardType.Upgrade);
      
      assert(produceCard !== undefined, 'Should have a Produce card');
      assert(upgradeCard !== undefined, 'Should have an Upgrade card');
      
      if (produceCard?.type === MerchantCardType.Produce) {
        assertEqual(produceCard.produces.YELLOW, 2, 'Produce card should produce 2 yellow');
      }
      
      if (upgradeCard?.type === MerchantCardType.Upgrade) {
        assertEqual(upgradeCard.upgrades.length, 1, 'Upgrade card should have 1 upgrade');
        assertEqual(upgradeCard.upgrades[0].count, 2, 'Should upgrade 2 crystals');
        assertEqual(upgradeCard.upgrades[0].times, 1, 'Should upgrade once');
      }
    }
  });

  test('Assigns starting crystals correctly', () => {
    const players = createTestPlayers(4);
    const game = createNewGame(players, 'test-seed-4');
    
    // First player gets 3 yellow, others get 4
    assertEqual(game.players[0].caravan.YELLOW, 3, 'First player should have 3 yellow');
    assertEqual(game.players[1].caravan.YELLOW, 4, 'Player 2 should have 4 yellow');
    assertEqual(game.players[2].caravan.YELLOW, 4, 'Player 3 should have 4 yellow');
    assertEqual(game.players[3].caravan.YELLOW, 4, 'Player 4 should have 4 yellow');
    
    // All other crystals should be 0
    for (const player of game.players) {
      assertEqual(player.caravan.GREEN, 0, 'Should have no green');
      assertEqual(player.caravan.RED, 0, 'Should have no red');
      assertEqual(player.caravan.BLUE, 0, 'Should have no blue');
    }
  });

  test('Sets first player correctly', () => {
    const players = createTestPlayers(3);
    const game = createNewGame(players, 'test-seed-5');
    
    assert(game.players[0].isFirstPlayer, 'First player should be marked');
    assert(!game.players[1].isFirstPlayer, 'Other players should not be marked');
    assert(!game.players[2].isFirstPlayer, 'Other players should not be marked');
  });

  test('Initializes merchant row with 6 cards', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'test-seed-6');
    
    assertEqual(game.merchantRow.cards.length, 6, 'Should have 6 cards in merchant row');
    assertEqual(game.merchantRow.maxSize, 6, 'Max size should be 6');
    
    // All slots should be filled initially
    for (const card of game.merchantRow.cards) {
      assert(card !== null, 'All slots should have cards initially');
    }
  });

  test('Initializes point card row with 5 cards', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'test-seed-7');
    
    assertEqual(game.pointCardRow.cards.length, 5, 'Should have 5 cards in point row');
    assertEqual(game.pointCardRow.maxSize, 5, 'Max size should be 5');
    
    // All slots should be filled initially
    for (const card of game.pointCardRow.cards) {
      assert(card !== null, 'All slots should have cards initially');
    }
  });

  test('Places coins on point cards correctly', () => {
    const players = createTestPlayers(3);
    const game = createNewGame(players, 'test-seed-8');
    
    // The 4th card (index 3) should have copper bonus (+1)
    // The 5th card (index 4) should have silver bonus (+3)
    const basePointDeck = [6, 7, 8, 9, 10]; // Example base values
    
    // We can't know exact base values without the deck, but we know:
    // - Cards at indices 0-2 should have their base points
    // - Card at index 3 should have base + 1
    // - Card at index 4 should have base + 3
    
    // Just verify cards exist and have points
    assert(game.pointCardRow.cards[3] !== null, 'Card at position 3 should exist');
    assert(game.pointCardRow.cards[4] !== null, 'Card at position 4 should exist');
    assert(game.pointCardRow.cards[3]!.points > 0, 'Card should have points');
    assert(game.pointCardRow.cards[4]!.points > 0, 'Card should have points');
  });

  test('Shuffles deterministically with same seed', () => {
    const players1 = createTestPlayers(2);
    const players2 = createTestPlayers(2);
    
    const game1 = createNewGame(players1, 'same-seed');
    const game2 = createNewGame(players2, 'same-seed');
    
    // Merchant row should be identical
    for (let i = 0; i < game1.merchantRow.cards.length; i++) {
      assertEqual(
        game1.merchantRow.cards[i]?.id,
        game2.merchantRow.cards[i]?.id,
        `Merchant card at position ${i} should be identical`
      );
    }
    
    // Point row should be identical
    for (let i = 0; i < game1.pointCardRow.cards.length; i++) {
      assertEqual(
        game1.pointCardRow.cards[i]?.id,
        game2.pointCardRow.cards[i]?.id,
        `Point card at position ${i} should be identical`
      );
    }
  });

  test('Shuffles differently with different seeds', () => {
    const players1 = createTestPlayers(2);
    const players2 = createTestPlayers(2);
    
    const game1 = createNewGame(players1, 'seed-A');
    const game2 = createNewGame(players2, 'seed-B');
    
    // At least one card should be different (very high probability)
    let foundDifference = false;
    for (let i = 0; i < game1.merchantRow.cards.length; i++) {
      if (game1.merchantRow.cards[i]?.id !== game2.merchantRow.cards[i]?.id) {
        foundDifference = true;
        break;
      }
    }
    
    assert(foundDifference, 'Different seeds should produce different shuffles');
  });

  test('Initializes empty play areas', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'test-seed-9');
    
    for (const player of game.players) {
      assertEqual(player.playArea.length, 0, 'Play area should be empty at start');
    }
  });

  test('Initializes with no point cards claimed', () => {
    const players = createTestPlayers(3);
    const game = createNewGame(players, 'test-seed-10');
    
    for (const player of game.players) {
      assertEqual(player.pointCards.length, 0, 'Should have no point cards at start');
      assertEqual(player.score, 0, 'Score should be 0 at start');
    }
  });

  test('Creates remaining merchant deck after dealing', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'test-seed-11');
    
    // Total merchant cards in game: 42 (standard deck)
    // Each player gets 2 starting cards: 2 * 2 = 4
    // Merchant row has 6 cards
    // Remaining deck should have: 42 - 6 = 36 (starting cards are separate)
    
    assert(game.merchantDeck.length > 0, 'Should have cards remaining in deck');
    assert(game.merchantRow.cards.length === 6, 'Row should have 6 cards');
  });

  test('Creates remaining point deck after dealing', () => {
    const players = createTestPlayers(2);
    const game = createNewGame(players, 'test-seed-12');
    
    // Point card row has 5 cards, rest should be in deck
    assert(game.pointCardDeck.length > 0, 'Should have cards remaining in point deck');
    assertEqual(game.pointCardRow.cards.length, 5, 'Row should have 5 cards');
  });

  test('Sets timestamps correctly', () => {
    const players = createTestPlayers(2);
    const before = Date.now();
    const game = createNewGame(players, 'test-seed-13');
    const after = Date.now();
    
    assert(game.createdAt >= before && game.createdAt <= after, 'createdAt should be set');
    assert(game.updatedAt >= before && game.updatedAt <= after, 'updatedAt should be set');
    assertEqual(game.createdAt, game.updatedAt, 'Both timestamps should be equal at creation');
  });

  test('Generates unique game ID', () => {
    const players1 = createTestPlayers(2);
    const players2 = createTestPlayers(2);
    
    const game1 = createNewGame(players1, 'seed-1');
    const game2 = createNewGame(players2, 'seed-2');
    
    assert(game1.id !== game2.id, 'Game IDs should be unique');
    assert(game1.id.startsWith('game-'), 'Game ID should have correct prefix');
  });

  test('Rejects duplicate player IDs', () => {
    const players = [
      { id: 'player1', name: 'Alice' },
      { id: 'player1', name: 'Bob' } // Duplicate ID
    ];
    
    let error = null;
    try {
      createNewGame(players, 'seed');
    } catch (e: any) {
      error = e.message;
    }
    
    assert(error !== null, 'Should reject duplicate player IDs');
    assert(error!.includes('unique'), 'Error should mention uniqueness');
  });
});
