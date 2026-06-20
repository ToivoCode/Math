import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../www/src/engine/game.js';

describe('game baseline', () => {
  it('creates an initial game state', () => {
    const game = createGame();
    assert.ok(game !== null);
  });
});
