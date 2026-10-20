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
  updateMultiplication,
  resetProgress,
} from '../www/src/engine/game.js';

import {
  TIMES_TABLES, createMultiplication, startMultiplicationRound,
  getMultiplicationQuestion, submitMultiplicationAnswer,
  requestMultiplicationHint, nextMultiplicationQuestion,
} from '../www/src/engine/multiplication.js';

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
  let stored = JSON.stringify(savedState);
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
    removeItem: () => { stored = null; },
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

    assert.deepEqual(getSkillProgress(level10State), { addition: 13, multiplication: 0 });
    assert.deepEqual(getSkillProgress(completedState), { addition: 100, multiplication: 0 });
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

describe('multiplication garden rules', () => {
  function solveRound(practice) {
    while (!practice.round.complete) {
      const question = getMultiplicationQuestion(practice);
      practice = submitMultiplicationAnswer(practice, String(question.answer));
      practice = nextMultiplicationQuestion(practice);
    }
    return practice;
  }

  it('opens all ten tables and covers factors 1 to 10 exactly once per round', () => {
    for (const table of TIMES_TABLES) {
      for (const seed of [0, 1, 42, 314159]) {
        let practice = startMultiplicationRound(createMultiplication(), table, seed);
        assert.deepEqual([...practice.round.factors].sort((a, b) => a - b), TIMES_TABLES);
        for (let index = 0; index < 10; index++) {
          const question = getMultiplicationQuestion(practice);
          assert.equal(question.table, table);
          assert.equal(question.answer, table * question.factor);
          practice = submitMultiplicationAnswer(practice, String(question.answer));
          practice = nextMultiplicationQuestion(practice);
        }
        assert.equal(practice.round.complete, true);
        assert.equal(practice.round.results.length, 10);
        assert.deepEqual(practice.progress[table], { rounds: 1, best: 10 });
      }
    }
  });

  it('repeats a seeded order and varies the order with another seed', () => {
    const initial = createMultiplication();
    const first = startMultiplicationRound(initial, 5, 42);
    assert.deepEqual(first, startMultiplicationRound(initial, 5, 42));
    assert.notDeepEqual(first.round.factors, startMultiplicationRound(initial, 5, 43).round.factors);
    assert.equal(initial.round, null);
  });

  it('rejects tables outside 1 to 10 without changing a current round', () => {
    const practice = startMultiplicationRound(createMultiplication(), 6);
    for (const table of [0, 11, -1, 1.5, NaN, '5', null]) {
      assert.equal(startMultiplicationRound(practice, table), practice);
    }
  });

  it('requires a whole-number answer and does not count empty input as a mistake', () => {
    const practice = startMultiplicationRound(createMultiplication(), 5);
    for (const input of ['', ' ', '1e1', '5.0', '-5', 'abc', '1000', null, undefined]) {
      const result = submitMultiplicationAnswer(practice, input);
      assert.equal(result.round.feedback, 'invalid');
      assert.equal(result.round.wrongAttempts, 0);
      assert.equal(result.round.results.length, 0);
    }
  });

  it('lets the child correct an answer without skipping or losing flowers', () => {
    const initial = startMultiplicationRound(createMultiplication(), 6);
    const answer = getMultiplicationQuestion(initial).answer;
    const wrong = submitMultiplicationAnswer(initial, '0');
    assert.equal(wrong.round.feedback, 'wrong');
    assert.equal(wrong.round.index, 0);
    assert.equal(nextMultiplicationQuestion(wrong), wrong);
    assert.equal(wrong.round.results.length, 0);
    const corrected = submitMultiplicationAnswer(wrong, String(answer));
    assert.equal(corrected.round.results[0].independent, false);
    assert.equal(initial.round.wrongAttempts, 0);
    const next = nextMultiplicationQuestion(corrected);
    assert.equal(next.round.index, 1);
    assert.equal(next.round.wrongAttempts, 0);
    assert.equal(next.round.feedback, null);
    const completed = solveRound(next);
    assert.deepEqual(completed.progress[6], { rounds: 1, best: 9 });
  });

  it('keeps help visible for a question and resets it for the next one', () => {
    let practice = startMultiplicationRound(createMultiplication(), 5);
    practice = requestMultiplicationHint(practice);
    assert.equal(practice.round.hintUsed, true);
    practice = submitMultiplicationAnswer(practice, String(getMultiplicationQuestion(practice).answer));
    assert.equal(practice.round.results[0].independent, false);
    practice = nextMultiplicationQuestion(practice);
    assert.equal(practice.round.hintUsed, false);
    assert.equal(solveRound(practice).progress[5].best, 9);
  });

  it('does not skip unanswered questions or count repeated submissions twice', () => {
    let practice = startMultiplicationRound(createMultiplication(), 10);
    assert.equal(nextMultiplicationQuestion(practice), practice);
    for (let index = 0; index < 10; index++) {
      const answer = String(getMultiplicationQuestion(practice).answer);
      practice = submitMultiplicationAnswer(practice, answer);
      assert.equal(submitMultiplicationAnswer(practice, answer), practice);
      assert.equal(requestMultiplicationHint(practice), practice);
      practice = nextMultiplicationQuestion(practice);
    }
    assert.equal(practice.progress[10].rounds, 1);
    assert.equal(getMultiplicationQuestion(practice), null);
    assert.equal(submitMultiplicationAnswer(practice, '100'), practice);
    assert.equal(nextMultiplicationQuestion(practice), practice);
  });

  it('keeps the best score on replay and separates table progress', () => {
    let practice = solveRound(startMultiplicationRound(createMultiplication(), 5));
    practice = startMultiplicationRound(practice, 5, 2);
    practice = solveRound(requestMultiplicationHint(practice));
    assert.deepEqual(practice.progress[5], { rounds: 2, best: 10 });
    practice = solveRound(startMultiplicationRound(practice, 6));
    assert.deepEqual(practice.progress[6], { rounds: 1, best: 10 });
    assert.equal(practice.progress[7], undefined);
    assert.equal(getSkillProgress({ ...createGame(), multiplication: practice }).multiplication, 20);
  });

  it('ignores unfinished rounds in saved progress', () => {
    let practice = startMultiplicationRound(createMultiplication(), 1);
    practice = submitMultiplicationAnswer(practice, String(getMultiplicationQuestion(practice).answer));
    assert.deepEqual(practice.progress, {});
  });

  it('loads old saves and sanitizes saved multiplication scores', () => {
    withSavedState({ currentLevelIndex: 0, levelStars: {} }, () => {
      assert.deepEqual(createGame().multiplication, { progress: {}, round: null });
    });
    const practice = createMultiplication({
      1: { rounds: 2, best: 12 },
      2: { rounds: 1, best: -1 },
      3: { rounds: -1, best: 10 },
      4: { rounds: 1, best: '10' },
      11: { rounds: 1, best: 10 },
    });
    assert.deepEqual(practice.progress, {
      1: { rounds: 2, best: 10 }, 2: { rounds: 1, best: 0 }, 4: { rounds: 1, best: 0 },
    });
  });

  it('saves multiplication separately from addition and resets both together', () => {
    withSavedState({
      currentLevelIndex: 1, currentPuzzleIndex: 3,
      levelStars: { 0: 3 }, totalStars: 3, settings: { sound: false },
    }, () => {
      const initial = createGame();
      const practice = solveRound(startMultiplicationRound(initial.multiplication, 6));
      updateMultiplication(initial, practice);
      const loaded = createGame();
      assert.deepEqual(loaded.multiplication.progress[6], { rounds: 1, best: 10 });
      assert.equal(loaded.multiplication.round, null);
      assert.equal(loaded.currentLevelIndex, 1);
      assert.equal(loaded.currentPuzzleIndex, 3);
      assert.deepEqual(loaded.levelStars, { 0: 3 });
      assert.equal(loaded.totalStars, 3);
      assert.deepEqual(loaded.settings, { sound: false });
      resetProgress();
      const reset = createGame();
      assert.deepEqual(reset.multiplication.progress, {});
      assert.deepEqual(reset.levelStars, {});
    });
  });
});
