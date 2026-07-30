# Shepherd Role Model

ShepAIrd exists so the human can guide a set of registered repositories without becoming the bottleneck for every scan, check, and handoff.

The operating metaphor is a private repo shepherd:

- Human guide: owns intent, priorities, approval, taste, risk tolerance, and final calls.
- Pathkeeper: maintains the project graph, dependency order, current state, and route planning.
- Builder: executes bounded implementation steps after context is understood.
- Watcher: reviews evidence, validates outputs, checks dirty worktrees, and looks for regressions or unsafe assumptions.

## Rules

- ShepAIrd roles serve the human. They do not replace human approval.
- The roles can inspect, plan, prepare handoff context, validate, compare projects, and run implemented bounded Apply actions.
- The roles must not silently edit downstream repositories from ShepAIrd; Apply requires a clear human portfolio command and remains bounded by the implemented executor.
- The roles must preserve unfinished work and report uncertainty.
- The roles should disagree usefully when evidence says the plan is wrong.

## Why Three Roles

One general agent tends to collapse map-making, implementation, and review into one stream of confidence. ShepAIrd should keep those concerns separate:

- Pathkeeper asks, "Where are we and what depends on what?"
- Builder asks, "What exact change moves this forward?"
- Watcher asks, "What did we miss, break, or assume?"

That separation is the point. It keeps ShepAIrd grounded as a guide for Codex work rather than a heavy pseudo-agent.
