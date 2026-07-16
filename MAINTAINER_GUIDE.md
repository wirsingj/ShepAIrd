---
yaiml: 0.2
kind: maintainer
title: StewAIrd Maintainer Guide
purpose: Commands, validation, and safe operating procedure.
belongs-here: command reference, validation steps, troubleshooting, output locations, executor safety checks.
not-here: product direction, architecture explanation, downstream implementation detail.
durability: stable; update when commands, executor behavior, validation, generated outputs, or operating rules change.
read-with: SOT; Architecture.
update-when: scripts, portfolio command flow, registry reconciliation, run records, or safety boundaries change.
agent-guidance: Validate StewAIrd honestly. Preserve downstream user work. Do not overclaim Apply capability.
---

# StewAIrd Maintainer Guide

## Operator Model

Assume the human usually will not run StewAIrd directly. The normal operator is Codex working in this project folder, using StewAIrd as a thin local instruction router for registered apps.

Keep command surfaces boring and scriptable. Prefer generated evidence, handoff prompts, run records, validation commands, and clear block conditions over richer app UI, stored packet files, local audit engines, or autonomous behavior.

## Commands

Run from the StewAIrd repository root:

```powershell
npm install
npm run help
npm test
npm run build
npm run shell
npm run status
npm run threads
npm run all
npm run portfolio:inspect
npm run portfolio:plan
npm run portfolio:validate
npm run portfolio:apply
```

Direct CLI form:

```powershell
node src/cli.mjs help
node src/cli.mjs threads
node src/cli.mjs portfolio inspect "Audit all managed projects"
node src/cli.mjs portfolio validate "Validate all managed projects"
node src/cli.mjs portfolio plan "Plan the next YAIML-defined step for every active managed repository"
node src/cli.mjs portfolio plan "Plan a security audit campaign across all managed repositories"
node src/cli.mjs portfolio plan "Plan a performance pass across all managed repositories"
node src/cli.mjs portfolio apply "Continue one YAIML-defined step in every active managed repository"
node src/cli.mjs portfolio apply "Clean temporary ARCS-era manifests back to YAIML"
```

`npm run build` performs a dependency-free shell smoke check.

`npm run help` prints the supported thin command surface, including campaign handoff and resume behavior.

`npm run shell` opens the local Electron command hub. Use **Scan workspace fleet** for the parent workspace, then use the Portfolio command box for Inspect, Plan, or Apply.

The shell is convenience infrastructure, not the center of the product. Do not expand it unless the change makes Codex-driven portfolio work clearer or safer.

Generated reports and records are written under `output/`:

- `output/project-status.md`
- `output/capability-map.md`
- `output/codex-task-map.md`
- `output/runs/*.json`
- `output/runs/*.md`

Campaign handoff context is not stored as packet files. Run records are operational evidence, not proof that downstream audit/fix work happened.

## Safe Workflow

1. Re-read `../YAIML/docs/SoTY.md`.
2. Review `yaiml.yml`.
3. Review `registry/projects.json`.
4. Run `npm test`.
5. Run `npm run build`.
6. Run `npm run all`.
7. Run `npm run portfolio:inspect`.
8. Inspect run records before using Apply on real downstream repositories.

## Cross-Chat Resilience

Assume any managed repository may have changed in its own Codex chat since the last StewAIrd run. Start with portfolio Inspect when scope is unclear:

```powershell
node src/cli.mjs portfolio inspect "Check current registry state after external repo work"
```

Use the reported Git branch, short HEAD, dirty state, YAIML manifest, and validation plan as the fresh source of truth. Do not rely on this chat remembering the latest state of each individual app.

Each portfolio run compares selected repositories with the most recent prior run record in `output/runs/`. Treat `Since previous run` as change detection, not proof of who or what made the change.

To resume a matching interrupted run, include `resume` in the command text or call `runPortfolioCommand` with `resume: true`. Resume skips only repositories previously marked `completed` or `dispatched`; it does not skip `planned`, `blocked`, or `failed` entries.

Registry entries may include optional `codexThread` metadata when a stable repo task is known:

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

Do not infer or auto-write thread IDs from fuzzy task titles. Add this metadata only when the intended repo task is confirmed.

Before sending portfolio work to existing Codex repo tasks, run:

```powershell
npm run threads
```

Use the report to confirm mapped/unmapped repositories and task cwd compatibility. A clean task map does not mean the repo task is current; still run portfolio Inspect or Validate when stale worktree state matters.

When the question is "did the portfolio still validate after work happened elsewhere?", prefer validation mode before Apply:

```powershell
node src/cli.mjs portfolio validate "Validate current registry after external repo work"
```

For multi-package repositories, keep registry validation entries tied to their actual working directories:

```json
{ "command": "npm run build", "cwd": "frontend" }
```

Manual or engine-dependent checks may be recorded with `"kind": "manual"` when StewAIrd should acknowledge them without trying to execute placeholder prose as a shell command.

## Campaign Lenses

Plan-mode campaign lenses are implemented as read-only ephemeral handoff context for:

- `security`
- `performance`
- `bug-check` / code-pattern review
- `architecture`
- `readability`
- `release-readiness`
- `test-coverage`
- `docs-drift`
- `yaiml`

For each selected repository, campaign handoff context includes:

- the inferred lens and why it applies;
- the repository's current Git branch/head/dirty state;
- YAIML documents to read first;
- repo-specific audit surfaces from registry evidence, document paths, capabilities, project kind, notes, bounded file inventory, and package scripts;
- safe-fix boundaries;
- validation commands with working directories;
- when to update YAIML;
- when to block for human judgment.

Do not implement broad Apply behavior for a lens inside StewAIrd. A lens should normally become a Codex handoff to the target repo context. Deterministic local Apply behavior is appropriate only for tiny support utilities such as validation, manifest cleanup, or run-note maintenance.

Campaign Apply accepts a programmatic `handoffDispatcher` hook. In tests this proves the thin dispatch contract without tying StewAIrd's core to the Codex app. Without that hook, CLI campaign Apply blocks and records the prepared handoff prompt/context.

Docs-drift and YAIML campaign handoff context also includes shallow content signals: declared YAIML document presence/headings, README presence/headings, and possible stale terminology. Treat these as pointers for Codex inspection, not as completed findings.

Current limitation: campaign handoff context inspects bounded file inventories, package scripts, and shallow docs/YAIML signals, but CLI/Electron do not yet locate/message repo-specific Codex chats, inspect source contents deeply, or produce findings by themselves. The next useful improvement is a thin Codex app thread adapter.

When a campaign needs reasoning or implementation beyond deterministic local edits, prefer sending precise Codex handoff context rather than expanding StewAIrd into a general-purpose agent or writing packet files.

## Apply Safety

An explicit Apply command authorizes only the requested bounded work in active managed repositories.

Additional explicit permission is still required for:

- commits;
- pushes;
- pull requests;
- publishing;
- deployment;
- releases;
- repository renames or moves;
- dependency/provider/model installation;
- shared-package extraction.

The direct executor blocks validation commands that attempt `git commit`, `git push`, `git reset`, `git clean`, `git checkout`, deploy, publish, or release operations.

Dirty worktrees are not automatic blockers. Inspect the changes and proceed only when StewAIrd's work can be isolated safely.

## Validation Checklist

Run after meaningful changes:

```powershell
npm test
npm run build
npm run all
npm run portfolio:inspect
```

Focused checks:

```powershell
rg "ARCS|arcs|SoTA|../ARCS|docs/ARCS_META_USAGE"
rg "does not edit downstream|only emits|packet files|work packets are execution"
rg "git commit|git push|deploy|publish|release"
```

Expected remaining ARCS hits should be temporary-rename cleanup support only.

## Troubleshooting

- If a registered repo is missing, run portfolio Inspect and compare reconciliation output against `registry/projects.json`.
- If a document is reported missing, check the repository's `yaiml.yml` before adding or hardcoding a state document path.
- If `arcs.yml` exists without `yaiml.yml`, treat it as a temporary ARCS-era cleanup signal.
- If both `arcs.yml` and `yaiml.yml` exist in a downstream repo, stop for manual reconciliation.
- If validation fails, report the repository blocker and continue unrelated repositories when safe.
- If an upstream dependency blocks, skip dependent repositories in that run.
- If an Apply command would require arbitrary coding work or judgment-heavy audit work, dispatch it to Codex repo context when a dispatcher exists; otherwise block honestly.
