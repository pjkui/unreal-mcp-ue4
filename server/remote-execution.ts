import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"

import { RemoteExecution, RemoteExecutionConfig } from "unreal-remote-execution"

const DEFAULT_MULTICAST_TTL = 1
const DEFAULT_MULTICAST_ADDRESS = "239.0.0.1"
const DEFAULT_MULTICAST_PORT = 6766
const DEFAULT_COMMAND_PORT = 0 // 0 = OS assigns a free port (avoids conflicts with multiple MCP instances)
const DEFAULT_RETRY_COUNT = 3
const DEFAULT_RETRY_DELAY_MS = 2000

const timingEnabled = () => !!process.env.UNREAL_MCP_TIMING

const getTimingLogPath = () => {
	const logDir = process.env.UNREAL_MCP_TIMING_LOG_DIR
		?? path.join(os.homedir(), ".unreal-mcp")
	if (!fs.existsSync(logDir)) {
		fs.mkdirSync(logDir, { recursive: true })
	}
	return path.join(logDir, "timing.log")
}

let timingLogStream: fs.WriteStream | undefined

const ensureLogStream = () => {
	if (!timingLogStream) {
		timingLogStream = fs.createWriteStream(getTimingLogPath(), { flags: "a" })
	}
	return timingLogStream
}

const logTiming = (label: string, startMs: number) => {
	if (timingEnabled()) {
		const elapsed = (performance.now() - startMs).toFixed(1)
		const line = `[timing] ${label}: ${elapsed}ms`
		console.error(line)
		const ts = new Date().toISOString()
		ensureLogStream().write(`${ts} ${line}\n`)
	}
}

export const logTimingRaw = (line: string) => {
	if (timingEnabled()) {
		console.error(line)
		const ts = new Date().toISOString()
		ensureLogStream().write(`${ts} ${line}\n`)
	}
}

/** Discover a free TCP port by briefly listening on port 0, then closing. */
const findFreePort = (host: string): Promise<number> =>
	new Promise((resolve, reject) => {
		const srv = net.createServer()
		srv.once("error", reject)
		srv.listen(0, host, () => {
			const addr = srv.address() as net.AddressInfo
			srv.close(() => resolve(addr.port))
		})
	})

const readIntegerEnv = (name: string, fallback: number) => {
	const value = process.env[name]
	if (!value) {
		return fallback
	}

	const parsedValue = Number.parseInt(value, 10)
	return Number.isFinite(parsedValue) ? parsedValue : fallback
}

const readStringEnv = (name: string) => {
	const value = process.env[name]
	return typeof value === "string" && value.trim() ? value.trim() : undefined
}

const resolveRemoteExecutionBindAddress = () => {
	const override = readStringEnv("UNREAL_MCP_BIND_ADDRESS")
	if (override) {
		return override
	}

	const interfaces = os.networkInterfaces()
	for (const networkInterface of Object.values(interfaces)) {
		for (const addressInfo of networkInterface ?? []) {
			if (addressInfo.family === "IPv4" && !addressInfo.internal) {
				return addressInfo.address
			}
		}
	}

	return "0.0.0.0"
}

const createRemoteExecutionConfig = async () => {
	const multicastTTL = readIntegerEnv("UNREAL_MCP_MULTICAST_TTL", DEFAULT_MULTICAST_TTL)
	const multicastAddress =
		readStringEnv("UNREAL_MCP_MULTICAST_ADDRESS") ?? DEFAULT_MULTICAST_ADDRESS
	const multicastPort = readIntegerEnv("UNREAL_MCP_MULTICAST_PORT", DEFAULT_MULTICAST_PORT)
	const bindAddress = resolveRemoteExecutionBindAddress()
	const commandAddress = readStringEnv("UNREAL_MCP_COMMAND_ADDRESS") ?? bindAddress
	const requestedPort = readIntegerEnv("UNREAL_MCP_COMMAND_PORT", DEFAULT_COMMAND_PORT)

	// When requestedPort is 0, discover a free port so the library config
	// contains the real port number (it sends this port in the UDP broadcast
	// and UE4 connects back to it).
	const commandPort = requestedPort === 0 ? await findFreePort(commandAddress) : requestedPort

	return {
		bindAddress,
		commandAddress,
		commandPort,
		config: new RemoteExecutionConfig(
			multicastTTL,
			[multicastAddress, multicastPort],
			bindAddress,
			[commandAddress, commandPort],
		),
	}
}

let remoteExecution: RemoteExecution | undefined = undefined
let remoteExecutionStartPromise: Promise<void> | undefined = undefined
let remoteConnectionPromise: Promise<RemoteExecution> | undefined = undefined

const ensureRemoteExecutionStarted = async () => {
	if (!remoteExecution) {
		const { bindAddress, commandAddress, commandPort, config } = await createRemoteExecutionConfig()
		remoteExecution = new RemoteExecution(config)
		console.error(
			`Using Unreal Remote Execution bind address: ${bindAddress} (command: ${commandAddress}:${commandPort})`,
		)
	}

	if (!remoteExecutionStartPromise) {
		const runtime = remoteExecution
		remoteExecutionStartPromise = runtime
			.start()
			.catch((error) => {
				if (remoteExecution === runtime) {
					remoteExecution = undefined
				}
				throw error
			})
			.finally(() => {
				remoteExecutionStartPromise = undefined
			})
	}

	await remoteExecutionStartPromise
	return remoteExecution!
}

const connectWithRetry = async (
	maxRetries: number = readIntegerEnv("UNREAL_MCP_RETRY_COUNT", DEFAULT_RETRY_COUNT),
	retryDelay: number = readIntegerEnv("UNREAL_MCP_RETRY_DELAY_MS", DEFAULT_RETRY_DELAY_MS),
) => {
	const runtime = await ensureRemoteExecutionStarted()
	let lastError: unknown = undefined

	for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
		try {
			let t0 = performance.now()
			const node = await runtime.getFirstRemoteNode(1000, 5000)
			logTiming("UDP node discovery", t0)

			t0 = performance.now()
			await runtime.openCommandConnection(node)
			logTiming("TCP connection open", t0)

			t0 = performance.now()
			const result = await runtime.runCommand('print("rrmcp:init")')
			logTiming("init handshake", t0)
			if (!result.success) {
				throw new Error(`Failed to run command: ${JSON.stringify(result.result)}`)
			}

			return runtime
		} catch (error) {
			lastError = error
			console.error(`Connection attempt ${attempt} failed:`, error)

			try {
				if (runtime.hasCommandConnection()) {
					runtime.closeCommandConnection()
				}
			} catch (closeError) {
				console.error("Failed to close Unreal command connection after a failed attempt:", closeError)
			}

			if (attempt < maxRetries) {
				console.error(`Retrying in ${retryDelay}ms...`)
				await new Promise((resolve) => setTimeout(resolve, retryDelay))
				retryDelay = Math.min(retryDelay * 1.5, 10000)
			}
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error("Unable to connect to your Unreal Engine Editor after multiple attempts")
}

const ensureRemoteConnection = async () => {
	if (remoteExecution?.hasCommandConnection()) {
		return remoteExecution
	}

	if (!remoteConnectionPromise) {
		remoteConnectionPromise = connectWithRetry().finally(() => {
			if (!remoteExecution?.hasCommandConnection()) {
				remoteConnectionPromise = undefined
			}
		})
	}

	return remoteConnectionPromise
}

export const shutdownRemoteExecution = async () => {
	const runtime = remoteExecution
	remoteExecution = undefined
	remoteExecutionStartPromise = undefined
	remoteConnectionPromise = undefined

	if (!runtime) {
		return
	}

	try {
		if (runtime.hasCommandConnection()) {
			runtime.closeCommandConnection()
		}
	} catch (error) {
		console.error("Failed to close Unreal command connection during shutdown:", error)
	}

	try {
		runtime.stop()
	} catch (error) {
		console.error("Failed to stop Unreal Remote Execution during shutdown:", error)
	}
}

export const tryRunCommand = async (command: string): Promise<string> => {
	const t0 = performance.now()
	const runtime = await ensureRemoteConnection()
	logTiming("ensureConnection", t0)

	try {
		const tCmd = performance.now()
		const result = await runtime.runCommand(command)
		logTiming(`runCommand (${command.length} chars)`, tCmd)
		if (!result.success) {
			throw new Error(`Command failed with: ${result.result}`)
		}

		return result.output.map((line) => line.output).join("\n")
	} catch (error) {
		try {
			if (runtime.hasCommandConnection()) {
				runtime.closeCommandConnection()
			}
		} catch (closeError) {
			console.error("Failed to close stale Unreal command connection:", closeError)
		}

		remoteConnectionPromise = undefined
		const retryRuntime = await ensureRemoteConnection()
		const retryResult = await retryRuntime.runCommand(command)
		if (!retryResult.success) {
			throw error instanceof Error ? error : new Error(String(error))
		}

		return retryResult.output.map((line) => line.output).join("\n")
	}
}

export const discoverPath = async (command: string, errorMessage: string) => {
	const output = await tryRunCommand(command)
	const lines = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
	const discoveredPath = lines.length > 0 ? lines[lines.length - 1] : ""

	if (!discoveredPath || discoveredPath === "None") {
		throw new Error(errorMessage)
	}

	return discoveredPath
}
