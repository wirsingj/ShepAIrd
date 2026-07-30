# Extraction And Adoption Plan

Do not extract code yet.

## Phase 1: Evidence

- Record source file paths that implement each provider/model boundary.
- Record validation and human-approval behavior after model output.
- Record provider health/status behavior.
- Record fallback behavior.

## Phase 2: Doctrine

Create a shared written contract first:

- provider request shape,
- provider response shape,
- status/health shape,
- validation responsibility,
- human approval responsibility,
- fallback responsibility.

## Phase 3: Pilot

Pick one consumer project and run a bounded Apply command or a separately approved repository-local task. ShepAIrd may prepare ephemeral Codex handoff context, but that context is not execution proof by itself.

## Phase 4: Extract Or Do Not

Only after the pilot, decide whether shared code is warranted. Some projects may need only a shared doctrine and fixtures.
