import { z } from "zod"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { RemoteExecution, RemoteExecutionConfig } from "unreal-remote-execution"
import * as editorTools from "./editor/tools.js"

export const server = new McpServer({
	name: "UnrealMCP-UE4",
	description: "Unreal Engine MCP for UE4.27.2 with UE4/UE5 editor scripting compatibility helpers",
	version: "0.1.4-ue4.27.2",
})

const config = new RemoteExecutionConfig(1, ["239.0.0.1", 6766], "0.0.0.0")
const remoteExecution = new RemoteExecution(config)

// Start the remote execution server
remoteExecution.start()

let remoteNode: RemoteExecution | undefined = undefined
let remoteConnectionPromise: Promise<void> | undefined = undefined
let enginePath: string | undefined = undefined
let projectPath: string | undefined = undefined

const connectWithRetry = async (maxRetries: number = 3, retryDelay: number = 2000) => {
	let lastError: unknown = undefined

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const node = await remoteExecution.getFirstRemoteNode(1000, 5000)

			// Once a node is found, open a command connection
			await remoteExecution.openCommandConnection(node)
			remoteNode = remoteExecution

			// Execute a command to verify connection
			const result = await remoteExecution.runCommand('print("rrmcp:init")')
			if (!result.success) {
				throw new Error(`Failed to run command: ${JSON.stringify(result.result)}`)
			}

			return
		} catch (error) {
			lastError = error
			console.error(`Connection attempt ${attempt} failed:`, error)

			if (attempt < maxRetries) {
				console.error(`Retrying in ${retryDelay}ms...`)
				await new Promise((resolve) => setTimeout(resolve, retryDelay))
				// Exponential backoff
				retryDelay = Math.min(retryDelay * 1.5, 10000)
			}
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error("Unable to connect to your Unreal Engine Editor after multiple attempts")
}

const ensureRemoteConnection = async () => {
	if (remoteNode) {
		return
	}

	if (!remoteConnectionPromise) {
		remoteConnectionPromise = connectWithRetry().finally(() => {
			if (!remoteNode) {
				remoteConnectionPromise = undefined
			}
		})
	}

	await remoteConnectionPromise
}

void ensureRemoteConnection().catch((error) => {
	console.error("Initial Unreal Remote Execution connection failed:", error)
})

const tryRunCommand = async (command: string): Promise<string> => {
	await ensureRemoteConnection()

	try {
		const result = await remoteNode!.runCommand(command)
		if (!result.success) {
			throw new Error(`Command failed with: ${result.result}`)
		}

		return result.output.map((line) => line.output).join("\n")
	} catch (error) {
		try {
			if (remoteExecution.hasCommandConnection()) {
				remoteExecution.closeCommandConnection()
			}
		} catch (closeError) {
			console.error("Failed to close stale Unreal command connection:", closeError)
		}

		remoteNode = undefined
		remoteConnectionPromise = undefined
		await ensureRemoteConnection()

		const retryResult = await remoteNode!.runCommand(command)
		if (!retryResult.success) {
			throw error instanceof Error ? error : new Error(String(error))
		}

		return retryResult.output.map((line) => line.output).join("\n")
	}
}

const textResponse = (text: string) => ({
	content: [{ type: "text", text }] as const,
})

const registerPythonTool = (
	name: string,
	description: string,
	schema: Record<string, z.ZodTypeAny>,
	buildCommand: (args: any) => string,
) => {
	server.tool(name, description, schema, async (args) => textResponse(await tryRunCommand(buildCommand(args))))
}

const registerZeroArgPythonTool = (
	name: string,
	description: string,
	buildCommand: () => string,
) => {
	server.tool(name, description, async () => textResponse(await tryRunCommand(buildCommand())))
}

const vector2InputSchema = z.union([
	z.object({ x: z.number(), y: z.number() }),
	z.tuple([z.number(), z.number()]),
])

const vector3InputSchema = z.union([
	z.object({ x: z.number(), y: z.number(), z: z.number() }),
	z.tuple([z.number(), z.number(), z.number()]),
])

const rotatorInputSchema = z.union([
	z.object({ pitch: z.number(), yaw: z.number(), roll: z.number() }),
	z.tuple([z.number(), z.number(), z.number()]),
])

const colorInputSchema = z.union([
	z.object({
		r: z.number(),
		g: z.number(),
		b: z.number(),
		a: z.number().optional(),
	}),
	z.tuple([z.number(), z.number(), z.number(), z.number()]),
])

const recordSchema = z.record(z.any())
const stringListSchema = z.array(z.string().min(1)).min(1)

type DomainDispatchResult =
	| { kind: "python"; command: string }
	| { kind: "direct"; payload: unknown }

type DomainActionHandler = (
	params: Record<string, any>,
) => DomainDispatchResult | Promise<DomainDispatchResult>

const chiR24DomainRegistry = new Map<string, { description: string; supportedActions: string[] }>()

const pythonDispatch = (command: string): DomainDispatchResult => ({ kind: "python", command })

const directDispatch = (payload: unknown): DomainDispatchResult => ({ kind: "direct", payload })

const normalizeActionName = (action: string) => action.trim().toLowerCase()

const requiredStringParam = (params: Record<string, any>, keys: string[]) => {
	for (const key of keys) {
		const value = params[key]
		if (typeof value === "string" && value.trim()) {
			return value.trim()
		}
	}

	throw new Error(`${keys[0]} is required`)
}

const optionalStringParam = (params: Record<string, any>, keys: string[]) => {
	for (const key of keys) {
		const value = params[key]
		if (typeof value === "string" && value.trim()) {
			return value.trim()
		}
	}

	return undefined
}

const optionalStringListParam = (params: Record<string, any>, keys: string[]) => {
	for (const key of keys) {
		const value = params[key]
		if (Array.isArray(value)) {
			const normalizedValues = value
				.filter((entry) => typeof entry === "string")
				.map((entry) => entry.trim())
				.filter(Boolean)

			if (normalizedValues.length > 0) {
				return normalizedValues
			}
		}

		if (typeof value === "string" && value.trim()) {
			return [value.trim()]
		}
	}

	return undefined
}

const requiredStringListParam = (params: Record<string, any>, keys: string[]) => {
	const values = optionalStringListParam(params, keys)
	if (values && values.length > 0) {
		return values
	}

	throw new Error(`${keys[0]} is required`)
}

const toVector2Record = (value: any) => {
	if (!value) {
		return undefined
	}

	if (Array.isArray(value)) {
		return {
			x: Number(value[0] ?? 0),
			y: Number(value[1] ?? 0),
		}
	}

	return {
		x: Number(value.x ?? 0),
		y: Number(value.y ?? 0),
	}
}

const toVector3Record = (value: any) => {
	if (!value) {
		return undefined
	}

	if (Array.isArray(value)) {
		return {
			x: Number(value[0] ?? 0),
			y: Number(value[1] ?? 0),
			z: Number(value[2] ?? 0),
		}
	}

	return {
		x: Number(value.x ?? 0),
		y: Number(value.y ?? 0),
		z: Number(value.z ?? 0),
	}
}

const toRotatorRecord = (value: any) => {
	if (!value) {
		return undefined
	}

	if (Array.isArray(value)) {
		return {
			pitch: Number(value[0] ?? 0),
			yaw: Number(value[1] ?? 0),
			roll: Number(value[2] ?? 0),
		}
	}

	return {
		pitch: Number(value.pitch ?? 0),
		yaw: Number(value.yaw ?? 0),
		roll: Number(value.roll ?? 0),
	}
}

const unsupportedDomainAction = (
	toolName: string,
	action: string,
	supportedActions: string[],
): DomainDispatchResult =>
	directDispatch({
		success: false,
		message: `Action '${action}' is not supported by ${toolName} in this UE4.27 port.`,
		supported_actions: supportedActions,
	})

const runDomainDispatch = async (result: DomainDispatchResult) => {
	if (result.kind === "python") {
		return textResponse(await tryRunCommand(result.command))
	}

	return textResponse(JSON.stringify(result.payload, null, 2))
}

const registerDomainTool = (
	name: string,
	description: string,
	actions: Record<string, DomainActionHandler>,
) => {
	const supportedActions = Object.keys(actions).sort()
	chiR24DomainRegistry.set(name, { description, supportedActions })

	server.tool(
		name,
		description,
		{
			action: z.string().describe(`Domain action to execute inside ${name}`),
			params: recordSchema.optional().describe("Optional action parameter object"),
		},
		async ({ action, params }) => {
			const normalizedAction = normalizeActionName(action)

			try {
				const handler = actions[normalizedAction]
				const result = handler
					? await handler(params ?? {})
					: unsupportedDomainAction(name, normalizedAction, supportedActions)

				return await runDomainDispatch(result)
			} catch (error) {
				return textResponse(
					JSON.stringify(
						{
							success: false,
							tool: name,
							action: normalizedAction,
							message: error instanceof Error ? error.message : String(error),
						},
						null,
						2,
					),
				)
			}
		},
	)
}
const worldBuildBaseSchema = {
	location: vector3InputSchema.optional().describe("Optional world location"),
	material_path: z.string().optional().describe("Optional material path to apply"),
	prefix: z.string().optional().describe("Optional actor label prefix"),
}

const toVector2Array = (value?: { x: number; y: number } | [number, number]) => {
	if (!value) {
		return undefined
	}

	return Array.isArray(value) ? value : [value.x, value.y]
}

const toVector3Array = (value?: { x: number; y: number; z: number } | [number, number, number]) => {
	if (!value) {
		return undefined
	}

	return Array.isArray(value) ? value : [value.x, value.y, value.z]
}

const toRotatorArray = (
	value?: { pitch: number; yaw: number; roll: number } | [number, number, number],
) => {
	if (!value) {
		return undefined
	}

	return Array.isArray(value) ? value : [value.pitch, value.yaw, value.roll]
}

const toColorArray = (
	value?: { r: number; g: number; b: number; a?: number } | [number, number, number, number],
) => {
	if (!value) {
		return undefined
	}

	return Array.isArray(value) ? value : [value.r, value.g, value.b, value.a ?? 1]
}

const searchAssetsCommand = (params: Record<string, any>, defaultAssetClass?: string) =>
	editorTools.UESearchAssets(
		optionalStringParam(params, ["search_term", "query", "pattern", "name"]) ?? "",
		optionalStringParam(params, ["asset_class", "class_name", "class"]) ?? defaultAssetClass,
	)

const worldBuildCommand = (operation: string, params: Record<string, any>) =>
	editorTools.UEWorldBuildingTool(operation, {
		...params,
		location: toVector3Array(params.location),
	})

const actorNameParam = (params: Record<string, any>) => requiredStringParam(params, ["name", "actor_name"])

const blueprintNameParam = (params: Record<string, any>) =>
	requiredStringParam(params, ["blueprint_name", "asset_path", "name"])

const widgetBlueprintParam = (params: Record<string, any>) =>
	requiredStringParam(params, ["widget_blueprint", "widget_blueprint_path", "widget_name", "blueprint_name"])

const sourceControlFileParam = (params: Record<string, any>) =>
	requiredStringParam(params, ["file", "path", "asset_path", "package", "name"])

const sourceControlFileListParam = (params: Record<string, any>) =>
	requiredStringListParam(params, [
		"files",
		"paths",
		"asset_paths",
		"packages",
		"file",
		"path",
		"asset_path",
		"package",
		"name",
	])

const sourceControlPackageListParam = (params: Record<string, any>) =>
	requiredStringListParam(params, [
		"packages",
		"package_names",
		"paths",
		"asset_paths",
		"package",
		"path",
	])

const sourceControlFilesCommand = (
	files: string[],
	singleOperation?: string,
	multiOperation?: string,
) => {
	if (singleOperation && files.length === 1) {
		return editorTools.UESourceControlTool(singleOperation, { file: files[0] })
	}

	return editorTools.UESourceControlTool(multiOperation ?? singleOperation!, { files })
}

/// Connection & Setup
server.tool(
	"set_unreal_engine_path",
	"Set the Unreal Engine path",
	{
		path: z.string(),
	},
	async ({ path }) => {
		enginePath = path

		return {
			content: [
				{
					type: "text",
					text: `Unreal Engine path set to ${path}`,
				},
			],
		}
	},
)

server.tool(
	"set_unreal_project_path",
	"Set the Project path",
	{
		path: z.string(),
	},
	async ({ path }) => {
		projectPath = path

		return {
			content: [
				{
					type: "text",
					text: `Project path set to ${path}`,
				},
			],
		}
	},
)

server.tool("get_unreal_engine_path", "Get the current Unreal Engine path", async () => {
	if (!enginePath) {
		throw new Error("Unreal Engine path is not set")
	}

	return {
		content: [
			{
				type: "text",
				text: `Unreal Engine path: ${enginePath}`,
			},
		],
	}
})

server.tool("get_unreal_project_path", "Get the current Unreal Project path", async () => {
	if (!projectPath) {
		throw new Error("Unreal Project path is not set")
	}

	return {
		content: [
			{
				type: "text",
				text: `Unreal Project path: ${projectPath}`,
			},
		],
	}
})

/// Actor / Level Tools
server.tool(
	"editor_create_object",
	"Create a new object/actor in the world\n\nExample output: {'success': true, 'actor_name': 'StaticMeshActor_1', 'actor_label': 'MyCube', 'class': 'StaticMeshActor', 'location': {'x': 100.0, 'y': 200.0, 'z': 0.0}, 'rotation': {'pitch': 0.0, 'yaw': 45.0, 'roll': 0.0}, 'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0}}\n\nReturns created actor details with final transform values.",
	{
		object_class: z.string().describe("Unreal class name (e.g., 'StaticMeshActor', 'DirectionalLight')"),
		object_name: z.string().describe("Name/label for the created object"),
		location: z
			.object({
				x: z.number().default(0),
				y: z.number().default(0),
				z: z.number().default(0),
			})
			.optional()
			.describe("World position coordinates"),
		rotation: z
			.object({
				pitch: z.number().default(0),
				yaw: z.number().default(0),
				roll: z.number().default(0),
			})
			.optional()
			.describe("Rotation in degrees"),
		scale: z
			.object({
				x: z.number().default(1),
				y: z.number().default(1),
				z: z.number().default(1),
			})
			.optional()
			.describe("Scale multipliers"),
		properties: z
			.record(z.any())
			.optional()
			.describe(
				'Additional actor properties. For StaticMeshActor: use \'StaticMesh\' for mesh path, \'Material\' for single material path, or \'Materials\' for array of material paths. Example: {"StaticMesh": "/Game/Meshes/Cube", "Material": "/Game/Materials/M_Basic"}',
			),
	},
	async ({ object_class, object_name, location, rotation, scale, properties }) => {
		const result = await tryRunCommand(
			editorTools.UECreateObject(object_class, object_name, location, rotation, scale, properties),
		)
		return {
			content: [
				{
					type: "text",
					text: result,
				},
			],
		}
	},
)

server.tool(
	"editor_update_object",
	"Update an existing object/actor in the world\n\nExample output: {'success': true, 'actor_name': 'StaticMeshActor_1', 'actor_label': 'UpdatedCube', 'class': 'StaticMeshActor', 'location': {'x': 150.0, 'y': 200.0, 'z': 50.0}, 'rotation': {'pitch': 0.0, 'yaw': 90.0, 'roll': 0.0}, 'scale': {'x': 2.0, 'y': 2.0, 'z': 2.0}}\n\nReturns updated actor details with new transform values.",
	{
		actor_name: z.string().describe("Name or label of the actor to update"),
		location: z
			.object({
				x: z.number(),
				y: z.number(),
				z: z.number(),
			})
			.optional()
			.describe("New world position coordinates"),
		rotation: z
			.object({
				pitch: z.number(),
				yaw: z.number(),
				roll: z.number(),
			})
			.optional()
			.describe("New rotation in degrees"),
		scale: z
			.object({
				x: z.number(),
				y: z.number(),
				z: z.number(),
			})
			.optional()
			.describe("New scale multipliers"),
		properties: z
			.record(z.any())
			.optional()
			.describe(
				'Additional actor properties to update. For StaticMeshActor: use \'StaticMesh\' for mesh path, \'Material\' for single material path, or \'Materials\' for array of material paths. Example: {"StaticMesh": "/Game/Meshes/Cube", "Material": "/Game/Materials/M_Basic"}',
			),
		new_name: z.string().optional().describe("New name/label for the actor"),
	},
	async ({ actor_name, location, rotation, scale, properties, new_name }) => {
		const result = await tryRunCommand(
			editorTools.UEUpdateObject(actor_name, location, rotation, scale, properties, new_name),
		)
		return {
			content: [
				{
					type: "text",
					text: result,
				},
			],
		}
	},
)

server.tool(
	"editor_delete_object",
	"Delete an object/actor from the world\n\nExample output: {'success': true, 'message': 'Successfully deleted actor: MyCube', 'deleted_actor': {'actor_name': 'StaticMeshActor_1', 'actor_label': 'MyCube', 'class': 'StaticMeshActor', 'location': {'x': 100.0, 'y': 200.0, 'z': 0.0}}}\n\nReturns deletion confirmation with details of the deleted actor.",
	{
		actor_names: z.string(),
	},
	async ({ actor_names }) => {
		const result = await tryRunCommand(editorTools.UEDeleteObject(actor_names))
		return {
			content: [
				{
					type: "text",
					text: result,
				},
			],
		}
	},
)

/// Domain Tools
registerDomainTool(
	"manage_asset",
	"Domain asset namespace for list, search, info, references, export, and validation actions.",
	{
		list: () => pythonDispatch(editorTools.UEListAssets()),
		search: (params) => pythonDispatch(searchAssetsCommand(params)),
		info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
		references: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetReferences(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
		export: (params) =>
			pythonDispatch(
				editorTools.UEExportAsset(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
		validate: (params) =>
			pythonDispatch(editorTools.UEValidateAssets(optionalStringParam(params, ["asset_paths", "paths"]))),
	},
)

registerDomainTool(
	"control_actor",
	"Domain actor namespace for listing, searching, spawning, deleting, transforming, and inspecting level actors.",
	{
		list: () => pythonDispatch(editorTools.UEActorTool("get_actors_in_level")),
		find: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("find_actors_by_name", {
					pattern: requiredStringParam(params, ["pattern", "name"]),
				}),
			),
		spawn: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("spawn_actor", {
					type: optionalStringParam(params, ["type", "actor_type", "class_name"]) ?? "StaticMeshActor",
					name: optionalStringParam(params, ["name", "actor_name"]),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
				}),
			),
		spawn_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("spawn_blueprint_actor", {
					blueprint_name: blueprintNameParam(params),
					name: optionalStringParam(params, ["name", "actor_name"]),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
					properties: params.properties,
				}),
			),
		delete: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("delete_actor", {
					name: actorNameParam(params),
				}),
			),
		transform: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("set_actor_transform", {
					name: actorNameParam(params),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
				}),
			),
		get_properties: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("get_actor_properties", {
					name: actorNameParam(params),
				}),
			),
		set_property: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("set_actor_property", {
					name: actorNameParam(params),
					property_name: requiredStringParam(params, ["property_name"]),
					property_value: params.property_value,
				}),
			),
		get_material_info: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("get_actor_material_info", {
					name: actorNameParam(params),
				}),
			),
	},
)

registerDomainTool(
	"control_editor",
	"Domain editor namespace for Python execution, console commands, project inspection, map inspection, screenshots, and camera control.",
	{
		run_python: (params) => pythonDispatch(requiredStringParam(params, ["code"])),
		console_command: (params) =>
			pythonDispatch(
				editorTools.UEConsoleCommand(requiredStringParam(params, ["command"])),
			),
		project_info: () => pythonDispatch(editorTools.UEGetProjectInfo()),
		map_info: () => pythonDispatch(editorTools.UEGetMapInfo()),
		world_outliner: () => pythonDispatch(editorTools.UEGetWorldOutliner()),
		screenshot: () => pythonDispatch(editorTools.UETakeScreenshot()),
		move_camera: (params) =>
			pythonDispatch(
				editorTools.UEMoveCamera(
					toVector3Record(params.location) ?? { x: 0, y: 0, z: 0 },
					toRotatorRecord(params.rotation) ?? { pitch: 0, yaw: 0, roll: 0 },
				),
			),
	},
)

registerDomainTool(
	"manage_level",
	"Domain level namespace for map inspection, actor listing, world outliner inspection, and preset structure creation actions.",
	{
		info: () => pythonDispatch(editorTools.UEGetMapInfo()),
		world_outliner: () => pythonDispatch(editorTools.UEGetWorldOutliner()),
		list_actors: () => pythonDispatch(editorTools.UEActorTool("get_actors_in_level")),
		create_wall: (params) => pythonDispatch(worldBuildCommand("create_wall", params)),
		create_maze: (params) => pythonDispatch(worldBuildCommand("create_maze", params)),
		create_pyramid: (params) => pythonDispatch(worldBuildCommand("create_pyramid", params)),
		create_bridge: (params) => pythonDispatch(worldBuildCommand("create_bridge", params)),
		create_town: (params) => pythonDispatch(worldBuildCommand("create_town", params)),
	},
)

registerDomainTool(
	"system_control",
	"Domain system namespace for console commands, project state inspection, and asset validation actions.",
	{
		console_command: (params) =>
			pythonDispatch(
				editorTools.UEConsoleCommand(requiredStringParam(params, ["command"])),
			),
		project_info: () => pythonDispatch(editorTools.UEGetProjectInfo()),
		validate_assets: (params) =>
			pythonDispatch(editorTools.UEValidateAssets(optionalStringParam(params, ["asset_paths", "paths"]))),
	},
)

registerDomainTool(
	"inspect",
	"Domain inspection namespace for asset, actor, project, map, and Blueprint analysis actions.",
	{
		asset: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
		asset_references: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetReferences(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
		actor: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("get_actor_properties", {
					name: actorNameParam(params),
				}),
			),
		actor_materials: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("get_actor_material_info", {
					name: actorNameParam(params),
				}),
			),
		blueprint: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintAnalysisTool("read_blueprint_content", {
					blueprint_name: blueprintNameParam(params),
					include_nodes: Boolean(params.include_nodes),
				}),
			),
		blueprint_graph: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintAnalysisTool("analyze_blueprint_graph", {
					blueprint_name: blueprintNameParam(params),
					graph_name: optionalStringParam(params, ["graph_name"]),
					include_nodes: params.include_nodes ?? true,
				}),
			),
		project: () => pythonDispatch(editorTools.UEGetProjectInfo()),
		map: () => pythonDispatch(editorTools.UEGetMapInfo()),
	},
)

registerDomainTool(
	"manage_pipeline",
	"Domain pipeline namespace for asset validation, project inspection, and tool status reporting actions.",
	{
		validate_assets: (params) =>
			pythonDispatch(editorTools.UEValidateAssets(optionalStringParam(params, ["asset_paths", "paths"]))),
		project_info: () => pythonDispatch(editorTools.UEGetProjectInfo()),
		tool_status: () =>
			directDispatch({
				success: true,
				domain_tool_count: chiR24DomainRegistry.size,
				domain_tools: Array.from(chiR24DomainRegistry.keys()).sort(),
			}),
	},
)

registerDomainTool(
	"manage_tools",
	"Domain tool-management namespace for listing registered domain tools and describing supported actions.",
	{
		list_domains: () =>
			directDispatch({
				success: true,
				domains: Array.from(chiR24DomainRegistry.entries())
					.map(([tool, info]) => ({
						tool,
						description: info.description,
						supported_actions: info.supportedActions,
					}))
					.sort((left, right) => left.tool.localeCompare(right.tool)),
			}),
		describe_domain: (params) => {
			const toolName = requiredStringParam(params, ["tool_name", "name"])
			const info = chiR24DomainRegistry.get(toolName)
			return directDispatch(
				info
					? {
							success: true,
							tool: toolName,
							description: info.description,
							supported_actions: info.supportedActions,
						}
					: {
							success: false,
							message: `Unknown domain tool: ${toolName}`,
							available_tools: Array.from(chiR24DomainRegistry.keys()).sort(),
						},
			)
		},
	},
)

/// Domain Tools
registerDomainTool(
	"manage_lighting",
	"Domain lighting namespace for spawning common light actors, transforming them, and inspecting level lighting state.",
	{
		spawn_directional_light: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("spawn_actor", {
					type: "DirectionalLight",
					name: optionalStringParam(params, ["name", "actor_name"]) ?? "DirectionalLight",
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
				}),
			),
		spawn_point_light: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("spawn_actor", {
					type: "PointLight",
					name: optionalStringParam(params, ["name", "actor_name"]) ?? "PointLight",
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
				}),
			),
		spawn_spot_light: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("spawn_actor", {
					type: "SpotLight",
					name: optionalStringParam(params, ["name", "actor_name"]) ?? "SpotLight",
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
				}),
			),
		transform_light: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("set_actor_transform", {
					name: actorNameParam(params),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
				}),
			),
		inspect_lighting: () => pythonDispatch(editorTools.UEGetMapInfo()),
	},
)

registerDomainTool(
	"manage_level_structure",
	"Domain level-structure namespace for preset town, house, mansion, tower, wall, bridge, and fortress construction actions.",
	{
		world_outliner: () => pythonDispatch(editorTools.UEGetWorldOutliner()),
		create_town: (params) => pythonDispatch(worldBuildCommand("create_town", params)),
		construct_house: (params) => pythonDispatch(worldBuildCommand("construct_house", params)),
		construct_mansion: (params) =>
			pythonDispatch(worldBuildCommand("construct_mansion", params)),
		create_tower: (params) => pythonDispatch(worldBuildCommand("create_tower", params)),
		create_wall: (params) => pythonDispatch(worldBuildCommand("create_wall", params)),
		create_bridge: (params) => pythonDispatch(worldBuildCommand("create_bridge", params)),
		create_suspension_bridge: (params) =>
			pythonDispatch(worldBuildCommand("create_suspension_bridge", params)),
		create_aqueduct: (params) => pythonDispatch(worldBuildCommand("create_aqueduct", params)),
		create_castle_fortress: (params) =>
			pythonDispatch(worldBuildCommand("create_castle_fortress", params)),
	},
)

registerDomainTool(
	"manage_volumes",
	"Domain volume namespace for spawning common engine volumes and applying delete or transform actions.",
	{
		spawn_trigger_volume: (params) =>
			pythonDispatch(
				editorTools.UECreateObject(
					optionalStringParam(params, ["object_class", "class_name"]) ?? "TriggerVolume",
					optionalStringParam(params, ["name", "actor_name"]) ?? "TriggerVolume",
					toVector3Record(params.location),
					toRotatorRecord(params.rotation),
					toVector3Record(params.scale),
					params.properties,
				),
			),
		spawn_blocking_volume: (params) =>
			pythonDispatch(
				editorTools.UECreateObject(
					optionalStringParam(params, ["object_class", "class_name"]) ?? "BlockingVolume",
					optionalStringParam(params, ["name", "actor_name"]) ?? "BlockingVolume",
					toVector3Record(params.location),
					toRotatorRecord(params.rotation),
					toVector3Record(params.scale),
					params.properties,
				),
			),
		spawn_physics_volume: (params) =>
			pythonDispatch(
				editorTools.UECreateObject(
					optionalStringParam(params, ["object_class", "class_name"]) ?? "PhysicsVolume",
					optionalStringParam(params, ["name", "actor_name"]) ?? "PhysicsVolume",
					toVector3Record(params.location),
					toRotatorRecord(params.rotation),
					toVector3Record(params.scale),
					params.properties,
				),
			),
		spawn_audio_volume: (params) =>
			pythonDispatch(
				editorTools.UECreateObject(
					optionalStringParam(params, ["object_class", "class_name"]) ?? "AudioVolume",
					optionalStringParam(params, ["name", "actor_name"]) ?? "AudioVolume",
					toVector3Record(params.location),
					toRotatorRecord(params.rotation),
					toVector3Record(params.scale),
					params.properties,
				),
			),
		delete_volume: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("delete_actor", {
					name: actorNameParam(params),
				}),
			),
		transform_volume: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("set_actor_transform", {
					name: actorNameParam(params),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
				}),
			),
	},
)

registerDomainTool(
	"manage_navigation",
	"Domain navigation namespace for spawning navigation volumes and proxies plus basic map inspection actions.",
	{
		spawn_nav_mesh_bounds_volume: (params) =>
			pythonDispatch(
				editorTools.UECreateObject(
					optionalStringParam(params, ["object_class", "class_name"]) ?? "NavMeshBoundsVolume",
					optionalStringParam(params, ["name", "actor_name"]) ?? "NavMeshBoundsVolume",
					toVector3Record(params.location),
					toRotatorRecord(params.rotation),
					toVector3Record(params.scale),
					params.properties,
				),
			),
		spawn_nav_modifier_volume: (params) =>
			pythonDispatch(
				editorTools.UECreateObject(
					optionalStringParam(params, ["object_class", "class_name"]) ?? "NavModifierVolume",
					optionalStringParam(params, ["name", "actor_name"]) ?? "NavModifierVolume",
					toVector3Record(params.location),
					toRotatorRecord(params.rotation),
					toVector3Record(params.scale),
					params.properties,
				),
			),
		spawn_nav_link_proxy: (params) =>
			pythonDispatch(
				editorTools.UECreateObject(
					optionalStringParam(params, ["object_class", "class_name"]) ?? "NavLinkProxy",
					optionalStringParam(params, ["name", "actor_name"]) ?? "NavLinkProxy",
					toVector3Record(params.location),
					toRotatorRecord(params.rotation),
					toVector3Record(params.scale),
					params.properties,
				),
			),
		inspect_navigation: () => pythonDispatch(editorTools.UEGetMapInfo()),
	},
)

registerDomainTool(
	"build_environment",
	"Domain environment-building namespace for preset town, arch, staircase, pyramid, and maze generation actions.",
	{
		create_town: (params) => pythonDispatch(worldBuildCommand("create_town", params)),
		create_arch: (params) => pythonDispatch(worldBuildCommand("create_arch", params)),
		create_staircase: (params) => pythonDispatch(worldBuildCommand("create_staircase", params)),
		create_pyramid: (params) => pythonDispatch(worldBuildCommand("create_pyramid", params)),
		create_maze: (params) => pythonDispatch(worldBuildCommand("create_maze", params)),
	},
)

registerDomainTool(
	"manage_splines",
	"Domain spline namespace for spawning a spline-host actor or Blueprint and then transforming or deleting it.",
	{
		spawn_actor: (params) => {
			const blueprintName = optionalStringParam(params, ["blueprint_name", "asset_path"])
			if (blueprintName) {
				return pythonDispatch(
					editorTools.UEActorTool("spawn_blueprint_actor", {
						blueprint_name: blueprintName,
						name: optionalStringParam(params, ["name", "actor_name"]),
						location: toVector3Array(params.location),
						rotation: toRotatorArray(params.rotation),
						scale: toVector3Array(params.scale),
						properties: params.properties,
					}),
				)
			}

			return pythonDispatch(
				editorTools.UECreateObject(
					optionalStringParam(params, ["object_class", "class_name"]) ?? "/Script/Engine.Actor",
					optionalStringParam(params, ["name", "actor_name"]) ?? "SplineHostActor",
					toVector3Record(params.location),
					toRotatorRecord(params.rotation),
					toVector3Record(params.scale),
					params.properties,
				),
			)
		},
		transform_actor: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("set_actor_transform", {
					name: actorNameParam(params),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
				}),
			),
		delete_actor: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("delete_actor", {
					name: actorNameParam(params),
				}),
			),
	},
)

/// Domain Tools
registerDomainTool(
	"animation_physics",
	"Domain animation-and-physics namespace for physics Blueprint spawning, Blueprint physics settings, and Blueprint compilation actions.",
	{
		spawn_physics_blueprint_actor: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("spawn_physics_blueprint_actor", {
					blueprint_name: blueprintNameParam(params),
					name: optionalStringParam(params, ["name", "actor_name"]),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
					component_name: optionalStringParam(params, ["component_name"]),
					material_path: optionalStringParam(params, ["material_path"]),
					slot_index: params.slot_index,
					simulate_physics: params.simulate_physics,
					gravity_enabled: params.gravity_enabled,
					mass: params.mass,
					linear_damping: params.linear_damping,
					angular_damping: params.angular_damping,
				}),
			),
		set_physics_properties: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("set_physics_properties", {
					blueprint_name: blueprintNameParam(params),
					component_name: requiredStringParam(params, ["component_name"]),
					simulate_physics: params.simulate_physics,
					gravity_enabled: params.gravity_enabled,
					mass: params.mass,
					linear_damping: params.linear_damping,
					angular_damping: params.angular_damping,
				}),
			),
		compile_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("compile_blueprint", {
					blueprint_name: blueprintNameParam(params),
				}),
			),
	},
)

registerDomainTool(
	"manage_skeleton",
	"Domain skeleton namespace for searching Skeleton and SkeletalMesh assets and inspecting their metadata.",
	{
		search_skeletons: (params) => pythonDispatch(searchAssetsCommand(params, "Skeleton")),
		search_skeletal_meshes: (params) =>
			pythonDispatch(searchAssetsCommand(params, "SkeletalMesh")),
		asset_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerDomainTool(
	"manage_geometry",
	"Domain geometry namespace for wall, arch, staircase, and pyramid preset construction actions.",
	{
		create_wall: (params) => pythonDispatch(worldBuildCommand("create_wall", params)),
		create_arch: (params) => pythonDispatch(worldBuildCommand("create_arch", params)),
		create_staircase: (params) => pythonDispatch(worldBuildCommand("create_staircase", params)),
		create_pyramid: (params) => pythonDispatch(worldBuildCommand("create_pyramid", params)),
	},
)

/// Domain Tools
registerDomainTool(
	"manage_effect",
	"Domain effects namespace for spawning debug-shape actors, assigning materials, tinting them, and deleting them.",
	{
		spawn_debug_shape: (params) => {
			const shapeName = optionalStringParam(params, ["shape", "shape_type"]) ?? "cube"
			const actorLabel = `${shapeName}_${optionalStringParam(params, ["name", "actor_name"]) ?? "DebugShape"}`
			const properties = {
				...(typeof params.properties === "object" && params.properties ? params.properties : {}),
				...(optionalStringParam(params, ["material_path"]) ? { Material: optionalStringParam(params, ["material_path"]) } : {}),
			}

			return pythonDispatch(
				editorTools.UECreateObject(
					"StaticMeshActor",
					actorLabel,
					toVector3Record(params.location),
					toRotatorRecord(params.rotation),
					toVector3Record(params.scale),
					properties,
				),
			)
		},
		apply_material: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("apply_material_to_actor", {
					actor_name: actorNameParam(params),
					component_name: optionalStringParam(params, ["component_name"]),
					material_path: requiredStringParam(params, ["material_path"]),
					slot_index: params.slot_index,
				}),
			),
		tint_debug_shape: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("set_mesh_material_color", {
					actor_name: actorNameParam(params),
					component_name: optionalStringParam(params, ["component_name"]),
					material_path: optionalStringParam(params, ["material_path"]),
					slot_index: params.slot_index,
					color: toColorArray(params.color as any),
					parameter_name: optionalStringParam(params, ["parameter_name"]),
					instance_name: optionalStringParam(params, ["instance_name"]),
					instance_path: optionalStringParam(params, ["instance_path"]),
				}),
			),
		delete_debug_shape: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("delete_actor", {
					name: actorNameParam(params),
				}),
			),
	},
)

registerDomainTool(
	"manage_material_authoring",
	"Domain material namespace for listing materials, applying them to actors or Blueprints, and tinting them with material instances.",
	{
		list_materials: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("get_available_materials", {
					search_term: optionalStringParam(params, ["search_term", "query"]),
					include_engine: params.include_engine,
					limit: params.limit,
				}),
			),
		apply_to_actor: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("apply_material_to_actor", {
					actor_name: actorNameParam(params),
					component_name: optionalStringParam(params, ["component_name"]),
					material_path: requiredStringParam(params, ["material_path"]),
					slot_index: params.slot_index,
				}),
			),
		apply_to_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("apply_material_to_blueprint", {
					blueprint_name: blueprintNameParam(params),
					component_name: requiredStringParam(params, ["component_name"]),
					material_path: requiredStringParam(params, ["material_path"]),
					slot_index: params.slot_index,
				}),
			),
		tint_material: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("set_mesh_material_color", {
					actor_name: optionalStringParam(params, ["actor_name", "name"]),
					blueprint_name: optionalStringParam(params, ["blueprint_name", "asset_path"]),
					component_name: optionalStringParam(params, ["component_name"]),
					material_path: optionalStringParam(params, ["material_path"]),
					slot_index: params.slot_index,
					color: toColorArray(params.color as any),
					parameter_name: optionalStringParam(params, ["parameter_name"]),
					instance_name: optionalStringParam(params, ["instance_name"]),
					instance_path: optionalStringParam(params, ["instance_path"]),
				}),
			),
	},
)

registerDomainTool(
	"manage_texture",
	"Domain texture namespace for searching texture assets and reading their asset metadata.",
	{
		search_textures: (params) => pythonDispatch(searchAssetsCommand(params, "Texture")),
		texture_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerDomainTool(
	"manage_blueprint",
	"Domain Blueprint namespace for Blueprint creation, component editing, graph inspection, graph pin wiring, compilation, and Blueprint inspection actions.",
	{
		create_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("create_blueprint", {
					name: requiredStringParam(params, ["name", "blueprint_name"]),
					parent_class: optionalStringParam(params, ["parent_class"]),
					path: optionalStringParam(params, ["path"]),
				}),
			),
		add_component: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("add_component_to_blueprint", {
					blueprint_name: blueprintNameParam(params),
					component_type: requiredStringParam(params, ["component_type", "class_name"]),
					component_name: requiredStringParam(params, ["component_name", "name"]),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
					component_properties: params.component_properties,
					parent_component_name: optionalStringParam(params, ["parent_component_name"]),
				}),
			),
		set_static_mesh: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("set_static_mesh_properties", {
					blueprint_name: blueprintNameParam(params),
					component_name: requiredStringParam(params, ["component_name"]),
					static_mesh: requiredStringParam(params, ["static_mesh", "mesh_path"]),
				}),
			),
		set_component_property: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("set_component_property", {
					blueprint_name: blueprintNameParam(params),
					component_name: requiredStringParam(params, ["component_name"]),
					property_name: requiredStringParam(params, ["property_name"]),
					property_value: params.property_value,
				}),
			),
		set_physics_properties: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("set_physics_properties", {
					blueprint_name: blueprintNameParam(params),
					component_name: requiredStringParam(params, ["component_name"]),
					simulate_physics: params.simulate_physics,
					gravity_enabled: params.gravity_enabled,
					mass: params.mass,
					linear_damping: params.linear_damping,
					angular_damping: params.angular_damping,
				}),
			),
		set_blueprint_property: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("set_blueprint_property", {
					blueprint_name: blueprintNameParam(params),
					property_name: requiredStringParam(params, ["property_name"]),
					property_value: params.property_value,
				}),
			),
		compile: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("compile_blueprint", {
					blueprint_name: blueprintNameParam(params),
				}),
			),
		read: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintAnalysisTool("read_blueprint_content", {
					blueprint_name: blueprintNameParam(params),
					include_nodes: Boolean(params.include_nodes),
				}),
			),
		analyze_graph: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintAnalysisTool("analyze_blueprint_graph", {
					blueprint_name: blueprintNameParam(params),
					graph_name: optionalStringParam(params, ["graph_name"]),
					include_nodes: params.include_nodes ?? true,
				}),
			),
		get_variable_details: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintAnalysisTool("get_blueprint_variable_details", {
					blueprint_name: blueprintNameParam(params),
					variable_name: optionalStringParam(params, ["variable_name", "name"]),
				}),
			),
		get_function_details: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintAnalysisTool("get_blueprint_function_details", {
					blueprint_name: blueprintNameParam(params),
					function_name: optionalStringParam(params, ["function_name", "name"]),
				}),
			),
		find_nodes: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintGraphTool("find_blueprint_nodes", {
					blueprint_name: blueprintNameParam(params),
					search_term: optionalStringParam(params, ["search_term", "query"]),
					graph_name: optionalStringParam(params, ["graph_name"]),
					node_class: optionalStringParam(params, ["node_class", "class_name"]),
				}),
			),
		connect_nodes: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintGraphTool("connect_nodes", {
					blueprint_name: blueprintNameParam(params),
					source_node: requiredStringParam(params, ["source_node"]),
					source_pin: requiredStringParam(params, ["source_pin"]),
					target_node: requiredStringParam(params, ["target_node"]),
					target_pin: requiredStringParam(params, ["target_pin"]),
				}),
			),
		disconnect_nodes: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintGraphTool("disconnect_nodes", {
					blueprint_name: blueprintNameParam(params),
					source_node: requiredStringParam(params, ["source_node"]),
					source_pin: requiredStringParam(params, ["source_pin"]),
					target_node: optionalStringParam(params, ["target_node"]),
					target_pin: optionalStringParam(params, ["target_pin"]),
				}),
			),
	},
)

registerDomainTool(
	"manage_sequence",
	"Domain sequence namespace for searching LevelSequence assets and inspecting their asset metadata.",
	{
		search_sequences: (params) => pythonDispatch(searchAssetsCommand(params, "LevelSequence")),
		sequence_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerDomainTool(
	"manage_performance",
	"Domain performance namespace for editor console commands and screenshot capture actions.",
	{
		console_command: (params) =>
			pythonDispatch(
				editorTools.UEConsoleCommand(requiredStringParam(params, ["command"])),
			),
		screenshot: () => pythonDispatch(editorTools.UETakeScreenshot()),
	},
)

/// Domain Tools
registerDomainTool(
	"manage_audio",
	"Domain audio namespace for searching audio assets and inspecting their asset metadata.",
	{
		search_audio_assets: (params) => pythonDispatch(searchAssetsCommand(params, "SoundCue")),
		audio_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerDomainTool(
	"manage_input",
	"Domain input namespace for creating classic UE4 input mappings and inspecting project input settings.",
	{
		create_input_mapping: (params) =>
			pythonDispatch(
				editorTools.UEProjectTool("create_input_mapping", {
					mapping_name: requiredStringParam(params, ["mapping_name", "action_name", "name"]),
					key: requiredStringParam(params, ["key"]),
					input_type: optionalStringParam(params, ["input_type"]) ?? "Action",
					scale: params.scale,
				}),
			),
		project_info: () => pythonDispatch(editorTools.UEGetProjectInfo()),
	},
)

/// Domain Tools
registerDomainTool(
	"manage_behavior_tree",
	"Domain behavior-tree namespace for searching BehaviorTree assets and inspecting their asset metadata.",
	{
		search_behavior_trees: (params) =>
			pythonDispatch(searchAssetsCommand(params, "BehaviorTree")),
		behavior_tree_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerDomainTool(
	"manage_ai",
	"Domain AI namespace for searching AI-related assets through the existing asset registry and project inspection actions.",
	{
		search_ai_assets: (params) => pythonDispatch(searchAssetsCommand(params, "BehaviorTree")),
		project_info: () => pythonDispatch(editorTools.UEGetProjectInfo()),
	},
)

registerDomainTool(
	"manage_gas",
	"Domain GAS namespace for searching gameplay-ability-related assets and inspecting their asset metadata.",
	{
		search_gas_assets: (params) => pythonDispatch(searchAssetsCommand(params)),
		asset_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerDomainTool(
	"manage_character",
	"Domain character namespace for creating Blueprint characters, spawning Blueprint actors, and inspecting project character data.",
	{
		create_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("create_blueprint", {
					name: requiredStringParam(params, ["name", "blueprint_name"]),
					parent_class: optionalStringParam(params, ["parent_class"]) ?? "Character",
					path: optionalStringParam(params, ["path"]),
				}),
			),
		spawn_blueprint_actor: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("spawn_blueprint_actor", {
					blueprint_name: blueprintNameParam(params),
					name: optionalStringParam(params, ["name", "actor_name"]),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
					properties: params.properties,
				}),
			),
		project_info: () => pythonDispatch(editorTools.UEGetProjectInfo()),
	},
)

registerDomainTool(
	"manage_combat",
	"Domain combat namespace for combat Blueprint scaffolding, Blueprint actor spawning, and actor property edits.",
	{
		create_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("create_blueprint", {
					name: requiredStringParam(params, ["name", "blueprint_name"]),
					parent_class: optionalStringParam(params, ["parent_class"]) ?? "Actor",
					path: optionalStringParam(params, ["path"]),
				}),
			),
		spawn_blueprint_actor: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("spawn_blueprint_actor", {
					blueprint_name: blueprintNameParam(params),
					name: optionalStringParam(params, ["name", "actor_name"]),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
					properties: params.properties,
				}),
			),
		set_actor_property: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("set_actor_property", {
					name: actorNameParam(params),
					property_name: requiredStringParam(params, ["property_name"]),
					property_value: params.property_value,
				}),
			),
	},
)

registerDomainTool(
	"manage_inventory",
	"Domain inventory namespace for Blueprint scaffolding, Blueprint default-property edits, and Blueprint compilation actions.",
	{
		create_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("create_blueprint", {
					name: requiredStringParam(params, ["name", "blueprint_name"]),
					parent_class: optionalStringParam(params, ["parent_class"]) ?? "Actor",
					path: optionalStringParam(params, ["path"]),
				}),
			),
		set_blueprint_property: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("set_blueprint_property", {
					blueprint_name: blueprintNameParam(params),
					property_name: requiredStringParam(params, ["property_name"]),
					property_value: params.property_value,
				}),
			),
		compile_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("compile_blueprint", {
					blueprint_name: blueprintNameParam(params),
				}),
			),
	},
)

registerDomainTool(
	"manage_interaction",
	"Domain interaction namespace for Blueprint scaffolding, component wiring, and Blueprint actor spawning actions.",
	{
		create_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("create_blueprint", {
					name: requiredStringParam(params, ["name", "blueprint_name"]),
					parent_class: optionalStringParam(params, ["parent_class"]) ?? "Actor",
					path: optionalStringParam(params, ["path"]),
				}),
			),
		add_component_to_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("add_component_to_blueprint", {
					blueprint_name: blueprintNameParam(params),
					component_type: requiredStringParam(params, ["component_type", "class_name"]),
					component_name: requiredStringParam(params, ["component_name", "name"]),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
					component_properties: params.component_properties,
					parent_component_name: optionalStringParam(params, ["parent_component_name"]),
				}),
			),
		spawn_blueprint_actor: (params) =>
			pythonDispatch(
				editorTools.UEActorTool("spawn_blueprint_actor", {
					blueprint_name: blueprintNameParam(params),
					name: optionalStringParam(params, ["name", "actor_name"]),
					location: toVector3Array(params.location),
					rotation: toRotatorArray(params.rotation),
					scale: toVector3Array(params.scale),
					properties: params.properties,
				}),
			),
	},
)

registerDomainTool(
	"manage_widget_authoring",
	"Domain widget namespace for UMG Blueprint creation, widget-tree edits, and viewport spawning actions.",
	{
		create_widget_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEUMGTool("create_umg_widget_blueprint", {
					widget_name: requiredStringParam(params, ["widget_name", "name"]),
					parent_class: optionalStringParam(params, ["parent_class"]),
					path: optionalStringParam(params, ["path"]),
				}),
			),
		add_text_block: (params) =>
			pythonDispatch(
				editorTools.UEUMGTool("add_text_block_to_widget", {
					widget_name: widgetBlueprintParam(params),
					text_block_name: requiredStringParam(params, ["text_block_name", "name"]),
					text: optionalStringParam(params, ["text"]),
					position: toVector2Array(params.position as any),
					size: toVector2Array(params.size as any),
					font_size: params.font_size,
					color: toColorArray(params.color as any),
				}),
			),
		add_button: (params) =>
			pythonDispatch(
				editorTools.UEUMGTool("add_button_to_widget", {
					widget_name: widgetBlueprintParam(params),
					button_name: requiredStringParam(params, ["button_name", "name"]),
					text: optionalStringParam(params, ["text"]),
					position: toVector2Array(params.position as any),
					size: toVector2Array(params.size as any),
					font_size: params.font_size,
					color: toColorArray(params.color as any),
					background_color: toColorArray(params.background_color as any),
				}),
			),
		add_to_viewport: (params) =>
			pythonDispatch(
				editorTools.UEUMGTool("add_widget_to_viewport", {
					widget_name: widgetBlueprintParam(params),
					z_order: params.z_order,
				}),
			),
		add_widget: (params) =>
			pythonDispatch(
				editorTools.UEUMGAddWidget(
					requiredStringParam(params, ["widget_blueprint_path", "widget_blueprint"]),
					requiredStringParam(params, ["widget_class"]),
					requiredStringParam(params, ["widget_name", "name"]),
					optionalStringParam(params, ["parent_widget_name"]),
					toVector2Record(params.position),
					typeof params.z_order === "number" ? params.z_order : undefined,
				),
			),
		remove_widget: (params) =>
			pythonDispatch(
				editorTools.UEUMGRemoveWidget(
					requiredStringParam(params, ["widget_blueprint_path", "widget_blueprint"]),
					requiredStringParam(params, ["widget_name", "name"]),
				),
			),
		position_widget: (params) =>
			pythonDispatch(
				editorTools.UEUMGSetWidgetPosition(
					requiredStringParam(params, ["widget_blueprint_path", "widget_blueprint"]),
					requiredStringParam(params, ["widget_name", "name"]),
					toVector2Record(params.position) ?? { x: 0, y: 0 },
					typeof params.z_order === "number" ? params.z_order : undefined,
				),
			),
		reparent_widget: (params) =>
			pythonDispatch(
				editorTools.UEUMGReparentWidget(
					requiredStringParam(params, ["widget_blueprint_path", "widget_blueprint"]),
					requiredStringParam(params, ["widget_name", "name"]),
					requiredStringParam(params, ["new_parent_widget_name"]),
					toVector2Record(params.position),
					typeof params.z_order === "number" ? params.z_order : undefined,
				),
			),
		add_child_widget: (params) =>
			pythonDispatch(
				editorTools.UEUMGAddChildWidget(
					requiredStringParam(params, ["widget_blueprint_path", "widget_blueprint"]),
					requiredStringParam(params, ["parent_widget_name"]),
					requiredStringParam(params, ["child_widget_class"]),
					requiredStringParam(params, ["child_widget_name", "name"]),
					toVector2Record(params.position),
					typeof params.z_order === "number" ? params.z_order : undefined,
				),
			),
		remove_child_widget: (params) =>
			pythonDispatch(
				editorTools.UEUMGRemoveChildWidget(
					requiredStringParam(params, ["widget_blueprint_path", "widget_blueprint"]),
					requiredStringParam(params, ["parent_widget_name"]),
					requiredStringParam(params, ["child_widget_name", "name"]),
				),
			),
		position_child_widget: (params) =>
			pythonDispatch(
				editorTools.UEUMGSetChildWidgetPosition(
					requiredStringParam(params, ["widget_blueprint_path", "widget_blueprint"]),
					requiredStringParam(params, ["parent_widget_name"]),
					requiredStringParam(params, ["child_widget_name", "name"]),
					toVector2Record(params.position) ?? { x: 0, y: 0 },
					typeof params.z_order === "number" ? params.z_order : undefined,
				),
			),
	},
)

registerDomainTool(
	"manage_source_control",
	"Domain source-control namespace for provider inspection and file or package source-control operations.",
	{
		provider_info: () =>
			pythonDispatch(editorTools.UESourceControlTool("get_source_control_provider")),
		query_state: (params) =>
			pythonDispatch(
				editorTools.UESourceControlTool("query_source_control_state", {
					file: sourceControlFileParam(params),
				}),
			),
		query_states: (params) =>
			pythonDispatch(
				editorTools.UESourceControlTool("query_source_control_states", {
					files: sourceControlFileListParam(params),
				}),
			),
		checkout: (params) =>
			pythonDispatch(
				sourceControlFilesCommand(
					sourceControlFileListParam(params),
					"check_out_file",
					"check_out_files",
				),
			),
		checkout_or_add: (params) =>
			pythonDispatch(
				sourceControlFilesCommand(
					sourceControlFileListParam(params),
					"check_out_or_add_file",
					"check_out_or_add_files",
				),
			),
		add: (params) =>
			pythonDispatch(
				sourceControlFilesCommand(
					sourceControlFileListParam(params),
					"mark_file_for_add",
					"mark_files_for_add",
				),
			),
		delete: (params) =>
			pythonDispatch(
				sourceControlFilesCommand(
					sourceControlFileListParam(params),
					"mark_file_for_delete",
					"mark_files_for_delete",
				),
			),
		revert: (params) =>
			pythonDispatch(
				sourceControlFilesCommand(
					sourceControlFileListParam(params),
					"revert_file",
					"revert_files",
				),
			),
		revert_unchanged: (params) =>
			pythonDispatch(
				editorTools.UESourceControlTool("revert_unchanged_files", {
					files: sourceControlFileListParam(params),
				}),
			),
		sync: (params) =>
			pythonDispatch(
				sourceControlFilesCommand(
					sourceControlFileListParam(params),
					"sync_file",
					"sync_files",
				),
			),
		submit: (params) =>
			pythonDispatch(
				editorTools.UESourceControlTool("check_in_files", {
					files: sourceControlFileListParam(params),
					description: requiredStringParam(params, ["description", "message"]),
					keep_checked_out: Boolean(params.keep_checked_out),
				}),
			),
		revert_and_reload_packages: (params) =>
			pythonDispatch(
				editorTools.UESourceControlTool("revert_and_reload_packages", {
					packages: sourceControlPackageListParam(params),
					revert_all: Boolean(params.revert_all),
					reload_world: Boolean(params.reload_world),
				}),
			),
	},
)

/// Domain Tools
registerDomainTool(
	"manage_networking",
	"Domain networking namespace for project inspection and console-command driven networking diagnostics.",
	{
		project_info: () => pythonDispatch(editorTools.UEGetProjectInfo()),
		console_command: (params) =>
			pythonDispatch(
				editorTools.UEConsoleCommand(requiredStringParam(params, ["command"])),
			),
	},
)

registerDomainTool(
	"manage_game_framework",
	"Domain game-framework namespace for project inspection and gameplay Blueprint scaffolding actions.",
	{
		project_info: () => pythonDispatch(editorTools.UEGetProjectInfo()),
		create_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintTool("create_blueprint", {
					name: requiredStringParam(params, ["name", "blueprint_name"]),
					parent_class: optionalStringParam(params, ["parent_class"]) ?? "Actor",
					path: optionalStringParam(params, ["path"]),
				}),
			),
	},
)

registerDomainTool(
	"manage_sessions",
	"Domain sessions namespace for project inspection and console-command driven local session diagnostics.",
	{
		project_info: () => pythonDispatch(editorTools.UEGetProjectInfo()),
		console_command: (params) =>
			pythonDispatch(
				editorTools.UEConsoleCommand(requiredStringParam(params, ["command"])),
			),
	},
)

server.resource("docs", "docs://unreal_python", async () => {
	return {
		contents: [
			{
				uri: "https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/?application_version=4.27",
				text: "Unreal Engine 4.27 Python API Documentation",
			},
		],
	}
})
