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
  updateSubtraction,
  goToScreen,
  resetProgress,
  selectPiece, undoLast, submitAnswer, requestHint, nextPuzzle, nextLevel,
} from '../www/src/engine/game.js';

import {
  TIMES_TABLES, createMultiplication, startMultiplicationRound,
  getMultiplicationQuestion, submitMultiplicationAnswer,
  requestMultiplicationHint, nextMultiplicationQuestion,
} from '../www/src/engine/multiplication.js';
import {
  SUBTRACTION_ROUND_SIZE, createSubtraction, startSubtractionRound,
  getSubtractionQuestion, submitSubtractionAnswer, nextSubtractionQuestion,
  SUBTRACTION_LEVEL_COUNT, getSubtractionLevelMax, getUnlockedSubtractionLevel,
  isSubtractionLevelUnlocked, unlockSubtractionToLevel,
} from '../www/src/engine/subtraction.js';

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

  it('measures addition progress by completed levels, including the final level', () => {
    const level10State = unlockProgressToLevel(createGame(), 10);
    const completedState = {
      ...createGame(),
      levelStars: Object.fromEntries(Array.from({ length: LEVEL_COUNT }, (_, i) => [i, 1])),
    };

    assert.equal(getSkillProgress(createGame()).addition, 0);
    assert.deepEqual(getSkillProgress(level10State), { addition: 11, subtraction: 0, multiplication: 0 });
    assert.equal(getSkillProgress({ ...completedState, levelStars: { ...completedState.levelStars, 79: 0 } }).addition, 99);
    assert.deepEqual(getSkillProgress(completedState), { addition: 100, subtraction: 0, multiplication: 0 });
  });

  it('keeps addition feedback and hints when visiting other activities', () => {
    const game = { ...createGame(), selectedPieces: new Set([0, 1]), feedback: 'correct' };
    const resumed = goToScreen(goToScreen(game, 'tables'), 'play');
    assert.equal(resumed.feedback, 'correct');
    assert.deepEqual(resumed.selectedPieces, game.selectedPieces);
    const hinted = requestHint(createGame());
    assert.equal(goToScreen(goToScreen(hinted, 'home'), 'play').hintText, hinted.hintText);
  });

  it('locks solved addition puzzles until the child advances', () => {
    for (const feedback of ['correct', 'levelComplete']) {
      const solved = { ...createGame(), feedback, selectedPieces: new Set([0]) };
      assert.equal(selectPiece(solved, 1), solved);
      assert.equal(undoLast(solved), solved);
      assert.equal(submitAnswer(solved), solved);
      assert.equal(requestHint(solved), solved);
    }
  });

  it('only advances solved addition puzzles and finishes the final level at level selection', () => {
    const game = createGame();
    assert.equal(nextPuzzle(game), game);
    assert.equal(nextLevel(game), game);
    assert.equal(nextPuzzle({ ...game, feedback: 'correct' }).currentPuzzleIndex, 1);
    assert.equal(nextLevel({ ...game, feedback: 'levelComplete' }).currentLevelIndex, 1);
    const last = { ...game, currentLevelIndex: 79, currentPuzzleIndex: 9, feedback: 'levelComplete' };
    assert.equal(nextPuzzle(last), last);
    assert.equal(nextLevel(last).screen, 'levels');
  });

  it('shows a requested hint after a wrong answer and ignores invalid piece indices', () => {
    const game = createGame();
    for (const index of [-1, 99, NaN, 0.5]) assert.equal(selectPiece(game, index), game);
    const hinted = requestHint({ ...game, feedback: 'wrong' });
    assert.equal(hinted.feedback, null);
    assert.ok(hinted.hintText);
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

describe('subtraction rules', () => {
  function solveRound(practice) {
    while (!practice.round.complete) {
      practice = submitSubtractionAnswer(practice, String(getSubtractionQuestion(practice).answer));
      practice = nextSubtractionQuestion(practice);
    }
    return practice;
  }

  it('generates ten varied subtraction questions with exactly one correct choice', () => {
    let sawZeroAnswer = false;
    let sawSubtractZero = false;
    for (let seed = 0; seed < 250; seed++) {
      const practice = startSubtractionRound(createSubtraction(), seed);
      assert.equal(practice.round.questions.length, SUBTRACTION_ROUND_SIZE);
      assert.deepEqual(practice.round.questions.map(q => q.minuend).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      for (const q of practice.round.questions) {
        assert.ok(Number.isInteger(q.subtrahend) && q.subtrahend >= 0 && q.subtrahend <= q.minuend);
        assert.equal(q.answer, q.minuend - q.subtrahend);
        assert.equal(q.choices.length, 4);
        assert.equal(new Set(q.choices).size, 4);
        assert.equal(q.choices.filter(choice => choice === q.answer).length, 1);
        assert.ok(q.choices.every(choice => Number.isInteger(choice) && choice >= 0 && choice <= 10));
        if (q.answer === 0) sawZeroAnswer = true;
        if (q.subtrahend === 0) sawSubtractZero = true;
      }
    }
    assert.equal(sawZeroAnswer, true);
    assert.equal(sawSubtractZero, true);
  });

  it('is deterministic for a seed and varies rounds without mutating earlier state', () => {
    const initial = createSubtraction();
    const first = startSubtractionRound(initial, 42);
    assert.deepEqual(first, startSubtractionRound(initial, 42));
    assert.notDeepEqual(first.round.questions, startSubtractionRound(initial, 43).round.questions);
    assert.equal(initial.round, null);
  });

  it('recognizes 6 minus 3 as 3, never the mockup answer 4', () => {
    const practice = startSubtractionRound(createSubtraction());
    practice.round.questions[0] = { minuend: 6, subtrahend: 3, answer: 3, choices: [2, 3, 4, 5] };
    const wrong = submitSubtractionAnswer(practice, 4);
    assert.equal(wrong.round.feedback, 'wrong');
    assert.equal(wrong.round.selectedAnswer, 4);
    assert.equal(wrong.round.results.length, 0);
    assert.equal(nextSubtractionQuestion(wrong), wrong);
    const corrected = submitSubtractionAnswer(wrong, 3);
    assert.equal(corrected.round.feedback, 'correct');
    assert.equal(corrected.round.selectedAnswer, 3);
    assert.deepEqual(corrected.round.results, [{ independent: false }]);
    assert.equal(practice.round.wrongAttempts, 0);
    const next = nextSubtractionQuestion(corrected);
    assert.equal(next.round.index, 1);
    assert.equal(next.round.selectedAnswer, null);
    assert.equal(next.round.feedback, null);
    assert.equal(next.round.wrongAttempts, 0);
    assert.deepEqual(solveRound(next).progress, { rounds: 1, best: 9 });
  });

  it('accepts typed and numeric zero without treating it as empty input', () => {
    const practice = startSubtractionRound(createSubtraction());
    practice.round.questions[0] = { minuend: 2, subtrahend: 2, answer: 0, choices: [0, 1, 2, 3] };
    for (const input of [0, '0', ' 0 ', '00']) {
      const result = submitSubtractionAnswer(practice, input);
      assert.equal(result.round.feedback, 'correct');
      assert.equal(result.round.selectedAnswer, 0);
      assert.deepEqual(result.round.results, [{ independent: true }]);
    }
  });

  it('validates text without counting empty, decimal, or other invalid input as a mistake', () => {
    const practice = startSubtractionRound(createSubtraction());
    for (const input of [null, undefined, '', ' ', NaN, -1, 0.5, '1.5', '1e1', '-2', '+2', 'abc', '1000', false, [0]]) {
      const result = submitSubtractionAnswer(practice, input);
      assert.equal(result.round.feedback, 'invalid');
      assert.equal(result.round.selectedAnswer, null);
      assert.equal(result.round.wrongAttempts, 0);
      assert.equal(result.round.results.length, 0);
      assert.equal(nextSubtractionQuestion(result), result);
      const corrected = submitSubtractionAnswer(result, String(getSubtractionQuestion(result).answer));
      assert.deepEqual(corrected.round.results, [{ independent: true }]);
    }
  });

  it('counts typed wrong answers outside the choices and accepts a corrected typed answer', () => {
    const practice = startSubtractionRound(createSubtraction());
    practice.round.questions[0] = { minuend: 6, subtrahend: 3, answer: 3, choices: [2, 3, 4, 5] };
    const wrong = submitSubtractionAnswer(practice, '99');
    assert.equal(wrong.round.feedback, 'wrong');
    assert.equal(wrong.round.selectedAnswer, 99);
    assert.equal(wrong.round.wrongAttempts, 1);
    assert.equal(nextSubtractionQuestion(wrong), wrong);
    const invalid = submitSubtractionAnswer(wrong, '');
    assert.equal(invalid.round.wrongAttempts, 1);
    const corrected = submitSubtractionAnswer(invalid, ' 3 ');
    assert.equal(corrected.round.feedback, 'correct');
    assert.equal(corrected.round.selectedAnswer, 3);
    assert.deepEqual(corrected.round.results, [{ independent: false }]);
    assert.equal(submitSubtractionAnswer(corrected, '3'), corrected);
    assert.equal(submitSubtractionAnswer(corrected, 3), corrected);
    const next = nextSubtractionQuestion(corrected);
    assert.equal(next.round.selectedAnswer, null);
    assert.equal(next.round.feedback, null);
  });

  it('prevents skipping questions and duplicate scores, including after completion', () => {
    const idle = createSubtraction();
    assert.equal(getSubtractionQuestion(idle), null);
    assert.equal(submitSubtractionAnswer(idle, 0), idle);
    assert.equal(nextSubtractionQuestion(idle), idle);
    let practice = startSubtractionRound(idle, 42);
    for (let index = 0; index < SUBTRACTION_ROUND_SIZE; index++) {
      assert.equal(nextSubtractionQuestion(practice), practice);
      assert.deepEqual(practice.progress, { rounds: 0, best: 0 });
      const q = getSubtractionQuestion(practice);
      practice = submitSubtractionAnswer(practice, q.answer);
      for (const choice of q.choices) assert.equal(submitSubtractionAnswer(practice, choice), practice);
      assert.equal(practice.round.results.length, index + 1);
      practice = nextSubtractionQuestion(practice);
    }
    assert.equal(practice.round.complete, true);
    assert.deepEqual(practice.progress, { rounds: 1, best: 10 });
    assert.equal(getSubtractionQuestion(practice), null);
    assert.equal(submitSubtractionAnswer(practice, 0), practice);
    assert.equal(nextSubtractionQuestion(practice), practice);
  });

  it('keeps the best first-attempt score when replaying', () => {
    let practice = solveRound(startSubtractionRound(createSubtraction(), 42));
    practice = startSubtractionRound(practice, 43, 0);
    const q = getSubtractionQuestion(practice);
    practice = submitSubtractionAnswer(practice, q.choices.find(choice => choice !== q.answer));
    practice = solveRound(practice);
    assert.deepEqual(practice.progress, { rounds: 2, best: 10 });
    assert.equal(getSkillProgress({ ...createGame(), subtraction: practice }).subtraction, 1);
  });

  it('defaults old saves and sanitizes invalid progress', () => {
    withSavedState({ levelStars: {} }, () => {
      assert.deepEqual(createGame().subtraction, { progress: { rounds: 0, best: 0 }, levels: { stars: {}, currentLevelIndex: 0 }, round: null });
    });
    for (const saved of [null, {}, { rounds: -1, best: 10 }, { rounds: '1', best: 10 }, { rounds: 0, best: 10 }]) {
      assert.deepEqual(createSubtraction(saved).progress, { rounds: 0, best: 0 });
    }
    assert.deepEqual(createSubtraction({ rounds: 2, best: 20 }).progress, { rounds: 2, best: 10 });
    assert.deepEqual(createSubtraction({ rounds: 1, best: -1 }).progress, { rounds: 1, best: 0 });
    assert.deepEqual(createSubtraction({ rounds: 1, best: '10' }).progress, { rounds: 1, best: 0 });
  });

  it('resumes in memory, saves only completed progress, and preserves other activities', () => {
    withSavedState({
      currentLevelIndex: 1, currentPuzzleIndex: 3, levelStars: { 0: 3 }, totalStars: 3,
      settings: { sound: false }, multiplicationProgress: { 6: { rounds: 2, best: 8 } },
    }, () => {
      let game = createGame();
      let practice = startSubtractionRound(game.subtraction, 42);
      practice = submitSubtractionAnswer(practice, getSubtractionQuestion(practice).answer);
      game = updateSubtraction(goToScreen(game, 'subtraction'), practice);
      game = goToScreen(game, 'home');
      game = goToScreen(game, 'subtraction');
      assert.equal(game.subtraction, practice);
      assert.equal(createGame().subtraction.round, null);
      assert.deepEqual(createGame().subtraction.progress, { rounds: 0, best: 0 });
      updateSubtraction(game, solveRound(practice));
      const loaded = createGame();
      assert.deepEqual(loaded.subtraction.progress, { rounds: 1, best: 10 });
      assert.equal(loaded.subtraction.round, null);
      assert.equal(loaded.currentLevelIndex, 1);
      assert.equal(loaded.currentPuzzleIndex, 3);
      assert.deepEqual(loaded.levelStars, { 0: 3 });
      assert.equal(loaded.totalStars, 3);
      assert.deepEqual(loaded.settings, { sound: false });
      assert.deepEqual(loaded.multiplication.progress, { 6: { rounds: 2, best: 8 } });
      updateMultiplication(loaded, startMultiplicationRound(loaded.multiplication, 6));
      assert.deepEqual(createGame().subtraction.progress, { rounds: 1, best: 10 });
      resetProgress();
      const reset = createGame();
      assert.deepEqual(reset.subtraction.progress, { rounds: 0, best: 0 });
      assert.deepEqual(reset.multiplication.progress, {});
      assert.deepEqual(reset.levelStars, {});
    });
  });

  it('unlocks all 80 subtraction levels one at a time and increases the number range', () => {
    let practice = createSubtraction();
    let previousMax = 0;
    for (let level = 0; level < SUBTRACTION_LEVEL_COUNT; level++) {
      assert.equal(getUnlockedSubtractionLevel(practice), level);
      assert.equal(isSubtractionLevelUnlocked(practice, level + 1), false);
      assert.equal(startSubtractionRound(practice, 42, level + 1), practice);
      practice = startSubtractionRound(practice, 42, level);
      const maximum = getSubtractionLevelMax(level);
      assert.ok(maximum > previousMax);
      previousMax = maximum;
      assert.equal(new Set(practice.round.questions.map(q => q.minuend)).size, 10);
      assert.equal(Math.max(...practice.round.questions.map(q => q.minuend)), maximum);
      for (const q of practice.round.questions) {
        assert.equal(q.answer, q.minuend - q.subtrahend);
        assert.ok(q.answer >= 0);
        assert.equal(new Set(q.choices).size, 4);
        assert.equal(q.choices.filter(value => value === q.answer).length, 1);
        assert.ok(q.choices.every(value => value >= 0 && value <= maximum));
      }
      practice = solveRound(practice);
      assert.equal(practice.levels.stars[level], 3);
    }
    assert.equal(previousMax, 160);
    assert.equal(practice.levels.currentLevelIndex, 79);
    assert.equal(getSkillProgress({ ...createGame(), subtraction: practice }).subtraction, 100);
  });

  it('awards subtraction stars using all mistakes and keeps the best on replay', () => {
    for (const [mistakes, stars] of [[0, 3], [1, 2], [3, 2], [4, 1]]) {
      let practice = startSubtractionRound(createSubtraction(), 9);
      const wrongAnswer = getSubtractionQuestion(practice).answer + 1;
      for (let count = 0; count < mistakes; count++) practice = submitSubtractionAnswer(practice, wrongAnswer);
      practice = solveRound(practice);
      assert.equal(practice.round.stars, stars);
      assert.equal(practice.levels.stars[0], stars);
      practice = solveRound(startSubtractionRound(practice, 10, 0));
      assert.equal(practice.levels.stars[0], 3);
      practice = startSubtractionRound(practice, 11, 0);
      practice = submitSubtractionAnswer(practice, getSubtractionQuestion(practice).answer + 1);
      practice = solveRound(practice);
      assert.equal(practice.round.stars, 2);
      assert.equal(practice.levels.stars[0], 3);
      assert.equal(Object.keys(practice.levels.stars).length, 1);
    }
  });

  it('preserves legacy subtraction results and repairs saved level data', () => {
    const migrated = createSubtraction({ rounds: 4, best: 10 });
    assert.deepEqual(migrated.levels, { stars: { 0: 3 }, currentLevelIndex: 1 });
    assert.deepEqual(migrated.progress, { rounds: 4, best: 10 });
    const repaired = createSubtraction({}, { stars: { 0: 2, 1: 7, 2: '3', 80: 3 }, currentLevelIndex: 50 });
    assert.deepEqual(repaired.levels, { stars: { 0: 2 }, currentLevelIndex: 1 });
    for (const level of [-1, 80, NaN, 1.5]) assert.equal(startSubtractionRound(repaired, 0, level), repaired);
    withSavedState({ subtractionProgress: { rounds: 1, best: 9 } }, () => {
      const game = createGame();
      const practice = solveRound(startSubtractionRound(game.subtraction, 10));
      updateSubtraction(game, practice);
      assert.deepEqual(createGame().subtraction.levels, { stars: { 0: 2, 1: 3 }, currentLevelIndex: 2 });
      assert.equal(createGame().subtraction.round, null);
    });
  });

  it('allows parent unlocking without lowering subtraction stars or progress', () => {
    const initial = solveRound(startSubtractionRound(createSubtraction()));
    const unlocked = unlockSubtractionToLevel(initial, 20);
    assert.equal(getUnlockedSubtractionLevel(unlocked), 19);
    assert.equal(unlocked.levels.stars[0], 3);
    assert.equal(unlocked.levels.currentLevelIndex, 19);
    assert.equal(unlocked.round, null);
    assert.deepEqual(unlockSubtractionToLevel(unlocked, 5).levels, unlocked.levels);
    for (const level of [0, 81, NaN, 1.5]) assert.equal(unlockSubtractionToLevel(unlocked, level), unlocked);
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
