import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  generatePuzzle,
  getActiveLevelIndex,
  getActivePuzzleIndex,
  getDailyChallengeLevelIndex,
  goToDailyChallenge,
  goToLevel,
  goToScreen,
  isLevelUnlocked,
  LEVEL_COUNT,
  PUZZLES_PER_LEVEL,
} from '../www/src/engine/game.js';

function minimumSolutionSize(puzzle) {
  for (let size = 1; size <= puzzle.pieces.length; size++) {
    let found = false;

    function visit(start, remaining, sum) {
      if (remaining === 0) {
        if (sum === puzzle.target) found = true;
        return;
      }
      if (found || sum >= puzzle.target) return;

      for (let i = start; i < puzzle.pieces.length; i++) {
        visit(i + 1, remaining - 1, sum + puzzle.pieces[i]);
      }
    }

    visit(0, size, 0);
    if (found) return size;
  }
  return null;
}

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

  it('scales generated targets up to 160 on the final level', () => {
    const finalTargets = Array.from({ length: PUZZLES_PER_LEVEL }, (_, puzzleIndex) =>
      generatePuzzle(LEVEL_COUNT - 1, puzzleIndex).target
    );

    assert.equal(Math.max(...finalTargets), 160);
    assert.deepEqual([...finalTargets].sort((a, b) => a - b), [151, 152, 153, 154, 155, 156, 157, 158, 159, 160]);
  });

  it('adds early variety with puzzles that require more than two numbers', () => {
    const earlySolutionSizes = [];
    for (let levelIndex = 0; levelIndex < 5; levelIndex++) {
      for (let puzzleIndex = 0; puzzleIndex < PUZZLES_PER_LEVEL; puzzleIndex++) {
        earlySolutionSizes.push(minimumSolutionSize(generatePuzzle(levelIndex, puzzleIndex)));
      }
    }

    assert.ok(earlySolutionSizes.includes(2));
    assert.ok(earlySolutionSizes.includes(3));
  });

  it('keeps generated puzzle solutions valid and varied across all levels', () => {
    const solutionSizes = new Set();

    for (let levelIndex = 0; levelIndex < LEVEL_COUNT; levelIndex++) {
      for (let puzzleIndex = 0; puzzleIndex < PUZZLES_PER_LEVEL; puzzleIndex++) {
        const puzzle = generatePuzzle(levelIndex, puzzleIndex);
        const solutionSize = minimumSolutionSize(puzzle);
        solutionSizes.add(solutionSize);

        assert.ok(solutionSize >= 2 && solutionSize <= 4);
        assert.ok(puzzle.pieces.length > solutionSize);
        assert.ok(puzzle.pieces.every(piece => Number.isInteger(piece) && piece > 0 && piece < puzzle.target));
      }
    }

    assert.deepEqual([...solutionSizes].sort((a, b) => a - b), [2, 3, 4]);
  });
});
