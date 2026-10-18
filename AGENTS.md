# Agent Instructions

ShepAIrd is the human's private Codex instruction shepherd for registered repositories, not a public product, command center, or unbounded autonomous migration bot.

Read `SOT.md`, `ARCHITECTURE.md`, `MAINTAINER_GUIDE.md`, `docs/YAIML_META_USAGE.md`, and `registry/projects.json` before changing registry meaning or downstream project interpretation. Consult the YAIML reference supplied at run time; use its committed content when a revision is pinned.

## YAIML Project Memory

The maintainer treats these projects as works in progress: latest working files, including uncommitted edits, are the current baseline. Preserve that work; branch names and older commits do not establish production state or permission for Git mutations.

Read and follow [.yaiml/YAIML_GUIDE.md](.yaiml/YAIML_GUIDE.md) and the [skill catalog](.yaiml/skills/INDEX.md). Select relevant methods, read their bodies and pass requested actions/counts/perspectives unchanged. Ordinary work uses context and maintains material understanding, including confirmed conversational decisions and new verification evidence, without a YAIML reminder. Init executes bootstrap immediately; routine startup uses local guidance without upstream polling or backlog execution. Native `.agents/skills/` entries route to these canonical methods.

At startup/context refresh, consider coordination from available context. For a concrete benefit, read [.yaiml/YAIMLACP.md](.yaiml/YAIMLACP.md), explain scope, access, limits, cost and the single-agent alternative, and obtain affirmative confirmation before first use or changed scope/cost. Otherwise continue independently.

Before meaningful work, read `yaiml.yml` and its core documents: SoT for current state, Architecture for system boundaries, and Maintainer Guide for procedures. Read each selected document's stable header before its body. Load supporting material only when task-relevant, reuse already-loaded context while current, and verify consequential claims against the repository.

Before finishing material work, update affected memory without a separate YAIML request. Respect read-only scope and review rules; report pending updates when writing is unavailable. Leave unchanged memory alone.

Replace the existing account of changed facts; remove superseded claims and resolved active items. Keep completed work only as current capability, a still-relevant decision or constraint, or a lesson that changes future action. Keep one detailed home per fact and link from other roles. Do not append session summaries or relocate history into supporting files.

Keep routine edits within the smallest affected passages; preserve unrelated wording and structure. Broad compression belongs in separately scoped work. Memory describes this checkout; distinguish proposed, implemented, and deployed. With a PR/MR, reconcile affected memory against the actual target and combined changes before integration, including clean textual merges. Preserve independent contributions; never choose an entire conflicting document by side. Keep decision conflicts visible and route dependent choices to existing review authority. Recheck affected claims and evidence after integration changes; report unavailable target context or unrun checks. Follow repository branch permissions.

Preserve human direction, evidence scope, uncertainty, unresolved contributor disagreements, and governed records. Measure affected documents before and after, check existing budgets, and compress safely first. Do not pad or inflate budgets. Report necessary net growth, its reason, retained overages, and next action in the task response, not memory.

"Update YAIML", "updated YAIML", "check new YAIML", or "run a YAIML update" means refresh convention guidance from a human-provided, workspace-local, or team-approved reference. Preserve project memory and the existing discovery layout.

"Clean up YAIML", "compress YAIML", "compact project memory", "prune project memory", or "prune SoT" means remove stale or repetitive memory while preserving current truth, direction, evidence, and uncertainty.

Memory is versioned with this repository and this repository is public. Never write drive letters, home or profile directories, local workspace paths, personal account URLs, credentials, tokens, or private personal detail into it. Use neutral placeholders such as `<workspace-root>/repo-name` in examples, and describe sensitive evidence by location and owner instead of copying it.

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
