# ShepAIrd

ShepAIrd is a private, local shepherding layer for guiding Codex work across a registered portfolio of repositories.

It is intentionally thin. ShepAIrd does not try to become a better coding model, a background agent swarm, or a replacement for each repository's own project memory. Its job is to help Codex and the human answer:

- Which repos are registered?
- What state are they in right now?
- Which validation commands should run for each repo?
- Which Codex task should receive repo-specific follow-up work?
- What changed since the last portfolio run?
- Where should a broad request like "run a bug-risk audit everywhere" be handed off?

The downstream repositories remain the source of truth for their own YAIML documents, code, risks, and validation evidence. ShepAIrd keeps track of where they are, what needs attention, and which Codex task should receive the next handoff.

## What It Does

Implemented capabilities:

- loads a managed project registry from `registry/projects.json`;
- discovers Git repositories under the configured workspace root;
- reconciles registered, discovered, missing, moved, inactive, and archived repositories;
- reads each repository's YAIML manifest when present;
- reports current Git branch, short HEAD, clean/dirty state, and manifest state;
- runs registered validation commands in the correct repository and optional subdirectory;
- blocks dangerous validation commands such as commit, push, reset, clean, deploy, publish, and release;
- interprets portfolio commands in Inspect, Plan, Validate, and bounded Apply modes;
- builds ephemeral Codex handoff context for campaign lenses such as security, performance, bug checks, architecture, readability, release readiness, test coverage, docs drift, and YAIML compliance;
- records portfolio run history under `output/runs/`;
- reports known Codex task mappings with `npm run threads`;
- includes a small Electron shell for scanning and command entry.

Not implemented, by design:

- broad autonomous coding across every repo;
- background task execution without a human/Codex command;
- stored campaign packet piles;
- automatic commits, pushes, releases, deploys, dependency installs, or repository moves;
- deep security or architecture findings without Codex doing the repo-specific review.

## Install

```powershell
npm install
```

Node 20 or newer is expected.

## Common Commands

```powershell
npm test
npm run build
npm run help
npm run status
npm run threads
npm run all
npm run portfolio:inspect
npm run portfolio:validate
npm run portfolio:plan
npm run portfolio:apply
```

Direct CLI form:

```powershell
node src/cli.mjs help
node src/cli.mjs status
node src/cli.mjs capabilities
node src/cli.mjs threads
node src/cli.mjs all
node src/cli.mjs portfolio inspect "Inspect all managed projects"
node src/cli.mjs portfolio validate "Validate all managed projects"
node src/cli.mjs portfolio plan "Plan a security audit across registered repos"
node src/cli.mjs portfolio apply "Continue one YAIML-defined step in every active managed repository"
```

## Portfolio Modes

Inspect is read-only. It reports current repository state, YAIML manifest status, dirty worktree state, and likely next steps.

Plan is read-only. It prepares repository-specific proposed work and ephemeral handoff context without claiming that work is complete.

Validate runs registered validation commands and records the run.

Apply is intentionally narrow. It can run implemented support actions, validation, temporary ARCS-to-YAIML manifest cleanup, and bounded YAIML continuation notes. General repository-specific fixes should be handed to the mapped Codex task for that repository.

## Codex Task Routing

Registry entries may include optional `codexThread` metadata:

```json
{
  "codexThread": {
    "threadId": "opaque-codex-thread-id",
    "hostId": "local",
    "title": "Human-readable task title",
    "cwd": "C:\\Users\\wirsi\\OneDrive\\Desktop\\git\\repo-name"
  }
}
```

Run:

```powershell
npm run threads
```

This prints mapped and unmapped repositories, verifies task cwd values against registry paths, and lists validation commands. It is a preflight report for Codex routing, not proof that any task was messaged or completed.

## Generated Output

`npm run all` writes:

- `output/project-status.md`
- `output/capability-map.md`
- `output/codex-task-map.md`

Portfolio runs write timestamped `.json` and `.md` records under `output/runs/`.

Generated output is operational evidence. It should not replace downstream YAIML documents as canonical project truth.

## Repository Layout

- `src/registry.mjs` - registry loading, inspection, status reports, capability maps, Codex task maps.
- `src/portfolio.mjs` - portfolio command interpretation, validation, bounded apply behavior, run records.
- `src/intake.mjs` - workspace scanning.
- `src/intakeView.mjs` - dependency-free rendering helpers for the shell.
- `src/cli.mjs` - command-line entrypoint.
- `shell/` - minimal Electron command hub.
- `registry/projects.json` - managed project registry.
- `SOT.md` - current project state.
- `ARCHITECTURE.md` - durable design and boundaries.
- `MAINTAINER_GUIDE.md` - operating procedure and validation.
- `yaiml.yml` - ShepAIrd's own YAIML memory index.

## Safety Boundaries

ShepAIrd may inspect registered repositories, run registered validation, generate reports, prepare handoff context, and perform implemented bounded support actions.

Separate explicit permission is required for:

- commits;
- pushes;
- pull requests;
- publishing;
- deployments;
- releases;
- repository renames or moves;
- dependency, provider, or model installation;
- shared-package extraction.

Dirty working trees are treated as evidence to preserve, not a reason to reset or clean.

## Validation Before Handoff

Before trusting a change:

```powershell
npm test
npm run build
npm run all
npm run portfolio:inspect
```

For registry-wide validation:

```powershell
node src/cli.mjs portfolio validate "Validate all managed projects"
```
