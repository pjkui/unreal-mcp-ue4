#!/usr/bin/env node

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { runAssetAuthoringScenarios } from "./e2e/asset-authoring-smoke.mjs"
import { runCoreScenarios } from "./e2e/core-smoke.mjs"
import { runWorldActorScenarios } from "./e2e/world-actors-smoke.mjs"
import { runWorldPresetScenarios } from "./e2e/world-presets-smoke.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const defaultServerEntry = path.join(repoRoot, "dist", "bin.js")

function printHelp() {
	console.log(`Unreal MCP UE4 smoke test runner

Usage:
  node scripts/e2e-smoke.mjs [options]

Options:
  --with-assets         Also test Blueprint and UMG asset creation/cleanup.
  --with-source-control-mutations
                        Exercise safe source-control mutation workflows using temporary files/assets.
                        Implies --with-assets.
  --keep-assets         Keep temporary Blueprint and Widget assets after the run.
  --skip-namespace      Skip the tool-namespace smoke phase.
  --prefix <value>      Prefix used for temporary test actor and asset names.
  --timeout-ms <value>  Timeout for connect/tool calls. Default: 20000.
  --server-entry <path> Path to the built MCP server entry. Default: dist/bin.js.
  --node-path <path>    Node executable used to launch the MCP server. Default: current node.
  --verbose             Print captured server stderr lines while the test runs.
  --help                Show this help text.
`)
}

function parseArgs(argv) {
	const options = {
		nodePath: process.execPath,
		prefix: `MCP_E2E_${Date.now()}`,
		serverEntry: defaultServerEntry,
		skipNamespace: false,
		timeoutMs: 20_000,
		verbose: false,
		withAssets: false,
		withSourceControlMutations: false,
		keepAssets: false,
	}

	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index]

		switch (value) {
			case "--with-assets":
				options.withAssets = true
				break
			case "--with-source-control-mutations":
				options.withSourceControlMutations = true
				options.withAssets = true
				break
			case "--keep-assets":
				options.keepAssets = true
				break
			case "--skip-namespace":
			case "--skip-domain":
				options.skipNamespace = true
				break
			case "--verbose":
				options.verbose = true
				break
			case "--help":
			case "-h":
				options.help = true
				break
			case "--prefix":
				options.prefix = argv[++index]
				break
			case "--timeout-ms":
				options.timeoutMs = Number(argv[++index])
				break
			case "--server-entry":
				options.serverEntry = path.resolve(argv[++index])
				break
			case "--node-path":
				options.nodePath = path.resolve(argv[++index])
				break
			default:
				throw new Error(`Unknown argument: ${value}`)
		}
	}

	if (!options.help) {
		if (!options.prefix) {
			throw new Error("--prefix requires a value")
		}

		if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
			throw new Error("--timeout-ms must be a positive number")
		}
	}

	return options
}

function fail(message) {
	throw new Error(message)
}

class ToolFailureError extends Error {
	constructor(message, parsed = undefined) {
		super(message)
		this.name = "ToolFailureError"
		this.parsed = parsed
	}
}

class StepSkipError extends Error {
	constructor(message) {
		super(message)
		this.name = "StepSkipError"
	}
}

function assert(condition, message) {
	if (!condition) {
		fail(message)
	}
}

function withTimeout(promise, timeoutMs, label) {
	let timeoutId
	const timeoutPromise = new Promise((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms`))
		}, timeoutMs)
	})

	return Promise.race([promise, timeoutPromise]).finally(() => {
		clearTimeout(timeoutId)
	})
}

function extractTextContent(result) {
	if (!result || !Array.isArray(result.content)) {
		return ""
	}

	return result.content
		.filter((item) => item?.type === "text")
		.map((item) => item.text)
		.join("\n")
		.trim()
}

function parseToolJson(toolName, result) {
	if (result?.isError) {
		fail(`Tool ${toolName} returned an MCP error: ${extractTextContent(result)}`)
	}

	const text = extractTextContent(result)
	if (!text) {
		fail(`Tool ${toolName} returned no text content`)
	}

	try {
		const parsed = JSON.parse(text)
		if (parsed && typeof parsed === "object") {
			if (parsed.success === false) {
				throw new ToolFailureError(
					parsed.message ?? `Tool ${toolName} reported success=false`,
					parsed,
				)
			}

			if (typeof parsed.error === "string" && parsed.error) {
				throw new ToolFailureError(parsed.error, parsed)
			}
		}
		return parsed
	} catch (error) {
		if (error instanceof ToolFailureError) {
			throw error
		}

		fail(
			`Tool ${toolName} returned non-JSON content: ${text.slice(0, 400)}${
				text.length > 400 ? "..." : ""
			}`,
		)
	}
}

function buildDeleteAssetsPython(assetPaths) {
	return `import json
import unreal
asset_paths = ${JSON.stringify(assetPaths)}
deleted = {}
for asset_path in asset_paths:
    try:
        deleted[asset_path] = bool(unreal.EditorAssetLibrary.delete_asset(asset_path))
    except Exception as exc:
        deleted[asset_path] = str(exc)
print(json.dumps({"success": True, "deleted": deleted}, indent=2))`
}

function resolveLocalPath(pathValue) {
	if (!pathValue) {
		return ""
	}

	return path.isAbsolute(pathValue) ? pathValue : path.resolve(repoRoot, pathValue)
}

function projectRepoHasGitRemote(projectDirectory) {
	if (!projectDirectory) {
		return false
	}

	try {
		const gitConfigPath = path.join(projectDirectory, ".git", "config")
		if (!fs.existsSync(gitConfigPath)) {
			return false
		}

		const gitConfigContent = fs.readFileSync(gitConfigPath, "utf8")
		return /\[remote\s+"/.test(gitConfigContent)
	} catch {
		return false
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2))
	if (options.help) {
		printHelp()
		return
	}

	if (!fs.existsSync(options.serverEntry)) {
		fail(
			`Built MCP server entry not found at ${options.serverEntry}. Run "npm run build" first.`,
		)
	}

	const transport = new StdioClientTransport({
		command: options.nodePath,
		args: [options.serverEntry],
		cwd: repoRoot,
		stderr: "pipe",
	})

	const stderrLines = []
	const client = new Client({
		name: "unreal-mcp-ue4-e2e",
		version: "0.1.0",
	})

	client.onerror = (error) => {
		if (options.verbose) {
			process.stderr.write(`[client] ${error instanceof Error ? error.message : String(error)}\n`)
		}
	}

	if (transport.stderr) {
		transport.stderr.on("data", (chunk) => {
			const text = chunk.toString()
			if (!text) {
				return
			}

			stderrLines.push(...text.split(/\r?\n/).filter(Boolean))
			while (stderrLines.length > 40) {
				stderrLines.shift()
			}

			if (options.verbose) {
				process.stderr.write(`[server] ${text}`)
			}
		})
	}

	const cleanupTasks = []
	const summary = []
	let projectInfo
	let currentMapInfo
	let projectFilePath = ""
	const basicShapeMaterialPath = "/Engine/BasicShapes/BasicShapeMaterial"
	const tintableMaterialPath = "/Engine/EngineMaterials/EmissiveMeshMaterial"
	const actorTintMaterialPath = `/Game/MCP/Tests/MI_${options.prefix}_ActorTint`
	const debugTintMaterialPath = `/Game/MCP/Tests/MI_${options.prefix}_DebugTint`

	const addCleanup = (name, fn) => {
		cleanupTasks.push({ name, fn })
	}

	const logPass = (name, detail = "") => {
		const suffix = detail ? `: ${detail}` : ""
		console.log(`[PASS] ${name}${suffix}`)
		summary.push({ name, status: "passed", detail })
	}

	const logSkip = (name, detail = "") => {
		const suffix = detail ? `: ${detail}` : ""
		console.log(`[SKIP] ${name}${suffix}`)
		summary.push({ name, status: "skipped", detail })
	}

	const runStep = async (name, fn) => {
		try {
			const result = await fn()
			logPass(name)
			return result
		} catch (error) {
			if (error instanceof StepSkipError) {
				logSkip(name, error.message)
				return undefined
			}

			const message = error instanceof Error ? error.message : String(error)
			console.error(`[FAIL] ${name}: ${message}`)
			summary.push({ name, status: "failed", detail: message })
			throw error
		}
	}

	const callJsonTool = async (toolName, args = {}) => {
		const result = await withTimeout(
			client.callTool({ name: toolName, arguments: args }),
			options.timeoutMs,
			toolName,
		)
		return parseToolJson(toolName, result)
	}

	const callTextTool = async (toolName, args = {}) => {
		const result = await withTimeout(
			client.callTool({ name: toolName, arguments: args }),
			options.timeoutMs,
			toolName,
		)

		if (result?.isError) {
			fail(`Tool ${toolName} returned an MCP error: ${extractTextContent(result)}`)
		}

		const text = extractTextContent(result)
		if (!text) {
			fail(`Tool ${toolName} returned no text content`)
		}

		return text
	}

	const isUnsupportedWidgetTreeAuthoring = (error) => {
		if (error instanceof ToolFailureError) {
			if (error.parsed?.unsupported_capability === "widget_tree_authoring") {
				return true
			}
		}

		return (
			error instanceof Error &&
			error.message.includes("Widget blueprint does not expose an editable widget tree in UE4.27 Python.")
		)
	}

	const safeDeleteActor = async (actorName) => {
		try {
			await callJsonTool("manage_actor", {
				action: "delete",
				params: { name: actorName },
			})
		} catch {
			// Best effort cleanup only.
		}
	}

	const safeDeleteActors = async (actorNames) => {
		for (const actorName of actorNames) {
			if (typeof actorName !== "string" || !actorName) {
				continue
			}
			await safeDeleteActor(actorName)
		}
	}

	const safeDeleteAssets = async (assetPaths) => {
		if (assetPaths.length === 0) {
			return
		}

		try {
			await callJsonTool("manage_editor", {
				action: "run_python",
				params: { code: buildDeleteAssetsPython(assetPaths) },
			})
		} catch {
			// Best effort cleanup only.
		}
	}

	const safeRevertSourceControlFiles = async (files) => {
		const normalizedFiles = files.filter((file) => typeof file === "string" && file.length > 0)
		if (normalizedFiles.length === 0) {
			return
		}

		try {
			await callJsonTool("manage_source_control", {
				action: "revert",
				params: { files: normalizedFiles },
			})
		} catch {
			// Best effort cleanup only.
		}
	}

	const safeStopPie = async () => {
		try {
			await callJsonTool("manage_editor", {
				action: "stop_pie",
				params: { timeout_seconds: 5, poll_interval: 0.25 },
			})
		} catch {
			// Best effort cleanup only.
		}
	}

	const pollPieStatus = async (expectedRunning, attempts = 30, delayMs = 350) => {
		let latestStatus = null
		for (let attempt = 0; attempt < attempts; attempt += 1) {
			latestStatus = await callJsonTool("manage_editor", {
				action: "is_pie_running",
				params: {},
			})
			if (Boolean(latestStatus?.is_pie_running) === expectedRunning) {
				return latestStatus
			}
			await new Promise((resolve) => setTimeout(resolve, delayMs))
		}
		return latestStatus
	}

	const firstAssetPathFromSearch = (searchResult) => {
		if (!Array.isArray(searchResult?.assets)) {
			return ""
		}

		for (const asset of searchResult.assets) {
			for (const candidate of [
				asset?.package_name,
				asset?.path,
				asset?.asset_path,
				asset?.package,
			]) {
				if (typeof candidate === "string" && candidate.length > 0) {
					return candidate
				}
			}
		}

		return ""
	}

	const ctx = {
		options,
		fs,
		os,
		path,
		addCleanup,
		logSkip,
		runStep,
		callJsonTool,
		callTextTool,
		assert,
		resolveLocalPath,
		safeDeleteActor,
		safeDeleteActors,
		safeDeleteAssets,
		safeStopPie,
		safeRevertSourceControlFiles,
		pollPieStatus,
		isUnsupportedWidgetTreeAuthoring,
		firstAssetPathFromSearch,
		projectRepoHasGitRemote,
		StepSkipError,
		paths: {
			basicShapeMaterialPath,
			tintableMaterialPath,
			actorTintMaterialPath,
			debugTintMaterialPath,
		},
		getProjectInfo: () => projectInfo,
		setProjectInfo: (value) => {
			projectInfo = value
		},
		getCurrentMapInfo: () => currentMapInfo,
		setCurrentMapInfo: (value) => {
			currentMapInfo = value
		},
		getProjectFilePath: () => projectFilePath,
		setProjectFilePath: (value) => {
			projectFilePath = value
		},
	}

	try {
		await runStep("Connect to Unreal MCP server", async () => {
			await withTimeout(client.connect(transport), options.timeoutMs, "MCP connect")
		})

		addCleanup("Ensure PIE is stopped", () => safeStopPie())

		const toolsResult = await runStep("List registered MCP tools", async () => client.listTools())
		const toolNames = new Set(toolsResult.tools.map((tool) => tool.name))
		const requiredTools = [
			"get_unreal_engine_path",
			"get_unreal_project_path",
			"get_unreal_version",
			"manage_asset",
			"manage_editor",
			"manage_actor",
			"manage_level",
			"manage_inspection",
			"manage_lighting",
			"manage_navigation",
			"manage_volumes",
			"manage_effect",
			"manage_splines",
			"manage_level_structure",
			"manage_environment",
			"manage_geometry",
			"manage_material_authoring",
			"manage_data",
			"manage_sequence",
			"manage_audio",
			"manage_skeleton",
			"manage_behavior_tree",
			"manage_gas",
			"manage_source_control",
			"manage_system",
			"manage_tools",
		]

		if (options.withAssets) {
			requiredTools.push(
				"manage_animation_physics",
				"manage_blueprint",
				"manage_input",
				"manage_material_authoring",
				"manage_texture",
				"manage_widget_authoring",
			)
		}

		await runStep("Verify required tool names are exposed", async () => {
			const missingTools = requiredTools.filter((toolName) => !toolNames.has(toolName))
			assert(missingTools.length === 0, `Missing expected tools: ${missingTools.join(", ")}`)
		})

		await runCoreScenarios(ctx)

		await runWorldActorScenarios(ctx)
		await runWorldPresetScenarios(ctx)

		if (options.withAssets) {
			await runAssetAuthoringScenarios(ctx)
		}

		console.log("")
		const skippedChecks = summary.filter((item) => item.status === "skipped").length
		const skipSuffix = skippedChecks > 0 ? ` (${skippedChecks} skipped)` : ""
		console.log(`Smoke test completed successfully with ${summary.length} checks${skipSuffix}.`)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error("")
		console.error(`Smoke test failed: ${message}`)
		if (stderrLines.length > 0) {
			console.error("")
			console.error("Recent server stderr:")
			for (const line of stderrLines.slice(-20)) {
				console.error(`  ${line}`)
			}
		}
		process.exitCode = 1
	} finally {
		for (const cleanupTask of cleanupTasks.reverse()) {
			try {
				await cleanupTask.fn()
				if (options.verbose) {
					process.stderr.write(`[cleanup] ${cleanupTask.name}\n`)
				}
			} catch {
				// Best effort cleanup only.
			}
		}

		try {
			await transport.close()
		} catch {
			// Ignore close errors during teardown.
		}
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error)
	console.error(`Smoke runner crashed: ${message}`)
	process.exit(1)
})
