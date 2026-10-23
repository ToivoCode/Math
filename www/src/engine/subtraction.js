// Subtraction practice with non-negative answers, typed answers, and four choices.
export const SUBTRACTION_ROUND_SIZE = 10;

export function createSubtraction(savedProgress) {
  const rounds = Number.isSafeInteger(savedProgress?.rounds) && savedProgress.rounds > 0
    ? savedProgress.rounds : 0;
  const best = rounds && Number.isInteger(savedProgress.best)
    ? Math.max(0, Math.min(SUBTRACTION_ROUND_SIZE, savedProgress.best)) : 0;
  return { progress: { rounds, best }, round: null };
}

export function startSubtractionRound(practice, seed = 0) {
  let randomState = (seed ^ 0x9E3779B9) >>> 0;
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
  const questions = shuffle(Array.from({ length: SUBTRACTION_ROUND_SIZE }, (_, index) => index + 1))
    .map(minuend => {
      const subtrahend = Math.floor(random() * (minuend + 1));
      const answer = minuend - subtrahend;
      const distractors = Array.from({ length: 11 }, (_, value) => value)
        .filter(value => value !== answer && Math.abs(value - answer) <= 3);
      const choices = shuffle([answer, ...shuffle(distractors).slice(0, 3)]);
      return { minuend, subtrahend, answer, choices };
    });
  return {
    ...practice,
    round: {
      questions, index: 0, results: [], selectedAnswer: null,
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
      round: { ...round, selectedAnswer: answer, feedback: 'wrong', wrongAttempts: round.wrongAttempts + 1 },
    };
  }
  const results = [...round.results, { independent: round.wrongAttempts === 0 }];
  const progress = results.length === SUBTRACTION_ROUND_SIZE ? {
    rounds: practice.progress.rounds + 1,
    best: Math.max(practice.progress.best, results.filter(result => result.independent).length),
  } : practice.progress;
  return {
    ...practice, progress,
    round: { ...round, results, selectedAnswer: answer, feedback: 'correct' },
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
  return Math.round(practice.progress.best / SUBTRACTION_ROUND_SIZE * 100);
}
