#!/usr/bin/env node

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { runAssetAuthoringScenarios } from "./e2e/asset-authoring-smoke.mjs"
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

		await runStep("Read project info", async () => {
			projectInfo = await callJsonTool("manage_editor", {
				action: "project_info",
				params: {},
			})
			assert(typeof projectInfo.project_name === "string" && projectInfo.project_name.length > 0, "project_name is missing")
			assert(typeof projectInfo.engine_version === "string" && projectInfo.engine_version.includes("4.27"), "engine_version does not look like UE4.27")
		})

		await runStep("Read Unreal Engine path through direct tool", async () => {
			const enginePathText = await callTextTool("get_unreal_engine_path")
			assert(
				enginePathText.startsWith("Unreal Engine path: "),
				"get_unreal_engine_path did not return the expected text format",
			)
			assert(
				enginePathText.slice("Unreal Engine path: ".length).trim().length > 0,
				"get_unreal_engine_path returned an empty path",
			)
		})

		await runStep("Read Unreal project path through direct tool", async () => {
			const projectPathText = await callTextTool("get_unreal_project_path")
			assert(
				projectPathText.startsWith("Unreal Project path: "),
				"get_unreal_project_path did not return the expected text format",
			)
			projectFilePath = projectPathText.slice("Unreal Project path: ".length).trim()
			assert(
				projectFilePath.toLowerCase().includes(".uproject"),
				"get_unreal_project_path did not return a .uproject path",
			)
		})

		await runStep("Read Unreal version through direct tool", async () => {
			const versionText = await callTextTool("get_unreal_version")
			assert(
				versionText.startsWith("Unreal version: "),
				"get_unreal_version did not return the expected text format",
			)
			assert(
				versionText.includes("4.27"),
				"get_unreal_version did not report a UE4.27 engine version",
			)
			assert(
				typeof projectInfo.engine_version === "string" &&
					versionText.includes(projectInfo.engine_version),
				"get_unreal_version did not match manage_editor.project_info",
			)
		})

		await runStep("Read current map info", async () => {
			currentMapInfo = await callJsonTool("manage_editor", {
				action: "map_info",
				params: {},
			})
			assert(typeof currentMapInfo.map_name === "string" && currentMapInfo.map_name.length > 0, "map_name is missing")
			assert(Number.isFinite(currentMapInfo.total_actors), "total_actors is missing")
		})

		await runStep("Read current world outliner", async () => {
			const outliner = await callJsonTool("manage_editor", {
				action: "world_outliner",
				params: {},
			})
			assert(Array.isArray(outliner.actors), "world outliner did not return an actor list")
		})

		await runStep("Read map info through manage_level", async () => {
			const levelInfo = await callJsonTool("manage_level", {
				action: "info",
				params: {},
			})
			assert(levelInfo.map_name === currentMapInfo.map_name, "manage_level info returned a different map name")
			assert(Number.isFinite(levelInfo.total_actors), "manage_level info did not return total_actors")
		})

		await runStep("Inspect the current map through manage_inspection", async () => {
			const mapInfo = await callJsonTool("manage_inspection", {
				action: "map",
				params: {},
			})
			assert(mapInfo.map_name === currentMapInfo.map_name, "manage_inspection map returned a different map name")
			assert(Number.isFinite(mapInfo.total_actors), "manage_inspection map did not return total_actors")
		})

		await runStep("Read world outliner through manage_level", async () => {
			const outliner = await callJsonTool("manage_level", {
				action: "world_outliner",
				params: {},
			})
			assert(Array.isArray(outliner.actors), "manage_level world_outliner did not return an actor list")
			assert(Number.isFinite(outliner.total_actors), "manage_level world_outliner did not return total_actors")
		})

		await runStep("Search assets through manage_asset", async () => {
			const searchResult = await callJsonTool("manage_asset", {
				action: "search",
				params: {
					search_term: "Cube",
					asset_class: "StaticMesh",
				},
			})
			assert(Array.isArray(searchResult.assets), "manage_asset search did not return an asset list")
			assert(
				searchResult.assets.some((asset) => asset.package_name === "/Engine/BasicShapes/Cube"),
				"manage_asset search did not find /Engine/BasicShapes/Cube",
			)
		})

		await runStep("Read asset info through manage_asset", async () => {
			const assetInfo = await callJsonTool("manage_asset", {
				action: "info",
				params: { asset_path: "/Engine/BasicShapes/Cube" },
			})
			assert(Array.isArray(assetInfo) && assetInfo.length === 1, "manage_asset info did not return one asset record")
			assert(assetInfo[0].package === "/Engine/BasicShapes/Cube", "manage_asset info returned the wrong asset package")
		})

		await runStep("Read asset references through manage_asset", async () => {
			const references = await callJsonTool("manage_asset", {
				action: "references",
				params: { asset_path: "/Engine/BasicShapes/Cube" },
			})
			assert(Array.isArray(references), "manage_asset references did not return an array")
		})

		await runStep("Inspect an asset through manage_inspection", async () => {
			const assetInfo = await callJsonTool("manage_inspection", {
				action: "asset",
				params: { asset_path: "/Engine/BasicShapes/Cube" },
			})
			assert(Array.isArray(assetInfo) && assetInfo.length === 1, "manage_inspection asset did not return one asset record")
			assert(assetInfo[0].package === "/Engine/BasicShapes/Cube", "manage_inspection asset returned the wrong asset package")
		})

		await runStep("Inspect asset references through manage_inspection", async () => {
			const references = await callJsonTool("manage_inspection", {
				action: "asset_references",
				params: { asset_path: "/Engine/BasicShapes/Cube" },
			})
			assert(Array.isArray(references), "manage_inspection asset_references did not return an array")
		})

		let skeletonAssetPath = ""
		await runStep("Search skeleton assets through manage_skeleton", async () => {
			const skeletonSearchResult = await callJsonTool("manage_skeleton", {
				action: "search_skeletons",
				params: { search_term: "" },
			})
			assert(Array.isArray(skeletonSearchResult.assets), "manage_skeleton search_skeletons did not return an asset list")
			skeletonAssetPath = firstAssetPathFromSearch(skeletonSearchResult)
			if (!skeletonAssetPath) {
				throw new StepSkipError("No Skeleton assets were found in the active project or engine content.")
			}
		})

		let skeletalMeshAssetPath = ""
		await runStep("Search skeletal meshes through manage_skeleton", async () => {
			const skeletalMeshSearchResult = await callJsonTool("manage_skeleton", {
				action: "search_skeletal_meshes",
				params: { search_term: "" },
			})
			assert(Array.isArray(skeletalMeshSearchResult.assets), "manage_skeleton search_skeletal_meshes did not return an asset list")
			skeletalMeshAssetPath = firstAssetPathFromSearch(skeletalMeshSearchResult)
			if (!skeletalMeshAssetPath) {
				throw new StepSkipError("No SkeletalMesh assets were found in the active project or engine content.")
			}
		})

		await runStep("Read skeleton-related metadata through manage_skeleton", async () => {
			const skeletonInfoTarget = skeletonAssetPath || skeletalMeshAssetPath
			if (!skeletonInfoTarget) {
				throw new StepSkipError("No Skeleton or SkeletalMesh asset was available for asset_info.")
			}
			const skeletonInfo = await callJsonTool("manage_skeleton", {
				action: "asset_info",
				params: { asset_path: skeletonInfoTarget },
			})
			assert(Array.isArray(skeletonInfo) && skeletonInfo.length === 1, "manage_skeleton asset_info did not return one asset record")
			assert(
				skeletonInfo[0].package === skeletonInfoTarget,
				"manage_skeleton asset_info returned the wrong asset package",
			)
		})

		await runStep("Validate an asset through manage_system", async () => {
			const validationResult = await callJsonTool("manage_system", {
				action: "validate_assets",
				params: { asset_paths: "/Engine/BasicShapes/Cube" },
			})
			assert(validationResult.total_validated === 1, "manage_system validate_assets did not validate one asset")
			assert(
				validationResult.validation_summary?.valid_count === 1,
				"manage_system validate_assets did not mark the engine cube as valid",
			)
		})

		await runStep("Validate an asset through manage_asset", async () => {
			const validationResult = await callJsonTool("manage_asset", {
				action: "validate",
				params: { asset_paths: "/Engine/BasicShapes/Cube" },
			})
			assert(validationResult.total_validated === 1, "manage_asset validate did not validate one asset")
			assert(
				validationResult.validation_summary?.valid_count === 1,
				"manage_asset validate did not mark the engine cube as valid",
			)
		})

		await runStep("Read source control provider info", async () => {
			const sourceControlInfo = await callJsonTool("manage_source_control", {
				action: "provider_info",
				params: {},
			})
			assert(typeof sourceControlInfo.provider === "string", "provider is missing")
			assert(typeof sourceControlInfo.enabled === "boolean", "enabled is missing")
			assert(typeof sourceControlInfo.available === "boolean", "available is missing")
		})

		await runStep("Query source control state", async () => {
			const sourceControlState = await callJsonTool("manage_source_control", {
				action: "query_state",
				params: { file: "/Game" },
			})
			assert(typeof sourceControlState.state?.filename === "string", "state filename is missing")
			assert(typeof sourceControlState.state?.is_valid === "boolean", "state validity is missing")
		})

		await runStep("Query source control states in bulk", async () => {
			const sourceControlStates = await callJsonTool("manage_source_control", {
				action: "query_states",
				params: { files: ["/Game", "/Engine/BasicShapes/Cube"] },
			})
			assert(sourceControlStates.count === 2, "manage_source_control query_states did not return the expected count")
			assert(Array.isArray(sourceControlStates.states), "manage_source_control query_states did not return a states list")
			assert(
				sourceControlStates.states.every(
					(state) =>
						typeof state?.filename === "string" && typeof state?.is_valid === "boolean",
				),
				"manage_source_control query_states returned an invalid state entry",
			)
		})

		await runStep("Take an editor screenshot through manage_editor", async () => {
			const screenshotText = (await callTextTool("manage_editor", {
				action: "screenshot",
				params: {},
			})).trim()
			assert(
				screenshotText.length > 0 && !screenshotText.includes("Failed to take screenshot"),
				"manage_editor screenshot did not return a screenshot path",
			)
			const screenshotPath = resolveLocalPath(screenshotText)
			assert(fs.existsSync(screenshotPath), `manage_editor screenshot did not create a file at ${screenshotPath}`)
			addCleanup(`Delete screenshot ${screenshotPath}`, async () => {
				try {
					fs.unlinkSync(screenshotPath)
				} catch {
					// Best effort only.
				}
			})
		})

		await runStep("Execute Python through manage_editor", async () => {
			const marker = `${options.prefix}_run_python_ok`
			const pythonOutput = (await callTextTool("manage_editor", {
				action: "run_python",
				params: {
					code: `print("${marker}")`,
				},
			})).trim()
			assert(
				pythonOutput === marker,
				`manage_editor run_python returned unexpected output: ${pythonOutput}`,
			)
		})

		const smokeConsoleVariableName = "t.MaxFPS"
		addCleanup(`Reset console variable ${smokeConsoleVariableName}`, async () => {
			try {
				await callJsonTool("manage_editor", {
					action: "console_command",
					params: { command: `${smokeConsoleVariableName} 0` },
				})
			} catch {
				// Best effort only.
			}
		})

		await runStep("Execute a console command through manage_editor", async () => {
			const consoleResult = await callJsonTool("manage_editor", {
				action: "console_command",
				params: { command: `${smokeConsoleVariableName} 87` },
			})
			assert(
				consoleResult.command === `${smokeConsoleVariableName} 87`,
				"manage_editor console_command did not echo the executed command",
			)
		})

		await runStep("Read a console variable through manage_editor", async () => {
			const consoleVariable = await callJsonTool("manage_editor", {
				action: "get_console_variable",
				params: { variable_name: smokeConsoleVariableName },
			})
			assert(
				consoleVariable.variable_name === smokeConsoleVariableName,
				"manage_editor get_console_variable returned the wrong variable name",
			)
			assert(
				Math.abs(Number(consoleVariable.float_value ?? 0) - 87) < 0.5
					|| Number(consoleVariable.int_value ?? -1) === 87
					|| String(consoleVariable.string_value ?? "").includes("87"),
				"manage_editor get_console_variable did not report the expected value",
			)
		})

		await runStep("Execute a console command through manage_system", async () => {
			const consoleResult = await callJsonTool("manage_system", {
				action: "console_command",
				params: { command: `${smokeConsoleVariableName} 91` },
			})
			assert(
				consoleResult.command === `${smokeConsoleVariableName} 91`,
				"manage_system console_command did not echo the executed command",
			)
		})

		await runStep("Read a console variable through manage_system", async () => {
			const consoleVariable = await callJsonTool("manage_system", {
				action: "get_console_variable",
				params: { variable_name: smokeConsoleVariableName },
			})
			assert(
				consoleVariable.variable_name === smokeConsoleVariableName,
				"manage_system get_console_variable returned the wrong variable name",
			)
			assert(
				Math.abs(Number(consoleVariable.float_value ?? 0) - 91) < 0.5
					|| Number(consoleVariable.int_value ?? -1) === 91
					|| String(consoleVariable.string_value ?? "").includes("91"),
				"manage_system get_console_variable did not report the expected value",
			)
		})

		await runStep("Move the viewport camera through manage_editor", async () => {
			const cameraResult = await callJsonTool("manage_editor", {
				action: "move_camera",
				params: {
					location: { x: 180, y: -420, z: 360 },
					rotation: { pitch: -20, yaw: 35, roll: 0 },
				},
			})
			assert(
				Math.abs(Number(cameraResult.location?.x ?? 0) - 180) < 0.1,
				"manage_editor move_camera did not update the expected X location",
			)
			assert(
				Math.abs(Number(cameraResult.rotation?.yaw ?? 0) - 35) < 0.1,
				"manage_editor move_camera did not update the expected yaw",
			)
		})

		const directActorName = `${options.prefix}_DirectActor`
		addCleanup(`Delete actor ${directActorName}`, () => safeDeleteActor(directActorName))

		await runStep("Spawn a direct-tool smoke-test actor", async () => {
			const directCreateResult = await callJsonTool("editor_create_object", {
				object_class: "StaticMeshActor",
				object_name: directActorName,
				location: { x: 0, y: -300, z: 150 },
			})
			assert(
				directCreateResult.actor_label === directActorName,
				"editor_create_object did not create the expected actor label",
			)
		})

		await runStep("Update the direct-tool smoke-test actor", async () => {
			const directUpdateResult = await callJsonTool("editor_update_object", {
				actor_name: directActorName,
				location: { x: 300, y: -300, z: 150 },
			})
			assert(
				Math.abs(Number(directUpdateResult.location?.x ?? 0) - 300) < 0.1,
				"editor_update_object did not update the expected X location",
			)
		})

		await runStep("Delete the direct-tool smoke-test actor", async () => {
			const directDeleteResult = await callJsonTool("editor_delete_object", {
				actor_names: directActorName,
			})
			assert(
				directDeleteResult.deleted_actor?.actor_label === directActorName,
				"editor_delete_object did not delete the expected actor",
			)
		})

		const granularActorName = `${options.prefix}_Actor`
		addCleanup(`Delete actor ${granularActorName}`, () => safeDeleteActor(granularActorName))

		await runStep("Spawn a granular smoke-test actor", async () => {
			const spawnResult = await callJsonTool("manage_actor", {
				action: "spawn",
				params: {
					type: "StaticMeshActor",
					name: granularActorName,
					location: { x: 0, y: 0, z: 150 },
				},
			})
			assert(spawnResult.actor?.label === granularActorName, "manage_actor spawn did not create the expected label")
		})

		await runStep("Find the spawned actor by name", async () => {
			const findResult = await callJsonTool("manage_actor", {
				action: "find",
				params: { pattern: granularActorName },
			})
			assert(findResult.count >= 1, "manage_actor find did not locate the smoke actor")
		})

		await runStep("List actors through manage_actor", async () => {
			const actorList = await callJsonTool("manage_actor", {
				action: "list",
				params: {},
			})
			assert(Array.isArray(actorList.actors), "manage_actor list did not return an actor list")
			assert(
				actorList.actors.some((actor) => actor.label === granularActorName),
				"manage_actor list did not include the smoke actor",
			)
		})

		await runStep("List actors through manage_level", async () => {
			const actorList = await callJsonTool("manage_level", {
				action: "list_actors",
				params: {},
			})
			assert(Array.isArray(actorList.actors), "manage_level list_actors did not return an actor list")
			assert(
				actorList.actors.some((actor) => actor.label === granularActorName),
				"manage_level list_actors did not include the smoke actor",
			)
		})

		await runStep("Assign a static mesh through manage_actor", async () => {
			const propertyResult = await callJsonTool("manage_actor", {
				action: "set_property",
				params: {
					name: granularActorName,
					property_name: "StaticMesh",
					property_value: "/Engine/BasicShapes/Cube",
				},
			})
			assert(propertyResult.actor?.label === granularActorName, "manage_actor set_property returned the wrong actor")
		})

		await runStep("Apply a material to the actor through manage_material_authoring", async () => {
			const applyResult = await callJsonTool("manage_material_authoring", {
				action: "apply_to_actor",
				params: {
					actor_name: granularActorName,
					material_path: basicShapeMaterialPath,
				},
			})
			assert(applyResult.actor?.label === granularActorName, "manage_material_authoring apply_to_actor returned the wrong actor")
			assert(
				applyResult.material?.path === basicShapeMaterialPath,
				"manage_material_authoring apply_to_actor returned the wrong material path",
			)
		})

		await runStep("Inspect actor material info through manage_actor", async () => {
			const materialInfo = await callJsonTool("manage_actor", {
				action: "get_material_info",
				params: { name: granularActorName },
			})
			assert(
				Array.isArray(materialInfo.materials?.components),
				"manage_actor get_material_info did not return component materials",
			)
			assert(
				materialInfo.materials.components.some((component) =>
					Array.isArray(component.materials)
						&& component.materials.some((slot) => slot.material?.path === basicShapeMaterialPath),
				),
				"manage_actor get_material_info did not report the applied material",
			)
		})

		await runStep("Tint the actor material through manage_material_authoring", async () => {
			const tintResult = await callJsonTool("manage_material_authoring", {
				action: "tint_material",
				params: {
					actor_name: granularActorName,
					material_path: tintableMaterialPath,
					color: { r: 0.2, g: 0.8, b: 0.3, a: 1.0 },
					parameter_name: "Color",
					instance_name: path.basename(actorTintMaterialPath),
					instance_path: path.dirname(actorTintMaterialPath).replace(/\\/g, "/"),
				},
			})
			assert(tintResult.actor?.label === granularActorName, "manage_material_authoring tint_material returned the wrong actor")
			assert(
				tintResult.material?.path === actorTintMaterialPath,
				`manage_material_authoring tint_material returned an unexpected material path: ${tintResult.material?.path}`,
			)
			assert(
				typeof tintResult.parameter_name === "string" && tintResult.parameter_name.length > 0,
				"manage_material_authoring tint_material did not report a parameter name",
			)
		})

		await runStep("Move the spawned actor", async () => {
			const transformResult = await callJsonTool("manage_actor", {
				action: "transform",
				params: {
					name: granularActorName,
					location: { x: 300, y: 0, z: 150 },
					scale: { x: 1, y: 1, z: 1 },
				},
			})
			assert(
				Math.abs(Number(transformResult.actor?.location?.x ?? 0) - 300) < 0.1,
				"manage_actor transform did not update the expected X location",
			)
		})

		await runStep("Inspect actor properties", async () => {
			const propertyResult = await callJsonTool("manage_actor", {
				action: "get_properties",
				params: { name: granularActorName },
			})
			assert(propertyResult.actor?.label === granularActorName, "manage_actor get_properties returned the wrong actor")
		})

		await runStep("Inspect actor properties through manage_inspection", async () => {
			const inspectionResult = await callJsonTool("manage_inspection", {
				action: "actor",
				params: { name: granularActorName },
			})
			assert(inspectionResult.actor?.label === granularActorName, "manage_inspection actor returned the wrong actor")
		})

		await runStep("Inspect actor materials through manage_inspection", async () => {
			const materialInspection = await callJsonTool("manage_inspection", {
				action: "actor_materials",
				params: { name: granularActorName },
			})
			assert(
				Array.isArray(materialInspection.materials?.components),
				"manage_inspection actor_materials did not return component materials",
			)
			assert(
				materialInspection.materials.components.some((component) =>
					Array.isArray(component.materials)
						&& component.materials.some((slot) => slot.material?.path === actorTintMaterialPath),
				),
				"manage_inspection actor_materials did not report the tinted material",
			)
		})

		await runStep("Delete the granular smoke-test actor", async () => {
			await callJsonTool("manage_actor", {
				action: "delete",
				params: { name: granularActorName },
			})
		})

		const namespaceActorName = `${options.prefix}_NamespaceActor`
		if (!options.skipNamespace) {
			addCleanup(`Delete actor ${namespaceActorName}`, () => safeDeleteActor(namespaceActorName))

			await runStep("Inspect registered tool namespaces", async () => {
				const namespaceInfo = await callJsonTool("manage_tools", { action: "list_namespaces", params: {} })
				assert(Array.isArray(namespaceInfo.namespaces), "manage_tools did not return a tool-namespace list")
				const namespaceNames = new Set(namespaceInfo.namespaces.map((item) => item.tool_namespace))
				for (const requiredNamespace of [
					"manage_actor",
					"manage_asset",
					"manage_data",
					"manage_source_control",
					"manage_widget_authoring",
				]) {
					assert(namespaceNames.has(requiredNamespace), `Tool namespace is missing: ${requiredNamespace}`)
				}
			})

			await runStep("Describe a tool namespace through manage_tools", async () => {
				const namespaceDescription = await callJsonTool("manage_tools", {
					action: "describe_namespace",
					params: { tool_name: "manage_material_authoring" },
				})
				assert(
					namespaceDescription.tool_namespace === "manage_material_authoring",
					"manage_tools describe_namespace returned the wrong namespace",
				)
				assert(
					Array.isArray(namespaceDescription.supported_actions)
						&& namespaceDescription.supported_actions.includes("apply_to_actor"),
					"manage_tools describe_namespace did not include apply_to_actor",
				)
			})

			await runStep("Read tool namespace status through manage_tools", async () => {
				const toolStatus = await callJsonTool("manage_tools", {
					action: "tool_status",
					params: {},
				})
				assert(
					Number.isFinite(toolStatus.tool_namespace_count) && toolStatus.tool_namespace_count >= 20,
					"manage_tools tool_status did not return a namespace count",
				)
				assert(
					Array.isArray(toolStatus.tool_namespaces)
						&& toolStatus.tool_namespaces.includes("manage_widget_authoring"),
					"manage_tools tool_status did not include manage_widget_authoring",
				)
			})

			await runStep("Read source control provider info through the tool-namespace layer", async () => {
				const providerInfo = await callJsonTool("manage_source_control", {
					action: "provider_info",
					params: {},
				})
				assert(typeof providerInfo.provider === "string", "manage_source_control did not return provider")
				assert(typeof providerInfo.enabled === "boolean", "manage_source_control did not return enabled")
				assert(typeof providerInfo.available === "boolean", "manage_source_control did not return available")
			})

			await runStep("Spawn an actor through the tool-namespace layer", async () => {
				const spawnResult = await callJsonTool("manage_actor", {
					action: "spawn",
					params: {
						type: "StaticMeshActor",
						name: namespaceActorName,
						location: { x: 0, y: 300, z: 150 },
					},
				})
				assert(
					spawnResult.actor?.label === namespaceActorName,
					"manage_actor spawn did not create the expected label",
				)
			})

			await runStep("Delete the tool-namespace actor", async () => {
				await callJsonTool("manage_actor", {
					action: "delete",
					params: { name: namespaceActorName },
				})
			})
		}

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
