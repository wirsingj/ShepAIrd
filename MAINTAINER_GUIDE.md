---
yaiml: 0.2
kind: maintainer
title: ShepAIrd Maintainer Guide
purpose: Commands, validation, and safe operating procedure.
belongs-here: command reference, validation steps, troubleshooting, output locations, executor safety checks.
not-here: product direction, architecture explanation, downstream implementation detail.
durability: stable; update when commands, executor behavior, validation, generated outputs, or operating rules change.
budget: About 1600 words; prefer replacing stale procedures over appending.
read-with: SOT; Architecture.
update-when: scripts, portfolio command flow, registry reconciliation, run records, or safety boundaries change.
agent-guidance: Validate ShepAIrd honestly. Preserve downstream user work. Do not overclaim Apply capability.
---

# ShepAIrd Maintainer Guide

## Operator Model

Assume the human usually will not run ShepAIrd directly. The normal operator is Codex working in this project folder, using ShepAIrd as a thin local instruction router for registered apps.

Keep command surfaces boring and scriptable. Prefer generated evidence, handoff prompts, run records, validation commands, and clear block conditions over richer app UI, stored packet files, local audit engines, or autonomous behavior.

## Commands

Run from the ShepAIrd repository root:

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

Assume any managed repository may have changed in its own Codex chat since the last ShepAIrd run. Start with portfolio Inspect when scope is unclear:

```powershell
node src/cli.mjs portfolio inspect "Check current registry state after external repo work"
```

Use the reported Git branch, short HEAD, dirty state, YAIML manifest, and validation plan as the fresh source of truth. Do not rely on this chat remembering the latest state of each individual app.

Each portfolio run compares selected repositories with the most recent prior run record in `output/runs/`. Treat `Since previous run` as change detection, not proof of who or what made the change.

To resume a matching interrupted run, include `resume` in the command text or call `runPortfolioCommand` with `resume: true`. Resume skips only repositories previously marked `completed` or `dispatched`; it does not skip `planned`, `blocked`, or `failed` entries.

Registry entries may include optional `codexProject` metadata when a saved repo-root Codex Project is known, plus optional `codexThread` metadata when a stable repo touchpoint task is known:

```json
{
  "codexProject": {
    "projectId": "C:\\Users\\wirsi\\OneDrive\\Desktop\\git\\repo-name",
    "hostId": "local",
    "label": "repo-name",
    "path": "C:\\Users\\wirsi\\OneDrive\\Desktop\\git\\repo-name",
    "kind": "local"
  },
  "codexThread": {
    "threadId": "opaque-codex-thread-id",
    "hostId": "local",
    "title": "Human-readable task title",
    "cwd": "C:\\Users\\wirsi\\OneDrive\\Desktop\\git\\repo-name",
    "scopePath": "C:\\Users\\wirsi\\OneDrive\\Desktop\\git\\repo-name"
  }
}
```

Do not infer or auto-write Project or thread IDs from fuzzy titles. Add this metadata only when the intended saved Project or repo task is confirmed from Codex app metadata. Omit `scopePath` when the task cwd is already the repository root. Use `scopePath` only for explicit parent-workspace exceptions, and only when it exactly matches the intended registry path. Do not auto-create parent-workspace tasks merely to eliminate an unmapped count.

Before sending portfolio work to existing Codex repo tasks, run:

```powershell
npm run threads
```

Use the report to confirm saved/missing Codex Projects, mapped/unmapped touchpoint tasks, Project path compatibility, task cwd or scope-path compatibility, and setup-needed guidance. A clean route map does not mean the repo task is current; still run portfolio Inspect or Validate when stale worktree state matters.

Treat mapped Codex tasks as soft routes. Before dispatching broad work, confirm:

- `npm run threads` shows zero route mismatches;
- each durable route uses a repo-root Codex Project when available;
- parent-workspace tasks have an exact `scopePath`;
- the handoff prompt includes the Routing guard section;
- waiting-on-approval or interrupted tasks are followed up before assuming work continues.

If a repo is missing a saved Project or touchpoint task, prefer reporting it cleanly. Create new sidebar tasks only when the human explicitly wants that sidebar home, and prefer creating them inside saved repo-specific Codex Projects rather than the parent `git` Project.

## YAIML Maintenance

Requests such as "update YAIML", "updated YAIML", or "check new YAIML" mean: compare ShepAIrd's local YAIML setup against a human-provided, workspace-local, or team-approved reference; refresh compatible guidance; preserve project-specific memory; and keep the existing discovery layout and version marker unless the human explicitly asks for a migration.

Requests such as "clean up YAIML", "compress YAIML", "compact project memory", "prune project memory", or "prune SoT" mean: remove stale, repetitive, resolved, or log-like memory while preserving current truth, human direction, evidence, uncertainty, active risks, and useful lessons.

Keep machine-specific reference paths, local drive names, user-profile paths, `file://` URIs, localhost URLs, secrets, private transcripts, raw sensitive logs, and confidential material out of versioned memory. Distinguish configured persistent instructions from observed fresh-session loading.

When the question is "did the portfolio still validate after work happened elsewhere?", prefer validation mode before Apply:

```powershell
node src/cli.mjs portfolio validate "Validate current registry after external repo work"
```

For multi-package repositories, keep registry validation entries tied to their actual working directories:

```json
{ "command": "npm run build", "cwd": "frontend" }
```

Manual or engine-dependent checks may be recorded with `"kind": "manual"` when ShepAIrd should acknowledge them without trying to execute placeholder prose as a shell command.

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
- the Routing guard with repository scope, saved Codex Project, mapped touchpoint task, cwd, and optional scope path;
- the repository's current Git branch/head/dirty state;
- YAIML documents to read first;
- repo-specific audit surfaces from registry evidence, document paths, capabilities, project kind, notes, bounded file inventory, and package scripts;
- safe-fix boundaries;
- validation commands with working directories;
- when to update YAIML;
- when to block for human judgment.

Do not implement broad Apply behavior for a lens inside ShepAIrd. A lens should normally become a Codex handoff to the target repo context. Deterministic local Apply behavior is appropriate only for tiny support utilities such as validation, manifest cleanup, or run-note maintenance.

Campaign Apply accepts a programmatic `handoffDispatcher` hook. In tests this proves the thin dispatch contract without tying ShepAIrd's core to the Codex app. Without that hook, CLI campaign Apply blocks and records the prepared handoff prompt/context.

Docs-drift and YAIML campaign handoff context also includes shallow content signals: declared YAIML document presence/headings, README presence/headings, and possible stale terminology. Treat these as pointers for Codex inspection, not as completed findings.

Current limitation: campaign handoff context inspects bounded file inventories, package scripts, and shallow docs/YAIML signals, but CLI/Electron do not yet locate/message repo-specific Codex chats, inspect source contents deeply, or produce findings by themselves. The next useful improvement is a thin Codex app thread adapter.

When a campaign needs reasoning or implementation beyond deterministic local edits, prefer sending precise Codex handoff context rather than expanding ShepAIrd into a general-purpose agent or writing packet files.

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

Dirty worktrees are not automatic blockers. Inspect the changes and proceed only when ShepAIrd's work can be isolated safely.

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
