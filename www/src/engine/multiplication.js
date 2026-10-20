// Multiplication practice rules. Every round covers one entire times table.
export const TIMES_TABLES = Array.from({ length: 10 }, (_, index) => index + 1);
export const MULTIPLICATION_ROUND_SIZE = 10;

export function createMultiplication(savedProgress) {
  const progress = {};
  for (const table of TIMES_TABLES) {
    const saved = savedProgress?.[table];
    if (!saved || !Number.isSafeInteger(saved.rounds) || saved.rounds < 1) continue;
    progress[table] = {
      rounds: saved.rounds,
      best: Number.isInteger(saved.best) ? Math.max(0, Math.min(10, saved.best)) : 0,
    };
  }
  return { progress, round: null };
}

export function startMultiplicationRound(practice, table, seed = 0) {
  if (!TIMES_TABLES.includes(table)) return practice;
  const factors = [...TIMES_TABLES];
  let randomState = (seed ^ 0x9E3779B9) >>> 0;
  for (let index = factors.length - 1; index > 0; index--) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    const other = Math.floor((randomState / 0x100000000) * (index + 1));
    [factors[index], factors[other]] = [factors[other], factors[index]];
  }
  return {
    ...practice,
    round: {
      table, factors, index: 0, results: [],
      feedback: null, wrongAttempts: 0, hintUsed: false, complete: false,
    },
  };
}

export function getMultiplicationQuestion(practice) {
  const round = practice.round;
  if (!round || round.complete) return null;
  const factor = round.factors[round.index];
  return { table: round.table, factor, answer: round.table * factor };
}

export function submitMultiplicationAnswer(practice, input) {
  const round = practice.round;
  const question = getMultiplicationQuestion(practice);
  if (!question || round.feedback === 'correct') return practice;
  const value = String(input).trim();
  if (!/^\d{1,3}$/.test(value)) {
    return { ...practice, round: { ...round, feedback: 'invalid' } };
  }
  if (Number(value) !== question.answer) {
    return {
      ...practice,
      round: { ...round, feedback: 'wrong', wrongAttempts: round.wrongAttempts + 1 },
    };
  }
  const results = [...round.results, {
    factor: question.factor,
    independent: round.wrongAttempts === 0 && !round.hintUsed,
  }];
  let progress = practice.progress;
  if (results.length === MULTIPLICATION_ROUND_SIZE) {
    const previous = progress[round.table];
    const independentCount = results.filter(result => result.independent).length;
    progress = {
      ...progress,
      [round.table]: {
        rounds: (previous?.rounds ?? 0) + 1,
        best: Math.max(previous?.best ?? 0, independentCount),
      },
    };
  }
  return { ...practice, progress, round: { ...round, results, feedback: 'correct' } };
}

export function requestMultiplicationHint(practice) {
  if (!practice.round || practice.round.complete || practice.round.feedback === 'correct') return practice;
  return { ...practice, round: { ...practice.round, hintUsed: true } };
}

export function nextMultiplicationQuestion(practice) {
  const round = practice.round;
  if (!round || round.complete || round.feedback !== 'correct') return practice;
  if (round.results.length === MULTIPLICATION_ROUND_SIZE) {
    return { ...practice, round: { ...round, complete: true } };
  }
  return {
    ...practice,
    round: { ...round, index: round.index + 1, feedback: null, wrongAttempts: 0, hintUsed: false },
  };
}

export function getMultiplicationProgress(practice) {
  // Ten tables with ten independent answers each make 100 percent.
  return TIMES_TABLES.reduce((sum, table) => sum + (practice.progress[table]?.best ?? 0), 0);
}
