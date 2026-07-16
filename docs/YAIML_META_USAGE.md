# YAIML Meta Usage

StewAIrd uses YAIML internally as its private portfolio-command memory grammar.

## What That Means

- `SOT.md` is the control desk's current state.
- `ARCHITECTURE.md` is the durable shape of the portfolio-command layer.
- `MAINTAINER_GUIDE.md` is the command and validation guide.
- `AGENTS.md` is the operating contract for Codex sessions.
- `registry/projects.json` is the managed-project policy and machine-readable view of the workspace graph.
- `output/runs/` records operational portfolio-run history.
- Supporting docs separate inventory, capability interpretation, comparison, and adoption planning.

## What It Does Not Mean

- StewAIrd is not a public YAIML implementation.
- StewAIrd does not turn YAIML into a required schema, parser, SDK, database, or hosted service.
- StewAIrd does not replace downstream repositories' YAIML documents with a central copy.
- StewAIrd does not silently commit, push, publish, deploy, release, move repositories, or extract shared packages.

## Operating Rule

When StewAIrd learns from downstream repositories, it records portfolio evidence and operational run history in its own YAIML-style documents and `output/runs/`. Each downstream repository remains the canonical owner of its own project truth.

Inspect and Plan modes are read-only. Apply mode may perform bounded direct filesystem and command-execution work in managed repositories when the user's portfolio command clearly authorizes that scope. Commit, push, publish, release, deployment, repo moves, and package extraction still require separate explicit permission.
