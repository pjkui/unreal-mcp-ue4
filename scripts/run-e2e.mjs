#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import process from "node:process"

const args = process.argv.slice(2)
const wantsHelp = args.includes("--help") || args.includes("-h")
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"

function run(command, commandArgs) {
	const result = spawnSync(command, commandArgs, {
		stdio: "inherit",
	})

	if (result.error) {
		throw result.error
	}

	if (typeof result.status === "number" && result.status !== 0) {
		process.exit(result.status)
	}
}

if (!wantsHelp) {
	run(npmCommand, ["run", "build"])
}

run(process.execPath, ["scripts/e2e-smoke.mjs", ...args])
