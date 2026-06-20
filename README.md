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
      game.js         game state, rules, and transitions
test/
  game.test.js        baseline regression tests
  game.rules.test.js  rule and edge-case coverage
docs/
  agentic-ways-of-working.md  structured standards for agentic collaboration
```

## Current scope

- TBD as game design evolves.

## Notes

- Game engine is pure logic — no DOM access.
- All game state lives in memory; no backend required.
