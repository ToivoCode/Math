// Game state, rules, and transitions — no DOM access.

export const LEVEL_COUNT       = 80;
export const PUZZLES_PER_LEVEL = 10;

// Difficulty tiers — each covers 10 levels (8 tiers × 10 = 80 levels).
const TIERS = [
  { tMin:  4, tMax:  9, n: 4, connected: false }, // 0: Levels  1–10  (Easy sums)
  { tMin:  6, tMax: 12, n: 4, connected: false }, // 1: Levels 11–20
  { tMin: 10, tMax: 16, n: 5, connected: false }, // 2: Levels 21–30  (Number bonds)
  { tMin: 12, tMax: 20, n: 5, connected: false }, // 3: Levels 31–40
  { tMin: 10, tMax: 20, n: 6, connected: true  }, // 4: Levels 41–50  (Connected pieces)
  { tMin: 15, tMax: 25, n: 6, connected: false }, // 5: Levels 51–60  (Larger numbers)
  { tMin: 20, tMax: 30, n: 7, connected: false }, // 6: Levels 61–70  (Challenge)
  { tMin: 25, tMax: 40, n: 8, connected: false }, // 7: Levels 71–80  (Expert)
];

// Seeded PRNG (LCG) with warm-up to break correlation between similar seeds.
function seededRand(seed) {
  let s = ((seed ^ 0xDEADBEEF) >>> 0) || 1;
  // Three warm-up steps so seeds that differ by small amounts diverge quickly.
  s = ((s * 1664525 + 1013904223) & 0xFFFFFFFF) >>> 0;
  s = ((s * 1664525 + 1013904223) & 0xFFFFFFFF) >>> 0;
  s = ((s * 1664525 + 1013904223) & 0xFFFFFFFF) >>> 0;
  return () => {
    s = ((s * 1664525 + 1013904223) & 0xFFFFFFFF) >>> 0;
    return s / 0x100000000;
  };
}

// Generates a deterministic puzzle for a given (levelIndex, puzzleIndex) pair.
export function generatePuzzle(levelIndex, puzzleIndex) {
  const tier = Math.min(Math.floor(levelIndex / 10), TIERS.length - 1);
  const { tMin, tMax, n, connected } = TIERS[tier];
  const range = tMax - tMin + 1;

  // ── Target selection ──────────────────────────────────────────────────────
  // Shuffle every possible target for this level using a level-scoped seed,
  // then assign targets round-robin. This guarantees that all different target
  // values appear before any repeats — eliminating "always the same number".
  const tr = seededRand(levelIndex * 49999 + 77777);
  const targets = Array.from({ length: range }, (_, i) => tMin + i);
  for (let i = range - 1; i > 0; i--) {
    const j = Math.floor(tr() * (i + 1));
    [targets[i], targets[j]] = [targets[j], targets[i]];
  }
  const target = targets[puzzleIndex % range];

  // ── Piece generation ──────────────────────────────────────────────────────
  // Seed incorporates the target so puzzles with the same index but different
  // targets (across levels) still get distinct pieces.
  const r = seededRand(levelIndex * 1000003 + puzzleIndex * 10007 + target * 101);

  // Guaranteed 2-piece solution: a + b = target, a ≠ b, both in [1, target-1].
  let a = 1 + Math.floor(r() * (target - 2));
  if (a * 2 === target) a = a > 1 ? a - 1 : a + 1;
  const b = target - a;

  // Distractors: values in [1, target-1] — upper bound guarantees no single
  // piece ever equals the target (prevents trivial one-tap solutions).
  const pieces = [a, b];
  const used   = new Set(pieces);
  const maxD   = Math.max(target - 1, 2);
  for (let slot = 2; slot < n; slot++) {
    let v, tries = 0;
    do { v = 1 + Math.floor(r() * maxD); tries++; } while (used.has(v) && tries < 15);
    used.add(v); // allow duplicate if no unique value found after 15 tries
    pieces.push(v);
  }

  // Fisher-Yates shuffle.
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }

  return { target, pieces, connected };
}

// Color palette for wheel pieces (idle → selected)
// Idle is near-white so unselected pieces look neutral; selected is vibrant.
export const PIECE_COLORS = [
  { idle: '#FAF5FF', selected: '#7C3AED', textIdle: '#374151', textSelected: '#FFFFFF' },
  { idle: '#F0FDF4', selected: '#16A34A', textIdle: '#374151', textSelected: '#FFFFFF' },
  { idle: '#FEFCE8', selected: '#CA8A04', textIdle: '#374151', textSelected: '#FFFFFF' },
  { idle: '#EFF6FF', selected: '#0284C7', textIdle: '#374151', textSelected: '#FFFFFF' },
  { idle: '#FFF1F2', selected: '#DC2626', textIdle: '#374151', textSelected: '#FFFFFF' },
  { idle: '#FFF7ED', selected: '#EA580C', textIdle: '#374151', textSelected: '#FFFFFF' },
];

// Rewards unlocked by completing specific levels (1-indexed; 0 = always unlocked).
// Spread ~2 rewards per 2 levels across all 80 levels.
export const REWARD_GROUPS = [
  {
    title: 'Dyr og venner',
    items: [
      { emoji: '🦊', name: 'Rev',         unlockLevel: 0  },
      { emoji: '🐱', name: 'Katt',        unlockLevel: 1  },
      { emoji: '🐶', name: 'Hund',        unlockLevel: 3  },
      { emoji: '🐭', name: 'Mus',         unlockLevel: 5  },
      { emoji: '🐰', name: 'Kanin',       unlockLevel: 7  },
      { emoji: '🐹', name: 'Hamster',     unlockLevel: 9  },
      { emoji: '🐼', name: 'Panda',       unlockLevel: 11 },
      { emoji: '🐸', name: 'Frosk',       unlockLevel: 13 },
      { emoji: '🐻', name: 'Bjørn',       unlockLevel: 15 },
      { emoji: '🦝', name: 'Vaskebjørn',  unlockLevel: 17 },
      { emoji: '🐯', name: 'Tiger',       unlockLevel: 19 },
      { emoji: '🐺', name: 'Ulv',         unlockLevel: 22 },
      { emoji: '🐻‍❄️', name: 'Isbjørn', unlockLevel: 26 },
      { emoji: '🦦', name: 'Oter',        unlockLevel: 30 },
      { emoji: '🐨', name: 'Koala',       unlockLevel: 34 },
      { emoji: '🦋', name: 'Sommerfugl',  unlockLevel: 38 },
      { emoji: '🐙', name: 'Blekksprut',  unlockLevel: 42 },
      { emoji: '🦁', name: 'Løve',        unlockLevel: 48 },
      { emoji: '🐉', name: 'Drage',       unlockLevel: 58 },
      { emoji: '🦄', name: 'Enhjørning',  unlockLevel: 70 },
    ],
  },
  {
    title: 'Godt og gøy',
    items: [
      { emoji: '⭐', name: 'Stjerne',     unlockLevel: 0  },
      { emoji: '🍦', name: 'Iskrem',      unlockLevel: 2  },
      { emoji: '🧇', name: 'Vaffel',      unlockLevel: 4  },
      { emoji: '🍰', name: 'Kake',        unlockLevel: 6  },
      { emoji: '🍪', name: 'Kjeks',       unlockLevel: 8  },
      { emoji: '🍭', name: 'Pinnevaffel', unlockLevel: 10 },
      { emoji: '🍩', name: 'Smultring',   unlockLevel: 12 },
      { emoji: '🧁', name: 'Muffins',     unlockLevel: 14 },
      { emoji: '🍫', name: 'Sjokolade',   unlockLevel: 16 },
      { emoji: '🎂', name: 'Bursdag',     unlockLevel: 18 },
      { emoji: '🍬', name: 'Godteri',     unlockLevel: 20 },
      { emoji: '🫂', name: 'Klem',        unlockLevel: 24 },
      { emoji: '🎀', name: 'Pynt',        unlockLevel: 28 },
      { emoji: '🥧', name: 'Pai',         unlockLevel: 32 },
      { emoji: '🌈', name: 'Regnbue',     unlockLevel: 36 },
      { emoji: '🎉', name: 'Konfetti',    unlockLevel: 40 },
      { emoji: '🌸', name: 'Blomst',      unlockLevel: 46 },
      { emoji: '💎', name: 'Diamant',     unlockLevel: 55 },
      { emoji: '👑', name: 'Krone',       unlockLevel: 65 },
      { emoji: '🌟', name: 'Superstjerne', unlockLevel: 75 },
    ],
  },
];

// All 15 puzzles across 4 difficulty tiers.
// Each puzzle is verified to have at least one valid sum combination.
export const LEVELS_LEGACY = []; // kept for test compatibility

function getDailyLevelIndex() {
  const epoch = new Date('2024-01-01').getTime();
  return Math.floor((Date.now() - epoch) / 86400000) % LEVEL_COUNT;
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem('mattelek') ?? '{}'); }
  catch { return {}; }
}

function persist(state) {
  try {
    localStorage.setItem('mattelek', JSON.stringify({
      currentLevelIndex:  state.currentLevelIndex,
      currentPuzzleIndex: state.currentPuzzleIndex,
      levelStars:         state.levelStars,
      totalStars:         state.totalStars,
      settings:           state.settings,
    }));
  } catch { /* storage unavailable */ }
}

export function createGame() {
  const saved = loadSaved();
  return {
    screen:             'home',
    currentLevelIndex:  saved.currentLevelIndex  ?? 0,
    currentPuzzleIndex: saved.currentPuzzleIndex ?? 0,
    selectedPieces:     new Set(),
    feedback:           null,   // null | 'correct' | 'levelComplete' | 'wrong'
    hintText:           null,
    wrongAttempts:      0,      // wrong attempts for current puzzle
    hintUsed:           false,
    levelWrongTotal:    0,      // accumulated across puzzles in current level
    levelHintTotal:     0,
    levelStars:         saved.levelStars  ?? {},
    totalStars:         saved.totalStars  ?? 0,
    settings:           saved.settings   ?? { sound: true },
    parentUnlocked:     false,
    dailyLevelIndex:    getDailyLevelIndex(),
  };
}

export function getCurrentPuzzle(state) {
  return generatePuzzle(state.currentLevelIndex, state.currentPuzzleIndex);
}

export function selectPiece(state, index) {
  const next = new Set(state.selectedPieces);
  if (next.has(index)) { next.delete(index); } else { next.add(index); }
  return { ...state, selectedPieces: next, feedback: null, hintText: null };
}

export function undoLast(state) {
  const arr = [...state.selectedPieces];
  if (!arr.length) return state;
  return { ...state, selectedPieces: new Set(arr.slice(0, -1)), feedback: null, hintText: null };
}

export function submitAnswer(state) {
  if (!state.selectedPieces.size) return state;
  const puzzle = getCurrentPuzzle(state);
  const sum    = [...state.selectedPieces].reduce((s, i) => s + puzzle.pieces[i], 0);

  if (sum === puzzle.target) {
    const isLastPuzzle = state.currentPuzzleIndex >= PUZZLES_PER_LEVEL - 1;

    if (isLastPuzzle) {
      // Level complete — tally stats and award stars.
      const totalWrong = state.levelWrongTotal + state.wrongAttempts;
      const totalHints = state.levelHintTotal + (state.hintUsed ? 1 : 0);
      const stars = totalWrong === 0 && totalHints === 0 ? 3
                  : totalWrong <= 3 ? 2
                  : 1;
      const levelStars = { ...state.levelStars };
      levelStars[state.currentLevelIndex] = Math.max(levelStars[state.currentLevelIndex] ?? 0, stars);
      const totalStars = Object.values(levelStars).reduce((a, b) => a + b, 0);
      const next = { ...state, feedback: 'levelComplete', levelStars, totalStars };
      persist(next);
      return next;
    }

    return { ...state, feedback: 'correct' };
  }

  return { ...state, feedback: 'wrong', wrongAttempts: state.wrongAttempts + 1 };
}

export function requestHint(state) {
  const puzzle     = getCurrentPuzzle(state);
  const currentSum = [...state.selectedPieces].reduce((s, i) => s + puzzle.pieces[i], 0);
  const remaining  = puzzle.target - currentSum;
  const hintText   = currentSum === 0
    ? `Finn tall som gir ${puzzle.target} til sammen.`
    : remaining > 0
    ? `Du har ${currentSum}. Du trenger ${remaining} til!`
    : `Du har for mye! Prøv å fjerne noen.`;
  return { ...state, hintText, hintUsed: true };
}

// Advance to the next puzzle within the same level.
export function nextPuzzle(state) {
  const next = {
    ...state,
    screen:             'play',
    currentPuzzleIndex: state.currentPuzzleIndex + 1,
    selectedPieces:     new Set(),
    feedback:           null,
    hintText:           null,
    wrongAttempts:      0,
    hintUsed:           false,
    levelWrongTotal:    state.levelWrongTotal + state.wrongAttempts,
    levelHintTotal:     state.levelHintTotal  + (state.hintUsed ? 1 : 0),
  };
  persist(next);
  return next;
}

// Advance to the first puzzle of the next level.
export function nextLevel(state) {
  const nextLevelIndex = Math.min(state.currentLevelIndex + 1, LEVEL_COUNT - 1);
  const next = {
    ...state,
    screen:             'play',
    currentLevelIndex:  nextLevelIndex,
    currentPuzzleIndex: 0,
    selectedPieces:     new Set(),
    feedback:           null,
    hintText:           null,
    wrongAttempts:      0,
    hintUsed:           false,
    levelWrongTotal:    0,
    levelHintTotal:     0,
  };
  persist(next);
  return next;
}

export function goToLevel(state, index) {
  const next = {
    ...state,
    screen:             'play',
    currentLevelIndex:  index,
    currentPuzzleIndex: 0,
    selectedPieces:     new Set(),
    feedback:           null,
    hintText:           null,
    wrongAttempts:      0,
    hintUsed:           false,
    levelWrongTotal:    0,
    levelHintTotal:     0,
  };
  persist(next);
  return next;
}

export function goToScreen(state, screen) {
  return { ...state, screen, feedback: null, hintText: null };
}

export function updateSetting(state, key, value) {
  const settings = { ...state.settings, [key]: value };
  const next = { ...state, settings };
  persist(next);
  return next;
}

export function unlockParent(state) {
  return { ...state, parentUnlocked: true };
}

export function resetProgress() {
  try { localStorage.removeItem('mattelek'); } catch { /* ignore */ }
}

export function getSkillProgress(state) {
  const comp = Object.keys(state.levelStars).map(Number);
  const pct  = (min, max) => Math.round((comp.filter(i => i >= min && i <= max).length / (max - min + 1)) * 100);
  return {
    addition:  pct(0,  19),
    bonds:     pct(20, 39),
    connected: pct(40, 49),
    challenge: pct(50, 79),
  };
}
