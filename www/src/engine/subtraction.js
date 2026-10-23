// Subtraction practice with non-negative answers, typed answers, and four choices.
export const SUBTRACTION_ROUND_SIZE = 10;
export const SUBTRACTION_LEVEL_COUNT = 80;

export function createSubtraction(savedProgress, savedLevels) {
  const rounds = Number.isSafeInteger(savedProgress?.rounds) && savedProgress.rounds > 0
    ? savedProgress.rounds : 0;
  const best = rounds && Number.isInteger(savedProgress.best)
    ? Math.max(0, Math.min(SUBTRACTION_ROUND_SIZE, savedProgress.best)) : 0;
  const stars = {};
  for (let index = 0; index < SUBTRACTION_LEVEL_COUNT; index++) {
    const value = savedLevels?.stars?.[index];
    if (Number.isInteger(value) && value >= 1 && value <= 3) stars[index] = value;
  }
  // Earlier versions had one round with numbers up to ten, equivalent to level 1.
  if (!savedLevels && rounds) stars[0] = best === 10 ? 3 : best >= 7 ? 2 : 1;
  const unlocked = getUnlockedSubtractionLevel({ levels: { stars } });
  const savedIndex = savedLevels?.currentLevelIndex;
  const currentLevelIndex = Number.isInteger(savedIndex)
    ? Math.max(0, Math.min(savedIndex, unlocked)) : unlocked;
  return { progress: { rounds, best }, levels: { stars, currentLevelIndex }, round: null };
}

export function getUnlockedSubtractionLevel(practice) {
  let index = 0;
  while (index < SUBTRACTION_LEVEL_COUNT - 1 && practice.levels.stars[index]) index++;
  return index;
}

export function isSubtractionLevelUnlocked(practice, index) {
  return Number.isInteger(index) && index >= 0 && index <= getUnlockedSubtractionLevel(practice);
}

export function getSubtractionLevelMax(index) {
  return 10 + Math.round(Math.max(0, Math.min(index, SUBTRACTION_LEVEL_COUNT - 1)) * 150 / (SUBTRACTION_LEVEL_COUNT - 1));
}

export function unlockSubtractionToLevel(practice, levelNumber) {
  if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > SUBTRACTION_LEVEL_COUNT) return practice;
  const stars = { ...practice.levels.stars };
  for (let index = 0; index < levelNumber - 1; index++) stars[index] = Math.max(stars[index] ?? 0, 1);
  const currentLevelIndex = Math.max(practice.levels.currentLevelIndex, levelNumber - 1);
  return { ...practice, levels: { stars, currentLevelIndex }, round: currentLevelIndex === practice.levels.currentLevelIndex ? practice.round : null };
}

export function startSubtractionRound(practice, seed = 0, levelIndex = practice.levels.currentLevelIndex) {
  if (!isSubtractionLevelUnlocked(practice, levelIndex)) return practice;
  const maximum = getSubtractionLevelMax(levelIndex);
  let randomState = (seed ^ 0x9E3779B9 ^ Math.imul(levelIndex, 2654435761)) >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };
  const shuffle = items => {
    for (let index = items.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [items[index], items[other]] = [items[other], items[index]];
    }
    return items;
  };
  const questions = shuffle(Array.from({ length: SUBTRACTION_ROUND_SIZE }, (_, index) => maximum - 9 + index))
    .map(minuend => {
      const subtrahend = Math.floor(random() * (minuend + 1));
      const answer = minuend - subtrahend;
      const distractors = Array.from({ length: maximum + 1 }, (_, value) => value)
        .filter(value => value !== answer && Math.abs(value - answer) <= 3);
      const choices = shuffle([answer, ...shuffle(distractors).slice(0, 3)]);
      return { minuend, subtrahend, answer, choices };
    });
  return {
    ...practice,
    levels: { ...practice.levels, currentLevelIndex: levelIndex },
    round: {
      levelIndex, questions, index: 0, results: [], selectedAnswer: null, wrongTotal: 0,
      feedback: null, wrongAttempts: 0, complete: false,
    },
  };
}

export function getSubtractionQuestion(practice) {
  const round = practice.round;
  return !round || round.complete ? null : round.questions[round.index];
}

export function submitSubtractionAnswer(practice, input) {
  const round = practice.round;
  const question = getSubtractionQuestion(practice);
  if (!question || round.feedback === 'correct') return practice;
  const value = String(input).trim();
  if (!['string', 'number'].includes(typeof input) || !/^\d{1,3}$/.test(value)) {
    return { ...practice, round: { ...round, selectedAnswer: null, feedback: 'invalid' } };
  }
  const answer = Number(value);
  if (answer !== question.answer) {
    return {
      ...practice,
      round: { ...round, selectedAnswer: answer, feedback: 'wrong', wrongAttempts: round.wrongAttempts + 1, wrongTotal: round.wrongTotal + 1 },
    };
  }
  const results = [...round.results, { independent: round.wrongAttempts === 0 }];
  const progress = results.length === SUBTRACTION_ROUND_SIZE ? {
    rounds: practice.progress.rounds + 1,
    best: Math.max(practice.progress.best, results.filter(result => result.independent).length),
  } : practice.progress;
  const stars = round.wrongTotal === 0 ? 3 : round.wrongTotal <= 3 ? 2 : 1;
  const levels = results.length === SUBTRACTION_ROUND_SIZE ? {
    currentLevelIndex: Math.min(round.levelIndex + 1, SUBTRACTION_LEVEL_COUNT - 1),
    stars: { ...practice.levels.stars, [round.levelIndex]: Math.max(practice.levels.stars[round.levelIndex] ?? 0, stars) },
  } : practice.levels;
  return {
    ...practice, progress, levels,
    round: { ...round, results, stars: results.length === SUBTRACTION_ROUND_SIZE ? stars : null, selectedAnswer: answer, feedback: 'correct' },
  };
}

export function nextSubtractionQuestion(practice) {
  const round = practice.round;
  if (!round || round.complete || round.feedback !== 'correct') return practice;
  if (round.results.length === SUBTRACTION_ROUND_SIZE) {
    return { ...practice, round: { ...round, complete: true } };
  }
  return {
    ...practice,
    round: { ...round, index: round.index + 1, selectedAnswer: null, feedback: null, wrongAttempts: 0 },
  };
}

export function getSubtractionProgress(practice) {
  return Math.round(Object.keys(practice.levels.stars).length / SUBTRACTION_LEVEL_COUNT * 100);
}
