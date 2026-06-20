// UI rendering and user action wiring
import {
  createGame, getCurrentPuzzle, selectPiece, undoLast,
  submitAnswer, requestHint, nextPuzzle, nextLevel, goToLevel, goToScreen,
  updateSetting, unlockParent, resetProgress, getSkillProgress,
  LEVEL_COUNT, PUZZLES_PER_LEVEL, PIECE_COLORS, REWARD_GROUPS,
} from './engine/game.js';

let state = createGame();
const app = document.getElementById('app');

// ── Sound ─────────────────────────────────────────────────────────────────────

function playSound(type) {
  if (!state.settings.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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

    slices += `<path d="${slicePath(cx, cy, r, startDeg, endDeg)}" fill="${fill}" stroke="white" stroke-width="3" class="wheel-slice${selected.has(i) ? ' sel' : ''}" data-index="${i}" />`;
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

  return `<svg class="wheel-svg${animClass}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tallhjul med ${n} deler">
    ${slices}${labels}${centerCircle}
  </svg>`;
}

// ── Celebration overlay ───────────────────────────────────────────────────────

function celebrate() {
  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay';
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

// ── Screen renderers ──────────────────────────────────────────────────────────

function renderBottomNav() {
  const s = state.screen === 'reward-detail' ? 'rewards' : state.screen;
  const btns = [
    { action: 'nav-home',     icon: '🏠', label: 'Hjem',        screen: 'home'     },
    { action: 'nav-play',     icon: '▶️',  label: 'Spill',       screen: 'play'     },
    { action: 'nav-rewards',  icon: '🎁', label: 'Belønninger', screen: 'rewards'  },
    { action: 'nav-progress', icon: '📊', label: 'Fremgang',    screen: 'progress' },
  ];
  return `<nav class="bottom-nav">
    ${btns.map(b => `
      <button class="nav-btn${s === b.screen ? ' active' : ''}" data-action="${b.action}">
        <span class="nav-icon">${b.icon}</span>
        <span class="nav-label">${b.label}</span>
      </button>`).join('')}
  </nav>`;
}

function renderHome() {
  return `
    <div class="screen screen-home">
      <div class="home-hero">
        <div class="app-logo">
          <span class="app-logo-icon">🎡</span>
          <div>
            <div class="app-title">Mattelek</div>
            <div class="app-subtitle">Matte er gøy å lære!</div>
          </div>
        </div>
        <span class="mascot">🦊</span>
      </div>

      <nav class="home-menu">
        <button class="menu-btn btn-continue" data-action="continue">
          <span class="btn-icon">▶️</span>
          <div>
            <div class="btn-label">Fortsett</div>
            <div class="btn-sub">Nivå ${state.currentLevelIndex + 1}</div>
          </div>
        </button>
        <button class="menu-btn btn-levels" data-action="levels">
          <span class="btn-icon">📚</span>
          <div class="btn-label">Velg nivå</div>
        </button>
        <button class="menu-btn btn-daily" data-action="daily">
          <span class="btn-icon">🎁</span>
          <div class="btn-label">Dagsutfordring</div>
        </button>
        <button class="menu-btn btn-parent" data-action="parent">
          <span class="btn-icon">👨‍👩‍👧</span>
          <div class="btn-label">Foreldreområde</div>
        </button>
      </nav>
    </div>
    ${renderBottomNav()}`;
}

function renderPlay() {
  const puzzle      = getCurrentPuzzle(state);
  const levelNum    = state.currentLevelIndex + 1;
  const puzzleNum   = state.currentPuzzleIndex + 1;
  const earnedStars = state.levelStars[state.currentLevelIndex] ?? 0;
  const isCorrect   = state.feedback === 'correct' || state.feedback === 'levelComplete';

  const starsHtml = `<span class="star-display">
    ${[1,2,3].map(n => `<span class="star">${earnedStars >= n ? '⭐' : '☆'}</span>`).join('')}
  </span>`;

  // 10 progress dots for puzzles within the current level.
  const dotsHtml = `<div class="progress-dots">
    ${Array.from({ length: PUZZLES_PER_LEVEL }, (_, i) => {
      const done    = i < state.currentPuzzleIndex || (isCorrect && i === state.currentPuzzleIndex);
      const current = !done && i === state.currentPuzzleIndex;
      return `<span class="pdot${done ? ' done' : current ? ' current' : ''}"></span>`;
    }).join('')}
  </div>`;

  const instruction = puzzle.connected
    ? `Finn tallene som gir <strong>${puzzle.target}</strong> — de må henge sammen!`
    : `Finn tallene som gir <strong>${puzzle.target}</strong>`;

  let feedbackHtml = '';
  if (state.feedback === 'levelComplete') {
    const stars = state.levelStars[state.currentLevelIndex] ?? 1;
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
      <span>Prøv en annen brikke!</span>
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
    ? `<button class="action-btn btn-next" data-action="next-level">Neste nivå →</button>`
    : state.feedback === 'correct'
    ? `<button class="action-btn btn-next" data-action="next-puzzle">Neste →</button>`
    : `<button class="action-btn btn-hint"  data-action="hint">💡 Tips</button>
       <button class="action-btn btn-undo"  data-action="undo">↩ Angre</button>
       <button class="action-btn btn-check" data-action="check">✓ Sjekk</button>`;

  return `
    <div class="screen screen-play">
      <header class="play-header">
        <div class="play-header-top">
          <button class="back-btn" data-action="home">←</button>
          <div class="level-info">
            <span class="level-name">Nivå ${levelNum}</span>
            ${starsHtml}
          </div>
          <span class="puzzle-counter">${puzzleNum} / ${PUZZLES_PER_LEVEL}</span>
        </div>
        ${dotsHtml}
      </header>

      <main class="play-main">
        <p class="instruction">${instruction}</p>
        <div class="wheel-container">
          ${renderWheel(puzzle, state.selectedPieces, state.feedback)}
        </div>
        ${feedbackHtml}
      </main>

      <footer class="action-bar">${actionHtml}</footer>
    </div>`;
}

function renderLevelSelect() {
  return `
    <div class="screen screen-levels">
      <header class="sub-header">
        <button class="back-btn" data-action="home">←</button>
        <h2>Velg nivå</h2>
        <span class="puzzle-counter" style="margin-left:auto">${Object.keys(state.levelStars).length} / ${LEVEL_COUNT}</span>
      </header>
      <div class="level-grid">
        ${Array.from({ length: LEVEL_COUNT }, (_, i) => {
          const s      = state.levelStars[i] ?? 0;
          const locked = i > state.currentLevelIndex && !state.levelStars[i];
          return `<button class="level-card${locked ? ' locked' : ''}${i === state.currentLevelIndex ? ' current' : ''}"
                    data-action="goto-level" data-level="${i}" ${locked ? 'disabled' : ''}>
            <div class="level-card-num">${i + 1}</div>
            <div class="level-card-stars">${s > 0 ? [1,2,3].map(n => s >= n ? '⭐' : '·').join('') : ''}</div>
          </button>`;
        }).join('')}
      </div>
    </div>
    ${renderBottomNav()}`;
}

function renderProgress() {
  const skill         = getSkillProgress(state);
  const totalCompleted = Object.keys(state.levelStars).length;

  const skillRows = [
    { key: 'addition',  label: 'Addisjon',    emoji: '➕', color: '#7C3AED' },
    { key: 'bonds',     label: 'Tallpar',      emoji: '🔢', color: '#0284C7' },
    { key: 'connected', label: 'Mønster',      emoji: '🧩', color: '#16A34A' },
    { key: 'challenge', label: 'Utfordring',   emoji: '⚡', color: '#EA580C' },
  ].map(r => `
    <div class="skill-row">
      <span class="skill-emoji">${r.emoji}</span>
      <div class="skill-info">
        <div class="skill-label">${r.label}</div>
        <div class="skill-bar-track">
          <div class="skill-bar-fill" style="width:${skill[r.key]}%;background:${r.color}"></div>
        </div>
      </div>
      <span class="skill-pct">${skill[r.key]}%</span>
    </div>`).join('');

  const badgeRows = [];
  if (totalCompleted >= 1) badgeRows.push({ icon: '🏆', label: 'Fullfører' });
  if (state.totalStars >= 5) badgeRows.push({ icon: '⚡', label: 'Rask tenker' });
  if (totalCompleted >= 3) badgeRows.push({ icon: '🧩', label: 'Løser' });
  if (state.totalStars >= 10) badgeRows.push({ icon: '🌟', label: 'Superstjerne' });
  if (state.totalStars >= 20) badgeRows.push({ icon: '👑', label: 'Mester' });

  return `
    <div class="screen screen-progress">
      <header class="sub-header"><h2>Fremgang</h2></header>

      <div class="progress-hero">
        <div class="total-stars-badge">
          <span class="tsbadge-icon">⭐</span>
          <div>
            <div class="tsbadge-num">${state.totalStars}</div>
            <div class="tsbadge-label">Stjerner totalt</div>
          </div>
        </div>
        <div class="level-badge">
          <div class="lbadge-label">Nivå</div>
          <div class="lbadge-num">${state.currentLevelIndex + 1}</div>
        </div>
      </div>

      <div class="skill-section">
        <div class="section-title">Ferdigheter</div>
        ${skillRows}
      </div>

      <div class="recent-section">
        <div class="section-title">Merker</div>
        ${badgeRows.length
          ? `<div class="badge-row">${badgeRows.map(b => `
              <div class="badge-item">
                <span class="badge-icon">${b.icon}</span>
                <span class="badge-label">${b.label}</span>
              </div>`).join('')}</div>`
          : `<p class="no-badges">Fullfør nivåer for å tjene merker!</p>`}
      </div>

      <div class="bear-mascot">🐻 Kjempebra! Du gjør det bra!</div>
    </div>
    ${renderBottomNav()}`;
}

function renderRewards() {
  const totalRewards = REWARD_GROUPS.reduce((s, g) => s + g.items.length, 0);
  const unlockedCount = REWARD_GROUPS.reduce((s, g) =>
    s + g.items.filter(r => r.unlockLevel === 0 || !!state.levelStars[r.unlockLevel - 1]).length, 0);

  // Next reward to unlock (motivational hint)
  const allItems = REWARD_GROUPS.flatMap(g => g.items);
  const nextReward = allItems
    .filter(r => r.unlockLevel > 0 && !state.levelStars[r.unlockLevel - 1])
    .sort((a, b) => a.unlockLevel - b.unlockLevel)[0];

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

      ${nextReward ? `<div class="next-reward-banner">
        <span class="next-reward-label">Neste: </span>
        <span class="next-reward-emoji">${nextReward.emoji}</span>
        <span class="next-reward-name">${nextReward.name}</span>
        <span class="next-reward-level">— fullfør nivå ${nextReward.unlockLevel}</span>
      </div>` : `<div class="next-reward-banner next-reward-done">🏆 Alle belønninger funnet!</div>`}

      ${REWARD_GROUPS.map((group, groupIndex) => `
      <section class="rewards-section">
        <div class="section-title">${group.title}</div>
        <div class="rewards-grid">${group.items.map((r, itemIndex) => rewardCard(r, groupIndex, itemIndex)).join('')}</div>
      </section>`).join('')}
    </div>
    ${renderBottomNav()}`;
}

function renderRewardDetail() {
  const reward = getSelectedReward();
  if (!reward || !isRewardUnlocked(reward)) return renderRewards();

  return `
    <div class="screen screen-reward-detail">
      <header class="sub-header">
        <button class="back-btn" data-action="nav-rewards">←</button>
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
  if (!state.parentUnlocked) {
    return `
      <div class="screen screen-parent">
        <header class="sub-header">
          <button class="back-btn" data-action="home">←</button>
          <h2>Foreldreområde</h2>
        </header>
        <div class="parent-gate">
          <span class="gate-emoji">🔐</span>
          <p class="gate-text">Er du en voksen? Løs regnestykket under for å åpne dette området.</p>
          <div class="gate-puzzle">
            <span class="gate-question">Hva er <strong>9 × 6</strong>?</span>
            <input type="number" id="parent-code" class="gate-input" placeholder="Skriv svar her" min="0" max="999" />
            <button class="gate-btn" data-action="unlock-parent">Åpne →</button>
          </div>
        </div>
      </div>
      ${renderBottomNav()}`;
  }

  return `
    <div class="screen screen-parent">
      <header class="sub-header">
        <button class="back-btn" data-action="home">←</button>
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
          <h3>Rapport</h3>
          <div class="report-row"><span>Fullførte nivåer</span><strong>${Object.keys(state.levelStars).length} / ${LEVEL_COUNT}</strong></div>
          <div class="report-row"><span>Stjerner totalt</span><strong>${state.totalStars}</strong></div>
          <div class="report-row"><span>Nåværende nivå</span><strong>${state.currentLevelIndex + 1}</strong></div>
        </section>

        <section class="parent-section">
          <h3>Om appen</h3>
          <p class="parent-text">Mattelek er en matematikkapp for barn i alderen 5–8 år. Den øver på addisjon, tallpar og mønstergjenkjenning gjennom interaktive tallhjulpuslespill.</p>
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
    case 'progress': return renderProgress();
    case 'rewards':  return renderRewards();
    case 'reward-detail': return renderRewardDetail();
    case 'parent':   return renderParent();
    default:         return renderHome();
  }
}

let pendingCelebrate = false;

function render(isScreenTransition = false) {
  app.innerHTML = renderScreen();
  if (isScreenTransition) {
    const screenEl = app.querySelector('.screen');
    if (screenEl) screenEl.classList.add('entering');
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
    label.setAttribute('fill', sel ? c.textSelected : c.textIdle);
  }
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
      if (state.feedback === 'correct') return;
      playSound('select');
      state = selectPiece(state, Number(el.dataset.index));
      applyPieceSelection();
    });
  });

  // Labelled-action buttons
  app.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => handleAction(el.dataset.action, el));
  });

  // Settings toggles
  app.querySelectorAll('[data-setting]').forEach(el => {
    el.addEventListener('change', () => {
      setState(updateSetting(state, el.dataset.setting, el.checked));
    });
  });
}

function handleAction(action, el) {
  switch (action) {
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

    case 'daily':
      setState(goToLevel(state, state.dailyLevelIndex));
      break;

    case 'nav-rewards':
      setState(goToScreen(state, 'rewards'));
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
        feedback: null,
        hintText: null,
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
      break;
    }

    case 'next-puzzle':
      setState(nextPuzzle(state));
      break;

    case 'next-level':
      setState(nextLevel(state));
      break;

    case 'unlock-parent': {
      const input = document.getElementById('parent-code');
      if (input && Number(input.value) === 54) {
        setState(unlockParent(state));
      } else {
        input?.classList.add('shake');
        setTimeout(() => input?.classList.remove('shake'), 400);
      }
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
