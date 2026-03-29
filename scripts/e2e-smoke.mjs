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
		keepAssets: false,
	}

	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index]

		switch (value) {
			case "--with-assets":
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
	const basicShapeMaterialPath = "/Engine/BasicShapes/BasicShapeMaterial"

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

	try {
		await runStep("Connect to Unreal MCP server", async () => {
			await withTimeout(client.connect(transport), options.timeoutMs, "MCP connect")
		})

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
			"manage_lighting",
			"manage_material_authoring",
			"manage_data",
			"manage_source_control",
			"manage_system",
			"manage_tools",
		]

		if (options.withAssets) {
			requiredTools.push(
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
			assert(
				projectPathText.toLowerCase().includes(".uproject"),
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
		addCleanup(`Delete actor ${lightActorName}`, () => safeDeleteActor(lightActorName))

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

		if (options.withAssets) {
			const blueprintPath = `/Game/MCP/Tests/BP_${options.prefix}`
			const dataAssetPath = `/Game/MCP/Tests/DA_${options.prefix}`
			const dataTablePath = `/Game/MCP/Tests/DT_${options.prefix}`
			const stringTablePath = `/Game/MCP/Tests/ST_${options.prefix}`
			const texturePath = `/Game/MCP/Tests/T_${options.prefix}`
			const widgetPath = `/Game/MCP/Tests/WBP_${options.prefix}`
			const tempTextureFile = path.join(os.tmpdir(), `${options.prefix}_Texture.png`)
			const inputMappingName = `${options.prefix}_Action`
			const defaultInputConfigPath = path.join(
				resolveLocalPath(projectInfo.project_directory),
				"Config",
				"DefaultInput.ini",
			)
			const originalDefaultInputConfig = fs.existsSync(defaultInputConfigPath)
				? fs.readFileSync(defaultInputConfigPath, "utf8")
				: null
			const originalClassicInputActionCount = Number(projectInfo.classic_input_actions_count ?? 0)
			let widgetAuthoringUnsupportedReason = ""
			let resolvedBlueprintMaterialPath = basicShapeMaterialPath
			const texturePixelBase64 =
				"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZSURBVBhXY/jPAEQNIAoO/oMBlEMQMDAAAO2DCXg4buGUAAAAAElFTkSuQmCC"
			fs.writeFileSync(tempTextureFile, Buffer.from(texturePixelBase64, "base64"))
			if (!options.keepAssets) {
				addCleanup(
					`Delete assets for ${options.prefix}`,
					() =>
						safeDeleteAssets([
							widgetPath,
							texturePath,
							blueprintPath,
							dataAssetPath,
							dataTablePath,
							stringTablePath,
						]),
				)
				addCleanup(`Delete temp image ${tempTextureFile}`, async () => {
					try {
						fs.unlinkSync(tempTextureFile)
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

			await runStep("Compile the Blueprint asset", async () => {
				const compileResult = await callJsonTool("manage_blueprint", {
					action: "compile",
					params: {
						blueprint_name: blueprintPath,
					},
				})
				assert(compileResult.blueprint === blueprintPath, "manage_blueprint compile returned an unexpected asset path")
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
				const refreshedProjectInfo = await callJsonTool("manage_editor", {
					action: "project_info",
					params: {},
				})
				assert(
					Array.isArray(refreshedProjectInfo.classic_input_actions) &&
						refreshedProjectInfo.classic_input_actions.includes(inputMappingName),
					"manage_editor project_info did not report the new classic input mapping",
				)
				assert(
					Number(refreshedProjectInfo.classic_input_actions_count ?? 0) >= originalClassicInputActionCount + 1,
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
			}

			if (options.keepAssets) {
				console.log(`[INFO] Kept Widget Blueprint asset: ${widgetPath}`)
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
