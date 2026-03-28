#!/usr/bin/env node

import fs from "node:fs"
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
			"manage_editor",
			"manage_actor",
			"manage_data",
			"manage_source_control",
			"manage_tools",
		]

		if (options.withAssets) {
			requiredTools.push(
				"manage_blueprint",
				"manage_widget_authoring",
			)
		}

		await runStep("Verify required tool names are exposed", async () => {
			const missingTools = requiredTools.filter((toolName) => !toolNames.has(toolName))
			assert(missingTools.length === 0, `Missing expected tools: ${missingTools.join(", ")}`)
		})

		await runStep("Read project info", async () => {
			const projectInfo = await callJsonTool("manage_editor", {
				action: "project_info",
				params: {},
			})
			assert(typeof projectInfo.project_name === "string" && projectInfo.project_name.length > 0, "project_name is missing")
			assert(typeof projectInfo.engine_version === "string" && projectInfo.engine_version.includes("4.27"), "engine_version does not look like UE4.27")
		})

		await runStep("Read current map info", async () => {
			const mapInfo = await callJsonTool("manage_editor", {
				action: "map_info",
				params: {},
			})
			assert(typeof mapInfo.map_name === "string" && mapInfo.map_name.length > 0, "map_name is missing")
			assert(Number.isFinite(mapInfo.total_actors), "total_actors is missing")
		})

		await runStep("Read current world outliner", async () => {
			const outliner = await callJsonTool("manage_editor", {
				action: "world_outliner",
				params: {},
			})
			assert(Array.isArray(outliner.actors), "world outliner did not return an actor list")
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

		if (options.withAssets) {
			const blueprintPath = `/Game/MCP/Tests/BP_${options.prefix}`
			const dataAssetPath = `/Game/MCP/Tests/DA_${options.prefix}`
			const stringTablePath = `/Game/MCP/Tests/ST_${options.prefix}`
			const widgetPath = `/Game/MCP/Tests/WBP_${options.prefix}`
			let widgetAuthoringUnsupportedReason = ""
			if (!options.keepAssets) {
				addCleanup(
					`Delete assets for ${options.prefix}`,
					() => safeDeleteAssets([widgetPath, blueprintPath, dataAssetPath, stringTablePath]),
				)
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

			await runStep("Compile the Blueprint asset", async () => {
				const compileResult = await callJsonTool("manage_blueprint", {
					action: "compile",
					params: {
						blueprint_name: blueprintPath,
					},
				})
				assert(compileResult.blueprint === blueprintPath, "manage_blueprint compile returned an unexpected asset path")
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

			if (options.keepAssets) {
				console.log(`[INFO] Kept Blueprint asset: ${blueprintPath}`)
				console.log(`[INFO] Kept DataAsset: ${dataAssetPath}`)
				console.log(`[INFO] Kept StringTable: ${stringTablePath}`)
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
