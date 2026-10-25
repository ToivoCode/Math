// Exact division: ten questions per divisor, no remainders or division by zero.
export const DIVISORS = Array.from({ length: 10 }, (_, index) => index + 1);
export const DIVISION_ROUND_SIZE = 10;

export function createDivision(savedProgress) {
  const progress = {};
  for (const divisor of DIVISORS) {
    const saved = savedProgress?.[divisor];
    if (!Number.isSafeInteger(saved?.rounds) || saved.rounds < 1) continue;
    progress[divisor] = {
      rounds: saved.rounds,
      best: Number.isInteger(saved.best) ? Math.max(0, Math.min(10, saved.best)) : 0,
    };
  }
  return { progress, round: null };
}

export function startDivisionRound(practice, divisor, seed = 0) {
  if (!DIVISORS.includes(divisor)) return practice;
  const quotients = [...DIVISORS];
  let random = (seed ^ 0x85EBCA6B) >>> 0;
  for (let index = quotients.length - 1; index > 0; index--) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const other = Math.floor(random / 0x100000000 * (index + 1));
    [quotients[index], quotients[other]] = [quotients[other], quotients[index]];
  }
  return { ...practice, round: {
    divisor, quotients, index: 0, results: [], feedback: null,
    wrongAttempts: 0, hintUsed: false, complete: false,
  } };
}

export function getDivisionQuestion(practice) {
  const round = practice.round;
  if (!round || round.complete) return null;
  const answer = round.quotients[round.index];
  return { dividend: answer * round.divisor, divisor: round.divisor, answer };
}

export function submitDivisionAnswer(practice, input) {
  const round = practice.round;
  const question = getDivisionQuestion(practice);
  if (!question || round.feedback === 'correct') return practice;
  const value = String(input).trim();
  if (!['string', 'number'].includes(typeof input) || !/^\d{1,3}$/.test(value)) {
    return { ...practice, round: { ...round, feedback: 'invalid' } };
  }
  if (Number(value) !== question.answer) {
    return { ...practice, round: { ...round, feedback: 'wrong', wrongAttempts: round.wrongAttempts + 1 } };
  }
  const results = [...round.results, {
    dividend: question.dividend, answer: question.answer,
    independent: round.wrongAttempts === 0 && !round.hintUsed,
  }];
  let progress = practice.progress;
  if (results.length === DIVISION_ROUND_SIZE) {
    const previous = progress[round.divisor];
    progress = { ...progress, [round.divisor]: {
      rounds: (previous?.rounds ?? 0) + 1,
      best: Math.max(previous?.best ?? 0, results.filter(result => result.independent).length),
    } };
  }
  return { ...practice, progress, round: { ...round, results, feedback: 'correct' } };
}

export function requestDivisionHint(practice) {
  if (!practice.round || practice.round.complete || practice.round.feedback === 'correct') return practice;
  return { ...practice, round: { ...practice.round, hintUsed: true } };
}

export function nextDivisionQuestion(practice) {
  const round = practice.round;
  if (!round || round.complete || round.feedback !== 'correct') return practice;
  if (round.results.length === DIVISION_ROUND_SIZE) return { ...practice, round: { ...round, complete: true } };
  return { ...practice, round: {
    ...round, index: round.index + 1, feedback: null, wrongAttempts: 0, hintUsed: false,
  } };
}

export function getDivisionProgress(practice) {
  return DIVISORS.reduce((sum, divisor) => sum + (practice.progress[divisor]?.best ?? 0), 0);
}
