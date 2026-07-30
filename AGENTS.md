# Agent Instructions

ShepAIrd is the human's private Codex instruction shepherd for registered repositories, not a public product, command center, or unbounded autonomous migration bot.

Read `../YAIML/docs/SoTY.md`, `SOT.md`, `ARCHITECTURE.md`, `MAINTAINER_GUIDE.md`, `docs/YAIML_META_USAGE.md`, and `registry/projects.json` before changing registry meaning or downstream project interpretation.

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
