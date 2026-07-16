# AI Chat And Provider Infrastructure Comparison

## Chaitroom

Strongest reusable runtime candidate. It has explicit adapters, OpenAI-compatible provider code, local Ollama support, structured model output parsing, visible history filtering, and bounded AI-to-AI routing.

## LoreKeeper

Strongest human-control application example. Provider output does not own canon; the app owns table state, recovery, authority, and review.

## SpriteWrite

Strongest compact structured-output example. The provider may propose only patch operations, and the user validates, previews, accepts, rejects, or edits.

## mAIcroFlow

Strongest safety-bound workflow example. AI interprets visible pixels inside explicit workflow nodes; actions are workflow-controlled and reviewed when needed.

## AIWIKI

Good downstream provider-interface example. Article generation is isolated behind a generator interface with local, hosted, and deterministic demo implementations.

## ytfictiongen

Good downstream staged-generation example. Content, TTS, image, and video generation are local-first and approval-gated, but TTS provider abstraction remains a known debt.
