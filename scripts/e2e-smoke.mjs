#!/usr/bin/env node

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

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

		const lightActorName = `${options.prefix}_PointLight`
		const directionalLightActorName = `${options.prefix}_DirectionalLight`
		const spotLightActorName = `${options.prefix}_SpotLight`
		const navBoundsVolumeName = `${options.prefix}_NavBounds`
		const navModifierVolumeName = `${options.prefix}_NavModifier`
		const navLinkProxyName = `${options.prefix}_NavLinkProxy`
		const triggerVolumeName = `${options.prefix}_TriggerVolume`
		const blockingVolumeName = `${options.prefix}_BlockingVolume`
		const physicsVolumeName = `${options.prefix}_PhysicsVolume`
		const audioVolumeName = `${options.prefix}_AudioVolume`
		const debugShapeActorName = `cube_${options.prefix}_DebugShape`
		const splineActorName = `${options.prefix}_SplineHost`
		addCleanup(`Delete actor ${lightActorName}`, () => safeDeleteActor(lightActorName))
		addCleanup(`Delete actor ${directionalLightActorName}`, () => safeDeleteActor(directionalLightActorName))
		addCleanup(`Delete actor ${spotLightActorName}`, () => safeDeleteActor(spotLightActorName))
		addCleanup(`Delete actor ${navBoundsVolumeName}`, () => safeDeleteActor(navBoundsVolumeName))
		addCleanup(`Delete actor ${navModifierVolumeName}`, () => safeDeleteActor(navModifierVolumeName))
		addCleanup(`Delete actor ${navLinkProxyName}`, () => safeDeleteActor(navLinkProxyName))
		addCleanup(`Delete actor ${triggerVolumeName}`, () => safeDeleteActor(triggerVolumeName))
		addCleanup(`Delete actor ${blockingVolumeName}`, () => safeDeleteActor(blockingVolumeName))
		addCleanup(`Delete actor ${physicsVolumeName}`, () => safeDeleteActor(physicsVolumeName))
		addCleanup(`Delete actor ${audioVolumeName}`, () => safeDeleteActor(audioVolumeName))
		addCleanup(`Delete actor ${debugShapeActorName}`, () => safeDeleteActor(debugShapeActorName))
		addCleanup(`Delete actor ${splineActorName}`, () => safeDeleteActor(splineActorName))

		await runStep("Spawn a point light through manage_lighting", async () => {
			const lightResult = await callJsonTool("manage_lighting", {
				action: "spawn_point_light",
				params: {
					name: lightActorName,
					location: { x: -300, y: 300, z: 240 },
				},
			})
			assert(lightResult.actor?.label === lightActorName, "manage_lighting spawn_point_light did not create the expected actor")
		})

		await runStep("Spawn a directional light through manage_lighting", async () => {
			const directionalLightResult = await callJsonTool("manage_lighting", {
				action: "spawn_directional_light",
				params: {
					name: directionalLightActorName,
					location: { x: -420, y: 320, z: 320 },
					rotation: { pitch: -35, yaw: 15, roll: 0 },
				},
			})
			assert(
				directionalLightResult.actor?.label === directionalLightActorName,
				"manage_lighting spawn_directional_light did not create the expected actor",
			)
		})

		await runStep("Spawn a spot light through manage_lighting", async () => {
			const spotLightResult = await callJsonTool("manage_lighting", {
				action: "spawn_spot_light",
				params: {
					name: spotLightActorName,
					location: { x: -80, y: 300, z: 280 },
					rotation: { pitch: -45, yaw: 0, roll: 0 },
				},
			})
			assert(
				spotLightResult.actor?.label === spotLightActorName,
				"manage_lighting spawn_spot_light did not create the expected actor",
			)
		})

		await runStep("Move the point light through manage_lighting", async () => {
			const transformResult = await callJsonTool("manage_lighting", {
				action: "transform_light",
				params: {
					name: lightActorName,
					location: { x: -180, y: 300, z: 260 },
				},
			})
			assert(
				Math.abs(Number(transformResult.actor?.location?.x ?? 0) - -180) < 0.1,
				"manage_lighting transform_light did not update the expected X location",
			)
		})

		await runStep("Inspect lighting through manage_lighting", async () => {
			const lightingInfo = await callJsonTool("manage_lighting", {
				action: "inspect_lighting",
				params: {},
			})
			assert(typeof lightingInfo.map_name === "string" && lightingInfo.map_name.length > 0, "manage_lighting inspect_lighting did not return map_name")
			assert(Number.isFinite(lightingInfo.lighting?.point_lights), "manage_lighting inspect_lighting did not return point_lights")
		})

		await runStep("Delete the point light smoke-test actor", async () => {
			await callJsonTool("manage_actor", {
				action: "delete",
				params: { name: lightActorName },
			})
		})

		await runStep("Spawn a nav-mesh bounds volume through manage_navigation", async () => {
			const navVolumeResult = await callJsonTool("manage_navigation", {
				action: "spawn_nav_mesh_bounds_volume",
				params: {
					name: navBoundsVolumeName,
					location: { x: 420, y: 320, z: 0 },
					scale: { x: 4, y: 4, z: 2 },
				},
			})
			assert(
				navVolumeResult.actor_label === navBoundsVolumeName,
				"manage_navigation spawn_nav_mesh_bounds_volume did not create the expected actor label",
			)
		})

		await runStep("Spawn a nav modifier volume through manage_navigation", async () => {
			const navModifierResult = await callJsonTool("manage_navigation", {
				action: "spawn_nav_modifier_volume",
				params: {
					name: navModifierVolumeName,
					location: { x: 470, y: 250, z: 0 },
					scale: { x: 2, y: 2, z: 2 },
				},
			})
			assert(
				navModifierResult.actor_label === navModifierVolumeName,
				"manage_navigation spawn_nav_modifier_volume did not create the expected actor label",
			)
		})

		await runStep("Spawn a nav link proxy through manage_navigation", async () => {
			const navLinkResult = await callJsonTool("manage_navigation", {
				action: "spawn_nav_link_proxy",
				params: {
					name: navLinkProxyName,
					location: { x: 520, y: 250, z: 0 },
				},
			})
			assert(
				navLinkResult.actor_label === navLinkProxyName,
				"manage_navigation spawn_nav_link_proxy did not create the expected actor label",
			)
		})

		await runStep("Inspect navigation through manage_navigation", async () => {
			const navigationInfo = await callJsonTool("manage_navigation", {
				action: "inspect_navigation",
				params: {},
			})
			assert(
				typeof navigationInfo.map_name === "string" && navigationInfo.map_name.length > 0,
				"manage_navigation inspect_navigation did not return map_name",
			)
			assert(
				Number.isFinite(navigationInfo.total_actors),
				"manage_navigation inspect_navigation did not return total_actors",
			)
		})

		await runStep("Delete the nav-mesh bounds volume", async () => {
			await callJsonTool("manage_actor", {
				action: "delete",
				params: { name: navBoundsVolumeName },
			})
		})

		await runStep("Delete the nav modifier volume", async () => {
			await callJsonTool("manage_actor", {
				action: "delete",
				params: { name: navModifierVolumeName },
			})
		})

		await runStep("Delete the nav link proxy", async () => {
			await callJsonTool("manage_actor", {
				action: "delete",
				params: { name: navLinkProxyName },
			})
		})

		await runStep("Spawn a trigger volume through manage_volumes", async () => {
			const triggerVolumeResult = await callJsonTool("manage_volumes", {
				action: "spawn_trigger_volume",
				params: {
					name: triggerVolumeName,
					location: { x: 520, y: 320, z: 0 },
					scale: { x: 2, y: 2, z: 2 },
				},
			})
			assert(
				triggerVolumeResult.actor_label === triggerVolumeName,
				"manage_volumes spawn_trigger_volume did not create the expected actor label",
			)
		})

		await runStep("Spawn a blocking volume through manage_volumes", async () => {
			const blockingVolumeResult = await callJsonTool("manage_volumes", {
				action: "spawn_blocking_volume",
				params: {
					name: blockingVolumeName,
					location: { x: 600, y: 260, z: 0 },
					scale: { x: 2, y: 2, z: 2 },
				},
			})
			assert(
				blockingVolumeResult.actor_label === blockingVolumeName,
				"manage_volumes spawn_blocking_volume did not create the expected actor label",
			)
		})

		await runStep("Spawn a physics volume through manage_volumes", async () => {
			const physicsVolumeResult = await callJsonTool("manage_volumes", {
				action: "spawn_physics_volume",
				params: {
					name: physicsVolumeName,
					location: { x: 650, y: 260, z: 0 },
					scale: { x: 2, y: 2, z: 2 },
				},
			})
			assert(
				physicsVolumeResult.actor_label === physicsVolumeName,
				"manage_volumes spawn_physics_volume did not create the expected actor label",
			)
		})

		await runStep("Spawn an audio volume through manage_volumes", async () => {
			const audioVolumeResult = await callJsonTool("manage_volumes", {
				action: "spawn_audio_volume",
				params: {
					name: audioVolumeName,
					location: { x: 700, y: 260, z: 0 },
					scale: { x: 2, y: 2, z: 2 },
				},
			})
			assert(
				audioVolumeResult.actor_label === audioVolumeName,
				"manage_volumes spawn_audio_volume did not create the expected actor label",
			)
		})

		await runStep("Transform the trigger volume through manage_volumes", async () => {
			const transformVolumeResult = await callJsonTool("manage_volumes", {
				action: "transform_volume",
				params: {
					name: triggerVolumeName,
					location: { x: 560, y: 320, z: 32 },
					scale: { x: 3, y: 2, z: 2 },
				},
			})
			assert(
				Math.abs(Number(transformVolumeResult.actor?.location?.x ?? 0) - 560) < 0.1,
				"manage_volumes transform_volume did not update the expected X location",
			)
		})

		await runStep("Delete the trigger volume through manage_volumes", async () => {
			await callJsonTool("manage_volumes", {
				action: "delete_volume",
				params: { name: triggerVolumeName },
			})
		})

		await runStep("Delete the blocking volume through manage_volumes", async () => {
			await callJsonTool("manage_volumes", {
				action: "delete_volume",
				params: { name: blockingVolumeName },
			})
		})

		await runStep("Delete the physics volume through manage_volumes", async () => {
			await callJsonTool("manage_volumes", {
				action: "delete_volume",
				params: { name: physicsVolumeName },
			})
		})

		await runStep("Delete the audio volume through manage_volumes", async () => {
			await callJsonTool("manage_volumes", {
				action: "delete_volume",
				params: { name: audioVolumeName },
			})
		})

		await runStep("Spawn a debug shape through manage_effect", async () => {
			const effectResult = await callJsonTool("manage_effect", {
				action: "spawn_debug_shape",
				params: {
					shape: "cube",
					name: `${options.prefix}_DebugShape`,
					location: { x: 640, y: 320, z: 100 },
					scale: { x: 1.25, y: 1.25, z: 1.25 },
				},
			})
			assert(
				effectResult.actor_label === debugShapeActorName,
				"manage_effect spawn_debug_shape did not create the expected actor label",
			)
		})

		await runStep("Apply a material to the debug shape through manage_effect", async () => {
			const applyResult = await callJsonTool("manage_effect", {
				action: "apply_material",
				params: {
					name: debugShapeActorName,
					material_path: tintableMaterialPath,
				},
			})
			assert(applyResult.actor?.label === debugShapeActorName, "manage_effect apply_material returned the wrong actor")
			assert(
				applyResult.material?.path === tintableMaterialPath,
				"manage_effect apply_material returned the wrong material path",
			)
		})

		await runStep("Tint the debug shape through manage_effect", async () => {
			const tintResult = await callJsonTool("manage_effect", {
				action: "tint_debug_shape",
				params: {
					name: debugShapeActorName,
					color: { r: 0.9, g: 0.2, b: 0.2, a: 1.0 },
					material_path: tintableMaterialPath,
					parameter_name: "Color",
					instance_name: path.basename(debugTintMaterialPath),
					instance_path: path.dirname(debugTintMaterialPath).replace(/\\/g, "/"),
				},
			})
			assert(tintResult.actor?.label === debugShapeActorName, "manage_effect tint_debug_shape returned the wrong actor")
			assert(
				tintResult.material?.path === debugTintMaterialPath,
				`manage_effect tint_debug_shape returned an unexpected material path: ${tintResult.material?.path}`,
			)
			assert(
				typeof tintResult.parameter_name === "string" && tintResult.parameter_name.length > 0,
				"manage_effect tint_debug_shape did not report a parameter name",
			)
		})

		await runStep("Delete the debug shape through manage_effect", async () => {
			await callJsonTool("manage_effect", {
				action: "delete_debug_shape",
				params: { name: debugShapeActorName },
			})
		})

		await runStep("Spawn a spline host actor through manage_splines", async () => {
			const splineSpawnResult = await callJsonTool("manage_splines", {
				action: "spawn_actor",
				params: {
					object_class: "/Script/Engine.Actor",
					name: splineActorName,
					location: { x: 760, y: 320, z: 100 },
				},
			})
			assert(
				splineSpawnResult.actor_label === splineActorName,
				"manage_splines spawn_actor did not create the expected actor label",
			)
		})

		await runStep("Transform the spline host actor through manage_splines", async () => {
			const splineTransformResult = await callJsonTool("manage_splines", {
				action: "transform_actor",
				params: {
					name: splineActorName,
					location: { x: 800, y: 340, z: 120 },
				},
			})
			assert(
				Math.abs(Number(splineTransformResult.actor?.location?.x ?? 0) - 800) < 0.1,
				"manage_splines transform_actor did not update the expected X location",
			)
		})

		await runStep("Delete the spline host actor through manage_splines", async () => {
			await callJsonTool("manage_splines", {
				action: "delete_actor",
				params: { name: splineActorName },
			})
		})

		const levelPrefix = `${options.prefix}_LevelWall`
		const levelMazePrefix = `${options.prefix}_LevelMaze`
		const levelPyramidPrefix = `${options.prefix}_LevelPyramid`
		const levelBridgePrefix = `${options.prefix}_LevelBridge`
		const levelTownPrefix = `${options.prefix}_LevelTown`
		const levelStructurePrefix = `${options.prefix}_House`
		const levelStructureBridgePrefix = `${options.prefix}_Bridge`
		const levelStructureMansionPrefix = `${options.prefix}_Mansion`
		const levelStructureTowerPrefix = `${options.prefix}_Tower`
		const levelStructureWallPrefix = `${options.prefix}_FortWall`
		const environmentPrefix = `${options.prefix}_Arch`
		const environmentTownPrefix = `${options.prefix}_EnvTown`
		const environmentStairPrefix = `${options.prefix}_EnvStair`
		const environmentPyramidPrefix = `${options.prefix}_Pyramid`
		const environmentMazePrefix = `${options.prefix}_EnvMaze`
		const geometryPrefix = `${options.prefix}_Stairs`
		const geometryArchPrefix = `${options.prefix}_GeoArch`
		const geometryWallPrefix = `${options.prefix}_GeoWall`
		const geometryPyramidPrefix = `${options.prefix}_GeoPyramid`

		await runStep("Create a wall through manage_level", async () => {
			const levelResult = await callJsonTool("manage_level", {
				action: "create_wall",
				params: {
					prefix: levelPrefix,
					location: { x: 700, y: 320, z: 0 },
					length: 260,
					height: 160,
					thickness: 30,
				},
			})
			assert(
				levelResult.structure === "create_wall",
				"manage_level create_wall returned the wrong structure",
			)
			assert(
				Number(levelResult.actor_count) > 0,
				"manage_level create_wall did not spawn any actors",
			)
			addCleanup(
				`Delete level actors for ${levelPrefix}`,
				() => safeDeleteActors((levelResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a maze through manage_level", async () => {
			const mazeResult = await callJsonTool("manage_level", {
				action: "create_maze",
				params: {
					prefix: levelMazePrefix,
					location: { x: 760, y: 640, z: 0 },
					rows: 4,
					cols: 5,
					cell_size: 180,
					wall_height: 140,
					wall_thickness: 24,
					seed: 42,
				},
			})
			assert(
				mazeResult.structure === "create_maze",
				"manage_level create_maze returned the wrong structure",
			)
			assert(
				Number(mazeResult.actor_count) > 0,
				"manage_level create_maze did not spawn any actors",
			)
			addCleanup(
				`Delete level actors for ${levelMazePrefix}`,
				() => safeDeleteActors((mazeResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a pyramid through manage_level", async () => {
			const pyramidResult = await callJsonTool("manage_level", {
				action: "create_pyramid",
				params: {
					prefix: levelPyramidPrefix,
					location: { x: 980, y: 760, z: 0 },
					levels: 3,
					block_size: 140,
				},
			})
			assert(
				pyramidResult.structure === "create_pyramid",
				"manage_level create_pyramid returned the wrong structure",
			)
			assert(
				Number(pyramidResult.actor_count) > 0,
				"manage_level create_pyramid did not spawn any actors",
			)
			addCleanup(
				`Delete level actors for ${levelPyramidPrefix}`,
				() => safeDeleteActors((pyramidResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a bridge through manage_level", async () => {
			const bridgeResult = await callJsonTool("manage_level", {
				action: "create_bridge",
				params: {
					prefix: levelBridgePrefix,
					location: { x: 1120, y: 860, z: 0 },
					segments: 4,
					segment_length: 140,
					width: 120,
					thickness: 24,
					rail_height: 50,
				},
			})
			assert(
				bridgeResult.structure === "create_bridge",
				"manage_level create_bridge returned the wrong structure",
			)
			assert(
				Number(bridgeResult.actor_count) > 0,
				"manage_level create_bridge did not spawn any actors",
			)
			addCleanup(
				`Delete level actors for ${levelBridgePrefix}`,
				() => safeDeleteActors((bridgeResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a town through manage_level", async () => {
			const townResult = await callJsonTool("manage_level", {
				action: "create_town",
				params: {
					prefix: levelTownPrefix,
					location: { x: 1480, y: 760, z: 0 },
					rows: 1,
					cols: 2,
					spacing: 650,
				},
			})
			assert(
				townResult.structure === "create_town",
				"manage_level create_town returned the wrong structure",
			)
			assert(
				Number(townResult.actor_count) >= 10,
				"manage_level create_town did not spawn enough actors",
			)
			addCleanup(
				`Delete level actors for ${levelTownPrefix}`,
				() => safeDeleteActors((townResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Construct a house through manage_level_structure", async () => {
			const structureResult = await callJsonTool("manage_level_structure", {
				action: "construct_house",
				params: {
					prefix: levelStructurePrefix,
					location: { x: 960, y: 320, z: 0 },
					width: 260,
					depth: 220,
					wall_height: 180,
					roof_height: 60,
				},
			})
			assert(
				structureResult.structure === "construct_house",
				"manage_level_structure construct_house returned the wrong structure",
			)
			assert(
				Number(structureResult.actor_count) >= 5,
				"manage_level_structure construct_house did not spawn enough actors",
			)
			addCleanup(
				`Delete level-structure actors for ${levelStructurePrefix}`,
				() => safeDeleteActors((structureResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a bridge through manage_level_structure", async () => {
			const bridgeResult = await callJsonTool("manage_level_structure", {
				action: "create_bridge",
				params: {
					prefix: levelStructureBridgePrefix,
					location: { x: 1100, y: 480, z: 0 },
					span_length: 320,
					width: 120,
					deck_thickness: 20,
					rail_height: 45,
				},
			})
			assert(
				bridgeResult.structure === "create_bridge",
				"manage_level_structure create_bridge returned the wrong structure",
			)
			assert(
				Number(bridgeResult.actor_count) > 0,
				"manage_level_structure create_bridge did not spawn any actors",
			)
			addCleanup(
				`Delete level-structure actors for ${levelStructureBridgePrefix}`,
				() => safeDeleteActors((bridgeResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Construct a mansion through manage_level_structure", async () => {
			const mansionResult = await callJsonTool("manage_level_structure", {
				action: "construct_mansion",
				params: {
					prefix: levelStructureMansionPrefix,
					location: { x: 1840, y: 360, z: 0 },
					width: 720,
					depth: 520,
					wall_height: 280,
					roof_height: 90,
					wing_offset: 520,
				},
			})
			assert(
				mansionResult.structure === "construct_mansion",
				"manage_level_structure construct_mansion returned the wrong structure",
			)
			assert(
				Number(mansionResult.actor_count) >= 15,
				"manage_level_structure construct_mansion did not spawn enough actors",
			)
			addCleanup(
				`Delete level-structure actors for ${levelStructureMansionPrefix}`,
				() => safeDeleteActors((mansionResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a tower through manage_level_structure", async () => {
			const towerResult = await callJsonTool("manage_level_structure", {
				action: "create_tower",
				params: {
					prefix: levelStructureTowerPrefix,
					location: { x: 2100, y: 640, z: 0 },
					width: 240,
					floors: 4,
					floor_height: 180,
				},
			})
			assert(
				towerResult.structure === "create_tower",
				"manage_level_structure create_tower returned the wrong structure",
			)
			assert(
				Number(towerResult.actor_count) >= 5,
				"manage_level_structure create_tower did not spawn enough actors",
			)
			addCleanup(
				`Delete level-structure actors for ${levelStructureTowerPrefix}`,
				() => safeDeleteActors((towerResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a wall through manage_level_structure", async () => {
			const wallResult = await callJsonTool("manage_level_structure", {
				action: "create_wall",
				params: {
					prefix: levelStructureWallPrefix,
					location: { x: 2300, y: 520, z: 160 },
					segments: 5,
					segment_length: 160,
					height: 220,
					thickness: 40,
				},
			})
			assert(
				wallResult.structure === "create_wall",
				"manage_level_structure create_wall returned the wrong structure",
			)
			assert(
				Number(wallResult.actor_count) > 0,
				"manage_level_structure create_wall did not spawn any actors",
			)
			addCleanup(
				`Delete level-structure actors for ${levelStructureWallPrefix}`,
				() => safeDeleteActors((wallResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create an arch through manage_environment", async () => {
			const environmentResult = await callJsonTool("manage_environment", {
				action: "create_arch",
				params: {
					prefix: environmentPrefix,
					location: { x: 1260, y: 320, z: 0 },
					span_width: 220,
					pillar_height: 180,
					pillar_width: 40,
					beam_height: 40,
				},
			})
			assert(
				environmentResult.structure === "create_arch",
				"manage_environment create_arch returned the wrong structure",
			)
			assert(
				Number(environmentResult.actor_count) === 3,
				"manage_environment create_arch did not spawn the expected actor count",
			)
			addCleanup(
				`Delete environment actors for ${environmentPrefix}`,
				() => safeDeleteActors((environmentResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a pyramid through manage_environment", async () => {
			const pyramidResult = await callJsonTool("manage_environment", {
				action: "create_pyramid",
				params: {
					prefix: environmentPyramidPrefix,
					location: { x: 1380, y: 520, z: 0 },
					base_size: 260,
					levels: 4,
					level_height: 36,
				},
			})
			assert(
				pyramidResult.structure === "create_pyramid",
				"manage_environment create_pyramid returned the wrong structure",
			)
			assert(
				Number(pyramidResult.actor_count) > 0,
				"manage_environment create_pyramid did not spawn any actors",
			)
			addCleanup(
				`Delete environment actors for ${environmentPyramidPrefix}`,
				() => safeDeleteActors((pyramidResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a staircase through manage_environment", async () => {
			const stairResult = await callJsonTool("manage_environment", {
				action: "create_staircase",
				params: {
					prefix: environmentStairPrefix,
					location: { x: 1560, y: 760, z: 0 },
					steps: 5,
					step_width: 180,
					step_height: 24,
					step_depth: 80,
				},
			})
			assert(
				stairResult.structure === "create_staircase",
				"manage_environment create_staircase returned the wrong structure",
			)
			assert(
				Number(stairResult.actor_count) === 5,
				"manage_environment create_staircase did not spawn the expected actor count",
			)
			addCleanup(
				`Delete environment actors for ${environmentStairPrefix}`,
				() => safeDeleteActors((stairResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a maze through manage_environment", async () => {
			const mazeResult = await callJsonTool("manage_environment", {
				action: "create_maze",
				params: {
					prefix: environmentMazePrefix,
					location: { x: 1760, y: 860, z: 0 },
					rows: 3,
					cols: 4,
					cell_size: 160,
					wall_height: 130,
					wall_thickness: 22,
					seed: 99,
				},
			})
			assert(
				mazeResult.structure === "create_maze",
				"manage_environment create_maze returned the wrong structure",
			)
			assert(
				Number(mazeResult.actor_count) > 0,
				"manage_environment create_maze did not spawn any actors",
			)
			addCleanup(
				`Delete environment actors for ${environmentMazePrefix}`,
				() => safeDeleteActors((mazeResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a town through manage_environment", async () => {
			const townResult = await callJsonTool("manage_environment", {
				action: "create_town",
				params: {
					prefix: environmentTownPrefix,
					location: { x: 1980, y: 860, z: 0 },
					rows: 1,
					cols: 2,
					spacing: 640,
				},
			})
			assert(
				townResult.structure === "create_town",
				"manage_environment create_town returned the wrong structure",
			)
			assert(
				Number(townResult.actor_count) >= 10,
				"manage_environment create_town did not spawn enough actors",
			)
			addCleanup(
				`Delete environment actors for ${environmentTownPrefix}`,
				() => safeDeleteActors((townResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a staircase through manage_geometry", async () => {
			const geometryResult = await callJsonTool("manage_geometry", {
				action: "create_staircase",
				params: {
					prefix: geometryPrefix,
					location: { x: 1500, y: 320, z: 0 },
					steps: 4,
					step_width: 180,
					step_height: 30,
					step_depth: 90,
				},
			})
			assert(
				geometryResult.structure === "create_staircase",
				"manage_geometry create_staircase returned the wrong structure",
			)
			assert(
				Number(geometryResult.actor_count) === 4,
				"manage_geometry create_staircase did not spawn the expected actor count",
			)
			addCleanup(
				`Delete geometry actors for ${geometryPrefix}`,
				() => safeDeleteActors((geometryResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create an arch through manage_geometry", async () => {
			const geometryArchResult = await callJsonTool("manage_geometry", {
				action: "create_arch",
				params: {
					prefix: geometryArchPrefix,
					location: { x: 1720, y: 520, z: 0 },
					span_width: 180,
					pillar_height: 150,
					pillar_width: 35,
					beam_height: 30,
				},
			})
			assert(
				geometryArchResult.structure === "create_arch",
				"manage_geometry create_arch returned the wrong structure",
			)
			assert(
				Number(geometryArchResult.actor_count) > 0,
				"manage_geometry create_arch did not spawn any actors",
			)
			addCleanup(
				`Delete geometry actors for ${geometryArchPrefix}`,
				() => safeDeleteActors((geometryArchResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a wall through manage_geometry", async () => {
			const geometryWallResult = await callJsonTool("manage_geometry", {
				action: "create_wall",
				params: {
					prefix: geometryWallPrefix,
					location: { x: 2220, y: 860, z: 140 },
					segments: 4,
					segment_length: 140,
					height: 200,
					thickness: 32,
				},
			})
			assert(
				geometryWallResult.structure === "create_wall",
				"manage_geometry create_wall returned the wrong structure",
			)
			assert(
				Number(geometryWallResult.actor_count) > 0,
				"manage_geometry create_wall did not spawn any actors",
			)
			addCleanup(
				`Delete geometry actors for ${geometryWallPrefix}`,
				() => safeDeleteActors((geometryWallResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		await runStep("Create a pyramid through manage_geometry", async () => {
			const geometryPyramidResult = await callJsonTool("manage_geometry", {
				action: "create_pyramid",
				params: {
					prefix: geometryPyramidPrefix,
					location: { x: 2400, y: 960, z: 0 },
					levels: 3,
					block_size: 120,
				},
			})
			assert(
				geometryPyramidResult.structure === "create_pyramid",
				"manage_geometry create_pyramid returned the wrong structure",
			)
			assert(
				Number(geometryPyramidResult.actor_count) > 0,
				"manage_geometry create_pyramid did not spawn any actors",
			)
			addCleanup(
				`Delete geometry actors for ${geometryPyramidPrefix}`,
				() => safeDeleteActors((geometryPyramidResult.actors || []).map((actor) => actor.label || actor.name)),
			)
		})

		if (options.withAssets) {
			const blueprintPath = `/Game/MCP/Tests/BP_${options.prefix}`
			const sequencePath = `/Game/MCP/Tests/LS_${options.prefix}`
			const behaviorTreePath = `/Game/MCP/Tests/BT_${options.prefix}`
			const gasAbilityPath = `/Game/MCP/Tests/GA_${options.prefix}`
			const dataAssetPath = `/Game/MCP/Tests/DA_${options.prefix}`
			const dataTablePath = `/Game/MCP/Tests/DT_${options.prefix}`
			const stringTablePath = `/Game/MCP/Tests/ST_${options.prefix}`
			const texturePath = `/Game/MCP/Tests/T_${options.prefix}`
			const widgetPath = `/Game/MCP/Tests/WBP_${options.prefix}`
			const sourceControlAddAssetPath = `/Game/MCP/Tests/SC_Add_DA_${options.prefix}`
			const sourceControlDataAssetPath = `/Game/MCP/Tests/SC_DA_${options.prefix}`
			const tempTextureFile = path.join(os.tmpdir(), `${options.prefix}_Texture.png`)
			const tempAudioFile = path.join(os.tmpdir(), `${options.prefix}_Audio.wav`)
			const inputMappingName = `${options.prefix}_Action`
			const generatedAssetPaths = [
				widgetPath,
				texturePath,
				blueprintPath,
				sequencePath,
				behaviorTreePath,
				gasAbilityPath,
				dataAssetPath,
				dataTablePath,
				stringTablePath,
				sourceControlAddAssetPath,
				sourceControlDataAssetPath,
				actorTintMaterialPath,
				debugTintMaterialPath,
			]
			const projectDirectoryPath = path.dirname(projectFilePath)
			const defaultInputConfigPath = path.join(projectDirectoryPath, "Config", "DefaultInput.ini")
			const defaultEngineConfigPath = path.join(projectDirectoryPath, "Config", "DefaultEngine.ini")
			const projectHasGitRemote = projectRepoHasGitRemote(projectDirectoryPath)
			const originalDefaultInputConfig = fs.existsSync(defaultInputConfigPath)
				? fs.readFileSync(defaultInputConfigPath, "utf8")
				: null
			const originalClassicInputActionCount = Number(projectInfo.classic_input_actions_count ?? 0)
			let widgetAuthoringUnsupportedReason = ""
			let resolvedBlueprintMaterialPath = basicShapeMaterialPath
			const texturePixelBase64 =
				"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZSURBVBhXY/jPAEQNIAoO/oMBlEMQMDAAAO2DCXg4buGUAAAAAElFTkSuQmCC"
			fs.writeFileSync(tempTextureFile, Buffer.from(texturePixelBase64, "base64"))
			const createSilenceWavBuffer = (sampleRate = 8000, durationSeconds = 0.1) => {
				const numSamples = Math.max(1, Math.floor(sampleRate * durationSeconds))
				const dataSize = numSamples
				const buffer = Buffer.alloc(44 + dataSize)
				buffer.write("RIFF", 0, "ascii")
				buffer.writeUInt32LE(36 + dataSize, 4)
				buffer.write("WAVE", 8, "ascii")
				buffer.write("fmt ", 12, "ascii")
				buffer.writeUInt32LE(16, 16)
				buffer.writeUInt16LE(1, 20)
				buffer.writeUInt16LE(1, 22)
				buffer.writeUInt32LE(sampleRate, 24)
				buffer.writeUInt32LE(sampleRate, 28)
				buffer.writeUInt16LE(1, 32)
				buffer.writeUInt16LE(8, 34)
				buffer.write("data", 36, "ascii")
				buffer.writeUInt32LE(dataSize, 40)
				buffer.fill(128, 44)
				return buffer
			}
			fs.writeFileSync(tempAudioFile, createSilenceWavBuffer())
			if (!options.keepAssets) {
				addCleanup(
					`Delete assets for ${options.prefix}`,
					() => safeDeleteAssets(generatedAssetPaths),
				)
				addCleanup(`Delete temp image ${tempTextureFile}`, async () => {
					try {
						fs.unlinkSync(tempTextureFile)
					} catch {
						// Best effort only.
					}
				})
				addCleanup(`Delete temp audio ${tempAudioFile}`, async () => {
					try {
						fs.unlinkSync(tempAudioFile)
					} catch {
						// Best effort only.
					}
				})
				addCleanup(`Restore input config ${defaultInputConfigPath}`, async () => {
					try {
						if (originalDefaultInputConfig === null) {
							if (fs.existsSync(defaultInputConfigPath)) {
								fs.unlinkSync(defaultInputConfigPath)
							}
							return
						}

						fs.writeFileSync(defaultInputConfigPath, originalDefaultInputConfig, "utf8")
					} catch {
						// Best effort only.
					}
				})
			}

			await runStep("Create a Blueprint asset", async () => {
				const createResult = await callJsonTool("manage_blueprint", {
					action: "create_blueprint",
					params: {
						name: blueprintPath,
						parent_class: "Actor",
					},
				})
				assert(
					createResult.asset_path === blueprintPath,
					`manage_blueprint create_blueprint returned an unexpected asset path: ${createResult.asset_path}`,
				)
			})

			await runStep("Add a StaticMeshComponent to the Blueprint", async () => {
				const componentResult = await callJsonTool("manage_blueprint", {
					action: "add_component",
					params: {
						blueprint_name: blueprintPath,
						component_type: "StaticMeshComponent",
						component_name: "SmokeMesh",
					},
				})
				assert(componentResult.component?.name === "SmokeMesh", "Blueprint component was not created")
			})

			await runStep("Assign a mesh to the Blueprint component", async () => {
				await callJsonTool("manage_blueprint", {
					action: "set_static_mesh",
					params: {
						blueprint_name: blueprintPath,
						component_name: "SmokeMesh",
						static_mesh: "/Engine/BasicShapes/Cube",
					},
				})
			})

			await runStep("List materials through manage_material_authoring", async () => {
				const materialsResult = await callJsonTool("manage_material_authoring", {
					action: "list_materials",
					params: {
						search_term: "BasicShapeMaterial",
						include_engine: true,
						limit: 10,
					},
				})
				assert(Array.isArray(materialsResult.materials), "manage_material_authoring list_materials did not return a materials list")
				const discoveredMaterial = materialsResult.materials.find((material) =>
					String(material.path).includes("BasicShapeMaterial"),
				)
				assert(discoveredMaterial, "manage_material_authoring list_materials did not find BasicShapeMaterial")
				resolvedBlueprintMaterialPath = discoveredMaterial.path
			})

			await runStep("Apply a material to the Blueprint through manage_material_authoring", async () => {
				const applyResult = await callJsonTool("manage_material_authoring", {
					action: "apply_to_blueprint",
					params: {
						blueprint_name: blueprintPath,
						component_name: "SmokeMesh",
						material_path: resolvedBlueprintMaterialPath,
					},
				})
				assert(applyResult.blueprint === blueprintPath, "manage_material_authoring apply_to_blueprint returned the wrong blueprint")
				assert(
					String(applyResult.component).includes("SmokeMesh"),
					"manage_material_authoring apply_to_blueprint returned the wrong component",
				)
				assert(
					applyResult.material?.path === resolvedBlueprintMaterialPath,
					"manage_material_authoring apply_to_blueprint returned the wrong material path",
				)
			})

			await runStep("Set a Blueprint component property through manage_blueprint", async () => {
				const componentPropertyResult = await callJsonTool("manage_blueprint", {
					action: "set_component_property",
					params: {
						blueprint_name: blueprintPath,
						component_name: "SmokeMesh",
						property_name: "cast_shadow",
						property_value: false,
					},
				})
				assert(
					componentPropertyResult.blueprint === blueprintPath,
					"manage_blueprint set_component_property returned the wrong blueprint path",
				)
				assert(
					componentPropertyResult.component?.name === "SmokeMesh",
					"manage_blueprint set_component_property returned the wrong component summary",
				)
			})

			await runStep("Set Blueprint physics properties through manage_blueprint", async () => {
				const physicsPropertyResult = await callJsonTool("manage_blueprint", {
					action: "set_physics_properties",
					params: {
						blueprint_name: blueprintPath,
						component_name: "SmokeMesh",
						simulate_physics: false,
						gravity_enabled: false,
						mass: 2.0,
						linear_damping: 0.2,
						angular_damping: 0.1,
					},
				})
				assert(
					physicsPropertyResult.blueprint === blueprintPath,
					"manage_blueprint set_physics_properties returned the wrong blueprint path",
				)
				assert(
					physicsPropertyResult.component?.name === "SmokeMesh",
					"manage_blueprint set_physics_properties returned the wrong component summary",
				)
			})

			await runStep("Set a Blueprint default property through manage_blueprint", async () => {
				const blueprintPropertyResult = await callJsonTool("manage_blueprint", {
					action: "set_blueprint_property",
					params: {
						blueprint_name: blueprintPath,
						property_name: "can_be_damaged",
						property_value: true,
					},
				})
				assert(
					blueprintPropertyResult.blueprint === blueprintPath,
					"manage_blueprint set_blueprint_property returned the wrong blueprint path",
				)
				assert(
					blueprintPropertyResult.property_name === "can_be_damaged",
					"manage_blueprint set_blueprint_property returned the wrong property name",
				)
				assert(
					blueprintPropertyResult.property_value === true,
					"manage_blueprint set_blueprint_property returned the wrong property value",
				)
			})

			await runStep("Compile the Blueprint asset", async () => {
				const compileResult = await callJsonTool("manage_blueprint", {
					action: "compile",
					params: {
						blueprint_name: blueprintPath,
					},
				})
				assert(compileResult.blueprint === blueprintPath, "manage_blueprint compile returned an unexpected asset path")
			})

			await runStep("Set Blueprint physics properties through manage_animation_physics", async () => {
				const animationPhysicsResult = await callJsonTool("manage_animation_physics", {
					action: "set_physics_properties",
					params: {
						blueprint_name: blueprintPath,
						component_name: "SmokeMesh",
						simulate_physics: true,
						gravity_enabled: true,
						mass: 3.0,
						linear_damping: 0.15,
						angular_damping: 0.05,
					},
				})
				assert(
					animationPhysicsResult.blueprint === blueprintPath,
					"manage_animation_physics set_physics_properties returned the wrong blueprint path",
				)
				assert(
					animationPhysicsResult.component?.name === "SmokeMesh",
					"manage_animation_physics set_physics_properties returned the wrong component summary",
				)
			})

			await runStep("Compile the Blueprint through manage_animation_physics", async () => {
				const animationCompileResult = await callJsonTool("manage_animation_physics", {
					action: "compile_blueprint",
					params: {
						blueprint_name: blueprintPath,
					},
				})
				assert(
					animationCompileResult.blueprint === blueprintPath,
					"manage_animation_physics compile_blueprint returned the wrong blueprint path",
				)
				assert(
					animationCompileResult.compiled === true || animationCompileResult.saved === true,
					"manage_animation_physics compile_blueprint did not compile or save the Blueprint",
				)
			})

			await runStep("Read the Blueprint contents through manage_blueprint", async () => {
				const blueprintReadResult = await callJsonTool("manage_blueprint", {
					action: "read",
					params: {
						blueprint_name: blueprintPath,
						include_nodes: false,
					},
				})
				assert(
					blueprintReadResult.blueprint?.asset_path === blueprintPath,
					"manage_blueprint read returned the wrong asset path",
				)
				assert(
					typeof blueprintReadResult.blueprint?.generated_class === "string" &&
						blueprintReadResult.blueprint.generated_class.length > 0,
					"manage_blueprint read did not report a generated class",
				)
				assert(
					Array.isArray(blueprintReadResult.blueprint?.components),
					"manage_blueprint read did not return a components list",
				)
				assert(
					Array.isArray(blueprintReadResult.blueprint?.graphs),
					"manage_blueprint read did not return a graphs list",
				)
			})

			await runStep("Inspect the Blueprint through manage_inspection", async () => {
				const inspectionBlueprintResult = await callJsonTool("manage_inspection", {
					action: "blueprint",
					params: {
						blueprint_name: blueprintPath,
						include_nodes: false,
					},
				})
				assert(
					inspectionBlueprintResult.blueprint?.asset_path === blueprintPath,
					"manage_inspection blueprint returned the wrong asset path",
				)
				assert(
					typeof inspectionBlueprintResult.blueprint?.generated_class === "string" &&
						inspectionBlueprintResult.blueprint.generated_class.length > 0,
					"manage_inspection blueprint did not report a generated class",
				)
			})

			const blueprintActorName = `${options.prefix}_BlueprintActor`
			addCleanup(`Delete actor ${blueprintActorName}`, () => safeDeleteActor(blueprintActorName))
			const physicsBlueprintActorName = `${options.prefix}_PhysicsBlueprintActor`
			addCleanup(
				`Delete actor ${physicsBlueprintActorName}`,
				() => safeDeleteActor(physicsBlueprintActorName),
			)

			await runStep("Spawn the Blueprint through manage_actor", async () => {
				const blueprintSpawnResult = await callJsonTool("manage_actor", {
					action: "spawn_blueprint",
					params: {
						blueprint_name: blueprintPath,
						name: blueprintActorName,
						location: { x: 180, y: -180, z: 150 },
					},
				})
				assert(
					blueprintSpawnResult.blueprint === blueprintPath,
					"manage_actor spawn_blueprint returned the wrong blueprint path",
				)
				assert(
					blueprintSpawnResult.actor?.label === blueprintActorName,
					"manage_actor spawn_blueprint did not create the expected actor label",
				)
			})

			await runStep("Spawn a physics-enabled Blueprint actor through manage_animation_physics", async () => {
				const physicsSpawnResult = await callJsonTool("manage_animation_physics", {
					action: "spawn_physics_blueprint_actor",
					params: {
						blueprint_name: blueprintPath,
						name: physicsBlueprintActorName,
						location: { x: 320, y: -220, z: 220 },
						material_path: resolvedBlueprintMaterialPath,
						simulate_physics: true,
						gravity_enabled: true,
						mass: 3.0,
						linear_damping: 0.15,
						angular_damping: 0.05,
					},
				})
				assert(
					physicsSpawnResult.blueprint === blueprintPath,
					"manage_animation_physics spawn_physics_blueprint_actor returned the wrong blueprint path",
				)
				assert(
					physicsSpawnResult.actor?.label === physicsBlueprintActorName,
					"manage_animation_physics spawn_physics_blueprint_actor did not create the expected actor label",
				)
				assert(
					physicsSpawnResult.physics?.simulate_physics === true,
					"manage_animation_physics spawn_physics_blueprint_actor did not enable physics",
				)
				assert(
					Array.isArray(physicsSpawnResult.materials),
					"manage_animation_physics spawn_physics_blueprint_actor did not return component material info",
				)
			})

			await runStep("Create a LevelSequence through manage_sequence", async () => {
				const sequenceCreateResult = await callJsonTool("manage_sequence", {
					action: "create_sequence",
					params: {
						name: sequencePath,
					},
				})
				assert(
					sequenceCreateResult.asset_path === sequencePath,
					`manage_sequence create_sequence returned an unexpected asset path: ${sequenceCreateResult.asset_path}`,
				)
			})

			await runStep("Search sequence assets through manage_sequence", async () => {
				const sequenceSearchResult = await callJsonTool("manage_sequence", {
					action: "search_sequences",
					params: { search_term: options.prefix },
				})
				assert(Array.isArray(sequenceSearchResult.assets), "manage_sequence search_sequences did not return an asset list")
				assert(
					firstAssetPathFromSearch(sequenceSearchResult) === sequencePath,
					"manage_sequence search_sequences did not find the created LevelSequence",
				)
			})

			await runStep("Read sequence metadata through manage_sequence", async () => {
				const sequenceInfo = await callJsonTool("manage_sequence", {
					action: "sequence_info",
					params: { asset_path: sequencePath },
				})
				assert(Array.isArray(sequenceInfo) && sequenceInfo.length === 1, "manage_sequence sequence_info did not return one asset record")
				assert(
					sequenceInfo[0].package === sequencePath,
					"manage_sequence sequence_info returned the wrong asset package",
				)
			})

			await runStep("Create a BehaviorTree through manage_behavior_tree", async () => {
				const behaviorTreeCreateResult = await callJsonTool("manage_behavior_tree", {
					action: "create_behavior_tree",
					params: {
						name: behaviorTreePath,
					},
				})
				assert(
					behaviorTreeCreateResult.asset_path === behaviorTreePath,
					`manage_behavior_tree create_behavior_tree returned an unexpected asset path: ${behaviorTreeCreateResult.asset_path}`,
				)
			})

			await runStep("Search behavior trees through manage_behavior_tree", async () => {
				const behaviorTreeSearchResult = await callJsonTool("manage_behavior_tree", {
					action: "search_behavior_trees",
					params: { search_term: options.prefix },
				})
				assert(Array.isArray(behaviorTreeSearchResult.assets), "manage_behavior_tree search_behavior_trees did not return an asset list")
				assert(
					firstAssetPathFromSearch(behaviorTreeSearchResult) === behaviorTreePath,
					"manage_behavior_tree search_behavior_trees did not find the created BehaviorTree",
				)
			})

			await runStep("Search AI assets through manage_behavior_tree", async () => {
				const aiAssetSearchResult = await callJsonTool("manage_behavior_tree", {
					action: "search_ai_assets",
					params: { search_term: options.prefix },
				})
				assert(Array.isArray(aiAssetSearchResult.assets), "manage_behavior_tree search_ai_assets did not return an asset list")
				assert(
					firstAssetPathFromSearch(aiAssetSearchResult) === behaviorTreePath,
					"manage_behavior_tree search_ai_assets did not find the created BehaviorTree",
				)
			})

			await runStep("Read behavior-tree metadata through manage_behavior_tree", async () => {
				const behaviorTreeInfo = await callJsonTool("manage_behavior_tree", {
					action: "behavior_tree_info",
					params: { asset_path: behaviorTreePath },
				})
				assert(Array.isArray(behaviorTreeInfo) && behaviorTreeInfo.length === 1, "manage_behavior_tree behavior_tree_info did not return one asset record")
				assert(
					behaviorTreeInfo[0].package === behaviorTreePath,
					"manage_behavior_tree behavior_tree_info returned the wrong asset package",
				)
			})

			let importedAudioCuePath = ""
			await runStep("Import audio through manage_audio", async () => {
				const audioImportResult = await callJsonTool("manage_audio", {
					action: "import_audio",
					params: {
						source_file: tempAudioFile,
						destination_path: "/Game/MCP/Tests",
						asset_name: `A_${options.prefix}`,
						auto_create_cue: true,
						cue_suffix: "_Cue",
					},
				})
				assert(
					typeof audioImportResult.sound_wave_path === "string" &&
						audioImportResult.sound_wave_path.includes(`/Game/MCP/Tests/A_${options.prefix}`),
					"manage_audio import_audio did not return the expected SoundWave path",
				)
				assert(
					typeof audioImportResult.sound_cue_path === "string" &&
						audioImportResult.sound_cue_path.endsWith(`A_${options.prefix}_Cue`),
					"manage_audio import_audio did not return the expected SoundCue path",
				)
				importedAudioCuePath = audioImportResult.sound_cue_path
				for (const importedAssetPath of [
					audioImportResult.sound_wave_path,
					audioImportResult.sound_cue_path,
				]) {
					if (
						typeof importedAssetPath === "string" &&
						importedAssetPath.length > 0 &&
						!generatedAssetPaths.includes(importedAssetPath)
					) {
						generatedAssetPaths.push(importedAssetPath)
					}
				}
			})

			await runStep("Search audio assets through manage_audio", async () => {
				const audioSearchResult = await callJsonTool("manage_audio", {
					action: "search_audio_assets",
					params: { search_term: options.prefix },
				})
				assert(Array.isArray(audioSearchResult.assets), "manage_audio search_audio_assets did not return an asset list")
				assert(
					firstAssetPathFromSearch(audioSearchResult) === importedAudioCuePath,
					"manage_audio search_audio_assets did not find the imported SoundCue",
				)
			})

			await runStep("Read audio metadata through manage_audio", async () => {
				const audioInfo = await callJsonTool("manage_audio", {
					action: "audio_info",
					params: { asset_path: importedAudioCuePath },
				})
				assert(Array.isArray(audioInfo) && audioInfo.length === 1, "manage_audio audio_info did not return one asset record")
				assert(
					audioInfo[0].package === importedAudioCuePath,
					"manage_audio audio_info returned the wrong asset package",
				)
			})

			let gasAbilityCreated = false
			await runStep("Create a GameplayAbility Blueprint for GAS smoke coverage", async () => {
				try {
					const gasBlueprintCreateResult = await callJsonTool("manage_blueprint", {
						action: "create_blueprint",
						params: {
							name: gasAbilityPath,
							parent_class: "/Script/GameplayAbilities.GameplayAbility",
						},
					})
					assert(
						gasBlueprintCreateResult.asset_path === gasAbilityPath,
						`GameplayAbility Blueprint was created at an unexpected path: ${gasBlueprintCreateResult.asset_path}`,
					)
					gasAbilityCreated = true
				} catch (error) {
					throw new StepSkipError(
						error instanceof Error
							? error.message
							: "GameplayAbility Blueprint creation is unavailable in this project or engine configuration.",
					)
				}
			})

			await runStep("Search GAS assets through manage_gas", async () => {
				if (!gasAbilityCreated) {
					throw new StepSkipError("GameplayAbility Blueprint creation is unavailable in this project or engine configuration.")
				}
				const gasSearchResult = await callJsonTool("manage_gas", {
					action: "search_gas_assets",
					params: { search_term: `GA_${options.prefix}` },
				})
				assert(Array.isArray(gasSearchResult.assets), "manage_gas search_gas_assets did not return an asset list")
				assert(
					firstAssetPathFromSearch(gasSearchResult) === gasAbilityPath,
					"manage_gas search_gas_assets did not find the created GameplayAbility Blueprint",
				)
			})

			await runStep("Read GAS asset metadata through manage_gas", async () => {
				if (!gasAbilityCreated) {
					throw new StepSkipError("GameplayAbility Blueprint creation is unavailable in this project or engine configuration.")
				}
				const gasAssetInfo = await callJsonTool("manage_gas", {
					action: "asset_info",
					params: { asset_path: gasAbilityPath },
				})
				assert(Array.isArray(gasAssetInfo) && gasAssetInfo.length === 1, "manage_gas asset_info did not return one asset record")
				assert(
					gasAssetInfo[0].package === gasAbilityPath,
					"manage_gas asset_info returned the wrong asset package",
				)
			})

			await runStep("Create a DataAsset through the tool-namespace layer", async () => {
				const dataAssetResult = await callJsonTool("manage_data", {
					action: "create_data_asset",
					params: {
						name: dataAssetPath,
						data_asset_class: "DataAsset",
					},
				})
				assert(
					dataAssetResult.asset_path === dataAssetPath,
					`DataAsset was created at an unexpected path: ${dataAssetResult.asset_path}`,
				)
			})

			await runStep("Read the DataAsset metadata", async () => {
				const dataAssetInfo = await callJsonTool("manage_data", {
					action: "asset_info",
					params: { asset_path: dataAssetPath },
				})
				assert(Array.isArray(dataAssetInfo) && dataAssetInfo.length === 1, "manage_data asset_info did not return one asset record")
				assert(
					dataAssetInfo[0].package === dataAssetPath,
					`manage_data asset_info returned an unexpected asset path: ${dataAssetInfo[0]?.package}`,
				)
			})

			await runStep("Create a DataTable through the tool-namespace layer", async () => {
				const dataTableResult = await callJsonTool("manage_data", {
					action: "create_data_table",
					params: {
						name: dataTablePath,
						row_struct: "/Script/Engine.TableRowBase",
					},
				})
				assert(
					dataTableResult.asset_path === dataTablePath,
					`DataTable was created at an unexpected path: ${dataTableResult.asset_path}`,
				)
				assert(
					String(dataTableResult.row_struct) === "/Script/Engine.TableRowBase",
					`DataTable used an unexpected row struct: ${dataTableResult.row_struct}`,
				)
			})

			await runStep("Create a StringTable through the tool-namespace layer", async () => {
				const stringTableResult = await callJsonTool("manage_data", {
					action: "create_string_table",
					params: {
						name: stringTablePath,
					},
				})
				assert(
					stringTableResult.asset_path === stringTablePath,
					`StringTable was created at an unexpected path: ${stringTableResult.asset_path}`,
				)
			})

			await runStep("Search data assets through manage_data", async () => {
				const dataSearchResult = await callJsonTool("manage_data", {
					action: "search_data_assets",
					params: {
						search_term: options.prefix,
						include_engine: false,
						limit: 20,
					},
				})
				assert(Array.isArray(dataSearchResult.assets), "manage_data search_data_assets did not return an asset list")
				assert(
					dataSearchResult.assets.some(
						(asset) =>
							asset.path === dataAssetPath
							|| asset.path === dataTablePath
							|| asset.path === stringTablePath,
					),
					"manage_data search_data_assets did not find any of the created data assets",
				)
			})

			await runStep("Create a classic input mapping through manage_input", async () => {
				const inputResult = await callJsonTool("manage_input", {
					action: "create_input_mapping",
					params: {
						mapping_name: inputMappingName,
						key: "P",
						input_type: "Action",
					},
				})
				const resolvedConfigPath = resolveLocalPath(inputResult.config_path)
				assert(inputResult.mapping_name === inputMappingName, "manage_input create_input_mapping returned the wrong mapping name")
				assert(
					typeof resolvedConfigPath === "string" && resolvedConfigPath.endsWith("DefaultInput.ini"),
					"manage_input create_input_mapping did not return DefaultInput.ini",
				)
				assert(
					fs.existsSync(resolvedConfigPath) &&
						fs.readFileSync(resolvedConfigPath, "utf8").includes(inputResult.mapping_line),
					"manage_input create_input_mapping did not write the mapping line to DefaultInput.ini",
				)
			})

			await runStep("Read project info after input mapping creation", async () => {
				let refreshedProjectInfo = null
				for (let attempt = 0; attempt < 10; attempt += 1) {
					refreshedProjectInfo = await callJsonTool("manage_editor", {
						action: "project_info",
						params: {},
					})
					if (
						Array.isArray(refreshedProjectInfo.classic_input_actions) &&
						refreshedProjectInfo.classic_input_actions.includes(inputMappingName)
					) {
						break
					}

					await new Promise((resolve) => setTimeout(resolve, 300))
				}
				assert(
					Array.isArray(refreshedProjectInfo?.classic_input_actions) &&
						refreshedProjectInfo.classic_input_actions.includes(inputMappingName),
					"manage_editor project_info did not report the new classic input mapping",
				)
				assert(
					Number(refreshedProjectInfo?.classic_input_actions_count ?? 0) >= originalClassicInputActionCount + 1,
					"manage_editor project_info did not increase the classic input action count",
				)
			})

			await runStep("Import a Texture through the tool-namespace layer", async () => {
				const textureImportResult = await callJsonTool("manage_texture", {
					action: "import_texture",
					params: {
						source_file: tempTextureFile,
						destination_path: "/Game/MCP/Tests",
						asset_name: path.basename(texturePath),
					},
				})
				assert(
					textureImportResult.asset_path === texturePath,
					`Texture was imported at an unexpected path: ${textureImportResult.asset_path}`,
				)
			})

			await runStep("Read the Texture metadata", async () => {
				const textureInfo = await callJsonTool("manage_texture", {
					action: "texture_info",
					params: { asset_path: texturePath },
				})
				assert(Array.isArray(textureInfo) && textureInfo.length === 1, "manage_texture texture_info did not return one asset record")
				assert(
					textureInfo[0].package === texturePath,
					`manage_texture texture_info returned an unexpected asset path: ${textureInfo[0]?.package}`,
				)
			})

			await runStep("Search textures through manage_texture", async () => {
				const textureSearchResult = await callJsonTool("manage_texture", {
					action: "search_textures",
					params: {
						search_term: options.prefix,
						include_engine: false,
						limit: 20,
					},
				})
				assert(Array.isArray(textureSearchResult.assets), "manage_texture search_textures did not return an asset list")
				assert(
					firstAssetPathFromSearch(textureSearchResult) === texturePath,
					"manage_texture search_textures did not find the imported texture",
				)
			})

			await runStep("List generated assets through manage_asset", async () => {
				const listedAssets = await callJsonTool("manage_asset", {
					action: "list",
					params: {
						root_path: "/Game/MCP/Tests",
						recursive: true,
						limit: 50,
					},
				})
				assert(listedAssets.root_path === "/Game/MCP/Tests", "manage_asset list returned the wrong root path")
				assert(Array.isArray(listedAssets.assets), "manage_asset list did not return an assets list")
				assert(
					listedAssets.assets.some(
						(assetPath) =>
							assetPath === blueprintPath || String(assetPath).startsWith(`${blueprintPath}.`),
					)
						&& listedAssets.assets.some(
							(assetPath) =>
								assetPath === texturePath || String(assetPath).startsWith(`${texturePath}.`),
						),
					"manage_asset list did not include the expected generated assets",
				)
			})

			const exportedTextureFile = path.join(os.tmpdir(), `${options.prefix}_TextureExport.tga`)
			if (!options.keepAssets) {
				addCleanup(`Delete exported asset ${exportedTextureFile}`, async () => {
					try {
						fs.unlinkSync(exportedTextureFile)
					} catch {
						// Best effort only.
					}
				})
			}

			await runStep("Export a generated asset through manage_asset", async () => {
				const exportResult = await callJsonTool("manage_asset", {
					action: "export",
					params: {
						asset_path: texturePath,
						destination_path: exportedTextureFile,
						overwrite: true,
					},
				})
				assert(
					resolveLocalPath(exportResult.exported_file) === exportedTextureFile,
					"manage_asset export returned the wrong destination path",
				)
				assert(
					fs.existsSync(exportedTextureFile) && fs.statSync(exportedTextureFile).size > 0,
					"manage_asset export did not create a non-empty exported file",
				)
			})

			if (options.keepAssets) {
				console.log(`[INFO] Kept Blueprint asset: ${blueprintPath}`)
				console.log(`[INFO] Kept DataAsset: ${dataAssetPath}`)
				console.log(`[INFO] Kept DataTable: ${dataTablePath}`)
				console.log(`[INFO] Kept StringTable: ${stringTablePath}`)
				console.log(`[INFO] Kept Texture asset: ${texturePath}`)
				console.log(`[INFO] Kept temp texture file: ${tempTextureFile}`)
			}

			await runStep("Create a Widget Blueprint through the tool-namespace layer", async () => {
				const createWidgetResult = await callJsonTool("manage_widget_authoring", {
					action: "create_widget_blueprint",
					params: { widget_name: widgetPath },
				})
				assert(
					createWidgetResult.asset_path === widgetPath,
					`Widget Blueprint was created at an unexpected path: ${createWidgetResult.asset_path}`,
				)
			})

			await runStep("Add a TextBlock to the Widget Blueprint", async () => {
				try {
					const textResult = await callJsonTool("manage_widget_authoring", {
						action: "add_text_block",
						params: {
							widget_name: widgetPath,
							text_block_name: "SmokeText",
							text: "UE4 smoke test",
							position: { x: 32, y: 32 },
						},
					})
					assert(textResult.widget?.name === "SmokeText", "TextBlock was not added to the widget blueprint")
				} catch (error) {
					if (isUnsupportedWidgetTreeAuthoring(error)) {
						widgetAuthoringUnsupportedReason =
							error instanceof Error ? error.message : "Widget tree authoring is unavailable in this UE4.27 Python environment."
						throw new StepSkipError(widgetAuthoringUnsupportedReason)
					}

					throw error
				}
			})

			if (widgetAuthoringUnsupportedReason) {
				logSkip("Add a Button to the Widget Blueprint", widgetAuthoringUnsupportedReason)
			} else {
				await runStep("Add a Button to the Widget Blueprint", async () => {
					try {
						const buttonResult = await callJsonTool("manage_widget_authoring", {
							action: "add_button",
							params: {
								widget_name: widgetPath,
								button_name: "SmokeButton",
								text: "Smoke",
								position: { x: 32, y: 96 },
							},
						})
						assert(buttonResult.widget?.name === "SmokeButton", "Button was not added to the widget blueprint")
					} catch (error) {
						if (isUnsupportedWidgetTreeAuthoring(error)) {
							widgetAuthoringUnsupportedReason =
								error instanceof Error ? error.message : "Widget tree authoring is unavailable in this UE4.27 Python environment."
							throw new StepSkipError(widgetAuthoringUnsupportedReason)
						}

						throw error
					}
				})

				await runStep("Move the TextBlock through advanced widget tooling", async () => {
					const moveTextResult = await callJsonTool("manage_widget_authoring", {
						action: "position_widget",
						params: {
							widget_blueprint_path: widgetPath,
							widget_name: "SmokeText",
							position: { x: 48, y: 40 },
							z_order: 1,
						},
					})
					assert(
						Math.abs(Number(moveTextResult.layout?.position?.x ?? 0) - 48) < 0.1,
						"Advanced widget move did not update the TextBlock X position",
					)
				})

				await runStep("Move the Button through advanced widget tooling", async () => {
					const moveButtonResult = await callJsonTool("manage_widget_authoring", {
						action: "position_widget",
						params: {
							widget_blueprint_path: widgetPath,
							widget_name: "SmokeButton",
							position: { x: 48, y: 112 },
							z_order: 2,
						},
					})
					assert(
						Math.abs(Number(moveButtonResult.layout?.position?.x ?? 0) - 48) < 0.1,
						"Advanced widget move did not update the Button X position",
					)
				})

				await runStep("Add a CanvasPanel through advanced widget tooling", async () => {
					const panelResult = await callJsonTool("manage_widget_authoring", {
						action: "add_widget",
						params: {
							widget_blueprint_path: widgetPath,
							widget_class: "CanvasPanel",
							widget_name: "SmokePanel",
							parent_widget_name: "CanvasPanel_0",
							position: { x: 160, y: 24 },
						},
					})
					assert(panelResult.widget_name === "SmokePanel", "CanvasPanel was not added through advanced widget tooling")
				})

				await runStep("Move the CanvasPanel through advanced widget tooling", async () => {
					const movePanelResult = await callJsonTool("manage_widget_authoring", {
						action: "position_widget",
						params: {
							widget_blueprint_path: widgetPath,
							widget_name: "SmokePanel",
							position: { x: 196, y: 40 },
							z_order: 1,
						},
					})
					assert(
						Math.abs(Number(movePanelResult.layout?.position?.x ?? 0) - 196) < 0.1,
						"Advanced widget move did not update the CanvasPanel X position",
					)
				})

				await runStep("Add a child widget through advanced widget tooling", async () => {
					const childResult = await callJsonTool("manage_widget_authoring", {
						action: "add_child_widget",
						params: {
							widget_blueprint_path: widgetPath,
							parent_widget_name: "SmokePanel",
							child_widget_class: "TextBlock",
							child_widget_name: "SmokeChildText",
							position: { x: 12, y: 18 },
						},
					})
					assert(childResult.child_widget_name === "SmokeChildText", "Child widget was not added through advanced widget tooling")
				})

				await runStep("Move the child widget through advanced widget tooling", async () => {
					const moveChildResult = await callJsonTool("manage_widget_authoring", {
						action: "position_child_widget",
						params: {
							widget_blueprint_path: widgetPath,
							parent_widget_name: "SmokePanel",
							child_widget_name: "SmokeChildText",
							position: { x: 48, y: 72 },
							z_order: 2,
						},
					})
					assert(
						Math.abs(Number(moveChildResult.layout?.position?.x ?? 0) - 48) < 0.1,
						"Advanced child widget move did not update the expected X position",
					)
				})

				await runStep("Add a second CanvasPanel through advanced widget tooling", async () => {
					const panelResult = await callJsonTool("manage_widget_authoring", {
						action: "add_widget",
						params: {
							widget_blueprint_path: widgetPath,
							widget_class: "CanvasPanel",
							widget_name: "SmokePanelHost",
							parent_widget_name: "CanvasPanel_0",
							position: { x: 320, y: 40 },
						},
					})
					assert(panelResult.widget_name === "SmokePanelHost", "Second CanvasPanel was not added through advanced widget tooling")
				})

				await runStep("Reparent the CanvasPanel through advanced widget tooling", async () => {
					const reparentResult = await callJsonTool("manage_widget_authoring", {
						action: "reparent_widget",
						params: {
							widget_blueprint_path: widgetPath,
							widget_name: "SmokePanel",
							new_parent_widget_name: "SmokePanelHost",
							position: { x: 24, y: 16 },
							z_order: 3,
						},
					})
					assert(
						reparentResult.old_parent_widget_name === "CanvasPanel_0",
						`Advanced widget reparent reported an unexpected old parent: ${reparentResult.old_parent_widget_name}`,
					)
					assert(
						reparentResult.new_parent_widget_name === "SmokePanelHost",
						"Advanced widget reparent did not report the expected new parent",
					)
					assert(
						Math.abs(Number(reparentResult.layout?.position?.x ?? 0) - 24) < 0.1,
						"Advanced widget reparent did not preserve the requested X position",
					)
				})

				await runStep("Remove the child widget through advanced widget tooling", async () => {
					const removeChildResult = await callJsonTool("manage_widget_authoring", {
						action: "remove_child_widget",
						params: {
							widget_blueprint_path: widgetPath,
							parent_widget_name: "SmokePanel",
							child_widget_name: "SmokeChildText",
						},
					})
					assert(removeChildResult.child_widget_name === "SmokeChildText", "Child widget was not removed through advanced widget tooling")
				})

				await runStep("Remove the CanvasPanel through advanced widget tooling", async () => {
					const removePanelResult = await callJsonTool("manage_widget_authoring", {
						action: "remove_widget",
						params: {
							widget_blueprint_path: widgetPath,
							widget_name: "SmokePanel",
						},
					})
					assert(removePanelResult.widget_name === "SmokePanel", "CanvasPanel was not removed through advanced widget tooling")
				})

				await runStep("Remove the second CanvasPanel through advanced widget tooling", async () => {
					const removePanelResult = await callJsonTool("manage_widget_authoring", {
						action: "remove_widget",
						params: {
							widget_blueprint_path: widgetPath,
							widget_name: "SmokePanelHost",
						},
					})
					assert(removePanelResult.widget_name === "SmokePanelHost", "Second CanvasPanel was not removed through advanced widget tooling")
				})
			}

			if (options.keepAssets) {
				console.log(`[INFO] Kept Widget Blueprint asset: ${widgetPath}`)
			}

			await runStep("Read PIE status through manage_editor", async () => {
				await safeStopPie()
				const pieStatus = await callJsonTool("manage_editor", {
					action: "is_pie_running",
					params: {},
				})
				assert(typeof pieStatus.is_pie_running === "boolean", "manage_editor is_pie_running did not return a boolean status")
				assert(pieStatus.is_pie_running === false, "manage_editor is_pie_running reported PIE before the test started")
			})

			await runStep("Start PIE through manage_editor", async () => {
				const pieStart = await callJsonTool("manage_editor", {
					action: "start_pie",
					params: { timeout_seconds: 10, poll_interval: 0.25 },
				})
				assert(pieStart.success === true, "manage_editor start_pie did not acknowledge the request")
				const pieStatus = await pollPieStatus(true)
				assert(pieStatus?.is_pie_running === true, "manage_editor start_pie did not lead to a running PIE session")
				assert(Number.isFinite(pieStatus?.pie_world_count), "manage_editor is_pie_running did not return pie_world_count")
			})

			await runStep("Add the Widget Blueprint to the viewport", async () => {
				const viewportResult = await callJsonTool("manage_widget_authoring", {
					action: "add_to_viewport",
					params: {
						widget_name: widgetPath,
						z_order: 5,
					},
				})
				assert(
					viewportResult.widget_blueprint === widgetPath,
					"manage_widget_authoring add_to_viewport returned the wrong widget blueprint path",
				)
				assert(
					typeof viewportResult.widget_class === "string" && viewportResult.widget_class.length > 0,
					"manage_widget_authoring add_to_viewport did not return a widget class",
				)
			})

			await runStep("Stop PIE through manage_editor", async () => {
				const pieStop = await callJsonTool("manage_editor", {
					action: "stop_pie",
					params: { timeout_seconds: 10, poll_interval: 0.25 },
				})
				assert(pieStop.success === true, "manage_editor stop_pie did not acknowledge the request")
				const pieStatus = await pollPieStatus(false)
				assert(pieStatus?.is_pie_running === false, "manage_editor stop_pie did not stop the PIE session")
			})

			if (options.withSourceControlMutations) {
				addCleanup(
					`Revert source-control package changes for ${options.prefix}`,
					() => safeRevertSourceControlFiles([sourceControlAddAssetPath, sourceControlDataAssetPath]),
				)

				await runStep("Confirm source control mutations are available", async () => {
					const providerInfo = await callJsonTool("manage_source_control", {
						action: "provider_info",
						params: {},
					})
					assert(providerInfo.enabled === true, "Source control provider is not enabled for mutation smoke")
					assert(providerInfo.available === true, "Source control provider is not available for mutation smoke")
				})

				await runStep("Query a tracked config file through manage_source_control", async () => {
					assert(fs.existsSync(defaultEngineConfigPath), `Tracked config file not found: ${defaultEngineConfigPath}`)
					const trackedConfigState = await callJsonTool("manage_source_control", {
						action: "query_state",
						params: { file: defaultEngineConfigPath },
					})
					assert(
						trackedConfigState.state?.filename === defaultEngineConfigPath,
						"manage_source_control query_state returned the wrong tracked config path",
					)
					assert(
						typeof trackedConfigState.state?.is_source_controlled === "boolean",
						"manage_source_control query_state did not expose source-control state for the tracked config file",
					)
				})

				await runStep("Check out a tracked config file through manage_source_control", async () => {
					const checkoutResult = await callJsonTool("manage_source_control", {
						action: "checkout",
						params: { files: [defaultEngineConfigPath] },
					})
					assert(
						checkoutResult.file === defaultEngineConfigPath
							|| checkoutResult.files?.includes(defaultEngineConfigPath),
						"manage_source_control checkout did not report the tracked config file",
					)
					assert(checkoutResult.success === true, "manage_source_control checkout did not succeed")
				})

				await runStep("Revert an unchanged tracked config file through manage_source_control", async () => {
					const revertUnchangedResult = await callJsonTool("manage_source_control", {
						action: "revert_unchanged",
						params: { files: [defaultEngineConfigPath] },
					})
					assert(
						revertUnchangedResult.files?.includes(defaultEngineConfigPath),
						"manage_source_control revert_unchanged did not report the tracked config file",
					)
					assert(
						revertUnchangedResult.success === true,
						"manage_source_control revert_unchanged did not succeed",
					)
				})

				await runStep("Sync a tracked config file through manage_source_control", async () => {
					if (!projectHasGitRemote) {
						throw new StepSkipError(
							"Project source-control repository does not have a remote configured for sync.",
						)
					}
					const syncResult = await callJsonTool("manage_source_control", {
						action: "sync",
						params: { files: [defaultEngineConfigPath] },
					})
					assert(
						syncResult.file === defaultEngineConfigPath
							|| syncResult.files?.includes(defaultEngineConfigPath),
						"manage_source_control sync did not report the tracked config file",
					)
					assert(syncResult.success === true, "manage_source_control sync did not succeed")
				})

				await runStep("Create a generated DataAsset for source control add smoke", async () => {
					const sourceControlAddAssetResult = await callJsonTool("manage_data", {
						action: "create_data_asset",
						params: {
							name: sourceControlAddAssetPath,
							data_asset_class: "DataAsset",
						},
					})
					assert(
						sourceControlAddAssetResult.asset_path === sourceControlAddAssetPath,
						"Source-control add smoke DataAsset was created at an unexpected path",
					)
				})

				await runStep("Create a generated DataAsset for source control checkout-or-add smoke", async () => {
					const sourceControlAssetResult = await callJsonTool("manage_data", {
						action: "create_data_asset",
						params: {
							name: sourceControlDataAssetPath,
							data_asset_class: "DataAsset",
						},
					})
					assert(
						sourceControlAssetResult.asset_path === sourceControlDataAssetPath,
						"Source-control smoke DataAsset was created at an unexpected path",
					)
				})

				await runStep("Mark a generated asset for add through manage_source_control", async () => {
					const addResult = await callJsonTool("manage_source_control", {
						action: "add",
						params: { files: [sourceControlAddAssetPath] },
					})
					assert(
						addResult.file === sourceControlAddAssetPath
							|| addResult.files?.includes(sourceControlAddAssetPath),
						"manage_source_control add did not report the generated asset package",
					)
				})

				await runStep("Query the generated add asset through manage_source_control", async () => {
					const tempFileState = await callJsonTool("manage_source_control", {
						action: "query_state",
						params: { file: sourceControlAddAssetPath },
					})
					assert(
						typeof tempFileState.state?.filename === "string" && tempFileState.state.filename.length > 0,
						"manage_source_control query_state did not return a filename for the generated add asset",
					)
					assert(
						typeof tempFileState.state?.is_added === "boolean",
						"manage_source_control query_state did not return an is_added flag for the generated add asset",
					)
				})

				await runStep("Revert the generated add asset through manage_source_control", async () => {
					const revertResult = await callJsonTool("manage_source_control", {
						action: "revert",
						params: { files: [sourceControlAddAssetPath] },
					})
					assert(
						revertResult.file === sourceControlAddAssetPath
							|| revertResult.files?.includes(sourceControlAddAssetPath),
						"manage_source_control revert did not report the generated add asset",
					)
				})

				await runStep("Check out or add a generated asset through manage_source_control", async () => {
					const checkoutOrAddResult = await callJsonTool("manage_source_control", {
						action: "checkout_or_add",
						params: { files: [sourceControlDataAssetPath] },
					})
					assert(
						checkoutOrAddResult.file === sourceControlDataAssetPath
							|| checkoutOrAddResult.files?.includes(sourceControlDataAssetPath),
						"manage_source_control checkout_or_add did not report the generated asset package",
					)
				})

				await runStep("Query the generated asset package through manage_source_control", async () => {
					const assetState = await callJsonTool("manage_source_control", {
						action: "query_state",
						params: { file: sourceControlDataAssetPath },
					})
					assert(
						typeof assetState.state?.filename === "string" && assetState.state.filename.length > 0,
						"manage_source_control query_state did not return a filename for the generated asset package",
					)
					assert(
						typeof assetState.state?.can_revert === "boolean",
						"manage_source_control query_state did not return a can_revert flag for the generated asset package",
					)
				})

				await runStep("Revert the generated checkout-or-add asset through manage_source_control", async () => {
					const revertResult = await callJsonTool("manage_source_control", {
						action: "revert",
						params: { files: [sourceControlDataAssetPath] },
					})
					assert(
						revertResult.file === sourceControlDataAssetPath
							|| revertResult.files?.includes(sourceControlDataAssetPath),
						"manage_source_control revert did not report the generated checkout-or-add asset",
					)
				})
			}
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
