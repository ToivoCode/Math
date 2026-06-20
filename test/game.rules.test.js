import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  getActiveLevelIndex,
  getActivePuzzleIndex,
  getDailyChallengeLevelIndex,
  goToDailyChallenge,
  goToLevel,
  goToScreen,
  isLevelUnlocked,
} from '../www/src/engine/game.js';

function withSavedState(savedState, fn) {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => JSON.stringify(savedState),
    setItem: () => {},
    removeItem: () => {},
  };

  try {
    return fn();
  } finally {
    if (previousStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previousStorage;
    }
  }
}

describe('game rules', () => {
  it('keeps daily challenge inside the unlocked range for a new player', () => {
    const state = { ...createGame(), dailyLevelIndex: 21 };
    const daily = goToDailyChallenge(state);

    assert.equal(getDailyChallengeLevelIndex(state), 0);
    assert.equal(getActiveLevelIndex(daily), 0);
    assert.equal(daily.currentLevelIndex, 0);
    assert.equal(daily.isDailyChallenge, true);
  });

  it('does not overwrite normal continue progress when entering or leaving daily challenge', () => {
    const state = {
      ...createGame(),
      currentLevelIndex: 0,
      currentPuzzleIndex: 4,
      playLevelIndex: 0,
      playPuzzleIndex: 4,
      dailyLevelIndex: 21,
    };

    const daily = goToDailyChallenge(state);
    assert.equal(daily.currentLevelIndex, 0);
    assert.equal(daily.currentPuzzleIndex, 4);
    assert.equal(getActiveLevelIndex(daily), 0);
    assert.equal(getActivePuzzleIndex(daily), 0);

    const home = goToScreen(daily, 'home');
    assert.equal(home.currentLevelIndex, 0);
    assert.equal(home.currentPuzzleIndex, 4);
    assert.equal(getActiveLevelIndex(home), 0);
    assert.equal(getActivePuzzleIndex(home), 4);
  });

  it('refuses direct navigation to a locked level', () => {
    const state = createGame();
    const next = goToLevel(state, 21);

    assert.equal(next.currentLevelIndex, 0);
    assert.equal(getActiveLevelIndex(next), 0);
    assert.equal(isLevelUnlocked(next, 21), false);
  });

  it('repairs saved current level when it points beyond unlocked progress', () => {
    withSavedState({
      currentLevelIndex: 21,
      currentPuzzleIndex: 6,
      levelStars: {},
      totalStars: 0,
    }, () => {
      const game = createGame();

      assert.equal(game.currentLevelIndex, 0);
      assert.equal(game.currentPuzzleIndex, 0);
      assert.equal(getActiveLevelIndex(game), 0);
      assert.equal(getActivePuzzleIndex(game), 0);
    });
  });
});
