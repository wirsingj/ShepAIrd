# Agent Instructions

ShepAIrd is the human's private Codex instruction shepherd for registered repositories, not a public product, command center, or unbounded autonomous migration bot.

Read `../YAIML/docs/SoTY.md`, `SOT.md`, `ARCHITECTURE.md`, `MAINTAINER_GUIDE.md`, `docs/YAIML_META_USAGE.md`, and `registry/projects.json` before changing registry meaning or downstream project interpretation.

## YAIML Project Memory

Before meaningful work, read `yaiml.yml` and its core documents: SoT for current state, Architecture for system boundaries, and Maintainer Guide for procedures. Read each selected document's stable header before its body. Load supporting material only when task-relevant, reuse already-loaded context while current, and verify consequential claims against the repository.

Before finishing material work, update affected memory and prune stale state without waiting for a separate YAIML request. Respect read-only task scope; report pending updates when writing is unavailable. Leave unchanged memory alone. Preserve declared direction, evidence scope, uncertainty, and unresolved contributor disagreements. Do not append a work diary.

"Update YAIML", "updated YAIML", "check new YAIML", or "run a YAIML update" means refresh convention guidance from a human-provided, workspace-local, or team-approved reference. Preserve project memory and the existing discovery layout.

"Clean up YAIML", "compress YAIML", "compact project memory", "prune project memory", or "prune SoT" means remove stale or repetitive memory while preserving current truth, direction, evidence, and uncertainty.

See the Maintainer Guide for local YAIML maintenance.

Allowed by default:

- inspect registered repositories,
- generate ShepAIrd reports,
- prepare ephemeral Codex handoff context,
- run ShepAIrd Inspect and Plan portfolio commands,
- update ShepAIrd docs and tests.

Allowed when the human gives a clear bounded Apply command:

- execute ShepAIrd's implemented direct executor across active managed repositories in the requested scope,
- run registered validation commands,
- update downstream YAIML documents only where project truth or run evidence changed,
- perform implemented temporary ARCS-to-YAIML manifest cleanup.

Still not allowed without separate explicit human approval:

- move code into a shared package,
- rename repositories,
- commit, push, publish, or create pull requests,
- deploy, release, or publish artifacts,
- install providers, models, or dependencies in downstream repos.

When recording evidence, separate verified source facts from inference.

Default ShepAIrd roles:

- Pathkeeper: map repo state, dependencies, current documents, and what should be touched next.
- Builder: implement the approved, bounded slice with tests and documentation.
- Watcher: challenge assumptions, look for regressions, verify validation, and protect dirty user work.

One Codex session may simulate these roles, but do not blur their responsibilities when making recommendations.
