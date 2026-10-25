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
      division.js     division rounds, equal-sharing hints, and progress rules
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
- **Minus** has 80 levels with ten questions each, a text field, and four answer buttons. Level 1 uses starting numbers 1–10 once each; the upper limit gradually grows to 160 on level 80. Each level uses ten distinct starting numbers near its upper limit. Answers are never negative. A seed and level determine both questions and answer order. Empty or invalid input does not count as a mistake.
- Wrong subtraction answers can be retried. The correct choice turns green and the explanation uses the actual difference (for example, 6 minus 3 is 3). The child advances with **Neste oppgave**, then sees a round summary and can play again.
- Completing a subtraction level unlocks the next and awards three stars for no mistakes, two for up to three mistakes, or one otherwise. Replaying keeps the best stars. Level selection shows open, completed, and locked levels, and can resume the active level. The parent area can unlock levels independently for addition and subtraction.
- Subtraction saves level stars and the continue level, as well as the existing completed-round count and best first-attempt score. Old completed rounds are recognized as level 1, using the best first-attempt score to award its initial stars (10: three; 7–9: two; otherwise one). The progress page measures completed levels for both addition and subtraction, from 0% to 100%; multiplication still measures independent answers.
- **Gangehagen** is a separate multiplication activity: choose any table from 1 to 10, type answers to ordinary multiplication questions, and grow a flower for each solved question.
- A round contains all factors 1–10 exactly once in a shuffled order. Wrong answers can be retried; optional dot groups explain multiplication through equal groups. There is no timer.
- Each table saves the number of completed rounds and the best number of answers correct on the first attempt without hints (out of 10). Multiplication progress is the sum of these ten best scores, shown as a percentage.
- After a multiplication round, a short repetition round revisits questions that needed hints or retries. A perfect round offers three recall questions. Repetition has its own question count and does not change the completed round's score.
- **Deling** offers divisors 1–10, with ten shuffled questions per round and whole-number answers 1–10. Wrong answers can be retried, and optional apple baskets illustrate equal sharing. Each divisor saves its best independent score and completed-round count; progress sums the ten best scores to a percentage.
- Completed progress is saved in localStorage. Active rounds can be resumed while the app remains open; reloading returns to the home screen and restarts unfinished subtraction, multiplication, and division rounds. Resetting progress clears all four activities. Older saves without subtraction data start at level 1; missing division progress starts at zero.
- The home screen presents four activity cards with start/resume actions. Navigation, question wording, and back controls are consistent; multiplication uses a × icon and division uses ÷. Rewards and the main star badge describe their addition scope explicitly.
- The addition wheel supports keyboard selection, shows the selected sum, and preserves solved answers and hints across navigation. Solved questions cannot be edited or submitted again; finishing level 80 returns to level selection.
- Pointer selection on the addition wheel suppresses the browser's rectangular SVG focus outline. Keyboard navigation retains a visible outline following the selected slice.
- Responsive layouts cover narrow phones, tablets, and short landscape screens. Phone cards are compact, subtraction controls stay within reach, and scrollable play areas keep actions accessible. Browser zoom, visible keyboard focus, and reduced-motion preferences are supported.

## Notes

- Game engine is pure logic — no DOM access.
- Active rounds live in memory; progress and settings use browser localStorage. No backend required.
