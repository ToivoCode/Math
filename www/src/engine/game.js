// Game state, rules, and transitions — no DOM access.

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

// All 15 puzzles across 4 difficulty tiers.
// Each puzzle is verified to have at least one valid sum combination.
export const LEVELS = [
  // Tier 1 — Easy addition (target < 10, 4 pieces)
  { target: 7,  pieces: [3, 2, 4, 1],             connected: false, skill: 'addition'  },
  { target: 5,  pieces: [2, 1, 3, 4],             connected: false, skill: 'addition'  },
  { target: 8,  pieces: [5, 2, 3, 6],             connected: false, skill: 'addition'  },
  { target: 6,  pieces: [4, 1, 2, 3],             connected: false, skill: 'addition'  },
  { target: 9,  pieces: [3, 4, 2, 5],             connected: false, skill: 'addition'  },
  // Tier 2 — Number bonds (target 10–20, 5–6 pieces)
  { target: 10, pieces: [3, 7, 4, 6, 2],          connected: false, skill: 'bonds'     },
  { target: 12, pieces: [5, 4, 8, 3, 7],          connected: false, skill: 'bonds'     },
  { target: 15, pieces: [6, 9, 4, 3, 8],          connected: false, skill: 'bonds'     },
  { target: 11, pieces: [5, 2, 8, 4, 6, 3],       connected: false, skill: 'bonds'     },
  { target: 20, pieces: [8, 5, 7, 12, 3, 6],      connected: false, skill: 'bonds'     },
  // Tier 3 — Connected pieces (adjacency visual guide, 6 pieces)
  { target: 13, pieces: [4, 6, 3, 7, 2, 5],       connected: true,  skill: 'connected' },
  { target: 16, pieces: [9, 4, 7, 2, 8, 5],       connected: true,  skill: 'connected' },
  { target: 18, pieces: [6, 9, 3, 12, 5, 7],      connected: true,  skill: 'connected' },
  // Tier 4 — Challenge (larger numbers, 7–8 pieces)
  { target: 25, pieces: [8, 7, 10, 5, 12, 3, 6, 4],  connected: false, skill: 'challenge' },
  { target: 30, pieces: [12, 8, 15, 7, 9, 6, 4, 11], connected: false, skill: 'challenge' },
];

function getDailyIndex() {
  const epoch = new Date('2024-01-01').getTime();
  const days  = Math.floor((Date.now() - epoch) / 86400000);
  return days % LEVELS.length;
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem('sumwheels') ?? '{}'); }
  catch { return {}; }
}

function persist(state) {
  try {
    localStorage.setItem('sumwheels', JSON.stringify({
      currentLevelIndex: state.currentLevelIndex,
      levelStars:        state.levelStars,
      totalStars:        state.totalStars,
      settings:          state.settings,
    }));
  } catch { /* storage unavailable */ }
}

export function createGame() {
  const saved = loadSaved();
  return {
    screen:            'home',
    currentLevelIndex: saved.currentLevelIndex ?? 0,
    selectedPieces:    new Set(),
    feedback:          null,   // null | 'correct' | 'wrong'
    hintText:          null,
    wrongAttempts:     0,
    hintUsed:          false,
    levelStars:        saved.levelStars  ?? {},
    totalStars:        saved.totalStars  ?? 0,
    settings:          saved.settings   ?? { sound: true },
    parentUnlocked:    false,
    dailyIndex:        getDailyIndex(),
  };
}

export function getCurrentPuzzle(state) {
  return LEVELS[state.currentLevelIndex];
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
    const stars = !state.hintUsed && state.wrongAttempts === 0 ? 3
                : state.wrongAttempts <= 1 ? 2
                : 1;
    const levelStars = { ...state.levelStars };
    levelStars[state.currentLevelIndex] = Math.max(levelStars[state.currentLevelIndex] ?? 0, stars);
    const totalStars = Object.values(levelStars).reduce((a, b) => a + b, 0);
    const next = { ...state, feedback: 'correct', levelStars, totalStars };
    persist(next);
    return next;
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

export function nextLevel(state) {
  const nextIndex = (state.currentLevelIndex + 1) % LEVELS.length;
  const next = {
    ...state,
    screen:            'play',
    currentLevelIndex: nextIndex,
    selectedPieces:    new Set(),
    feedback:          null,
    hintText:          null,
    wrongAttempts:     0,
    hintUsed:          false,
  };
  persist(next);
  return next;
}

export function goToLevel(state, index) {
  const next = {
    ...state,
    screen:            'play',
    currentLevelIndex: index,
    selectedPieces:    new Set(),
    feedback:          null,
    hintText:          null,
    wrongAttempts:     0,
    hintUsed:          false,
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
  try { localStorage.removeItem('sumwheels'); } catch { /* ignore */ }
}

export function getSkillProgress(state) {
  const comp = Object.keys(state.levelStars).map(Number);
  return {
    addition:  Math.round((comp.filter(i => i < 5).length / 5) * 100),
    bonds:     Math.round((comp.filter(i => i >= 5 && i < 10).length / 5) * 100),
    connected: Math.round((comp.filter(i => i >= 10 && i < 13).length / 3) * 100),
    challenge: Math.round((comp.filter(i => i >= 13).length / 2) * 100),
  };
}
