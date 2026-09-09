---
yaiml: 0.2
kind: architecture
title: ShepAIrd Architecture
purpose: Durable system shape, boundaries, data model, executor model, and invariants.
belongs-here: components, registry model, portfolio command flow, execution boundaries, data flow, danger zones.
not-here: volatile roadmap, command reference, full audit history.
durability: stable; update when registry shape, command flow, executor capability, or safety boundaries change.
budget: About 2000 words; preserve necessary invariants if exceeded.
read-with: SOT; Maintainer Guide; registry/projects.json.
update-when: registry semantics, workspace reconciliation, CLI/app responsibilities, run records, or executor boundaries change.
last-verified: not established; claims not rechecked in this refresh.
agent-guidance: Keep ShepAIrd request-driven, repository-specific, and honest about executor limits.
---

# ShepAIrd Architecture

## Boundary

ShepAIrd is a private, thin Codex instruction router for the human's managed repositories under the configured Git workspace. It is request-driven, not a background daemon, and not a model-replacement product.

Its core job is to give Codex a small deterministic local substrate for one human portfolio command: resolve scope, gather evidence, prepare ephemeral repo-specific handoff context, run registered validation, perform only tiny bounded support edits when explicitly implemented, and preserve each repository's own YAIML documents as the canonical project truth.

ShepAIrd is intentionally cross-chat tolerant: it must expect each managed repository may be changed, committed, validated, or partially dirtied by a separate Codex chat. The registry is routing policy, not a frozen mirror of repo truth; current Git and YAIML state must be read from disk every run.

ShepAIrd should also become a campaign translator for recurring Codex audit passes. A campaign lens is a human intent such as security, performance, bug check, architecture, readability, release readiness, test coverage, docs drift, or YAIML compliance. The lens supplies the question; each repository's YAIML and registry evidence supply the local meaning; Codex remains the reasoning and implementation layer for audit findings and product changes.

ShepAIrd may inspect, plan, dispatch, and, for implemented bounded Apply actions, directly execute filesystem and command work inside managed repositories. Direct execution should stay limited to support utilities such as validation, run notes, and manifest cleanup. It must not commit, push, publish, deploy, release, move repositories, install dependencies/providers, or extract shared packages without separate explicit permission.

## Components

- `yaiml.yml`: ShepAIrd's own YAIML memory index.
- `registry/projects.json`: managed-project policy, dependency order, registry paths, capabilities, validation commands, and evidence pointers.
- `src/registry.mjs`: registry loader, project inspector, status report builder, capability mapper, and Codex Project/task route-map reporter.
- `src/intake.mjs`: workspace/repo scanner used by the shell.
- `src/intakeView.mjs`: dependency-free Token Strip and dossier rendering helpers.
- `src/portfolio.mjs`: portfolio command interpreter, workspace discovery, registry reconciliation, YAIML manifest reader, direct executor, validation runner, blocker isolation, and run-record writer.
- `src/cli.mjs`: command-line surface for reports and portfolio commands.
- `shell/`: minimal Electron wrapper for workspace scanning and portfolio command execution; not the primary human interface.
- `output/`: generated reports and `output/runs/` portfolio run records.
- `docs/`: human-readable operating model, inventory, capability interpretation, comparison, and adoption notes.

## Portfolio Command Flow

```text
human command
  -> interpret mode: Inspect, Plan, Validate, or Apply
  -> infer optional campaign lens
  -> discover Git repositories under configured workspace
  -> reconcile discoveries with managed registry
  -> resolve selected active managed repositories
  -> order by dependency order
  -> compare each repository with the previous run record when available
  -> if resume is requested, skip previous matching completed/dispatched repositories
  -> read each repository's yaiml.yml or temporary arcs.yml
  -> inspect git branch/head/status and registered validation
  -> inspect, plan, validate, or apply one bounded action per repository
  -> validate each repository separately
  -> isolate blockers and skip blocked dependents
  -> write one run record and one portfolio report
```

## Command Modes

Inspect is read-only. It reports current repository state, YAIML manifest status, dirty worktree state, and likely next steps.

Plan is read-only. It produces repository-specific proposed work and ephemeral campaign handoff context, but it must not claim completion.

Validate is read-only with respect to repository source files. It runs registered validation commands and records the run.

Apply is bounded mutation. An explicit Apply command authorizes the requested managed repository scope for implemented direct executor actions only. Apply writes run records, may run registered validation, and may update downstream YAIML documents when project truth or run evidence changes.

## Campaign Lenses

Supported Plan-mode lenses:

- `yaiml`: current state, stale claims, missing or drifted YAIML docs, portable memory, validation records.
- `security`: secrets, permissions, generated-content safety, provider/API-key handling, local file exposure, release/package safety, privacy claims.
- `performance`: hot loops, build/runtime cost, rendering/capture loops, package size, expensive polling, engine-specific bottlenecks.
- `bug-check`: likely defects, risky code patterns, race conditions, stale state, edge cases, missing regression tests, failed validations.
- `architecture`: boundary drift, component ownership, provider/model seams, repo-specific invariants, overgrown controllers.
- `readability`: code clarity, naming, local duplication, confusing control flow, docs that would help future agents.
- `release-readiness`: package/build/release scripts, store or shipping docs, version drift, manual QA, generated artifacts.
- `test-coverage`: missing tests around high-risk behavior, brittle tests, validation gaps.
- `docs-drift`: README, maintainer, architecture, YAIML, and implementation disagreements.

Plan mode turns a lens into per-repo campaign handoff context inside the run result. It does not write stored packet files. Apply mode does not become broad autonomous repair simply because a lens exists.

Campaign handoff context currently uses registry metadata, YAIML manifest document paths, current Git state, validation commands, interface evidence, capabilities, project kind, notes, bounded file inventory, package-script summaries, and shallow docs/YAIML content signals for the docs-drift and YAIML lenses. It is input for Codex in the target repo context; it does not perform deep source-content analysis or produce completed audit findings by itself.

Campaign Apply can use an injected `handoffDispatcher` function. The dispatcher receives `{ project, command, handoff }`, where `handoff.prompt` is the exact repo-chat prompt to send. If no dispatcher is configured, campaign Apply blocks. A dispatched repository is reported as `dispatched`, not `completed`.

## Direct Executor

The current executor is direct filesystem plus child-process command execution. It is intentionally narrow support machinery:

- temporary `arcs.yml` to `yaiml.yml` manifest cleanup;
- bounded YAIML-continuation run note in the repository's declared state document;
- registered validation command execution;
- blocker and validation outcome recording.

It is not a general coding agent and should not grow into one. If the command requires repository-specific implementation work or judgment-heavy audit work, ShepAIrd must report a blocker or require a dispatch adapter rather than fabricating success.

The dispatch concept should remain thin: tell Codex what to do in the right repo context, not implement a competing agent runtime or persist per-repo packet files. CLI/Electron integration should be a small adapter over Codex app thread routing, not a model layer.

## Registry Model

Each project entry records:

- stable `id`,
- human `name`,
- `kind`,
- relative `path`,
- `managed` and `lifecycle`,
- `dependencyTier` and `dependsOn`,
- status, architecture, maintainer, agent, YAIML, and temporary ARCS document paths,
- produced and consumed capabilities,
- validation commands,
- optional validation working directories,
- optional interface evidence entries with capability, role, source paths, and summary,
- optional `codexProject` compatibility metadata with `projectId`, `hostId`, `label`, `path`, and `kind`,
- optional `codexThread` touchpoint metadata with `threadId`, `hostId`, `title`, `cwd`, and `scopePath`,
- notes from audit evidence.

Discovered repositories that are not managed are inspect-only until explicitly included by policy or command scope.

## Codex Project And Task Routing

Codex Project and task metadata is a lightweight bridge between ShepAIrd's registry and the Codex app's Project/task tools. A mapped repository can record the saved Codex Project's opaque id, host id, label, kind, and local path, plus one durable touchpoint task's opaque task id, host id, human title, task cwd, and optional repository `scopePath`. ShepAIrd validates this metadata only as local routing evidence: it can report saved or missing Projects, mapped or missing touchpoint tasks, compare Project paths, compare task cwd or scope path against registry path, and include the mapping in handoff context.

A repo-root Codex Project is the preferred durable home for each registered app. A touchpoint task is the working conversation inside that Project. ShepAIrd's registry should not treat a parent workspace Project as equivalent to a repo-root Project unless the human explicitly wants that temporary route.

`scopePath` exists for parent-workspace Codex tasks. If Codex exposes the parent workspace folder as a saved project but not a specific repository folder, a task may run from the parent workspace while its prompt and registry metadata bind it to one target repository. This is acceptable only when the scope path exactly matches the registry path, but it is not the preferred durable mapping. Parent-workspace tasks add visual clutter to the `git` project and should be explicit, temporary exceptions rather than an automatic fallback.

Campaign handoff prompts include a route guard before the work instructions. The guard repeats the repository scope, saved Codex Project, mapped touchpoint task, task cwd, optional scope path, and the stop condition if the Project or task route does not match. This makes each dispatch self-contained enough to survive task-title drift, parent-workspace cwd, and stale human memory.

ShepAIrd does not own Codex task execution. The CLI command `node src/cli.mjs threads` and generated `output/codex-task-map.md` are preflight reports for Codex, not a background dispatcher. Actual messaging to repo tasks happens through Codex app tooling when the human or this Codex session chooses to dispatch work.

For repositories missing saved Codex Projects or touchpoint tasks, ShepAIrd should not silently create parent-workspace tasks just to make the route map complete. Safer choices are: report the unmapped repos, ask for explicit task creation, create or use saved repo-specific Codex Projects when available, or perform bounded current-thread inspection/validation without creating sidebar tasks.

## Invariants

- YAIML remains upstream of ShepAIrd's project-memory interpretation.
- Codex remains the reasoning and coding surface; ShepAIrd supplies local evidence, routing, prompts, and validation scaffolding.
- Downstream repositories own their own YAIML truth.
- Current filesystem, Git, and repository YAIML evidence wins over this chat's memory.
- One global command may produce different repository-specific work in each target repository.
- Campaign lenses must be interpreted through each repo's YAIML, code shape, and validation surface, then handed to Codex/repo context for reasoning-heavy work.
- Previous-run comparison is observational only; it detects changed snapshots without attributing authorship.
- Resume skips only previous matching `completed` or `dispatched` repository results; it does not treat `planned`, `blocked`, or `failed` as done.
- Missing documents are reported, not invented.
- Dirty working trees are inspected and preserved, not reset or cleaned.
- Campaign handoff context is ephemeral run context, not execution proof.
- Codex Project and thread metadata is routing compatibility data only; absence means unmapped, not unmanaged.
- Codex route-map reports are routing preflights, not proof that a task has been messaged or completed work.
- Every Codex handoff prompt must carry its repository scope, Project/task route, and route guard; do not rely on the receiving task's title or prior chat memory.
- Shallow content signals are audit pointers, not findings.
- Run records are operational history, not canonical downstream project truth.
- Dependency order is explicit and readable.
- Commit, push, publish, release, deployment, repo moves, dependency installs, and shared-package extraction require separate explicit permission.
- ShepAIrd remains personal unless the human explicitly decides to productize or publish it.
- Thinness is an architectural invariant. Prefer registry metadata, run records, reports, dispatch prompts, and explicit commands over new UI, background services, embedded model logic, packet piles, local audit engines, or broad abstractions.

## Danger Zones

- Describing planned executor behavior as implemented.
- Treating generated handoff context as completed downstream work.
- Applying the same literal edit across different repositories.
- Treating a campaign lens as universal checklist cargo-culting.
- Flattening projects with different product constraints into one abstraction.
- Hiding dirty/untracked state in portfolio summaries.
- Assuming this chat knows about changes made in an individual repo chat.
- Letting the registry become stale enough that global commands target the wrong path.
- Turning run records into a replacement for downstream YAIML memory.
- Building a second agent brain inside ShepAIrd instead of handing rich context back to Codex.
- Reintroducing stored per-repo packet files as the default workflow.
