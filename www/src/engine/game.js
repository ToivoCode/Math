// Game state, rules, and transitions — no DOM access.

export const LEVEL_COUNT       = 80;
export const PUZZLES_PER_LEVEL = 10;

const FIRST_LEVEL_TARGET_MAX = 10;
const FINAL_LEVEL_TARGET_MAX = 160;
const MIN_TARGET = 4;

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

function shuffleInPlace(items, r) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function getLevelTargetMax(levelIndex) {
  const levelProgress = Math.max(0, Math.min(levelIndex, LEVEL_COUNT - 1)) / (LEVEL_COUNT - 1);
  return Math.round(FIRST_LEVEL_TARGET_MAX + (FINAL_LEVEL_TARGET_MAX - FIRST_LEVEL_TARGET_MAX) * levelProgress);
}

function getTargetRange(levelIndex) {
  const tMax = getLevelTargetMax(levelIndex);
  const span = Math.min(PUZZLES_PER_LEVEL - 1, Math.max(6, Math.floor(tMax / 16)));
  return { tMin: Math.max(MIN_TARGET, tMax - span), tMax };
}

function getSolutionSize(levelIndex, puzzleIndex, target) {
  const earlyMix = [2, 2, 3, 2, 3, 2, 2, 3, 2, 2];
  const middleMix = [2, 3, 2, 2, 3, 2, 4, 2, 3, 2];
  const lateMix = [2, 3, 2, 4, 3, 2, 3, 4, 2, 3];
  const expertMix = [3, 2, 4, 3, 2, 4, 3, 2, 4, 3];
  const mix = levelIndex < 10 ? earlyMix
            : levelIndex < 20 ? middleMix
            : levelIndex < 50 ? lateMix
            : expertMix;
  const size = mix[(puzzleIndex + levelIndex) % mix.length];
  if (size === 4 && target < 10) return 3;
  return size;
}

function getPieceCount(levelIndex, solutionSize) {
  const base = levelIndex < 10 ? 5
             : levelIndex < 25 ? 6
             : levelIndex < 50 ? 7
             : 8;
  return Math.min(8, Math.max(base, solutionSize + 2));
}

function hasSubsetSum(pieces, target, maxSize) {
  function visit(start, remainingSize, sum) {
    if (sum === target) return true;
    if (sum > target || remainingSize === 0) return false;
    for (let i = start; i < pieces.length; i++) {
      if (visit(i + 1, remainingSize - 1, sum + pieces[i])) return true;
    }
    return false;
  }

  for (let size = 1; size <= maxSize; size++) {
    if (visit(0, size, 0)) return true;
  }
  return false;
}

function makeSolutionParts(target, solutionSize, r) {
  const parts = Array.from({ length: solutionSize }, () => 1);
  let remaining = target - solutionSize;
  while (remaining > 0) {
    const slot = Math.floor(r() * solutionSize);
    const chunk = 1 + Math.floor(r() * Math.min(remaining, Math.max(1, Math.ceil(target / (solutionSize * 2)))));
    parts[slot] += chunk;
    remaining -= chunk;
  }
  return shuffleInPlace(parts, r);
}

function canAddDistractor(pieces, value, target, solutionSize) {
  if (!Number.isInteger(value) || value <= 0 || value >= target) return false;
  return !hasSubsetSum([...pieces, value], target, solutionSize - 1);
}

function buildTwoPieceFallback(target, pieceCount, r) {
  const pieces = makeSolutionParts(target, 2, r);
  while (pieces.length < pieceCount) {
    pieces.push(1 + Math.floor(r() * (target - 1)));
  }
  return shuffleInPlace(pieces, r);
}

function buildPieces(target, pieceCount, solutionSize, r) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const pieces = makeSolutionParts(target, solutionSize, r);

    while (pieces.length < pieceCount) {
      let added = false;
      const maxValue = target - 1;

      for (let tries = 0; tries < 80; tries++) {
        const candidate = 1 + Math.floor(r() * maxValue);
        if (canAddDistractor(pieces, candidate, target, solutionSize)) {
          pieces.push(candidate);
          added = true;
          break;
        }
      }

      if (!added) {
        for (let candidate = 1; candidate <= maxValue; candidate++) {
          if (canAddDistractor(pieces, candidate, target, solutionSize)) {
            pieces.push(candidate);
            added = true;
            break;
          }
        }
      }

      if (!added) break;
    }

    if (pieces.length === pieceCount) return shuffleInPlace(pieces, r);
  }

  return solutionSize > 2
    ? buildPieces(target, pieceCount, solutionSize - 1, r)
    : buildTwoPieceFallback(target, pieceCount, r);
}

// Generates a deterministic puzzle for a given (levelIndex, puzzleIndex) pair.
export function generatePuzzle(levelIndex, puzzleIndex) {
  const { tMin, tMax } = getTargetRange(levelIndex);
  const range = tMax - tMin + 1;

  const tr = seededRand(levelIndex * 49999 + 77777);
  const targets = Array.from({ length: range }, (_, i) => tMin + i);
  shuffleInPlace(targets, tr);
  const target = targets[puzzleIndex % range];

  const solutionSize = getSolutionSize(levelIndex, puzzleIndex, target);
  const pieceCount = getPieceCount(levelIndex, solutionSize);
  const r = seededRand(levelIndex * 1000003 + puzzleIndex * 10007 + target * 101);
  const pieces = buildPieces(target, pieceCount, solutionSize, r);
  const connected = levelIndex >= 40 && levelIndex < 50;

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
      { emoji: '🦊', name: 'Rev', unlockLevel: 0, funFact: 'Reven bruker den buskete halen som et varmt teppe når den hviler.' },
      { emoji: '🐱', name: 'Katt', unlockLevel: 1, funFact: 'Katter kan lage en malelyd når de er rolige og fornøyde.' },
      { emoji: '🐶', name: 'Hund', unlockLevel: 3, funFact: 'Hunder lukter mye bedre enn mennesker og kan kjenne igjen spennende lukter på lang avstand.' },
      { emoji: '🐭', name: 'Mus', unlockLevel: 5, funFact: 'Mus har store ører for kroppen sin, og de hører veldig godt.' },
      { emoji: '🐰', name: 'Kanin', unlockLevel: 7, funFact: 'Kaniner har øyne på siden av hodet, så de kan se nesten hele veien rundt seg.' },
      { emoji: '🐹', name: 'Hamster', unlockLevel: 9, funFact: 'Hamstere har kinnposer som de kan fylle med mat.' },
      { emoji: '🐼', name: 'Panda', unlockLevel: 11, funFact: 'Pandaer spiser mest bambus, selv om de egentlig hører til bjørnefamilien.' },
      { emoji: '🐸', name: 'Frosk', unlockLevel: 13, funFact: 'Frosker kan puste litt gjennom huden når den er fuktig.' },
      { emoji: '🐻', name: 'Bjørn', unlockLevel: 15, funFact: 'Bjørner har veldig god luktesans og kan snuse seg fram til mat.' },
      { emoji: '🦝', name: 'Vaskebjørn', unlockLevel: 17, funFact: 'Vaskebjørner har flinke framføtter som kan gripe og undersøke ting.' },
      { emoji: '🐯', name: 'Tiger', unlockLevel: 19, funFact: 'Tigeren er den største katten i verden.' },
      { emoji: '🐺', name: 'Ulv', unlockLevel: 22, funFact: 'Ulver kan ule for å holde kontakt med flokken sin.' },
      { emoji: '🐻‍❄️', name: 'Isbjørn', unlockLevel: 26, funFact: 'Isbjørner har svart hud under den lyse pelsen, og det hjelper dem å ta opp varme fra sola.' },
      { emoji: '🦦', name: 'Oter', unlockLevel: 30, funFact: 'Otere har tett pels som hjelper dem å holde varmen i vannet.' },
      { emoji: '🐨', name: 'Koala', unlockLevel: 34, funFact: 'Koalaer spiser mest blader fra eukalyptustrær.' },
      { emoji: '🦋', name: 'Sommerfugl', unlockLevel: 38, funFact: 'Sommerfugler smaker med føttene sine.' },
      { emoji: '🐙', name: 'Blekksprut', unlockLevel: 42, funFact: 'Blekkspruter har tre hjerter.' },
      { emoji: '🦁', name: 'Løve', unlockLevel: 48, funFact: 'Løver lever ofte i grupper som kalles flokker.' },
      { emoji: '🐉', name: 'Drage', unlockLevel: 58, funFact: 'Drager finnes ikke på ekte, men de finnes i gamle historier fra mange land.' },
      { emoji: '🦄', name: 'Enhjørning', unlockLevel: 70, funFact: 'Enhjørninger er fantasidyr, og i mange fortellinger har de ett horn i pannen.' },
    ],
  },
  {
    title: 'Godt og gøy',
    items: [
      { emoji: '⭐', name: 'Stjerne', unlockLevel: 0, funFact: 'En stjerne er en stor, glødende kule av varm gass langt ute i verdensrommet.' },
      { emoji: '🍦', name: 'Iskrem', unlockLevel: 2, funFact: 'Iskrem blir luftigere når den røres mens den fryser.' },
      { emoji: '🧇', name: 'Vaffel', unlockLevel: 4, funFact: 'Vafler får mønsteret sitt fra vaffeljernet.' },
      { emoji: '🍰', name: 'Kake', unlockLevel: 6, funFact: 'Kaker hever ofte fordi det dannes små luftbobler i røren.' },
      { emoji: '🍪', name: 'Kjeks', unlockLevel: 8, funFact: 'Kjeks er ofte tørre og sprø fordi mye av vannet forsvinner når de stekes.' },
      { emoji: '🍭', name: 'Pinnevaffel', unlockLevel: 10, funFact: 'En pinnevaffel er lett å holde fordi den sitter på en pinne.' },
      { emoji: '🍩', name: 'Smultring', unlockLevel: 12, funFact: 'Smultringer har ofte hull i midten, og det hjelper dem å steke jevnere.' },
      { emoji: '🧁', name: 'Muffins', unlockLevel: 14, funFact: 'Muffins stekes ofte i små former, så hver person kan få sin egen lille kake.' },
      { emoji: '🍫', name: 'Sjokolade', unlockLevel: 16, funFact: 'Sjokolade lages av frøene inni kakaofrukten.' },
      { emoji: '🎂', name: 'Bursdag', unlockLevel: 18, funFact: 'Du har bursdag omtrent hver gang jorda har gått én runde rundt sola.' },
      { emoji: '🍬', name: 'Godteri', unlockLevel: 20, funFact: 'Godteri inneholder ofte sukker, som kan komme fra planter som sukkerrør eller sukkerbeter.' },
      { emoji: '🫂', name: 'Klem', unlockLevel: 24, funFact: 'En klem er en måte å vise at vi bryr oss på uten å bruke ord.' },
      { emoji: '🎀', name: 'Pynt', unlockLevel: 28, funFact: 'Sløyfer brukes ofte som pynt på gaver fordi de kan gjøre pakken ekstra festlig.' },
      { emoji: '🥧', name: 'Pai', unlockLevel: 32, funFact: 'Pai kan ha lokk av deig på toppen eller bare deig i bunnen.' },
      { emoji: '🌈', name: 'Regnbue', unlockLevel: 36, funFact: 'En regnbue kan dukke opp når sollys skinner gjennom regndråper.' },
      { emoji: '🎉', name: 'Konfetti', unlockLevel: 40, funFact: 'Konfetti er små papirbiter som ofte kastes i luften for å feire.' },
      { emoji: '🌸', name: 'Blomst', unlockLevel: 46, funFact: 'Blomster kan lage frø som kan bli til nye planter.' },
      { emoji: '💎', name: 'Diamant', unlockLevel: 55, funFact: 'Diamant er det hardeste naturlige mineralet vi kjenner.' },
      { emoji: '👑', name: 'Krone', unlockLevel: 65, funFact: 'En krone er et tegn på at noen er konge, dronning eller en annen kongelig person.' },
      { emoji: '🌟', name: 'Superstjerne', unlockLevel: 75, funFact: 'En superstjerne er noe vi kaller en person eller ting som skinner ekstra mye i mengden.' },
    ],
  },
];

// All 15 puzzles across 4 difficulty tiers.
// Each puzzle is verified to have at least one valid sum combination.
export const LEVELS_LEGACY = []; // kept for test compatibility

function clampLevelIndex(index) {
  return Number.isInteger(index) ? Math.max(0, Math.min(index, LEVEL_COUNT - 1)) : 0;
}

function clampPuzzleIndex(index) {
  return Number.isInteger(index) ? Math.max(0, Math.min(index, PUZZLES_PER_LEVEL - 1)) : 0;
}

export function getUnlockedLevelIndex(levelStars = {}) {
  let index = 0;
  while (index < LEVEL_COUNT - 1 && levelStars[index]) index++;
  return index;
}

export function isLevelUnlocked(state, index) {
  return clampLevelIndex(index) === index && index <= getUnlockedLevelIndex(state.levelStars);
}

export function getActiveLevelIndex(state) {
  return clampLevelIndex(state.currentLevelIndex);
}

export function getActivePuzzleIndex(state) {
  return clampPuzzleIndex(state.currentPuzzleIndex);
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
  const levelStars = saved.levelStars ?? {};
  const unlockedLevelIndex = getUnlockedLevelIndex(levelStars);
  const savedLevelIndex = clampLevelIndex(saved.currentLevelIndex ?? 0);
  const currentLevelIndex = Math.min(savedLevelIndex, unlockedLevelIndex);
  const currentPuzzleIndex = savedLevelIndex === currentLevelIndex
    ? clampPuzzleIndex(saved.currentPuzzleIndex ?? 0)
    : 0;
  return {
    screen:             'home',
    currentLevelIndex,
    currentPuzzleIndex,
    selectedPieces:     new Set(),
    feedback:           null,   // null | 'correct' | 'levelComplete' | 'wrong'
    hintText:           null,
    wrongAttempts:      0,      // wrong attempts for current puzzle
    hintUsed:           false,
    levelWrongTotal:    0,      // accumulated across puzzles in current level
    levelHintTotal:     0,
    levelStars,
    totalStars:         saved.totalStars  ?? 0,
    settings:           saved.settings   ?? { sound: true },
    parentUnlocked:     false,
  };
}

export function getCurrentPuzzle(state) {
  return generatePuzzle(getActiveLevelIndex(state), getActivePuzzleIndex(state));
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
    const activePuzzleIndex = getActivePuzzleIndex(state);
    const isLastPuzzle = activePuzzleIndex >= PUZZLES_PER_LEVEL - 1;

    if (isLastPuzzle) {
      // Level complete — tally stats and award stars.
      const totalWrong = state.levelWrongTotal + state.wrongAttempts;
      const totalHints = state.levelHintTotal + (state.hintUsed ? 1 : 0);
      const stars = totalWrong === 0 && totalHints === 0 ? 3
                  : totalWrong <= 3 ? 2
                  : 1;
      const activeLevelIndex = getActiveLevelIndex(state);
      const levelStars = { ...state.levelStars };
      levelStars[activeLevelIndex] = Math.max(levelStars[activeLevelIndex] ?? 0, stars);
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
  const nextPuzzleIndex = getActivePuzzleIndex(state) + 1;
  const next = {
    ...state,
    screen:             'play',
    currentPuzzleIndex: nextPuzzleIndex,
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
  const activeLevelIndex = getActiveLevelIndex(state);
  const nextLevelIndex = Math.min(activeLevelIndex + 1, LEVEL_COUNT - 1);
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
  const fallbackIndex = Math.min(clampLevelIndex(state.currentLevelIndex), getUnlockedLevelIndex(state.levelStars));
  const targetIndex = isLevelUnlocked(state, index) ? index : fallbackIndex;
  const next = {
    ...state,
    screen:             'play',
    currentLevelIndex:  targetIndex,
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
  return {
    ...state,
    screen,
    feedback:         null,
    hintText:         null,
  };
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
