#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { server, shutdownRemoteExecution } from "./"

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
