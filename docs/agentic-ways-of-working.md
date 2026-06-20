# Agentic Ways of Working

This document defines a shared operating system for human + agent development in this project.

## 1. Mission and constraints

- Build and evolve a frontend-only math game with stable, testable business rules.
- Prefer vanilla JS/HTML/CSS and keep dependencies minimal.
- Keep game rules deterministic and independent from rendering.
- Prioritize readability, small increments, and reversible changes.
- Browser localStorage as the data storage

## 2. Working agreement

### 2.1 Ownership model

- Human owns product direction, UX taste, and final acceptance.
- Agent owns implementation momentum, test discipline, and documentation updates.
- Decisions are recorded in this file or `README.md` when scope changes.

### 2.2 Branch and commit style

- All changes are done in the main branch. No need for feature branches.
- Commit in small slices with clear intent.
- Avoid mixed-purpose commits (rule changes and styling changes should be separate when possible).

## 3. Delivery lifecycle (every task)

1. **Understand**
   - Restate goal and identify impacted modules.
   - Identify behavioral risks before editing.
2. **Plan**
   - Choose smallest viable change that can be tested.
   - Define explicit acceptance checks.
3. **Implement**
   - Keep engine logic in `src/engine`.
   - Keep UI code in `src/main.js` and presentation in `styles.css`.
4. **Verify**
   - Run `npm test`.
   - For UI changes, run app locally and validate key interactions manually.
5. **Document**
   - Update `README.md` and this document if workflow or architecture changed.

## 4. Code boundaries

- `src/engine`: game state, rules, transitions — no DOM access.
- `src/main.js`: user actions, render cycle, and view mapping.
- `styles.css`: design system and responsive behavior.
- `test`: rule-level automated tests.

## 5. Testing policy

- Rule changes require tests in `test/game.rules.test.js`.
- New mechanics must include both happy-path and failure-path assertions.
- Bug fixes require a regression test first when practical.
- Manual play is optional for confidence, not a release gate.
- UI behavior can be validated manually, but business logic must be covered by automated tests.

## 6. Definition of done

A task is done only when all are true:

- Behavior is implemented and aligned with the requested rules.
- `npm test` passes.
- No dead code or temporary debugging artifacts remain.
- Documentation is updated for any workflow, architecture, or rule change.
- Handover note includes what changed, what was verified, and known follow-ups.

## 7. Change log template for handovers

Use this in agent final messages:

```md
## What changed
- ...

## Verification
- `npm test` → pass/fail
- Manual checks → ...

## Follow-ups
1. ...
```

## 8. Quality guardrails

- Prefer pure functions for rule checks and state transitions.
- Avoid hidden coupling between UI and engine internals.
- Prefer modern native HTML controls when they provide the intended behavior; use custom controls only when native controls cannot satisfy the need.
- Keep naming domain-specific.
- Keep files small and purpose-driven.

## 9. Next process upgrades

- Add browser-level tests (Playwright) once UI interactions stabilize.
- Introduce CI pipeline to run `npm test` on every push.
- Add a lightweight architecture decision log (`docs/adrs`) for non-trivial design changes.
