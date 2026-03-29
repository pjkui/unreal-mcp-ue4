import { z } from "zod"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { RemoteExecution, RemoteExecutionConfig } from "unreal-remote-execution"
import * as editorTools from "./editor/tools.js"

export const server = new McpServer({
	name: "UnrealMCP-UE4",
	description: "Unreal Engine MCP for UE4.27.2 with UE4/UE5 editor scripting compatibility helpers",
	version: "0.1.4-ue4.27.2",
})
const rawServerTool = server.tool.bind(server) as (...args: any[]) => unknown

const config = new RemoteExecutionConfig(1, ["239.0.0.1", 6766], "0.0.0.0")
const remoteExecution = new RemoteExecution(config)

// Start the remote execution server
remoteExecution.start()

let remoteNode: RemoteExecution | undefined = undefined
let remoteConnectionPromise: Promise<void> | undefined = undefined

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
	content: [{ type: "text" as const, text }],
})

const discoverPath = async (command: string, errorMessage: string) => {
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

const registerPythonTool = (
	name: string,
	description: string,
	schema: Record<string, z.ZodTypeAny>,
	buildCommand: (args: any) => string,
) => {
	rawServerTool(name, description, schema, async (args: any) =>
		textResponse(await tryRunCommand(buildCommand(args))),
	)
}

const registerZeroArgPythonTool = (
	name: string,
	description: string,
	buildCommand: () => string,
) => {
	rawServerTool(name, description, async () => textResponse(await tryRunCommand(buildCommand())))
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

type NamespaceDispatchResult =
	| { kind: "python"; command: string }
	| { kind: "direct"; payload: unknown }

type NamespaceActionHandler = (
	params: Record<string, any>,
) => NamespaceDispatchResult | Promise<NamespaceDispatchResult>

const toolNamespaceRegistry = new Map<string, { description: string; supportedActions: string[] }>()

const pythonDispatch = (command: string): NamespaceDispatchResult => ({ kind: "python", command })

const directDispatch = (payload: unknown): NamespaceDispatchResult => ({ kind: "direct", payload })

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

const unsupportedNamespaceAction = (
	toolName: string,
	action: string,
	supportedActions: string[],
): NamespaceDispatchResult =>
	directDispatch({
		success: false,
		message: `Action '${action}' is not supported by ${toolName} in this UE4.27 port.`,
		supported_actions: supportedActions,
	})

const runNamespaceDispatch = async (result: NamespaceDispatchResult) => {
	if (result.kind === "python") {
		return textResponse(await tryRunCommand(result.command))
	}

	return textResponse(JSON.stringify(result.payload, null, 2))
}

const registerToolNamespace = (
	name: string,
	description: string,
	actions: Record<string, NamespaceActionHandler>,
) => {
	const supportedActions = Object.keys(actions).sort()
	toolNamespaceRegistry.set(name, { description, supportedActions })

	rawServerTool(
		name,
		description,
		{
			action: z.string().describe(`Action to execute inside tool namespace ${name}`),
			params: recordSchema.optional().describe("Optional action parameter object"),
		},
		async ({ action, params }: { action: string; params?: Record<string, any> }) => {
			const normalizedAction = normalizeActionName(action)

			try {
				const handler = actions[normalizedAction]
				const result = handler
					? await handler(params ?? {})
					: unsupportedNamespaceAction(name, normalizedAction, supportedActions)

				return await runNamespaceDispatch(result)
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

/// Editor Session Info
rawServerTool(
	"get_unreal_engine_path",
	"Get the active Unreal Engine root path from the connected editor session",
	async () => {
		const enginePath = await discoverPath(
			[
				"import os",
				"import unreal",
				'engine_dir = unreal.Paths.engine_dir() or ""',
				"full_engine_dir = unreal.Paths.convert_relative_path_to_full(engine_dir) if engine_dir else ''",
				"normalized = os.path.normpath(full_engine_dir) if full_engine_dir else ''",
				"if normalized and os.path.basename(normalized).lower() == 'engine':",
				"    print(os.path.dirname(normalized))",
				"else:",
				"    print(normalized)",
			].join("\n"),
			"Unable to resolve the active Unreal Engine path",
		)

		return textResponse(`Unreal Engine path: ${enginePath}`)
	},
)

rawServerTool(
	"get_unreal_project_path",
	"Get the active Unreal project file path from the connected editor session",
	async () => {
		const projectPath = await discoverPath(
			[
				"import os",
				"import unreal",
				'project_file = unreal.Paths.get_project_file_path() or ""',
				"full_project_file = unreal.Paths.convert_relative_path_to_full(project_file) if project_file else ''",
				"print(os.path.normpath(full_project_file) if full_project_file else '')",
			].join("\n"),
			"Unable to resolve the active Unreal project path",
		)

		return textResponse(`Unreal Project path: ${projectPath}`)
	},
)

rawServerTool(
	"get_unreal_version",
	"Get the active Unreal Engine version string from the connected editor session",
	async () => {
		const engineVersion = await discoverPath(
			[
				"import unreal",
				"print(unreal.SystemLibrary.get_engine_version() or '')",
			].join("\n"),
			"Unable to resolve the active Unreal Engine version",
		)

		return textResponse(`Unreal version: ${engineVersion}`)
	},
)

/// Core Direct Tools
registerPythonTool(
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
	({ object_class, object_name, location, rotation, scale, properties }) =>
		editorTools.UECreateObject(object_class, object_name, location, rotation, scale, properties),
)

registerPythonTool(
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
	({ actor_name, location, rotation, scale, properties, new_name }) =>
		editorTools.UEUpdateObject(actor_name, location, rotation, scale, properties, new_name),
)

registerPythonTool(
	"editor_delete_object",
	"Delete an object/actor from the world\n\nExample output: {'success': true, 'message': 'Successfully deleted actor: MyCube', 'deleted_actor': {'actor_name': 'StaticMeshActor_1', 'actor_label': 'MyCube', 'class': 'StaticMeshActor', 'location': {'x': 100.0, 'y': 200.0, 'z': 0.0}}}\n\nReturns deletion confirmation with details of the deleted actor.",
	{
		actor_names: z.string(),
	},
	({ actor_names }) => editorTools.UEDeleteObject(actor_names),
)

/// Tool Namespaces
registerToolNamespace(
	"manage_asset",
	"Asset tool namespace for list, search, info, references, export, and validation actions.",
	{
		list: (params) =>
			pythonDispatch(
				editorTools.UEListAssets(
					optionalStringParam(params, ["root_path", "path"]) ?? "/Game",
					typeof params.recursive === "boolean" ? params.recursive : true,
					typeof params.limit === "number" ? params.limit : undefined,
				),
			),
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
				editorTools.UEExportAsset(
					requiredStringParam(params, ["asset_path", "path", "name"]),
					optionalStringParam(params, ["destination_path", "file_path", "output_path"]),
					typeof params.overwrite === "boolean" ? params.overwrite : true,
				),
			),
		validate: (params) =>
			pythonDispatch(editorTools.UEValidateAssets(optionalStringParam(params, ["asset_paths", "paths"]))),
	},
)

registerToolNamespace(
	"manage_actor",
	"Actor tool namespace for listing, searching, spawning, deleting, transforming, and inspecting level actors.",
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

registerToolNamespace(
	"manage_editor",
	"Editor tool namespace for Python execution, console commands, project inspection, map inspection, PIE control, screenshots, and camera control.",
	{
		run_python: (params) => pythonDispatch(requiredStringParam(params, ["code"])),
		console_command: (params) =>
			pythonDispatch(
				editorTools.UEConsoleCommand(requiredStringParam(params, ["command"])),
			),
		project_info: () => pythonDispatch(editorTools.UEGetProjectInfo()),
		map_info: () => pythonDispatch(editorTools.UEGetMapInfo()),
		world_outliner: () => pythonDispatch(editorTools.UEGetWorldOutliner()),
		is_pie_running: (params) =>
			pythonDispatch(
				editorTools.UEPIETool("get_pie_status", {
					timeout_seconds: params.timeout_seconds,
					poll_interval: params.poll_interval,
				}),
			),
		start_pie: (params) =>
			pythonDispatch(
				editorTools.UEPIETool("start_pie", {
					timeout_seconds: params.timeout_seconds,
					poll_interval: params.poll_interval,
				}),
			),
		stop_pie: (params) =>
			pythonDispatch(
				editorTools.UEPIETool("stop_pie", {
					timeout_seconds: params.timeout_seconds,
					poll_interval: params.poll_interval,
				}),
			),
		get_console_variable: (params) =>
			pythonDispatch(
				editorTools.UEGetConsoleVariable(
					requiredStringParam(params, ["variable_name", "name", "console_variable"]),
				),
			),
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

registerToolNamespace(
	"manage_level",
	"Level tool namespace for map inspection, actor listing, world outliner inspection, and preset structure creation actions.",
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

registerToolNamespace(
	"manage_system",
	"System tool namespace for console commands and asset validation actions.",
	{
		console_command: (params) =>
			pythonDispatch(
				editorTools.UEConsoleCommand(requiredStringParam(params, ["command"])),
			),
		get_console_variable: (params) =>
			pythonDispatch(
				editorTools.UEGetConsoleVariable(
					requiredStringParam(params, ["variable_name", "name", "console_variable"]),
				),
			),
		validate_assets: (params) =>
			pythonDispatch(editorTools.UEValidateAssets(optionalStringParam(params, ["asset_paths", "paths"]))),
	},
)

registerToolNamespace(
	"manage_inspection",
	"Inspection tool namespace for asset, actor, map, and Blueprint analysis actions.",
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
		map: () => pythonDispatch(editorTools.UEGetMapInfo()),
	},
)

registerToolNamespace(
	"manage_tools",
	"Tool-namespace registry for listing registered tool namespaces and describing supported actions. Use this as the discovery entry point for the namespace-first MCP surface.",
	{
		list_namespaces: () =>
			directDispatch({
				success: true,
				namespaces: Array.from(toolNamespaceRegistry.entries())
					.map(([toolNamespace, info]) => ({
						tool_namespace: toolNamespace,
						description: info.description,
						supported_actions: info.supportedActions,
					}))
					.sort((left, right) => left.tool_namespace.localeCompare(right.tool_namespace)),
			}),
		tool_status: () =>
			directDispatch({
				success: true,
				tool_namespace_count: toolNamespaceRegistry.size,
				tool_namespaces: Array.from(toolNamespaceRegistry.keys()).sort(),
			}),
		describe_namespace: (params) => {
			const toolName = requiredStringParam(params, ["tool_name", "namespace_name", "name"])
			const info = toolNamespaceRegistry.get(toolName)
			return directDispatch(
				info
					? {
							success: true,
							tool_namespace: toolName,
							description: info.description,
							supported_actions: info.supportedActions,
						}
					: {
							success: false,
							message: `Unknown tool namespace: ${toolName}`,
							available_tool_namespaces: Array.from(toolNamespaceRegistry.keys()).sort(),
						},
			)
		},
	},
)

/// Tool Namespaces
registerToolNamespace(
	"manage_lighting",
	"Lighting tool namespace for spawning common light actors, transforming them, and inspecting level lighting state.",
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

registerToolNamespace(
	"manage_level_structure",
	"Level-structure tool namespace for preset town, house, mansion, tower, wall, bridge, and fortress construction actions.",
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

registerToolNamespace(
	"manage_volumes",
	"Volume tool namespace for spawning common engine volumes and applying delete or transform actions.",
	{
		spawn_trigger_volume: (params) =>
			pythonDispatch(
				editorTools.UECreateObject(
					optionalStringParam(params, ["object_class", "class_name"]) ?? "/Script/Engine.TriggerVolume",
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
					optionalStringParam(params, ["object_class", "class_name"]) ?? "/Script/Engine.BlockingVolume",
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
					optionalStringParam(params, ["object_class", "class_name"]) ?? "/Script/Engine.PhysicsVolume",
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
					optionalStringParam(params, ["object_class", "class_name"]) ?? "/Script/Engine.AudioVolume",
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

registerToolNamespace(
	"manage_navigation",
	"Navigation tool namespace for spawning navigation volumes and proxies plus basic map inspection actions.",
	{
		spawn_nav_mesh_bounds_volume: (params) =>
			pythonDispatch(
				editorTools.UECreateObject(
					optionalStringParam(params, ["object_class", "class_name"]) ?? "/Script/NavigationSystem.NavMeshBoundsVolume",
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
					optionalStringParam(params, ["object_class", "class_name"]) ?? "/Script/NavigationSystem.NavModifierVolume",
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
					optionalStringParam(params, ["object_class", "class_name"]) ?? "/Script/AIModule.NavLinkProxy",
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

registerToolNamespace(
	"manage_environment",
	"Environment-building tool namespace for preset town, arch, staircase, pyramid, and maze generation actions.",
	{
		create_town: (params) => pythonDispatch(worldBuildCommand("create_town", params)),
		create_arch: (params) => pythonDispatch(worldBuildCommand("create_arch", params)),
		create_staircase: (params) => pythonDispatch(worldBuildCommand("create_staircase", params)),
		create_pyramid: (params) => pythonDispatch(worldBuildCommand("create_pyramid", params)),
		create_maze: (params) => pythonDispatch(worldBuildCommand("create_maze", params)),
	},
)

registerToolNamespace(
	"manage_splines",
	"Spline tool namespace for spawning a spline-host actor or Blueprint and then transforming or deleting it.",
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

/// Tool Namespaces
registerToolNamespace(
	"manage_animation_physics",
	"Animation-and-physics tool namespace for physics Blueprint spawning, Blueprint physics settings, and Blueprint compilation actions.",
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

registerToolNamespace(
	"manage_skeleton",
	"Skeleton tool namespace for searching Skeleton and SkeletalMesh assets and inspecting their metadata.",
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

registerToolNamespace(
	"manage_geometry",
	"Geometry tool namespace for wall, arch, staircase, and pyramid preset construction actions.",
	{
		create_wall: (params) => pythonDispatch(worldBuildCommand("create_wall", params)),
		create_arch: (params) => pythonDispatch(worldBuildCommand("create_arch", params)),
		create_staircase: (params) => pythonDispatch(worldBuildCommand("create_staircase", params)),
		create_pyramid: (params) => pythonDispatch(worldBuildCommand("create_pyramid", params)),
	},
)

/// Tool Namespaces
registerToolNamespace(
	"manage_effect",
	"Effects tool namespace for spawning debug-shape actors, assigning materials, tinting them, and deleting them.",
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

registerToolNamespace(
	"manage_material_authoring",
	"Material tool namespace for listing materials, applying them to actors or Blueprints, and tinting them with material instances.",
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

registerToolNamespace(
	"manage_texture",
	"Texture tool namespace for searching texture assets, importing image files as textures, and reading their asset metadata.",
	{
		search_textures: (params) => pythonDispatch(searchAssetsCommand(params, "Texture")),
		texture_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
		import_texture: (params) =>
			pythonDispatch(
				editorTools.UETextureTool("import_texture", {
					source_file: requiredStringParam(params, ["source_file", "file_path", "local_path"]),
					destination_path: optionalStringParam(params, ["destination_path", "content_path", "path"]),
					asset_name: optionalStringParam(params, ["asset_name", "name"]),
					replace_existing:
						typeof params.replace_existing === "boolean" ? params.replace_existing : true,
					save: typeof params.save === "boolean" ? params.save : true,
				}),
			),
	},
)

registerToolNamespace(
	"manage_data",
	"Data tool namespace for searching data assets, creating common data containers, and inspecting their asset metadata.",
	{
		search_data_assets: (params) =>
			pythonDispatch(
				editorTools.UEDataTool("search_data_assets", {
					search_term: optionalStringParam(params, ["search_term", "query", "pattern", "name"]) ?? "",
					include_engine: Boolean(params.include_engine),
					limit: params.limit,
				}),
			),
		asset_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
		create_data_asset: (params) =>
			pythonDispatch(
				editorTools.UEDataTool("create_data_asset", {
					name: requiredStringParam(params, ["name", "asset_name"]),
					path: optionalStringParam(params, ["path"]),
					data_asset_class: optionalStringParam(params, ["data_asset_class", "class_name"]),
				}),
			),
		create_data_table: (params) =>
			pythonDispatch(
				editorTools.UEDataTool("create_data_table", {
					name: requiredStringParam(params, ["name", "asset_name"]),
					path: optionalStringParam(params, ["path"]),
					row_struct: requiredStringParam(params, ["row_struct", "struct"]),
				}),
			),
		create_string_table: (params) =>
			pythonDispatch(
				editorTools.UEDataTool("create_string_table", {
					name: requiredStringParam(params, ["name", "asset_name"]),
					path: optionalStringParam(params, ["path"]),
				}),
			),
	},
)

registerToolNamespace(
	"manage_blueprint",
	"Blueprint tool namespace for Blueprint creation, component editing, graph inspection, graph pin wiring, compilation, and Blueprint inspection actions.",
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

registerToolNamespace(
	"manage_sequence",
	"Sequence tool namespace for searching LevelSequence assets and inspecting their asset metadata.",
	{
		search_sequences: (params) => pythonDispatch(searchAssetsCommand(params, "LevelSequence")),
		sequence_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

/// Tool Namespaces
registerToolNamespace(
	"manage_audio",
	"Audio tool namespace for searching audio assets and inspecting their asset metadata.",
	{
		search_audio_assets: (params) => pythonDispatch(searchAssetsCommand(params, "SoundCue")),
		audio_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerToolNamespace(
	"manage_input",
	"Input tool namespace for creating classic UE4 input mappings.",
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
	},
)

/// Tool Namespaces
registerToolNamespace(
	"manage_behavior_tree",
	"Behavior-tree tool namespace for searching BehaviorTree assets and inspecting their asset metadata.",
	{
		search_behavior_trees: (params) =>
			pythonDispatch(searchAssetsCommand(params, "BehaviorTree")),
		search_ai_assets: (params) =>
			pythonDispatch(searchAssetsCommand(params, "BehaviorTree")),
		behavior_tree_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerToolNamespace(
	"manage_gas",
	"GAS tool namespace for searching gameplay-ability-related assets and inspecting their asset metadata.",
	{
		search_gas_assets: (params) => pythonDispatch(searchAssetsCommand(params)),
		asset_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerToolNamespace(
	"manage_widget_authoring",
	"Widget tool namespace for UMG Blueprint creation, widget-tree edits, and viewport spawning actions. Use add_child_widget for typical nested layout work under an existing root such as CanvasPanel_0; add_widget without parent_widget_name is only for assigning a new root widget.",
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

registerToolNamespace(
	"manage_source_control",
	"Source-control tool namespace for provider inspection and file or package source-control operations.",
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
