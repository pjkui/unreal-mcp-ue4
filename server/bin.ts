#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { server, shutdownRemoteExecution } from "./"
import { checkForUpdate, performUpdate } from "./update-check.js"
import { projectVersion } from "./version.js"

const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
	console.log(projectVersion)
	process.exit(0)
}

if (args.includes("--update")) {
	performUpdate()
	process.exit(0)
}

// Background update check — never blocks startup
checkForUpdate()

const transport = new StdioServerTransport()
server.connect(transport)

let shutdownInProgress = false

const shutdown = async () => {
	if (shutdownInProgress) {
		return
	}

	shutdownInProgress = true
	await shutdownRemoteExecution()
}

process.once("SIGINT", () => {
	void shutdown().finally(() => process.exit(0))
})

process.once("SIGTERM", () => {
	void shutdown().finally(() => process.exit(0))
})

process.once("beforeExit", () => {
	void shutdown()
})

process.once("exit", () => {
	void shutdown()
})
