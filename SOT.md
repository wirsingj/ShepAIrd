---
yaiml: 0.2
kind: sot
title: ShepAIrd State Of The Project
purpose: Current engineering state, direction, risks, and next work for ShepAIrd.
belongs-here: current product purpose, verified capabilities, active risks, validation state, next steps.
not-here: durable architecture, command reference, complete audit history, downstream implementation details.
durability: volatile; synthesize and prune aggressively.
read-with: Architecture; Maintainer Guide; registry/projects.json.
update-when: registry scope, portfolio command behavior, execution capability, or validation state changes.
agent-guidance: Preserve human control. Do not describe aspirational execution as implemented.
---

# ShepAIrd State Of The Project

Updated: 2026-08-08

## Identity

ShepAIrd is the human's thin local instruction router for Codex work across repositories beneath the configured parent Git workspace.

Its founding purpose is to reduce repetitive manual Codex chat hopping without pretending to be better than Codex. The human is expected to interact with ShepAIrd mostly through this Codex project folder/chat. ShepAIrd should tell Codex what to do in each registered app by offloading boring local coordination to deterministic files and commands: resolve relevant managed repositories, read each repository's YAIML documents, interpret the command in that repository's context, prepare handoff prompts, execute only tiny bounded support utilities, validate separately, update local YAIML truth when appropriate, record the run, and return one combined result.

The individual repositories remain the canonical owners of their project truth and implementation work. ShepAIrd coordinates and records operational run history; it does not replace downstream YAIML documents with a central copy and should not become the place where broad repo-specific audits or fixes are reasoned through.

ShepAIrd must assume the human may use separate Codex chats or other tools inside any individual repository without telling this chat first. Each portfolio run should therefore rehydrate from current filesystem, Git, registry, and repository YAIML evidence instead of relying on this conversation's memory.

ShepAIrd's emerging purpose is broader than YAIML maintenance, but it must stay thin. YAIML is the project-memory substrate; ShepAIrd should become the local command translator that helps Codex apply recurring self-audit pressure across registered apps. The human wants to say things like "run a security audit across all registered apps, fix safe issues, validate, and update YAIML" or swap security for performance, bug check, architecture, code readability, release readiness, test coverage, docs drift, or YAIML compliance.

The campaign runner must interpret each lens through each repository's own YAIML, registry metadata, code shape, validation commands, and danger zones, then hand precise instructions to Codex/repo context. It must not flatten every repo into one checklist, store packet piles, or grow into a heavy model-replacement app.

## What Works Now

- `yaiml.yml` is ShepAIrd's own memory index.
- `registry/projects.json` points to `../YAIML`, records `workspaceRoot`, and marks registry projects with managed/lifecycle policy.
- Workspace discovery scans the configured workspace for Git repositories.
- Registry reconciliation reports managed, missing, possible moved, discovered, excluded, inactive, and archived repository states.
- YAIML discovery reads `yaiml.yml` first and treats `arcs.yml` as a temporary ARCS-era cleanup signal.
- Repository-specific document paths are read from each repository's YAIML manifest rather than hardcoding a SoT path.
- YAIML discovery supports both the older flat `documents.*.path` shape and the current nested `yaiml.core` / `yaiml.supporting` discovery shape used by the governing YAIML repository.
- Portfolio Inspect reports each repository's current Git branch, short HEAD, and clean/dirty state so external repo-chat changes are visible on the next run.
- Registry validation commands can run from project subdirectories, which makes multi-package repositories such as Go-backend plus Vite-frontend apps validate from their real package roots.
- The CLI supports portfolio commands: `node src/cli.mjs portfolio inspect|plan|validate|apply "..."`.
- The Electron shell has a portfolio command box with Inspect, Plan, and Apply buttons wired through IPC to the same executor.
- Inspect mode reads and reports without mutation.
- Plan mode prepares repository-specific next-step intent without mutation.
- Validate mode runs registered validation without mutating repository YAIML memory.
- Apply mode has a direct filesystem/command executor for a narrow vertical slice:
  - temporary `arcs.yml` to `yaiml.yml` manifest cleanup;
  - one bounded YAIML-continuation step that records a sanitized run note in the repository state document when validation is registered;
  - per-repository validation command execution;
  - run records under `output/runs/`.
- Apply mode blocks dangerous validation commands such as `git commit`, `git push`, `git reset`, `git clean`, deploy, publish, and release commands.
- Dependency ordering is respected, and downstream repositories are skipped when an upstream dependency blocks.
- Tests cover workspace discovery, registry reconciliation, legacy and current nested YAIML discovery, temporary ARCS discovery, Inspect/Plan/Apply interpretation, one-step and N-step command parsing, actual executor invocation, run recording, validation safety, dependency blocker isolation, and temporary ARCS cleanup.
- Plan-mode campaign lenses are implemented for security, performance, bug-check/code-pattern review, architecture, readability, release readiness, test coverage, docs drift, and YAIML compliance.
- Campaign Plan builds ephemeral per-repository Codex handoff context. It no longer writes stored campaign packet files.
- Campaign handoff context includes bounded file inventory signals and package-script summaries, so Plan output is grounded in more than registry metadata alone.
- Docs-drift and YAIML campaign handoff context includes shallow content signals such as declared-document presence/headings, README presence/headings, and possible stale terminology.
- Campaign Apply has a thin programmatic `handoffDispatcher` hook. When configured by the caller, ShepAIrd sends the per-repo prompt/context and records `dispatched` without claiming the downstream audit/fix is complete.
- Registry entries support optional `codexProject` metadata (`projectId`, `hostId`, `label`, `path`, `kind`) and `codexThread` touchpoint metadata (`threadId`, `hostId`, `title`, `cwd`). Status reports show saved Codex Project routing, mapped or unmapped touchpoint tasks, and campaign handoffs carry the metadata for dispatchers.
- `node src/cli.mjs threads` and `npm run threads` generate a dedicated Codex route map with saved Project counts, missing Project counts, mapped/unmapped touchpoint counts, route health, setup-needed guidance, task cwd checks, dirty/clean state, and validation commands.
- `npm run all` now writes `output/codex-task-map.md` beside the status and capability reports.
- Confirmed saved Codex Projects and durable touchpoint task mappings currently exist for YAIML, ShepAIrd, LoreKeeper, SpriteWrite, mAIcroFlow, ytfictiongen/ytdoc, and YTMMOCC. LlamaSaddle, Chaitroom, AIWIKI, OOBHunter, and ooze-tactics do not have durable repo-root Codex Projects or touchpoint task mappings yet.
- Task-route checks now treat parent-workspace task mappings as valid only when `scopePath` matches the registry path and sits inside the task cwd.
- Campaign handoff prompts include a routing guard that repeats the repository scope, saved Codex Project, mapped touchpoint task, task cwd, optional scope path, and stop condition before repo-specific audit instructions.
- Parent-workspace tasks created for the unmapped repos were archived after they cluttered the `git` project task list. They are not retained as stable registry mappings.
- Resume mode skips repositories already marked `completed` or `dispatched` in the previous matching run, while continuing unfinished repositories.
- CLI help documents the thin command surface, campaign handoff limits, stored-packet deprecation, and resume behavior.
- Portfolio runs compare each selected repository against the previous run record when one exists, reporting branch, HEAD, dirty-count, YAIML manifest/hash, and validation outcome changes.

## What Was Corrected

Before the portfolio-command pass, ShepAIrd was mostly a reporting and work-packet generator. Its docs explicitly said it did not edit downstream repositories, and its shell was an intake/dossier viewer. That was useful scaffolding but not the core product.

The previous answer reduced ShepAIrd to inspection and work packets because that was the implementation truth at the time. The correction is now partly implemented: ShepAIrd has a real request-driven portfolio-command path, but only a narrow direct executor.

## Current Limitations

- General repository-specific coding execution is not implemented. ShepAIrd cannot yet autonomously fix arbitrary build failures or implement product features across repositories.
- ShepAIrd is not intended to become a rich standalone app the human operates directly. The primary operator is Codex reading and writing this local project folder.
- The current bounded continuation step is operationally real but conservative: it runs registered validation and records a sanitized YAIML run note; it does not infer and code arbitrary next product work.
- Registry reconciliation reports discovered and moved repositories, but it does not automatically rewrite the registry.
- Temporary ARCS cleanup is narrow: it safely renames the discovery manifest and updates manifest terminology. Broader document terminology cleanup still needs repository-specific review.
- Run resumption is implemented for previous matching run records. It is conservative: only `completed` and `dispatched` repositories are skipped, and `planned`, `blocked`, `failed`, or missing entries remain eligible.
- ShepAIrd compares current branch/head/dirty state and YAIML manifest hash against the previous portfolio-run snapshot. This is change detection, not yet attribution of which chat or tool caused the change.
- Dirty worktree isolation is reported through git status; deep diff attribution between pre-existing user work and ShepAIrd-created changes is not yet complete.
- Campaign handoff context is in-run evidence, not a stored artifact and not proof of execution.
- Campaign handoff context is generated from registry metadata, YAIML metadata, current Git state, bounded file inventory, package-script summaries, Codex Project/task metadata, and shallow docs/YAIML content signals. The programmatic dispatcher hook exists, and the CLI can now report a Codex route map, but CLI/Electron surfaces still do not message actual Codex repo chats. Handoff context still does not perform deep source-content audit or produce findings without Codex doing the audit in the target repo context.
- Repository `codexProject` and `codexThread` IDs should be written into `registry/projects.json` only after exact routing is confirmed from Codex app project/task metadata. Parent-workspace `scopePath` tasks are technically supported, but they should be treated as explicit temporary exceptions because they clutter the parent project task list and feel fragile.
- Codex tasks are inherently softer routing than a local process cwd. A task can be renamed, interrupted, waiting on approval, archived, or pointed at a parent workspace. ShepAIrd guards path scope, but it still cannot prove live task health from the plain CLI.

## Default Command Meaning

When the human says "continue through the YAIML checklist" without extra bounds, ShepAIrd defaults to one meaningful bounded support step or Codex handoff per selected active managed repository, in dependency order, followed by validation and YAIML/run-record updates where supported.

Today that default is limited by the direct executor. If a repository has no YAIML manifest, no registered validation, unsafe validation, or requires real implementation beyond the executor, ShepAIrd records a precise blocker instead of claiming completion.

When the human names a campaign lens such as security, performance, bug check, architecture, readability, release readiness, test coverage, docs drift, or YAIML compliance, ShepAIrd can generate repository-specific Codex handoff context in Plan mode. Apply remains conservative: campaign lenses dispatch only when the caller supplies a real handoff dispatcher; otherwise they block instead of pretending the audit ran.

## Current Project Graph

```text
YAIML
  -> ShepAIrd
  -> LlamaSaddle
  -> reusable/provider-heavy projects: Chaitroom, LoreKeeper, SpriteWrite, mAIcroFlow
  -> downstream applications: AIWIKI, ytfictiongen, YTMMOCC
  -> game prototypes / vertical slices: OOBHunter, ooze-tactics
```

## Active Risks

- The implemented Apply slice could be mistaken for full autonomous coding execution. It is not; broad audit and fix work belongs in Codex/repo context.
- Product gravity could pull ShepAIrd toward a heavy UI or pseudo-agent. Resist that; keep it as deterministic local scaffolding for Codex orchestration.
- Dirty or untracked downstream working trees remain common. Preserve user work and isolate ShepAIrd changes carefully.
- Registry reconciliation is safer than stale manual paths, but the registry can still drift until automatic refresh policy is implemented.
- The state-document run note is intentionally sanitized; it should not become a noisy append-only log.
- Validation commands in the registry are trusted enough to run except for the explicit denylist; broader command classification may be needed before wider Apply use.
- Registry validation commands must stay executable from their declared working directories; stale root-relative commands make portfolio Apply look less capable than the underlying repos really are.
- Campaign lens names could make ShepAIrd sound more capable than it is. Keep Inspect and Plan honest, and keep Apply dispatch-oriented unless the action is a tiny deterministic support utility.
- Security, performance, and architecture mean different things per repo; do not use one universal checklist without repo-specific interpretation.

## Next Five Steps

1. Add reporting for active/waiting/completed task state when Codex task metadata is available.
2. Create saved repo-root Codex Projects and one durable touchpoint task for LlamaSaddle, Chaitroom, AIWIKI, OOBHunter, and ooze-tactics only when the human explicitly wants those sidebar homes.
3. Wire the programmatic `handoffDispatcher` hook to Codex app thread routing for mapped repositories.
4. Keep the Electron shell and CLI minimal; avoid UI/product work unless it directly improves Codex-driven coordination.
5. Allow deterministic Apply behavior only for tiny support utilities, not broad audit/fix engines that should run inside Codex repo context.
