// UI rendering and user action wiring
import {
  createGame, getCurrentPuzzle, selectPiece, undoLast,
  submitAnswer, requestHint, nextPuzzle, nextLevel, goToLevel, goToScreen,
  unlockProgressToLevel, updateSetting, updateMultiplication, updateSubtraction, unlockParent, resetProgress, getSkillProgress,
  getActiveLevelIndex, getActivePuzzleIndex, getUnlockedLevelIndex, isLevelUnlocked,
  LEVEL_COUNT, PUZZLES_PER_LEVEL, PIECE_COLORS, REWARD_GROUPS,
} from './engine/game.js';
import {
  TIMES_TABLES, MULTIPLICATION_ROUND_SIZE, startMultiplicationRound,
  getMultiplicationQuestion, submitMultiplicationAnswer,
  requestMultiplicationHint, nextMultiplicationQuestion,
} from './engine/multiplication.js';
import {
  SUBTRACTION_ROUND_SIZE, startSubtractionRound, getSubtractionQuestion,
  submitSubtractionAnswer, nextSubtractionQuestion,
  SUBTRACTION_LEVEL_COUNT, getSubtractionLevelMax, isSubtractionLevelUnlocked,
  unlockSubtractionToLevel,
} from './engine/subtraction.js';

let state = createGame();
const app = document.getElementById('app');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  });
}

// ── Sound ─────────────────────────────────────────────────────────────────────

let audioContext;

function playSound(type) {
  if (!state.settings.sound) return;
  try {
    const ctx = audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const schedule = (freq, startOffset, dur, type = 'sine', vol = 0.28) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = type;
      o.frequency.value = freq;
      const t = ctx.currentTime + startOffset;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t);
      o.stop(t + dur);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    };

    if (type === 'select') {
      schedule(540, 0, 0.12);
    } else if (type === 'correct') {
      [523, 659, 784, 1047].forEach((f, i) => schedule(f, i * 0.09, 0.35, 'sine', 0.3));
    } else if (type === 'wrong') {
      schedule(180, 0, 0.28, 'square', 0.14);
    } else if (type === 'hint') {
      schedule(440, 0, 0.18);
      schedule(550, 0.13, 0.18);
    }
  } catch { /* audio not available */ }
}

// ── Wheel SVG ─────────────────────────────────────────────────────────────────

function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx, cy, r, startDeg, endDeg) {
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = (endDeg - startDeg) >= 180 ? 1 : 0;
  return `M${cx},${cy} L${s.x.toFixed(2)},${s.y.toFixed(2)} A${r},${r} 0 ${large},1 ${e.x.toFixed(2)},${e.y.toFixed(2)} Z`;
}

function renderWheel(puzzle, selected, feedback) {
  const solved = feedback === 'correct' || feedback === 'levelComplete';
  const size = 280;
  const cx = size / 2, cy = size / 2;
  const r  = cx - 6;
  const innerR = Math.round(r * 0.27);
  const n = puzzle.pieces.length;
  const step = 360 / n;

  let slices = '';
  let labels = '';

  for (let i = 0; i < n; i++) {
    const startDeg = i * step;
    const endDeg   = (i + 1) * step;
    const midDeg   = startDeg + step / 2;
    const tp       = polar(cx, cy, r * 0.61, midDeg);
    const c        = PIECE_COLORS[i % PIECE_COLORS.length];

    let fill, textColor;
    if ((feedback === 'correct' || feedback === 'levelComplete') && selected.has(i)) {
      fill = '#16A34A'; textColor = '#FFFFFF';
    } else if (feedback === 'wrong' && selected.has(i)) {
      fill = '#FCA5A5'; textColor = '#7F1D1D';
    } else {
      fill = selected.has(i) ? c.selected : c.idle;
      textColor = selected.has(i) ? c.textSelected : c.textIdle;
    }

    const numStr   = String(puzzle.pieces[i]);
    const fontSize = numStr.length > 1
      ? (n <= 5 ? 18 : 15)
      : (n <= 5 ? 22 : 18);

    slices += `<path d="${slicePath(cx, cy, r, startDeg, endDeg)}" fill="${fill}" stroke="white" stroke-width="3" class="wheel-slice${selected.has(i) ? ' sel' : ''}" data-index="${i}" role="button" tabindex="${solved ? -1 : 0}" aria-label="Brikke ${i + 1}: ${puzzle.pieces[i]}" aria-pressed="${selected.has(i)}" aria-disabled="${solved}" />`;
    labels += `<text x="${tp.x.toFixed(2)}" y="${tp.y.toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-size="${fontSize}" font-weight="800" font-family="'Nunito',sans-serif" class="wheel-label" data-index="${i}" style="pointer-events:none">${puzzle.pieces[i]}</text>`;
  }

  // Center circle & target number
  const centerBg = (feedback === 'correct' || feedback === 'levelComplete') ? '#16A34A'
                 : feedback === 'wrong' ? '#EF4444'
                 : '#7C3AED';
  const targetStr    = String(puzzle.target);
  const centerFontSz = targetStr.length > 1 ? 18 : 24;
  const centerCircle = `<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="${centerBg}" />
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="${centerFontSz}" font-weight="900" font-family="'Nunito',sans-serif" style="pointer-events:none">${puzzle.target}</text>`;

  const animClass = (feedback === 'correct' || feedback === 'levelComplete') ? ' wheel-correct'
                  : feedback === 'wrong' ? ' wheel-wrong'
                  : '';

  return `<svg class="wheel-svg${animClass}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Tallhjul: velg tall som blir ${puzzle.target} til sammen">
    ${slices}${labels}${centerCircle}
  </svg>`;
}

// ── Celebration overlay ───────────────────────────────────────────────────────

function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  const emojis = ['🌟', '⭐', '✨', '🎉', '🎊', '💫'];
  for (let i = 0; i < 14; i++) {
    const span       = document.createElement('span');
    span.className   = 'confetti-piece';
    span.textContent = emojis[i % emojis.length];
    const left    = 5 + Math.random() * 90;
    const top     = 5 + Math.random() * 65;
    const size    = 1.1 + Math.random() * 1.4;
    const delay   = (Math.random() * 0.35).toFixed(2);
    span.style.cssText = `left:${left}%;top:${top}%;font-size:${size}rem;animation-delay:${delay}s`;
    overlay.appendChild(span);
  }
  app.appendChild(overlay);
  setTimeout(() => overlay.remove(), 1600);
}

// ── Stars strip ───────────────────────────────────────────────────────────────

function starsStrip(count) {
  return Array.from({ length: count }, (_, i) =>
    `<span class="star-earned" style="animation-delay:${(i * 0.12).toFixed(2)}s">⭐</span>`
  ).join('');
}

function isRewardUnlocked(reward, gameState = state) {
  return reward.unlockLevel === 0 || !!gameState.levelStars[reward.unlockLevel - 1];
}

function getSelectedReward() {
  return REWARD_GROUPS[state.rewardGroupIndex]?.items[state.rewardItemIndex] ?? null;
}

function getRewardEntries() {
  return REWARD_GROUPS.flatMap((group, groupIndex) =>
    group.items.map((reward, itemIndex) => ({ group, groupIndex, itemIndex, reward }))
  ).sort((a, b) =>
    a.reward.unlockLevel - b.reward.unlockLevel
    || a.groupIndex - b.groupIndex
    || a.itemIndex - b.itemIndex
  );
}

// ── Screen renderers ──────────────────────────────────────────────────────────

function renderBottomNav() {
  const s = state.screen === 'reward-detail' ? 'rewards'
    : state.screen === 'multiplication' ? 'tables'
    : state.screen === 'subtraction-levels' ? 'subtraction'
    : state.screen === 'levels' ? 'play' : state.screen;
  const btns = [
    { action: 'nav-home',     icon: '🏠', label: 'Hjem',        screen: 'home'     },
    { action: 'nav-play',     icon: '➕', label: 'Addisjon',    screen: 'play'     },
    { action: 'subtraction-open', icon: '➖', label: 'Minus', screen: 'subtraction' },
    { action: 'multiplication-tables', icon: '×', label: 'Gange', screen: 'tables' },
    { action: 'nav-rewards',  icon: '🎁', label: 'Belønninger', screen: 'rewards'  },
    { action: 'nav-progress', icon: '📊', label: 'Fremgang',    screen: 'progress' },
  ];
  return `<nav class="bottom-nav" aria-label="Hovedmeny">
    ${btns.map(b => `
      <button class="nav-btn${s === b.screen ? ' active' : ''}" data-action="${b.action}" ${s === b.screen ? 'aria-current="page"' : ''}>
        <span class="nav-icon${b.screen === 'tables' ? ' nav-multiply' : ''}" aria-hidden="true">${b.icon}</span>
        <span class="nav-label">${b.label}</span>
      </button>`).join('')}
  </nav>`;
}

function renderHome() {
  const minusRound = state.subtraction.round;
  const gangeRound = state.multiplication.round;
  const resumeMinus = minusRound && !minusRound.complete;
  const resumeGange = gangeRound && !gangeRound.complete;
  const additionStarted = state.currentPuzzleIndex > 0 || state.selectedPieces.size > 0 || state.totalStars > 0;
  const minusLevel = resumeMinus ? minusRound.levelIndex : state.subtraction.levels.currentLevelIndex;
  return `
    <div class="screen screen-home">
      <header class="home-hero">
        <div class="app-logo">
          <span class="app-logo-icon" aria-hidden="true">🎡</span>
          <div>
            <div class="app-title">Mattelek</div>
            <div class="app-subtitle">Små oppgaver. Store oppdagelser.</div>
          </div>
        </div>
        <img class="home-fox" src="img/minus-fox.svg" alt="" width="112" height="134" />
      </header>
      <main class="home-main">
      <div class="home-intro">
        <h1>Hva vil du leke med i dag?</h1>
        <p>Velg en aktivitet og øv i ditt eget tempo.</p>
      </div>
      <nav class="home-menu" aria-label="Velg aktivitet">
        <button class="menu-btn btn-continue" data-action="continue">
          <span class="activity-symbol" aria-hidden="true">+</span>
          <span class="activity-copy"><span class="btn-label">Addisjon</span>
            <span class="btn-sub">Finn tall som passer sammen i tallhjulet.</span>
            <span class="activity-status">Nivå ${state.currentLevelIndex + 1} · oppgave ${state.currentPuzzleIndex + 1} av 10</span>
          </span>
          <span class="activity-cta">${additionStarted ? 'Fortsett' : 'Spill tallhjulet'} <span aria-hidden="true">→</span></span>
        </button>
        <button class="menu-btn btn-subtraction" data-action="subtraction-open">
          <span class="activity-symbol" aria-hidden="true">−</span>
          <span class="activity-copy"><span class="btn-label">Minus</span>
            <span class="btn-sub">Trekk fra og finn svaret sammen med reven.</span>
            <span class="activity-status">Nivå ${minusLevel + 1} · ${resumeMinus ? `${minusRound.results.length} av 10 løst` : `tall opptil ${getSubtractionLevelMax(minusLevel)}`}</span>
          </span>
          <span class="activity-cta">${resumeMinus ? 'Fortsett' : 'Spill med reven'} <span aria-hidden="true">→</span></span>
        </button>
        <button class="menu-btn btn-multiplication" data-action="${resumeGange ? 'multiplication-resume' : 'multiplication-tables'}">
          <span class="activity-symbol" aria-hidden="true">×</span>
          <span class="activity-copy"><span class="btn-label">Gangehagen</span>
            <span class="btn-sub">Øv på gangetabellene og dyrk fine blomster.</span>
            <span class="activity-status">${resumeGange ? `${gangeRound.table}-gangen · ${gangeRound.results.length} av 10 løst` : '1–10-gangen · 10 oppgaver'}</span>
          </span>
          <span class="activity-cta">${resumeGange ? 'Fortsett' : 'Velg gangetabell'} <span aria-hidden="true">→</span></span>
        </button>
      </nav>
      <nav class="home-shortcuts" aria-label="Flere valg">
        <button data-action="levels"><span aria-hidden="true">📚</span> Velg addisjonsnivå <span aria-hidden="true">→</span></button>
        <button data-action="subtraction-levels"><span aria-hidden="true">📚</span> Velg minusnivå <span aria-hidden="true">→</span></button>
        <button data-action="parent"><span aria-hidden="true">⚙️</span> Foreldreområde <span aria-hidden="true">→</span></button>
      </nav>
      <p class="home-note">Her er det lov å prøve igjen. Vi lærer litt for hver gang.</p>
      </main>
    </div>
    ${renderBottomNav()}`;
}

function renderSelectedSum(puzzle) {
  const numbers = [...state.selectedPieces].map(index => puzzle.pieces[index]);
  return numbers.length ? `${numbers.join(' + ')} = ${numbers.reduce((sum, number) => sum + number, 0)}` : 'Trykk på tallene du vil legge sammen.';
}

function renderPlay() {
  const puzzle      = getCurrentPuzzle(state);
  const activeLevelIndex = getActiveLevelIndex(state);
  const activePuzzleIndex = getActivePuzzleIndex(state);
  const levelNum    = activeLevelIndex + 1;
  const puzzleNum   = activePuzzleIndex + 1;
  const earnedStars = state.levelStars[activeLevelIndex] ?? 0;
  const isCorrect   = state.feedback === 'correct' || state.feedback === 'levelComplete';

  const starsHtml = `<span class="star-display">
    ${[1,2,3].map(n => `<span class="star">${earnedStars >= n ? '⭐' : '☆'}</span>`).join('')}
  </span>`;

  // 10 progress dots for puzzles within the current level.
  const dotsHtml = `<div class="progress-dots" role="img" aria-label="${activePuzzleIndex + (isCorrect ? 1 : 0)} av ${PUZZLES_PER_LEVEL} oppgaver løst">
    ${Array.from({ length: PUZZLES_PER_LEVEL }, (_, i) => {
      const done    = i < activePuzzleIndex || (isCorrect && i === activePuzzleIndex);
      const current = !done && i === activePuzzleIndex;
      return `<span class="pdot${done ? ' done' : current ? ' current' : ''}"></span>`;
    }).join('')}
  </div>`;

  const instruction = puzzle.connected
    ? `Finn tallene som gir <strong>${puzzle.target}</strong> — de må henge sammen!`
    : `Finn tallene som gir <strong>${puzzle.target}</strong>`;

  let feedbackHtml = '';
  if (state.feedback === 'levelComplete') {
    const stars = state.levelStars[activeLevelIndex] ?? 1;
    feedbackHtml = `<div class="feedback feedback-level-complete">
      <span class="feedback-emoji">🏆</span>
      <span>Nivå ${levelNum} fullført!</span>
      <span class="stars-earned">${starsStrip(stars)}</span>
    </div>`;
  } else if (state.feedback === 'correct') {
    const selectedNums = [...state.selectedPieces].map(i => puzzle.pieces[i]);
    feedbackHtml = `<div class="feedback feedback-correct">
      <span class="feedback-emoji">🌟</span>
      <span>${selectedNums.join(' + ')} = ${puzzle.target}</span>
    </div>`;
  } else if (state.feedback === 'wrong') {
    feedbackHtml = `<div class="feedback feedback-wrong">
      <span class="feedback-emoji">💭</span>
      <span>Ikke helt ennå. Velg andre tall, eller trykk på Tips.</span>
    </div>`;
  } else if (state.hintText) {
    feedbackHtml = `<div class="feedback feedback-hint">
      <span class="feedback-emoji">💡</span>
      <span>${state.hintText}</span>
    </div>`;
  } else {
    feedbackHtml = `<div class="feedback feedback-empty"></div>`;
  }

  const actionHtml = state.feedback === 'levelComplete'
    ? `<button class="action-btn btn-next" data-action="next-level">${levelNum === LEVEL_COUNT ? 'Alle nivåene er løst! Velg nivå' : 'Neste nivå'} →</button>`
    : state.feedback === 'correct'
    ? `<button class="action-btn btn-next" data-action="next-puzzle">Neste oppgave →</button>`
    : `<button class="action-btn btn-hint"  data-action="hint">💡 Tips</button>
       <button class="action-btn btn-undo"  data-action="undo" ${state.selectedPieces.size ? '' : 'disabled'}>↩ Angre</button>
       <button class="action-btn btn-check" data-action="check" ${state.selectedPieces.size ? '' : 'disabled'}>Sjekk svar</button>`;

  return `
    <div class="screen screen-play">
      <header class="play-header">
        <div class="play-header-top">
          <button class="back-btn" data-action="home" aria-label="Til hjem">←</button>
          <div class="level-info">
            <span class="level-name">Addisjon <small>Nivå ${levelNum}</small></span>
            ${starsHtml}
          </div>
          <span class="puzzle-counter">Oppgave ${puzzleNum} av ${PUZZLES_PER_LEVEL}</span>
        </div>
        ${dotsHtml}
      </header>

      <main class="play-main">
        <p class="instruction">${instruction}</p>
        <div class="wheel-container">
          ${renderWheel(puzzle, state.selectedPieces, state.feedback)}
          <p class="selection-summary" aria-live="polite">${renderSelectedSum(puzzle)}</p>
        </div>
        <div class="addition-feedback" role="status">${feedbackHtml}</div>
      </main>

      <footer class="action-bar">${actionHtml}</footer>
    </div>`;
}

function renderLevelSelect(activity = 'addition') {
  const minus = activity === 'subtraction';
  const count = minus ? SUBTRACTION_LEVEL_COUNT : LEVEL_COUNT;
  const stars = minus ? state.subtraction.levels.stars : state.levelStars;
  const current = minus ? state.subtraction.levels.currentLevelIndex : state.currentLevelIndex;
  const resumable = minus && state.subtraction.round && !state.subtraction.round.complete;
  return `
    <div class="screen screen-levels${minus ? ' screen-minus-levels' : ''}">
      <header class="sub-header">
        <button class="back-btn" data-action="home" aria-label="Til hjem">←</button>
        <h2>${minus ? 'Minus' : 'Addisjon'} · velg nivå</h2>
        <span class="puzzle-counter" style="margin-left:auto">${Object.keys(stars).length} / ${count}</span>
      </header>
      <p class="levels-intro">Løs 10 oppgaver for å åpne neste nivå. Du kan spille åpne nivåer om igjen og samle opptil tre stjerner.</p>
      ${resumable ? `<button class="levels-resume" data-action="subtraction-open">Fortsett på nivå ${state.subtraction.round.levelIndex + 1} · ${state.subtraction.round.results.length} av 10 løst →</button>` : ''}
      <div class="level-grid">
        ${Array.from({ length: count }, (_, i) => {
          const s = stars[i] ?? 0;
          const locked = minus ? !isSubtractionLevelUnlocked(state.subtraction, i) : !isLevelUnlocked(state, i);
          return `<button class="level-card${locked ? ' locked' : ''}${i === current ? ' current' : ''}"
                    data-action="${minus ? 'subtraction-level' : 'goto-level'}" data-level="${i}" ${locked ? 'disabled' : ''}
                    aria-label="Nivå ${i + 1}${locked ? ', låst' : s ? `, ${s} ${s === 1 ? 'stjerne' : 'stjerner'}` : ', åpent'}">
            <div class="level-card-num">${i + 1}</div>
            <div class="level-card-stars">${s > 0 ? [1,2,3].map(n => s >= n ? '⭐' : '·').join('') : ''}</div>
          </button>`;
        }).join('')}
      </div>
    </div>
    ${renderBottomNav()}`;
}

// ── Gangehagen ────────────────────────────────────────────────────────────────

function renderMultiplicationTables() {
  const practice = state.multiplication;
  const resumable = practice.round && !practice.round.complete;
  return `
    <div class="screen screen-tables">
      <header class="sub-header">
        <button class="back-btn" data-action="home" aria-label="Til hjem">←</button>
        <h2>Gangehagen</h2>
      </header>
      <main class="tables-main">
        <div class="tables-intro">
          <span class="garden-mascot" aria-hidden="true">🌻</span>
          <h1>Hva vil du øve på?</h1>
          <p>Velg en gangetabell. Løs 10 gangestykker og få hagen til å blomstre!</p>
        </div>
        ${resumable ? `<button class="garden-resume" data-action="multiplication-resume">
          Fortsett med ${practice.round.table}-gangen · ${practice.round.results.length} av 10 løst →
        </button>` : ''}
        <div class="times-table-grid" aria-label="Velg gangetabell">
          ${TIMES_TABLES.map(table => {
            const progress = practice.progress[table];
            const resume = resumable && practice.round.table === table;
            return `<button class="times-table-card${progress?.best === 10 ? ' mastered' : ''}"
                data-action="${resume ? 'multiplication-resume' : 'multiplication-start'}" data-table="${table}">
              <span class="table-flower" aria-hidden="true">${progress?.best === 10 ? '🌻' : progress ? '🌷' : '🌱'}</span>
              <span class="table-title">${table}-gangen</span>
              <span class="table-example">${table} × 3 = ${table * 3}</span>
              <span class="table-record">${resume ? 'Fortsett runden →' : progress ? `Beste: ${progress.best} av 10 på egen hånd` : 'Klar til å så!'}</span>
            </button>`;
          }).join('')}
        </div>
        <p class="garden-note">Alle tabellene er åpne. Øv så mange ganger du vil, i ditt eget tempo.</p>
      </main>
    </div>
    ${renderBottomNav()}`;
}

function renderGarden(round) {
  return `<div class="multiplication-garden" role="img" aria-label="${round.results.length} av 10 blomster har blomstret">
    <div class="garden-sky" aria-hidden="true"><span>☁️</span><span>☀️</span></div>
    <div class="garden-plots" aria-hidden="true">
      ${round.factors.map((factor, index) => `
        <div class="garden-plot${index < round.results.length ? ' bloomed' : ''}${index === round.index && round.feedback !== 'correct' ? ' growing' : ''}">
          <span class="garden-flower">${index < round.results.length ? ['🌻', '🌷', '🌼'][index % 3] : '🌱'}</span>
          <span class="garden-plot-label">× ${factor}</span>
        </div>`).join('')}
    </div>
    <div class="garden-ground"></div>
  </div>`;
}

function renderMultiplicationHint(question) {
  return `<div class="multiplication-hint" id="multiplication-hint">
    <p><strong>${question.factor} grupper med ${question.table} prikker.</strong><br>Tell ${question.table} om gangen. Hvor mange blir det til sammen?</p>
    <div class="dot-groups" role="img" aria-label="${question.factor} grupper med ${question.table} prikker i hver">
      ${Array.from({ length: question.factor }, () => `<span class="dot-group" aria-hidden="true">
        ${'<i></i>'.repeat(question.table)}
      </span>`).join('')}
    </div>
  </div>`;
}

function renderMultiplication() {
  const round = state.multiplication.round;
  if (!round) return renderMultiplicationTables();
  const question = getMultiplicationQuestion(state.multiplication);
  const correct = round.feedback === 'correct';
  const independentCount = round.results.filter(result => result.independent).length;
  let feedback = 'Skriv svaret og se hva som spirer!';
  if (correct && question) feedback = `Riktig! ${question.table} × ${question.factor} = ${question.answer}. En ny blomst!`;
  else if (round.feedback === 'wrong') feedback = 'Det var ikke helt riktig. Prøv igjen, eller bruk prikkene som hjelp.';
  else if (round.feedback === 'invalid') feedback = 'Skriv et helt tall i svarfeltet først.';

  return `<div class="screen screen-multiplication">
    <header class="sub-header multiplication-header">
      <button class="back-btn" data-action="multiplication-tables" aria-label="Velg gangetabell">←</button>
      <h2>${round.table}-gangen</h2>
      <span class="garden-counter">🌼 ${round.results.length} / ${MULTIPLICATION_ROUND_SIZE}</span>
    </header>
    <main class="multiplication-main${round.complete ? ' round-complete' : ''}">
      <section class="garden-panel">
        <div class="garden-heading">
          <span class="garden-eyebrow">GANGEHAGEN</span>
          <h1>${round.complete ? 'Se så fint det blomstrer!' : 'Dyrk din egen gangehage'}</h1>
          <p>${round.complete ? `Du har løst alle de 10 stykkene i ${round.table}-gangen.` : 'Hvert riktige svar får en ny blomst til å vokse.'}</p>
        </div>
        ${renderGarden(round)}
      </section>
      ${round.complete ? `<section class="multiplication-card multiplication-summary">
        <span class="summary-bloom" aria-hidden="true">💐</span>
        <h2 tabindex="-1" id="multiplication-result">Hele hagen blomstrer!</h2>
        <p><strong>${independentCount} av 10</strong> på første forsøk uten hjelp.</p>
        <p>${independentCount === 10 ? 'Du kan denne tabellen kjempegodt!' : 'Hver runde gjør deg litt tryggere. Prøv igjen når du vil!'}</p>
        <details class="multiplication-review">
          <summary>Se gangestykkene dine</summary>
          <ul>${[...round.results].sort((a, b) => a.factor - b.factor).map(result => `<li>
            <strong>${round.table} × ${result.factor} = ${round.table * result.factor}</strong>
            <span>${result.independent ? 'På egen hånd' : 'Med litt øving'}</span>
          </li>`).join('')}</ul>
        </details>
        <button class="garden-primary" data-action="multiplication-start" data-table="${round.table}">Øv på ${round.table}-gangen igjen</button>
        <button class="garden-secondary" data-action="multiplication-tables">Velg en annen gangetabell</button>
      </section>` : `<section class="multiplication-card">
        <p class="garden-eyebrow">OPPGAVE ${round.index + 1} AV 10</p>
        <div class="multiplication-equation" aria-label="${question.table} ganger ${question.factor}">
          ${question.table} <span>×</span> ${question.factor} <span>=</span> <strong>${correct ? question.answer : '?'}</strong>
        </div>
        <p class="multiplication-feedback ${correct ? 'is-correct' : ''}" id="multiplication-feedback" role="status">${feedback}</p>
        ${correct ? `<button class="garden-primary" data-action="multiplication-next">${round.results.length === 10 ? 'Se resultatet' : 'Neste oppgave'} →</button>` : `
          <form id="multiplication-form" novalidate>
            <label for="multiplication-answer">Svaret ditt</label>
            <div class="multiplication-answer-row">
              <input id="multiplication-answer" name="answer" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" enterkeyhint="done"
                aria-describedby="multiplication-feedback" ${['wrong', 'invalid'].includes(round.feedback) ? 'aria-invalid="true"' : ''} />
              <button type="submit" class="garden-primary">Sjekk svar →</button>
            </div>
          </form>
          <button class="garden-secondary" data-action="multiplication-hint" aria-expanded="${round.hintUsed}" aria-controls="multiplication-hint">💡 Vis meg med prikker</button>
          ${round.hintUsed ? renderMultiplicationHint(question) : ''}
        `}
      </section>`}
    </main>
  </div>`;
}

// ── Minus ─────────────────────────────────────────────────────────────────────

function renderSubtraction() {
  const round = state.subtraction.round;
  if (!round) return renderHome();
  const question = getSubtractionQuestion(state.subtraction);
  const correct = round.feedback === 'correct';
  const independentCount = round.results.filter(result => result.independent).length;
  return `<div class="screen screen-subtraction">
    <header class="sub-header subtraction-header">
      <button class="back-btn" data-action="subtraction-levels" aria-label="Velg minusnivå">←</button>
      <h2>Minus <small>Nivå ${round.levelIndex + 1}</small></h2>
      <span class="garden-counter">${round.results.length} av 10 løst</span>
    </header>
    <main class="subtraction-main">
      <div class="subtraction-toolbar">
        <div class="subtraction-progress">
          <label for="subtraction-progress">${round.complete ? 'Alle oppgavene er løst!' : `Oppgave ${round.index + 1} av ${SUBTRACTION_ROUND_SIZE}`}</label>
          <progress id="subtraction-progress" value="${round.results.length}" max="${SUBTRACTION_ROUND_SIZE}">${round.results.length} av ${SUBTRACTION_ROUND_SIZE} løst</progress>
        </div>
      </div>
      ${round.complete ? `<section class="subtraction-summary">
        <img src="img/minus-fox.svg" alt="" width="112" height="134" />
        <h1 id="subtraction-result" tabindex="-1">Nivå ${round.levelIndex + 1} fullført! 🎉</h1>
        <div class="subtraction-stars" aria-label="${round.stars} ${round.stars === 1 ? 'stjerne' : 'stjerner'}">${starsStrip(round.stars)}</div>
        <p>Du løste <strong>${independentCount} av 10</strong> på første forsøk.</p>
        <p>${independentCount === SUBTRACTION_ROUND_SIZE ? 'Du er en minusmester!' : 'Godt jobbet! Hver runde gjør deg litt tryggere.'}</p>
        ${round.levelIndex < SUBTRACTION_LEVEL_COUNT - 1
          ? `<button class="subtraction-next" data-action="subtraction-level" data-level="${round.levelIndex + 1}">Neste nivå <span aria-hidden="true">→</span></button>`
          : '<p>Du har løst alle 80 nivåene. Fantastisk jobbet!</p>'}
        <button class="subtraction-back" data-action="subtraction-start">Øv på nivå ${round.levelIndex + 1} igjen</button>
        <button class="subtraction-back" data-action="subtraction-levels">Velg nivå</button>
      </section>` : `
        <section class="subtraction-puzzle" aria-labelledby="subtraction-heading">
          <span class="subtraction-cloud cloud-left" aria-hidden="true"></span>
          <span class="subtraction-cloud cloud-right" aria-hidden="true"></span>
          <h1 id="subtraction-heading">Minus</h1>
          <h2 class="subtraction-equation" id="subtraction-question" tabindex="-1" aria-label="${question.minuend} minus ${question.subtrahend}. ${correct ? `Svaret er ${question.answer}.` : 'Hva blir svaret?'}">
            ${question.minuend} − ${question.subtrahend} = ${correct ? question.answer : '?'}
          </h2>
          <p>Hva blir svaret?</p>
          <img class="subtraction-fox" src="img/minus-fox.svg" alt="" width="112" height="134" />
          <span class="subtraction-bushes" aria-hidden="true"></span>
        </section>
        <form id="subtraction-form" class="subtraction-form" novalidate>
          <label for="subtraction-answer">Svaret ditt</label>
          <div class="subtraction-answer-row">
            <input id="subtraction-answer" name="answer" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" enterkeyhint="done"
              placeholder="Skriv et tall" value="${round.selectedAnswer ?? ''}" aria-describedby="subtraction-feedback"
              ${['wrong', 'invalid'].includes(round.feedback) ? 'aria-invalid="true"' : ''} ${correct ? 'disabled' : ''} />
            <button type="submit" class="subtraction-check" ${correct ? 'disabled' : ''}>Sjekk svar <span aria-hidden="true">→</span></button>
          </div>
        </form>
        <div class="subtraction-choices" role="group" aria-labelledby="subtraction-question">
          ${question.choices.map(answer => {
            const selected = round.selectedAnswer === answer;
            const answerState = selected ? (correct ? 'is-correct' : 'is-wrong') : '';
            return `<button class="subtraction-choice ${answerState}" data-action="subtraction-answer" data-answer="${answer}"
              aria-label="${answer}${selected ? (correct ? ', riktig svar' : ', prøv igjen') : ''}" ${selected ? 'aria-describedby="subtraction-feedback"' : ''} ${correct ? 'disabled' : ''}>
              ${answer}${selected ? `<span class="subtraction-choice-mark" aria-hidden="true">${correct ? '✓' : '×'}</span>` : ''}
            </button>`;
          }).join('')}
        </div>
        <div class="subtraction-feedback ${correct ? 'is-correct' : round.feedback === 'wrong' ? 'is-wrong' : ''}" id="subtraction-feedback" role="status" aria-live="polite" aria-atomic="true">
          ${correct ? `<span class="subtraction-feedback-icon" aria-hidden="true">✓</span><div><strong>Helt riktig! 🎉</strong><p>${question.minuend} minus ${question.subtrahend} er ${question.answer}.</p></div>`
            : round.feedback === 'wrong' ? `<span class="subtraction-feedback-icon" aria-hidden="true">↻</span><div><strong>Prøv en gang til!</strong><p>${question.subtrahend < 10 ? `Start på ${question.minuend} og tell ${question.subtrahend} tilbake.` : `Trekk først fra ${Math.floor(question.subtrahend / 10) * 10}, så ${question.subtrahend % 10} til.`}</p></div>`
            : round.feedback === 'invalid' ? '<p>Skriv et helt tall i svarfeltet først.</p>'
            : '<p>Skriv svaret eller velg et tall.</p>'}
        </div>
        <button class="subtraction-next" data-action="subtraction-next" aria-describedby="subtraction-feedback" ${correct ? '' : 'disabled'}>
          ${round.results.length === SUBTRACTION_ROUND_SIZE ? 'Se resultatet' : 'Neste oppgave'} <span aria-hidden="true">→</span>
        </button>
      `}
    </main>
    <div class="subtraction-meadow" aria-hidden="true"></div>
  </div>`;
}

function renderProgress() {
  const skill         = getSkillProgress(state);
  const unlockedLevel = getUnlockedLevelIndex(state.levelStars) + 1;

  const skillRows = [
    { key: 'addition', label: 'Addisjon', emoji: '➕', color: '#7C3AED', description: `${Object.keys(state.levelStars).length} av ${LEVEL_COUNT} nivåer fullført`, action: 'continue' },
    { key: 'subtraction', label: 'Minus', emoji: '➖', color: '#2782B1', description: `${Object.keys(state.subtraction.levels.stars).length} av ${SUBTRACTION_LEVEL_COUNT} nivåer fullført`, action: 'subtraction-open' },
    { key: 'multiplication', label: 'Gangehagen', emoji: '🌻', color: '#15803D', description: 'Beste resultater i alle tabellene, på første forsøk uten hjelp', action: 'multiplication-tables' },
  ].map(r => `
    <div class="skill-row">
      <span class="skill-emoji" aria-hidden="true">${r.emoji}</span>
      <div class="skill-info">
        <div class="skill-label">${r.label}</div>
        <div class="skill-description">${r.description}</div>
        <div class="skill-bar-track" role="progressbar" aria-label="${r.label}" aria-valuenow="${skill[r.key]}" aria-valuemin="0" aria-valuemax="100">
          <div class="skill-bar-fill" style="width:${skill[r.key]}%;background:${r.color}"></div>
        </div>
      </div>
      <span class="skill-pct">${skill[r.key]}%</span>
      <button class="skill-play" data-action="${r.action}" aria-label="Øv på ${r.label}">Øv <span aria-hidden="true">→</span></button>
    </div>`).join('');

  return `
    <div class="screen screen-progress">
      <header class="sub-header"><h2>Fremgang</h2></header>

      <div class="progress-hero">
        <div class="total-stars-badge">
          <span class="tsbadge-icon">⭐</span>
          <div>
            <div class="tsbadge-num">${state.totalStars}</div>
            <div class="tsbadge-label">Stjerner i addisjon</div>
          </div>
        </div>
        <div class="level-badge">
          <div class="lbadge-label">Nivå</div>
          <div class="lbadge-num">${unlockedLevel}</div>
        </div>
      </div>

      <div class="skill-section">
        <div class="section-title">Dette har du øvd på</div>
        ${skillRows}
      </div>

      <div class="bear-mascot">🌱 Litt øving hver gang. Du kan alltid prøve igjen!</div>
    </div>
    ${renderBottomNav()}`;
}

function renderRewards() {
  const activeFilter = state.rewardFilter ?? 'all';
  const filters = [
    { key: 'all', label: 'Alle' },
    ...REWARD_GROUPS.map((group, groupIndex) => ({ key: String(groupIndex), label: group.title })),
  ];
  const totalRewards = REWARD_GROUPS.reduce((s, g) => s + g.items.length, 0);
  const unlockedCount = REWARD_GROUPS.reduce((s, g) =>
    s + g.items.filter(r => r.unlockLevel === 0 || !!state.levelStars[r.unlockLevel - 1]).length, 0);

  // Next reward to unlock (motivational hint)
  const rewardEntries = getRewardEntries();
  const nextReward = rewardEntries
    .map(entry => entry.reward)
    .find(r => r.unlockLevel > 0 && !state.levelStars[r.unlockLevel - 1]);
  const visibleRewardEntries = rewardEntries
    .filter(entry => activeFilter === 'all' || activeFilter === String(entry.groupIndex));

  const rewardCard = (r, groupIndex, itemIndex) => {
    const unlocked = isRewardUnlocked(r);
    return `<button type="button" class="reward-card${unlocked ? ' unlocked' : ' locked'}"
      ${unlocked
        ? `data-action="open-reward" data-reward-group="${groupIndex}" data-reward-index="${itemIndex}" aria-label="Åpne ${r.name}"`
        : `disabled aria-label="${r.name} låses opp på nivå ${r.unlockLevel}"`}>
      <div class="reward-emoji">${unlocked ? r.emoji : '\uD83D\uDD12'}</div>
      <div class="reward-name">${r.name}</div>
      ${!unlocked ? `<div class="reward-req">Niv\u00e5 ${r.unlockLevel}</div>` : ''}
    </button>`;
  };

  return `
    <div class="screen screen-rewards">
      <header class="sub-header">
        <h2>Belønninger</h2>
        <div class="stars-header">${unlockedCount} / ${totalRewards}</div>
      </header>

      <p class="rewards-intro">Fullfør nivåer i addisjon for å samle nye venner og overraskelser.</p>

      ${nextReward ? `<div class="next-reward-banner">
        <span class="next-reward-label">Neste: </span>
        <span class="next-reward-emoji">${nextReward.emoji}</span>
        <span class="next-reward-name">${nextReward.name}</span>
        <span class="next-reward-level">— fullfør nivå ${nextReward.unlockLevel}</span>
      </div>` : `<div class="next-reward-banner next-reward-done">🏆 Alle belønninger funnet!</div>`}

      <div class="reward-filter" role="group" aria-label="Filtrer belønninger">
        ${filters.map(filter => `
          <button type="button" class="reward-filter-btn${activeFilter === filter.key ? ' active' : ''}"
            data-action="filter-rewards" data-reward-filter="${filter.key}"
            aria-pressed="${activeFilter === filter.key}">${filter.label}</button>
        `).join('')}
      </div>

      <section class="rewards-section">
        <div class="rewards-grid">${visibleRewardEntries
          .map(entry => rewardCard(entry.reward, entry.groupIndex, entry.itemIndex))
          .join('')}</div>
      </section>
    </div>
    ${renderBottomNav()}`;
}

function renderRewardDetail() {
  const reward = getSelectedReward();
  if (!reward || !isRewardUnlocked(reward)) return renderRewards();

  return `
    <div class="screen screen-reward-detail">
      <header class="sub-header">
        <button class="back-btn" data-action="nav-rewards" aria-label="Til belønninger">←</button>
        <h2>${reward.name}</h2>
      </header>

      <main class="reward-detail-main">
        <div class="reward-detail-icon" aria-hidden="true">${reward.emoji}</div>
        <p class="reward-detail-fact">${reward.funFact}</p>
      </main>
    </div>
    ${renderBottomNav()}`;
}

function renderParent() {
  const parentActivity = state.parentActivity ?? 'addition';
  const selectedLevel = parentActivity === 'subtraction' ? state.subtraction.levels.currentLevelIndex : state.currentLevelIndex;
  const unlockLevelOptions = Array.from({ length: LEVEL_COUNT }, (_, i) => `
    <option value="${i + 1}" ${i === selectedLevel ? 'selected' : ''}>${i + 1}</option>
  `).join('');

  if (!state.parentUnlocked) {
    return `
      <div class="screen screen-parent">
        <header class="sub-header">
          <button class="back-btn" data-action="home" aria-label="Til hjem">←</button>
          <h2>Foreldreområde</h2>
        </header>
        <div class="parent-gate">
          <span class="gate-emoji">🔐</span>
          <p class="gate-text">Er du en voksen? Løs regnestykket under for å åpne dette området.</p>
          <form class="gate-puzzle" id="parent-form" novalidate>
            <label for="parent-code" class="gate-question">Hva er <strong>12 × 8</strong>?</label>
            <input type="text" inputmode="numeric" id="parent-code" class="gate-input" placeholder="Skriv svar her" maxlength="3" autocomplete="off" aria-describedby="parent-feedback" />
            <p id="parent-feedback" role="status"></p>
            <button class="gate-btn" type="submit">Åpne →</button>
          </form>
        </div>
      </div>
      ${renderBottomNav()}`;
  }

  return `
    <div class="screen screen-parent">
      <header class="sub-header">
        <button class="back-btn" data-action="home" aria-label="Til hjem">←</button>
        <h2>Foreldreområde</h2>
      </header>
      <div class="parent-content">
        <section class="parent-section">
          <h3>Innstillinger</h3>
          <label class="setting-row">
            <span>Lyd</span>
            <input type="checkbox" class="setting-toggle" data-setting="sound" ${state.settings.sound ? 'checked' : ''} />
          </label>
        </section>

        <section class="parent-section">
          <h3>Lås opp nivå</h3>
          <div class="unlock-level-row">
            <select id="unlock-activity-select" class="unlock-level-select" aria-label="Velg aktivitet">
              <option value="addition" ${parentActivity === 'addition' ? 'selected' : ''}>Addisjon</option><option value="subtraction" ${parentActivity === 'subtraction' ? 'selected' : ''}>Minus</option>
            </select>
            <select id="unlock-level-select" class="unlock-level-select" aria-label="Velg nivå">
              ${unlockLevelOptions}
            </select>
            <button class="unlock-level-btn" data-action="unlock-progress-level">Lås opp</button>
          </div>
          <p class="parent-notice" role="status">${state.parentNotice ?? ''}</p>
        </section>

        <section class="parent-section">
          <h3>Rapport</h3>
          <div class="report-row"><span>Fullførte nivåer</span><strong>${Object.keys(state.levelStars).length} / ${LEVEL_COUNT}</strong></div>
          <div class="report-row"><span>Stjerner totalt</span><strong>${state.totalStars}</strong></div>
          <div class="report-row"><span>Nåværende nivå</span><strong>${state.currentLevelIndex + 1}</strong></div>
          <div class="report-row"><span>Gangetabeller øvd på</span><strong>${Object.keys(state.multiplication.progress).length} / 10</strong></div>
          <div class="report-row"><span>Gange på egen hånd</span><strong>${getSkillProgress(state).multiplication}%</strong></div>
          <div class="report-row"><span>Fullførte minusrunder</span><strong>${state.subtraction.progress.rounds}</strong></div>
          <div class="report-row"><span>Fullførte minusnivåer</span><strong>${Object.keys(state.subtraction.levels.stars).length} / ${SUBTRACTION_LEVEL_COUNT}</strong></div>
          <div class="report-row"><span>Stjerner i minus</span><strong>${Object.values(state.subtraction.levels.stars).reduce((sum, stars) => sum + stars, 0)}</strong></div>
          <div class="report-row"><span>Minus · beste runde på første forsøk</span><strong>${state.subtraction.progress.best} / ${SUBTRACTION_ROUND_SIZE}</strong></div>
        </section>

        <section class="parent-section">
          <h3>Om appen</h3>
          <p class="parent-text">Mattelek øver på addisjon med tallhjul, minus og gangetabellene fra 1 til 10. Addisjon og minus har 80 nivåer hver, med 10 oppgaver per nivå og tall som gradvis øker til 160. I minus gir en runde uten feil tre stjerner, opptil tre feil gir to, og alle fullførte nivåer gir minst én. Beste resultat beholdes når barnet øver igjen.</p>
        </section>

        <button class="reset-btn" data-action="reset-progress">Nullstill all fremgang</button>
      </div>
    </div>
    ${renderBottomNav()}`;
}

// ── Render dispatcher ─────────────────────────────────────────────────────────

function renderScreen() {
  switch (state.screen) {
    case 'home':     return renderHome();
    case 'play':     return renderPlay();
    case 'levels':   return renderLevelSelect();
    case 'subtraction-levels': return renderLevelSelect('subtraction');
    case 'tables':   return renderMultiplicationTables();
    case 'multiplication': return renderMultiplication();
    case 'subtraction': return renderSubtraction();
    case 'progress': return renderProgress();
    case 'rewards':  return renderRewards();
    case 'reward-detail': return renderRewardDetail();
    case 'parent':   return renderParent();
    default:         return renderHome();
  }
}

let pendingCelebrate = false;

function render(isScreenTransition = false) {
  const scrollTop = app.querySelector('.screen')?.scrollTop ?? 0;
  const focused = document.activeElement;
  const focusAction = focused?.dataset.action;
  const focusSetting = focused?.dataset.setting;
  const focusId = focused?.id;
  app.innerHTML = renderScreen();
  if (isScreenTransition) {
    const screenEl = app.querySelector('.screen');
    if (screenEl) screenEl.classList.add('entering');
    const heading = screenEl?.querySelector('h1, h2, .level-name');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  } else {
    const screenEl = app.querySelector('.screen');
    if (screenEl) screenEl.scrollTop = scrollTop;
    const selector = focusSetting ? `[data-setting="${focusSetting}"]`
      : focusAction ? `[data-action="${focusAction}"]${focused.dataset.rewardFilter ? `[data-reward-filter="${focused.dataset.rewardFilter}"]` : ''}` : null;
    if (selector) app.querySelector(selector)?.focus({ preventScroll: true });
    else if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }
  attachEvents();
  if (pendingCelebrate) {
    pendingCelebrate = false;
    setTimeout(celebrate, 60);
  }
}

function setState(newState) {
  const isTransition = newState.screen !== state.screen;
  state = newState;
  render(isTransition);
}

// Piece selection: mutate SVG attributes directly — no re-render, no layout jump.
function applyPieceSelection() {
  const puzzle = getCurrentPuzzle(state);
  for (let i = 0; i < puzzle.pieces.length; i++) {
    const path  = app.querySelector(`path.wheel-slice[data-index="${i}"]`);
    const label = app.querySelector(`text.wheel-label[data-index="${i}"]`);
    if (!path || !label) { render(); return; } // safety fallback
    const c   = PIECE_COLORS[i % PIECE_COLORS.length];
    const sel = state.selectedPieces.has(i);
    path.setAttribute('fill', sel ? c.selected : c.idle);
    path.classList.toggle('sel', sel);
    path.setAttribute('aria-pressed', String(sel));
    label.setAttribute('fill', sel ? c.textSelected : c.textIdle);
  }
  const summary = app.querySelector('.selection-summary');
  if (summary) summary.textContent = renderSelectedSum(puzzle);
  app.querySelectorAll('[data-action="check"], [data-action="undo"]').forEach(button => {
    button.disabled = state.selectedPieces.size === 0;
  });
  // Sync feedback/hint display — clears 'wrong' feedback and hint text when user re-selects.
  if (state.feedback === null) {
    const feedbackEl = app.querySelector('.feedback');
    if (feedbackEl) { feedbackEl.className = 'feedback feedback-empty'; feedbackEl.innerHTML = ''; }
    const centerEl = app.querySelector('.wheel-svg circle');
    if (centerEl) centerEl.setAttribute('fill', '#7C3AED');
  }
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function attachEvents() {
  // Wheel slice taps — update SVG in-place to avoid layout jump
  app.querySelectorAll('.wheel-slice').forEach(el => {
    el.addEventListener('click', () => {
      if (state.feedback === 'correct' || state.feedback === 'levelComplete') return;
      playSound('select');
      state = selectPiece(state, Number(el.dataset.index));
      applyPieceSelection();
    });
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });
  });

  // Labelled-action buttons
  app.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => handleAction(el.dataset.action, el));
  });

  const multiplicationForm = document.getElementById('multiplication-form');
  multiplicationForm?.addEventListener('submit', event => {
    event.preventDefault();
    const input = document.getElementById('multiplication-answer');
    const answer = input.value;
    const practice = submitMultiplicationAnswer(state.multiplication, answer);
    if (practice.round.feedback === 'correct') {
      playSound('correct');
    } else if (practice.round.feedback === 'wrong') {
      playSound('wrong');
    }
    setState(updateMultiplication(state, practice));
    focusMultiplication(answer);
  });

  document.getElementById('subtraction-form')?.addEventListener('submit', event => {
    event.preventDefault();
    checkSubtractionAnswer(document.getElementById('subtraction-answer').value, true);
  });
  document.getElementById('parent-form')?.addEventListener('submit', event => {
    event.preventDefault();
    handleAction('unlock-parent');
  });
  document.getElementById('unlock-activity-select')?.addEventListener('change', event => {
    setState({ ...state, parentActivity: event.target.value, parentNotice: null });
  });

  // Settings toggles
  app.querySelectorAll('[data-setting]').forEach(el => {
    el.addEventListener('change', () => {
      setState(updateSetting(state, el.dataset.setting, el.checked));
    });
  });
}

function focusMultiplication(answer = '') {
  const input = document.getElementById('multiplication-answer');
  if (input) {
    input.value = answer;
    input.focus();
    input.select();
  } else {
    const next = document.getElementById('multiplication-result')
      ?? app.querySelector('[data-action="multiplication-next"]');
    next?.focus({ preventScroll: true });
  }
}

function focusSubtraction() {
  const target = document.getElementById('subtraction-result')
    ?? document.getElementById('subtraction-question');
  target?.focus();
}

function checkSubtractionAnswer(answer, fromInput = false) {
  const practice = submitSubtractionAnswer(state.subtraction, answer);
  if (practice === state.subtraction) return;
  const feedback = practice.round.feedback;
  if (feedback === 'correct' || feedback === 'wrong') playSound(feedback);
  setState(updateSubtraction(state, practice));
  if (feedback === 'correct') {
    app.querySelector('[data-action="subtraction-next"]')?.focus();
  } else if (fromInput) {
    const input = document.getElementById('subtraction-answer');
    input.value = answer;
    input.focus({ preventScroll: true });
    input.select();
  } else {
    app.querySelector(`[data-action="subtraction-answer"][data-answer="${answer}"]`)?.focus({ preventScroll: true });
  }
}

function handleAction(action, el) {
  switch (action) {
    case 'subtraction-levels':
      setState(goToScreen(state, 'subtraction-levels'));
      break;

    case 'subtraction-level': {
      const level = Number(el.dataset.level);
      if (!isSubtractionLevelUnlocked(state.subtraction, level)) break;
      const round = state.subtraction.round;
      const practice = round && !round.complete && round.levelIndex === level
        ? state.subtraction : startSubtractionRound(state.subtraction, Date.now(), level);
      setState(updateSubtraction(goToScreen(state, 'subtraction'), practice));
      focusSubtraction();
      break;
    }

    case 'subtraction-open':
    case 'subtraction-start': {
      const practice = action === 'subtraction-start' || !state.subtraction.round || state.subtraction.round.complete
        ? startSubtractionRound(state.subtraction, Date.now(), action === 'subtraction-start' ? state.subtraction.round?.levelIndex : state.subtraction.levels.currentLevelIndex)
        : state.subtraction;
      setState(updateSubtraction(goToScreen(state, 'subtraction'), practice));
      focusSubtraction();
      break;
    }

    case 'subtraction-answer':
      checkSubtractionAnswer(Number(el.dataset.answer));
      break;

    case 'subtraction-next': {
      const practice = nextSubtractionQuestion(state.subtraction);
      if (practice === state.subtraction) break;
      if (practice.round.complete) pendingCelebrate = true;
      setState(updateSubtraction(state, practice));
      focusSubtraction();
      break;
    }

    case 'multiplication-tables':
      setState(goToScreen(state, 'tables'));
      break;

    case 'multiplication-start':
      setState(updateMultiplication(
        goToScreen(state, 'multiplication'),
        startMultiplicationRound(state.multiplication, Number(el.dataset.table), Date.now())
      ));
      focusMultiplication();
      break;

    case 'multiplication-resume':
      setState(goToScreen(state, 'multiplication'));
      focusMultiplication();
      break;

    case 'multiplication-next': {
      const practice = nextMultiplicationQuestion(state.multiplication);
      if (practice === state.multiplication) break;
      if (practice.round.complete) pendingCelebrate = true;
      setState(updateMultiplication(state, practice));
      focusMultiplication();
      break;
    }

    case 'multiplication-hint': {
      const answer = document.getElementById('multiplication-answer')?.value ?? '';
      playSound('hint');
      setState(updateMultiplication(state, requestMultiplicationHint(state.multiplication)));
      focusMultiplication(answer);
      break;
    }

    case 'continue':
    case 'nav-play':
      setState(goToScreen(state, 'play'));
      break;

    case 'home':
    case 'nav-home':
      setState(goToScreen(state, 'home'));
      break;

    case 'levels':
      setState(goToScreen(state, 'levels'));
      break;

    case 'nav-rewards':
      setState(goToScreen(state, 'rewards'));
      break;

    case 'filter-rewards':
      setState({
        ...state,
        rewardFilter: el.dataset.rewardFilter ?? 'all',
      });
      break;

    case 'open-reward': {
      const groupIndex = Number(el.dataset.rewardGroup);
      const itemIndex = Number(el.dataset.rewardIndex);
      const reward = REWARD_GROUPS[groupIndex]?.items[itemIndex];
      if (!reward || !isRewardUnlocked(reward)) break;

      setState({
        ...state,
        screen: 'reward-detail',
        rewardGroupIndex: groupIndex,
        rewardItemIndex: itemIndex,
      });
      break;
    }

    case 'nav-progress':
      setState(goToScreen(state, 'progress'));
      break;

    case 'parent':
      setState(goToScreen(state, 'parent'));
      break;

    case 'goto-level':
      setState(goToLevel(state, Number(el.dataset.level)));
      break;

    case 'hint':
      playSound('hint');
      setState(requestHint(state));
      break;

    case 'undo':
      setState(undoLast(state));
      break;

    case 'check': {
      const result = submitAnswer(state);
      if (result.feedback === 'correct' || result.feedback === 'levelComplete') {
        playSound('correct');
        pendingCelebrate = true;
      } else if (result.feedback === 'wrong') {
        playSound('wrong');
      }
      setState(result);
      app.querySelector('[data-action="next-puzzle"], [data-action="next-level"]')?.focus({ preventScroll: true });
      break;
    }

    case 'next-puzzle':
      setState(nextPuzzle(state));
      app.querySelector('.wheel-slice')?.focus({ preventScroll: true });
      break;

    case 'next-level':
      setState(nextLevel(state));
      app.querySelector('.wheel-slice')?.focus({ preventScroll: true });
      break;

    case 'unlock-parent': {
      const input = document.getElementById('parent-code');
      if (input && Number(input.value) === 96) {
        setState(unlockParent(state));
      } else {
        document.getElementById('parent-feedback').textContent = 'Ikke helt riktig. Prøv igjen.';
        input?.setAttribute('aria-invalid', 'true');
        input?.focus();
        input?.select();
        input?.classList.add('shake');
        setTimeout(() => input?.classList.remove('shake'), 400);
      }
      break;
    }

    case 'unlock-progress-level': {
      const select = document.getElementById('unlock-level-select');
      const minus = state.parentActivity === 'subtraction';
      const level = Number(select?.value);
      const next = minus ? updateSubtraction(state, unlockSubtractionToLevel(state.subtraction, level)) : unlockProgressToLevel(state, level);
      setState({ ...next, parentNotice: `${minus ? 'Minus' : 'Addisjon'}: nivå ${level} er åpent.` });
      break;
    }

    case 'reset-progress':
      if (window.confirm('Er du sikker? Dette sletter all fremgang.')) {
        resetProgress();
        state = createGame();
        render();
      }
      break;

    default:
      break;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
render();
