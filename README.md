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
      subtraction.js  subtraction rounds, answer choices, and progress rules
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
- **Minus** is a separate subtraction activity with ten questions per round, a text field, and four answer buttons, styled with a blue sky, a fox, and a meadow. Children can type an answer and press Enter or **Sjekk svar**, or tap one of the choices. Empty or invalid input does not count as a mistake. Each round uses starting numbers 1–10 once each in shuffled order and subtracts a number from 0 to the starting number; answers are never negative. A seed determines both questions and answer order.
- Wrong subtraction answers can be retried. The correct choice turns green and the explanation uses the actual difference (for example, 6 minus 3 is 3). The child advances with **Neste oppgave**, then sees a round summary and can play again.
- Subtraction saves completed rounds and the best first-attempt score out of ten. The progress page shows that best score as a percentage; the parent report also shows completed rounds. Unfinished rounds can be resumed while the app stays open.
- **Gangehagen** is a separate multiplication activity: choose any table from 1 to 10, type answers to ordinary multiplication questions, and grow a flower for each solved question.
- A round contains all factors 1–10 exactly once in a shuffled order. Wrong answers can be retried; optional dot groups explain multiplication through equal groups. There is no timer.
- Each table saves the number of completed rounds and the best number of answers correct on the first attempt without hints (out of 10). Multiplication progress is the sum of these ten best scores, shown as a percentage.
- Completed-round progress is saved in localStorage alongside existing addition progress. Active multiplication and subtraction rounds can be resumed while the app remains open; reloading returns to the home screen. Resetting progress clears all three activities. Older saves load with zero subtraction progress.

## Notes

- Game engine is pure logic — no DOM access.
- Active rounds live in memory; progress and settings use browser localStorage. No backend required.
