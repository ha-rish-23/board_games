import { Game, Player, CrystalColor, CrystalSet, GamePhase, MerchantCardType } from '../types/domain';
import { PlayerInput } from '../setup/gameSetup';

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================

/**
 * Creates an empty crystal set.
 */
export function emptyCrystals(): CrystalSet {
  return {
    [CrystalColor.Yellow]: 0,
    [CrystalColor.Green]: 0,
    [CrystalColor.Red]: 0,
    [CrystalColor.Blue]: 0
  };
}

/**
 * Creates a crystal set with specified amounts.
 */
export function crystals(y: number = 0, g: number = 0, r: number = 0, b: number = 0): CrystalSet {
  return {
    [CrystalColor.Yellow]: y,
    [CrystalColor.Green]: g,
    [CrystalColor.Red]: r,
    [CrystalColor.Blue]: b
  };
}

/**
 * Counts total crystals in a set.
 */
export function countCrystals(set: CrystalSet): number {
  return set.YELLOW + set.GREEN + set.RED + set.BLUE;
}

/**
 * Creates a minimal test player input.
 */
export function createTestPlayerInput(id: string, name: string): PlayerInput {
  return { id, name };
}

/**
 * Creates an array of test player inputs.
 */
export function createTestPlayers(count: number): PlayerInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `player${i + 1}`,
    name: `Player ${i + 1}`
  }));
}

/**
 * Finds a player in the game by ID.
 */
export function findPlayer(game: Game, playerId: string): Player {
  const player = game.players.find(p => p.id === playerId);
  if (!player) {
    throw new Error(`Player ${playerId} not found in game`);
  }
  return player;
}

/**
 * Gets the current active player.
 */
export function getCurrentPlayer(game: Game): Player {
  return game.players[game.currentPlayerIndex];
}

/**
 * Asserts two crystal sets are equal.
 */
export function assertCrystalsEqual(actual: CrystalSet, expected: CrystalSet): void {
  if (
    actual.YELLOW !== expected.YELLOW ||
    actual.GREEN !== expected.GREEN ||
    actual.RED !== expected.RED ||
    actual.BLUE !== expected.BLUE
  ) {
    throw new Error(
      `Crystal sets not equal.\nExpected: ${formatCrystals(expected)}\nActual: ${formatCrystals(actual)}`
    );
  }
}

/**
 * Formats a crystal set for display.
 */
export function formatCrystals(set: CrystalSet): string {
  return `Y:${set.YELLOW} G:${set.GREEN} R:${set.RED} B:${set.BLUE}`;
}

/**
 * Asserts a condition is true.
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Asserts two values are equal.
 */
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    const msg = message || `Expected ${expected}, got ${actual}`;
    throw new Error(msg);
  }
}

/**
 * Finds a card in merchant row by partial ID match.
 */
export function findMerchantCard(game: Game, partialId: string) {
  for (let i = 0; i < game.merchantRow.cards.length; i++) {
    const card = game.merchantRow.cards[i];
    if (card && card.id.includes(partialId)) {
      return { card, index: i };
    }
  }
  return null;
}

/**
 * Finds a point card in point row by partial ID match.
 */
export function findPointCard(game: Game, partialId: string) {
  for (let i = 0; i < game.pointCardRow.cards.length; i++) {
    const card = game.pointCardRow.cards[i];
    if (card && card.id.includes(partialId)) {
      return { card, index: i };
    }
  }
  return null;
}

/**
 * Gets a card from player's hand by type.
 */
export function getCardByType(player: Player, type: MerchantCardType) {
  return player.hand.find(c => c.type === type);
}

/**
 * Sets a player's caravan to specific values (for testing).
 */
export function setPlayerCaravan(game: Game, playerId: string, caravan: CrystalSet): Game {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  const updatedPlayer = { ...game.players[playerIndex], caravan };
  const newPlayers = [
    ...game.players.slice(0, playerIndex),
    updatedPlayer,
    ...game.players.slice(playerIndex + 1)
  ];
  return { ...game, players: newPlayers };
}

/**
 * Runs a test function and catches errors.
 */
export function runTest(name: string, testFn: () => void | Promise<void>): void {
  try {
    const result = testFn();
    if (result instanceof Promise) {
      result
        .then(() => process.stdout.write(`✓ ${name}\n`))
        .catch(error => process.stderr.write(`✗ ${name}\n  ${error.message}\n`));
    } else {
      process.stdout.write(`✓ ${name}\n`);
    }
  } catch (error: any) {
    process.stderr.write(`✗ ${name}\n  ${error.message}\n`);
  }
}

/**
 * Test suite runner.
 */
export function describe(suiteName: string, suiteFn: () => void): void {
  process.stdout.write(`\n${suiteName}\n`);
  process.stdout.write('='.repeat(suiteName.length) + '\n');
  suiteFn();
}

/**
 * Individual test runner.
 */
export function test(testName: string, testFn: () => void | Promise<void>): void {
  runTest(testName, testFn);
}
