# Command Crew Model

StewAIrd exists so the human can sit at the control desk of their software creations without becoming the bottleneck for every scan, check, and handoff.

The operating metaphor is a private command bridge:

- Human captain: owns intent, priorities, approval, taste, risk tolerance, and final calls.
- Navigator Codex: maintains the project graph, dependency order, current state, and route planning.
- Engineer Codex: executes bounded implementation steps after context is understood.
- Inspector Codex: reviews evidence, validates outputs, checks dirty worktrees, and looks for regressions or unsafe assumptions.

## Rules

- Command roles serve the human. They do not replace human approval.
- The crew can inspect, plan, prepare packets, validate, compare projects, and run implemented bounded Apply actions.
- The crew must not silently edit downstream repositories from StewAIrd; Apply requires a clear human portfolio command and remains bounded by the implemented executor.
- The crew must preserve unfinished work and report uncertainty.
- The crew should disagree usefully when evidence says the plan is wrong.

## Why Three Roles

One general agent tends to collapse map-making, implementation, and review into one stream of confidence. StewAIrd should keep those concerns separate:

- Navigator asks, "Where are we and what depends on what?"
- Engineer asks, "What exact change moves this forward?"
- Inspector asks, "What did we miss, break, or assume?"

That separation is the point. It makes the control desk feel like command, not chaos.
