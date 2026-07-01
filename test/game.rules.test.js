import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  generatePuzzle,
  getActiveLevelIndex,
  getActivePuzzleIndex,
  getSkillProgress,
  getUnlockedLevelIndex,
  goToLevel,
  isLevelUnlocked,
  LEVEL_COUNT,
  PUZZLES_PER_LEVEL,
  REWARD_GROUPS,
  unlockProgressToLevel,
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

  it('unlocks progress up to the selected continue level', () => {
    const state = createGame();
    const next = unlockProgressToLevel(state, 10);

    assert.equal(next.currentLevelIndex, 9);
    assert.equal(next.currentPuzzleIndex, 0);
    assert.equal(next.totalStars, 9);
    assert.equal(Object.keys(next.levelStars).length, 9);
    assert.equal(getUnlockedLevelIndex(next.levelStars), 9);
    assert.equal(isLevelUnlocked(next, 9), true);
    assert.equal(isLevelUnlocked(next, 10), false);
  });

  it('maps addition progress to the highest unlocked level', () => {
    const level10State = unlockProgressToLevel(createGame(), 10);
    const completedState = {
      ...createGame(),
      levelStars: Object.fromEntries(Array.from({ length: LEVEL_COUNT }, (_, i) => [i, 1])),
    };

    assert.deepEqual(getSkillProgress(level10State), { addition: 13 });
    assert.deepEqual(getSkillProgress(completedState), { addition: 100 });
  });

  it('does not lower existing progress when unlocking an earlier level', () => {
    const state = {
      ...createGame(),
      currentLevelIndex: 15,
      currentPuzzleIndex: 4,
      levelStars: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i, i === 0 ? 3 : 1])),
      totalStars: 17,
    };
    const next = unlockProgressToLevel(state, 10);

    assert.equal(next.currentLevelIndex, 15);
    assert.equal(next.currentPuzzleIndex, 4);
    assert.equal(next.levelStars[0], 3);
    assert.equal(next.totalStars, 17);
  });

  it('scales generated targets up to 160 on the final level', () => {
    const finalTargets = Array.from({ length: PUZZLES_PER_LEVEL }, (_, puzzleIndex) =>
      generatePuzzle(LEVEL_COUNT - 1, puzzleIndex).target
    );

    assert.equal(Math.max(...finalTargets), 160);
    assert.deepEqual([...finalTargets].sort((a, b) => a - b), [151, 152, 153, 154, 155, 156, 157, 158, 159, 160]);
  });

  it('has a reward for the final level', () => {
    const rewards = REWARD_GROUPS.flatMap(group => group.items);
    const finalReward = rewards.find(reward => reward.unlockLevel === LEVEL_COUNT);

    assert.equal(finalReward?.name, 'Pariserhjul');
    assert.equal(finalReward?.funFact, 'Det første store pariserhjulet ble bygget i Chicago i 1893 og var omtrent 80 meter høyt.');
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
