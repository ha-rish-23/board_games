# Test Error Summary and Resolution

## Errors Found

The test files have TypeScript compile errors due to action type inference issues.

### Root Cause
When creating action objects like:
```typescript
const action = {
  type: ActionType.PlayMerchantCard,
  // ...
};
```

TypeScript infers the type as `{ type: ActionType; ... }` instead of `PlayCardAction`.

### Solution
Add explicit type annotations:
```typescript
const action: PlayCardAction = {
  type: ActionType.PlayMerchantCard,
  // ...
};
```

## Files Requiring Fixes

1. **validation.test.ts** - 19 action objects need type annotations
2. **actionResolution.test.ts** - 17 action objects need type annotations  
3. **comprehensive.test.ts** - 8 action objects need type annotations
4. **testHelpers.ts** - Replace `console` with `process.stdout/stderr` (already fixed)

## Quick Fix Instructions

For each test file, add the appropriate type annotation before the action object:

- `PlayCardAction` for play card actions
- `AcquireCardAction` for acquire actions
- `ClaimPointAction` for claim actions
- `RestAction` for rest actions

Example pattern:
```typescript
// Before (causes error)
const action = {
  type: ActionType.PlayMerchantCard,
  playerId: 'player1',
  cardId: card.id,
  timestamp: Date.now()
};

// After (works)
const action: PlayCardAction = {
  type: ActionType.PlayMerchantCard,
  playerId: 'player1',
  cardId: card.id,
  timestamp: Date.now()
};
```

## Status

- ✅ Imports added to all test files  
- ✅ testHelpers.ts console errors fixed
- ⏳ Action object type annotations needed (can run tests after this)

## Alternative Workaround

If fixing all annotations is too tedious, you can use type assertions:
```typescript
const action = {
  type: ActionType.PlayMerchantCard,
  // ...
} as PlayCardAction;
```

Or the tests can be run with `// @ts-ignore` comments (not recommended for production).
