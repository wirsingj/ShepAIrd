import assert from "node:assert/strict";
import test from "node:test";
import { buildCliHelp } from "../src/help.mjs";

test("CLI help documents thin campaign handoff and resume behavior", () => {
  const help = buildCliHelp();
  assert.match(help, /portfolio <inspect\|plan\|validate\|apply>/);
  assert.match(help, /node src\/cli\.mjs threads/);
  assert.match(help, /Codex Project\/task routing:/);
  assert.match(help, /repo-root Codex Projects/);
  assert.match(help, /handoffDispatcher/);
  assert.match(help, /plain CLI has no Codex app dispatcher/);
  assert.match(help, /Resume skips only repositories previously marked completed or dispatched/);
  assert.match(help, /Stored packet files are deprecated/);
});
