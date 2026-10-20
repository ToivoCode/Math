# Mattelek

A browser-based math game built in plain JavaScript, HTML, and CSS.

## Tech choices

- No runtime dependencies — vanilla JS, HTML, CSS only
- Browser app with ES modules
- Pure game engine in `src/engine`
- Automated tests with Node's built-in `node:test`

## Quick start

```bash
npm test
npm run serve
```

Then open `http://localhost:8080`.

## Project structure

```
www/
  index.html          app shell
  styles.css          visual language and responsive layout
  src/
    main.js           UI rendering and user action wiring
    engine/
      game.js         game state, persistence, and addition rules
      multiplication.js  times-table rounds and progress rules
test/
  game.test.js        baseline regression tests
  game.rules.test.js  rule and edge-case coverage
docs/
  agentic-ways-of-working.md  structured standards for agentic collaboration
```

## Current scope

- 80 deterministic levels with 10 puzzles per level.
- Targets grow from small early sums to 160 on level 80.
- Generated addition puzzles require a varied mix of 2, 3, and 4 selected numbers.
- **Gangehagen** is a separate multiplication activity: choose any table from 1 to 10, type answers to ordinary multiplication questions, and grow a flower for each solved question.
- A round contains all factors 1–10 exactly once in a shuffled order. Wrong answers can be retried; optional dot groups explain multiplication through equal groups. There is no timer.
- Each table saves the number of completed rounds and the best number of answers correct on the first attempt without hints (out of 10). Multiplication progress is the sum of these ten best scores, shown as a percentage.
- Completed-round progress is saved in localStorage alongside existing addition progress. An active round can be resumed while the app remains open; reloading returns to the home screen. Resetting progress clears both activities.

## Notes

- Game engine is pure logic — no DOM access.
- Active rounds live in memory; progress and settings use browser localStorage. No backend required.
