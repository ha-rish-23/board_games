#!/usr/bin/env node
/**
 * Simple test runner for the board game engine.
 * Runs all test files and reports results.
 */

// Import all test files
import './gameSetup.test';
import './validation.test';
import './actionResolution.test';
import './comprehensive.test';

console.log('\n');
console.log('='.repeat(60));
console.log('All tests completed');
console.log('='.repeat(60));
