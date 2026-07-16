# Capability Map

This document records the first human-readable capability interpretation. The generated version lives at `output/capability-map.md`.

## Key Shared Capability

`provider-adapter-contract` is the most obvious shared capability candidate.

Verified producer:

- Chaitroom, via `AgentAdapter`, provider clients, structured output parsing, and bounded routing.

Consumers or adjacent implementations:

- LoreKeeper, which needs provider settings, local Ollama generation, manual bridge mode, response review, and recovery rails.
- SpriteWrite, which uses provider output only as structured patch operations.
- AIWIKI, which uses a generator interface across Ollama, hosted OpenAI-compatible, and demo providers.
- ytfictiongen, which uses local content generation and deterministic fallbacks.

Inference:

- A shared contract may be useful, but the product constraints differ. The first shared artifact should probably be an interface doctrine or test fixture pattern, not a package.
