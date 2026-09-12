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
last-verified: not established; claims not rechecked in this refresh.
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

1. Consult the YAIML reference supplied at run time, using committed content at the requested revision when pinned.
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
    "projectId": "<workspace-root>/repo-name",
    "hostId": "local",
    "label": "repo-name",
    "path": "<workspace-root>/repo-name",
    "kind": "local"
  },
  "codexThread": {
    "threadId": "opaque-codex-thread-id",
    "hostId": "local",
    "title": "Human-readable task title",
    "cwd": "<workspace-root>/repo-name",
    "scopePath": "<workspace-root>/repo-name"
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

Provide the YAIML reference from the human prompt, workspace context, or a team-approved source at run time. Do not commit machine-specific reference paths, local drive names, user profile paths, `file://` URIs, localhost URLs, private workspace URLs, secrets, private transcripts, or raw sensitive logs into versioned project memory. This repository is public, so treat that rule as a disclosure boundary, not a style preference.

### Path Disclosure Status

Prior inspection found the maintainer's user-profile path committed in this guide's and `README.md`'s routing examples. This guide now uses `<workspace-root>/repo-name`; README uses a neutral drive placeholder. Two maintainer decisions remain open:

- The working tree is clean of that path in both files, but **committed Git history still contains it** and this repository is public. Removal means a history rewrite, a force push, and re-cloning by anyone holding a copy. Do not attempt it during a documentation or YAIML pass.
- `registry/projects.json` still holds the profile path in live `codexProject.projectId`, `codexProject.path`, and `codexThread.cwd` values plus a `generatedFrom` note. These are routing identifiers that `npm run threads` compares against registry paths, so decide the routing question first — move absolute paths to ignored local configuration, or accept the disclosure knowingly. Do not blind-replace them with placeholders.

For convention-refresh and compression request meanings, follow [AGENTS.md](AGENTS.md#yaiml-project-memory). Obtain the reference at run time; request one if unavailable. Compare its update and init guidance with the existing pointer and maintenance procedures. Preserve discovery layout, version, paths, custom fields, and project knowledge. Do not copy the reference's prompt/template inventory without a concrete local need.

Apply the pointer's synthesis rules to affected memory, compress safely first, and report counts, necessary growth, and retained overages outside memory. Verify affected links, discovery paths, stable headers, sensitive-content handling, and instruction scope. Repeat the comparison to ensure healthy files stay unchanged. Report configured persistence separately from observed fresh-session loading; do not infer automatic writing or sustained pruning from a read-only check.

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

See [Architecture](ARCHITECTURE.md#campaign-lenses) for supported Plan-mode lenses and the dispatch contract.

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

Use a configured `handoffDispatcher` for campaign Apply; without it the CLI blocks and records prepared context. Delegate reasoning and implementation to Codex in the target repository. Limit direct Apply to tiny support utilities such as validation, manifest cleanup, and run-note maintenance.

Docs-drift and YAIML campaign handoff context also includes shallow content signals: declared YAIML document presence/headings, README presence/headings, and possible stale terminology. Treat these as pointers for Codex inspection, not as completed findings.

CLI/Electron do not locate/message repo-specific Codex chats or produce deep findings themselves. Keep handoffs ephemeral; do not add packet files or a general-purpose agent. Current development priorities belong in [SOT](SOT.md#next-five-steps).

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
