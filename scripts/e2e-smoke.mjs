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
  --skip-domain         Skip the domain-tool smoke phase.
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
		skipDomain: false,
		timeoutMs: 20_000,
		verbose: false,
		withAssets: false,
	}

	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index]

		switch (value) {
			case "--with-assets":
				options.withAssets = true
				break
			case "--skip-domain":
				options.skipDomain = true
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
				fail(parsed.message ?? `Tool ${toolName} reported success=false`)
			}

			if (typeof parsed.error === "string" && parsed.error) {
				fail(parsed.error)
			}
		}
		return parsed
	} catch (error) {
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

	const runStep = async (name, fn) => {
		try {
			const result = await fn()
			logPass(name)
			return result
		} catch (error) {
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

	const safeDeleteActor = async (actorName) => {
		try {
			await callJsonTool("delete_actor", { name: actorName })
		} catch {
			// Best effort cleanup only.
		}
	}

	const safeDeleteAssets = async (assetPaths) => {
		if (assetPaths.length === 0) {
			return
		}

		try {
			await callJsonTool("editor_run_python", { code: buildDeleteAssetsPython(assetPaths) })
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
			"editor_project_info",
			"editor_get_map_info",
			"editor_get_world_outliner",
			"spawn_actor",
			"set_actor_transform",
			"delete_actor",
			"control_actor",
			"manage_tools",
		]

		if (options.withAssets) {
			requiredTools.push(
				"create_blueprint",
				"add_component_to_blueprint",
				"set_static_mesh_properties",
				"compile_blueprint",
				"create_umg_widget_blueprint",
				"add_text_block_to_widget",
				"manage_widget_authoring",
			)
		}

		await runStep("Verify required tool names are exposed", async () => {
			const missingTools = requiredTools.filter((toolName) => !toolNames.has(toolName))
			assert(missingTools.length === 0, `Missing expected tools: ${missingTools.join(", ")}`)
		})

		await runStep("Read project info", async () => {
			const projectInfo = await callJsonTool("editor_project_info")
			assert(typeof projectInfo.project_name === "string" && projectInfo.project_name.length > 0, "project_name is missing")
			assert(typeof projectInfo.engine_version === "string" && projectInfo.engine_version.includes("4.27"), "engine_version does not look like UE4.27")
		})

		await runStep("Read current map info", async () => {
			const mapInfo = await callJsonTool("editor_get_map_info")
			assert(typeof mapInfo.map_name === "string" && mapInfo.map_name.length > 0, "map_name is missing")
			assert(Number.isFinite(mapInfo.total_actors), "total_actors is missing")
		})

		await runStep("Read current world outliner", async () => {
			const outliner = await callJsonTool("editor_get_world_outliner")
			assert(Array.isArray(outliner.actors), "world outliner did not return an actor list")
		})

		const granularActorName = `${options.prefix}_Actor`
		addCleanup(`Delete actor ${granularActorName}`, () => safeDeleteActor(granularActorName))

		await runStep("Spawn a granular smoke-test actor", async () => {
			const spawnResult = await callJsonTool("spawn_actor", {
				type: "StaticMeshActor",
				name: granularActorName,
				location: { x: 0, y: 0, z: 150 },
			})
			assert(spawnResult.actor?.label === granularActorName, "spawn_actor did not create the expected label")
		})

		await runStep("Find the spawned actor by name", async () => {
			const findResult = await callJsonTool("find_actors_by_name", { pattern: granularActorName })
			assert(findResult.count >= 1, "find_actors_by_name did not locate the smoke actor")
		})

		await runStep("Move the spawned actor", async () => {
			const transformResult = await callJsonTool("set_actor_transform", {
				name: granularActorName,
				location: { x: 300, y: 0, z: 150 },
				scale: { x: 1, y: 1, z: 1 },
			})
			assert(
				Math.abs(Number(transformResult.actor?.location?.x ?? 0) - 300) < 0.1,
				"set_actor_transform did not update the expected X location",
			)
		})

		await runStep("Inspect actor properties", async () => {
			const propertyResult = await callJsonTool("get_actor_properties", { name: granularActorName })
			assert(propertyResult.actor?.label === granularActorName, "get_actor_properties returned the wrong actor")
		})

		await runStep("Delete the granular smoke-test actor", async () => {
			await callJsonTool("delete_actor", { name: granularActorName })
		})

		const domainActorName = `${options.prefix}_DomainActor`
		if (!options.skipDomain) {
			addCleanup(`Delete actor ${domainActorName}`, () => safeDeleteActor(domainActorName))

			await runStep("Inspect registered domain tools", async () => {
				const domainInfo = await callJsonTool("manage_tools", { action: "list_domains", params: {} })
				assert(Array.isArray(domainInfo.domains), "manage_tools did not return a domain list")
				const domainNames = new Set(domainInfo.domains.map((item) => item.tool))
				for (const requiredDomain of ["control_actor", "manage_asset", "manage_widget_authoring"]) {
					assert(domainNames.has(requiredDomain), `Domain tool is missing: ${requiredDomain}`)
				}
			})

			await runStep("Spawn an actor through the domain layer", async () => {
				const spawnResult = await callJsonTool("control_actor", {
					action: "spawn",
					params: {
						type: "StaticMeshActor",
						name: domainActorName,
						location: { x: 0, y: 300, z: 150 },
					},
				})
				assert(spawnResult.actor?.label === domainActorName, "control_actor spawn did not create the expected label")
			})

			await runStep("Delete the domain-layer actor", async () => {
				await callJsonTool("control_actor", {
					action: "delete",
					params: { name: domainActorName },
				})
			})
		}

		if (options.withAssets) {
			const blueprintPath = `/Game/MCP/Tests/BP_${options.prefix}`
			const widgetPath = `/Game/MCP/Tests/WBP_${options.prefix}`
			addCleanup(`Delete assets for ${options.prefix}`, () => safeDeleteAssets([widgetPath, blueprintPath]))

			await runStep("Create a Blueprint asset", async () => {
				const createResult = await callJsonTool("create_blueprint", {
					name: blueprintPath,
					parent_class: "Actor",
				})
				assert(createResult.asset_path === blueprintPath, "create_blueprint returned an unexpected asset path")
			})

			await runStep("Add a StaticMeshComponent to the Blueprint", async () => {
				const componentResult = await callJsonTool("add_component_to_blueprint", {
					blueprint_name: blueprintPath,
					component_type: "StaticMeshComponent",
					component_name: "SmokeMesh",
				})
				assert(componentResult.component?.name === "SmokeMesh", "Blueprint component was not created")
			})

			await runStep("Assign a mesh to the Blueprint component", async () => {
				await callJsonTool("set_static_mesh_properties", {
					blueprint_name: blueprintPath,
					component_name: "SmokeMesh",
					static_mesh: "/Engine/BasicShapes/Cube",
				})
			})

			await runStep("Compile the Blueprint asset", async () => {
				const compileResult = await callJsonTool("compile_blueprint", {
					blueprint_name: blueprintPath,
				})
				assert(compileResult.blueprint === blueprintPath, "compile_blueprint returned an unexpected asset path")
			})

			await runStep("Create a Widget Blueprint through the domain layer", async () => {
				const createWidgetResult = await callJsonTool("manage_widget_authoring", {
					action: "create_widget_blueprint",
					params: { widget_name: widgetPath },
				})
				assert(createWidgetResult.asset_path === widgetPath, "Widget Blueprint was not created at the expected path")
			})

			await runStep("Add a TextBlock to the Widget Blueprint", async () => {
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
			})

			await runStep("Add a Button to the Widget Blueprint", async () => {
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
			})
		}

		console.log("")
		console.log(`Smoke test completed successfully with ${summary.length} checks.`)
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
