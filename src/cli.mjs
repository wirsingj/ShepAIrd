#!/usr/bin/env node
import { buildCapabilityMap, buildCodexTaskMap, buildStatusReport, inspectRegistry, writeOutputs } from "./registry.mjs";
import { buildPortfolioReport, runPortfolioCommand } from "./portfolio.mjs";
import { buildCliHelp } from "./help.mjs";

const command = process.argv[2] ?? "status";
const registryPath = process.argv[3];

try {
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(buildCliHelp());
  } else if (command === "status") {
    const inspected = await inspectRegistry(registryPath);
    console.log(buildStatusReport(inspected));
  } else if (command === "capabilities") {
    const inspected = await inspectRegistry(registryPath);
    console.log(buildCapabilityMap(inspected));
  } else if (command === "threads" || command === "tasks") {
    const inspected = await inspectRegistry(registryPath);
    console.log(buildCodexTaskMap(inspected));
  } else if (command === "all") {
    const inspected = await inspectRegistry(registryPath);
    const result = await writeOutputs(inspected);
    console.log(`Wrote ${result.statusPath}`);
    console.log(`Wrote ${result.capabilityMapPath}`);
    console.log(`Wrote ${result.codexTaskMapPath}`);
  } else if (command === "packets") {
    throw new Error("Stored work packets are deprecated. Use portfolio plan/apply handoff flow instead.");
  } else if (command === "portfolio") {
    const mode = process.argv[3] ?? "inspect";
    const text = process.argv.slice(4).join(" ") || "Inspect all managed projects";
    const run = await runPortfolioCommand(text, { mode });
    console.log(buildPortfolioReport(run));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
