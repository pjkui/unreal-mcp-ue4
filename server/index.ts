import fs from "node:fs"
import path from "node:path"
import process from "node:process"
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
let enginePath: string | undefined = undefined
let projectPath: string | undefined = undefined

const connectWithRetry = async (maxRetries: number = 3, retryDelay: number = 2000) => {
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
			console.log(`Connection attempt ${attempt} failed:`, error)

			if (attempt < maxRetries) {
				console.log(`Retrying in ${retryDelay}ms...`)
				await new Promise((resolve) => setTimeout(resolve, retryDelay))
				// Exponential backoff
				retryDelay = Math.min(retryDelay * 1.5, 10000)
			} else {
				console.log("Unable to connect to your Unreal Engine Editor after multiple attempts")
				remoteExecution.stop()
				process.exit(1)
			}
		}
	}
}

connectWithRetry()

const tryRunCommand = async (command: string): Promise<string> => {
	if (!remoteNode) {
		throw new Error("Remote node is not available")
	}

	const result = await remoteNode.runCommand(command)
	if (!result.success) {
		throw new Error(`Command failed with: ${result.result}`)
	}

	return result.output.map((line) => line.output).join("\n")
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

/// Editor & Asset Tools
server.tool(
	"editor_run_python",
	"Execute any python within the Unreal Editor. All python must have `import unreal` at the top. CHECK THE UNREAL PYTHON DOCUMENTATION BEFORE USING THIS TOOL. NEVER EVER ADD COMMENTS",
	{ code: z.string() },
	async ({ code }) => {
		const result = await tryRunCommand(code)

		return {
			content: [{ type: "text", text: result }],
		}
	},
)

server.tool(
	"editor_list_assets",
	"List all Unreal assets\n\nExample output: [''/Game/Characters/Hero/BP_Hero'', ''/Game/Maps/TestMap'', ''/Game/Materials/M_Basic'']\n\nReturns a Python list of asset paths.",
	async () => {
		const result = await tryRunCommand(editorTools.UEListAssets())
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
	"editor_export_asset",
	"Export an Unreal asset to text\n\nExample output: Binary data of the exported asset file\n\nReturns the raw binary content of the exported asset.",
	{
		asset_path: z.string(),
	},
	async ({ asset_path }) => {
		const result = await tryRunCommand(editorTools.UEExportAsset(asset_path))
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
	"editor_get_asset_info",
	"Get information about an asset, including LOD levels for StaticMesh and SkeletalMesh assets\n\nExample output: [{'name': 'SM_Cube', 'is_valid': True, 'is_u_asset': True, 'is_asset_loaded': True, 'class': 'StaticMesh', 'path': '/Game/Meshes/SM_Cube', 'package': 'SM_Cube', 'package_path': '/Game/Meshes/SM_Cube', 'lod_levels': [{'lod_index': 0, 'num_vertices': 24, 'num_triangles': 12}, {'lod_index': 1, 'num_vertices': 16, 'num_triangles': 8}]}]\n\nReturns asset metadata with LOD information for mesh assets.",
	{ asset_path: z.string() },
	async ({ asset_path }) => {
		const result = await tryRunCommand(editorTools.UEGetAssetInfo(asset_path))
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
	"editor_get_asset_references",
	"Get references for an asset\n\nExample output: [{'name': '/Game/Materials/M_Character.M_Character', 'class': 'Material'}, {'name': '/Game/Blueprints/BP_Player.BP_Player', 'class': 'Blueprint'}]\n\nReturns list of assets that reference the specified asset.",
	{ asset_path: z.string() },
	async ({ asset_path }) => {
		const result = await tryRunCommand(editorTools.UEGetAssetReferences(asset_path))

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
	"editor_console_command",
	"Run a console command in Unreal\n\nExample output: (No output for most commands, executed silently)\n\nExecutes the console command without returning output.",
	{ command: z.string() },
	async ({ command }) => {
		const result = await tryRunCommand(editorTools.UEConsoleCommand(command))
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
	"editor_project_info",
	"Get detailed information about the current project\n\nExample output: {'project_name': 'MyGame', 'project_directory': '/Users/dev/MyGame/', 'engine_version': '4.27.2', 'total_assets': 1250, 'asset_locations': {'Game': 800, 'Engine': 450}, 'enhanced_input_enabled': false, 'classic_input_enabled': true, 'classic_input_actions': ['Jump'], 'game_modes': ['/Game/Core/GM_Main'], 'characters': ['/Game/Characters/B_Hero'], 'maps': ['/Game/Maps/L_TestMap']}\n\nReturns comprehensive project metadata and asset counts.",
	{},
	async () => {
		const result = await tryRunCommand(editorTools.UEGetProjectInfo())
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
	"editor_get_map_info",
	"Get detailed information about the current map/level\n\nExample output: {'map_name': 'TestMap', 'map_path': '/Game/Maps/TestMap', 'total_actors': 45, 'actor_types': {'StaticMeshActor': 20, 'DirectionalLight': 1, 'PlayerStart': 1}, 'lighting': {'has_lightmass_importance_volume': false, 'directional_lights': 1, 'point_lights': 3, 'spot_lights': 0}, 'streaming_levels': 0, 'streaming_level_names': []}\n\nReturns current level information with actor counts and lighting details.",
	{},
	async () => {
		const result = await tryRunCommand(editorTools.UEGetMapInfo())
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
	"editor_search_assets",
	"Search for assets by name or path with optional class filter\n\nExample output: {'search_term': 'character', 'asset_class_filter': 'Blueprint', 'total_matches': 3, 'assets': [{'name': 'BP_Character', 'path': '/Game/Characters', 'class': 'Blueprint', 'package_name': 'BP_Character'}, {'name': 'BP_EnemyCharacter', 'path': '/Game/Enemies', 'class': 'Blueprint', 'package_name': 'BP_EnemyCharacter'}]}\n\nReturns search results with asset details, limited to 50 results.",
	{
		search_term: z.string(),
		asset_class: z.string().optional(),
	},
	async ({ search_term, asset_class }) => {
		const result = await tryRunCommand(editorTools.UESearchAssets(search_term, asset_class))
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
	"editor_get_world_outliner",
	"Get all actors in the current world with their properties\n\nExample output: {'world_name': 'TestMap', 'total_actors': 45, 'actors': [{'name': 'StaticMeshActor_0', 'class': 'StaticMeshActor', 'location': {'x': 0.0, 'y': 0.0, 'z': 0.0}, 'rotation': {'pitch': 0.0, 'yaw': 0.0, 'roll': 0.0}, 'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0}, 'is_hidden': false, 'folder_path': '/Meshes', 'components': ['StaticMeshComponent', 'SceneComponent']}]}\n\nReturns complete world outliner with all actors and their transform data.",
	{},
	async () => {
		const result = await tryRunCommand(editorTools.UEGetWorldOutliner())
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
	"editor_validate_assets",
	"Validate assets in the project to check for errors\n\nExample output: {'total_validated': 100, 'valid_assets': [{'path': '/Game/Meshes/SM_Cube', 'class': 'StaticMesh', 'size': '1024'}], 'invalid_assets': [{'path': '/Game/Missing/Asset', 'error': 'Asset does not exist'}], 'validation_summary': {'valid_count': 95, 'invalid_count': 5, 'success_rate': 95.0}}\n\nReturns validation results with asset status and error details.",
	{
		asset_paths: z.string().optional(),
	},
	async ({ asset_paths }) => {
		const result = await tryRunCommand(editorTools.UEValidateAssets(asset_paths))
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

server.tool(
	"editor_take_screenshot",
	"Take a screenshot of the Unreal Editor\n\nExample output: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...\n\nReturns a base64-encoded PNG image of the current editor view. IF THIS ERRORS OUT MAKE SURE THE UNREAL ENGINE WINDOW IS FOCUSED",
	{},
	async () => {
		const result = await tryRunCommand(editorTools.UETakeScreenshot())

		const filePath = result.trim()
		const fullPath = path.resolve(filePath)
		await new Promise((resolve) => setTimeout(resolve, 3000))
		if (fs.existsSync(fullPath)) {
			const base64Data = fs.readFileSync(fullPath, { encoding: "base64" })
			fs.unlinkSync(fullPath)
			if (base64Data) {
				return {
					content: [
						{
							type: "image",
							data: base64Data,
							mimeType: "image/png",
						},
					],
				}
			}
		}

		return {
			content: [
				{
					type: "text",
					text: result || "Failed to take screenshot. Is the Unreal Engine window focused?",
				},
			],
		}
	},
)

server.tool(
	"editor_move_camera",
	"Move the viewport camera to a specific location and rotation for positioning screenshots",
	{
		location: z
			.object({
				x: z.number(),
				y: z.number(),
				z: z.number(),
			})
			.describe("Camera world position coordinates"),
		rotation: z
			.object({
				pitch: z.number(),
				yaw: z.number(),
				roll: z.number(),
			})
			.describe("Camera rotation in degrees"),
	},
	async ({ location, rotation }) => {
		const result = await tryRunCommand(editorTools.UEMoveCamera(location, rotation))
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

registerZeroArgPythonTool(
	"get_actors_in_level",
	"Get all actors currently loaded in the editor level.",
	() => editorTools.UEActorTool("get_actors_in_level"),
)

registerPythonTool(
	"find_actors_by_name",
	"Find level actors by matching a name or label pattern.",
	{
		pattern: z.string().describe("Partial actor name or label to search for"),
	},
	({ pattern }) => editorTools.UEActorTool("find_actors_by_name", { pattern }),
)

registerPythonTool(
	"spawn_actor",
	"Spawn a native actor class into the current level.",
	{
		type: z.string().describe("Actor class name or class path"),
		name: z.string().optional().describe("Optional actor label"),
		location: vector3InputSchema.optional().describe("Optional world location"),
		rotation: rotatorInputSchema.optional().describe("Optional world rotation"),
	},
	({ type, name, location, rotation }) =>
		editorTools.UEActorTool("spawn_actor", {
			type,
			name,
			location: toVector3Array(location),
			rotation: toRotatorArray(rotation),
		}),
)

registerPythonTool(
	"delete_actor",
	"Delete a level actor by name or actor label.",
	{
		name: z.string().describe("Actor name or label"),
	},
	({ name }) => editorTools.UEActorTool("delete_actor", { name }),
)

registerPythonTool(
	"set_actor_transform",
	"Set actor location, rotation, or scale in the current level.",
	{
		name: z.string().describe("Actor name or label"),
		location: vector3InputSchema.optional().describe("Optional world location"),
		rotation: rotatorInputSchema.optional().describe("Optional world rotation"),
		scale: vector3InputSchema.optional().describe("Optional world scale"),
	},
	({ name, location, rotation, scale }) =>
		editorTools.UEActorTool("set_actor_transform", {
			name,
			location: toVector3Array(location),
			rotation: toRotatorArray(rotation),
			scale: toVector3Array(scale),
		}),
)

registerPythonTool(
	"get_actor_properties",
	"Inspect common editor properties for a specific actor.",
	{
		name: z.string().describe("Actor name or label"),
	},
	({ name }) => editorTools.UEActorTool("get_actor_properties", { name }),
)

registerPythonTool(
	"get_actor_material_info",
	"Inspect the material slots used by an actor's mesh components.",
	{
		name: z.string().describe("Actor name or label"),
	},
	({ name }) => editorTools.UEActorTool("get_actor_material_info", { name }),
)

registerPythonTool(
	"set_actor_property",
	"Set a single editor property on an existing actor.",
	{
		name: z.string().describe("Actor name or label"),
		property_name: z.string().describe("Editor property name"),
		property_value: z.any().describe("Editor property value"),
	},
	({ name, property_name, property_value }) =>
		editorTools.UEActorTool("set_actor_property", { name, property_name, property_value }),
)

registerPythonTool(
	"spawn_blueprint_actor",
	"Spawn an actor from a Blueprint asset into the current level.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		name: z.string().optional().describe("Optional actor label"),
		location: vector3InputSchema.optional().describe("Optional world location"),
		rotation: rotatorInputSchema.optional().describe("Optional world rotation"),
		scale: vector3InputSchema.optional().describe("Optional world scale"),
		properties: recordSchema.optional().describe("Optional actor properties to apply after spawn"),
	},
	({ blueprint_name, name, location, rotation, scale, properties }) =>
		editorTools.UEActorTool("spawn_blueprint_actor", {
			blueprint_name,
			name,
			location: toVector3Array(location),
			rotation: toRotatorArray(rotation),
			scale: toVector3Array(scale),
			properties,
		}),
)

/// Blueprint Analysis Tools
registerPythonTool(
	"read_blueprint_content",
	"Read a Blueprint's variables, graphs, functions, and component summary.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		include_nodes: z.boolean().optional().describe("Include serialized graph nodes"),
	},
	({ blueprint_name, include_nodes }) =>
		editorTools.UEBlueprintAnalysisTool("read_blueprint_content", {
			blueprint_name,
			include_nodes,
		}),
)

registerPythonTool(
	"analyze_blueprint_graph",
	"Analyze Blueprint graph nodes and connections.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		graph_name: z.string().optional().describe("Optional graph name"),
		include_nodes: z.boolean().optional().describe("Include serialized graph nodes"),
	},
	({ blueprint_name, graph_name, include_nodes }) =>
		editorTools.UEBlueprintAnalysisTool("analyze_blueprint_graph", {
			blueprint_name,
			graph_name,
			include_nodes,
		}),
)

registerPythonTool(
	"get_blueprint_variable_details",
	"Inspect Blueprint variable definitions and pin metadata.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		variable_name: z.string().optional().describe("Optional variable name filter"),
	},
	({ blueprint_name, variable_name }) =>
		editorTools.UEBlueprintAnalysisTool("get_blueprint_variable_details", {
			blueprint_name,
			variable_name,
		}),
)

registerPythonTool(
	"get_blueprint_function_details",
	"Inspect Blueprint function graphs, entry nodes, and call nodes.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		function_name: z.string().optional().describe("Optional function graph name filter"),
	},
	({ blueprint_name, function_name }) =>
		editorTools.UEBlueprintAnalysisTool("get_blueprint_function_details", {
			blueprint_name,
			function_name,
		}),
)

/// Blueprint Asset / Component Tools
registerPythonTool(
	"create_blueprint",
	"Create a new Blueprint asset from a parent class.",
	{
		name: z.string().describe("Blueprint asset name or full package path"),
		parent_class: z.string().optional().describe("Parent class name or class path"),
		path: z.string().optional().describe("Optional content browser folder such as /Game/Blueprints"),
	},
	({ name, parent_class, path }) =>
		editorTools.UEBlueprintTool("create_blueprint", {
			name,
			parent_class,
			path,
		}),
)

registerPythonTool(
	"add_component_to_blueprint",
	"Add a component to a Blueprint construction script.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		component_type: z.string().describe("Component class name or class path"),
		component_name: z.string().describe("Blueprint component name"),
		location: vector3InputSchema.optional().describe("Optional relative location"),
		rotation: rotatorInputSchema.optional().describe("Optional relative rotation"),
		scale: vector3InputSchema.optional().describe("Optional relative scale"),
		component_properties: recordSchema.optional().describe("Optional component properties"),
		parent_component_name: z.string().optional().describe("Optional parent component name"),
	},
	({
		blueprint_name,
		component_type,
		component_name,
		location,
		rotation,
		scale,
		component_properties,
		parent_component_name,
	}) =>
		editorTools.UEBlueprintTool("add_component_to_blueprint", {
			blueprint_name,
			component_type,
			component_name,
			location: toVector3Array(location),
			rotation: toRotatorArray(rotation),
			scale: toVector3Array(scale),
			component_properties,
			parent_component_name,
		}),
)

registerPythonTool(
	"set_static_mesh_properties",
	"Assign a Static Mesh asset to a Blueprint StaticMeshComponent.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		component_name: z.string().describe("Blueprint component name"),
		static_mesh: z.string().describe("Static Mesh asset path"),
	},
	({ blueprint_name, component_name, static_mesh }) =>
		editorTools.UEBlueprintTool("set_static_mesh_properties", {
			blueprint_name,
			component_name,
			static_mesh,
		}),
)

registerPythonTool(
	"set_component_property",
	"Set a single editor property on a Blueprint component template.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		component_name: z.string().describe("Blueprint component name"),
		property_name: z.string().describe("Component property name"),
		property_value: z.any().describe("Component property value"),
	},
	({ blueprint_name, component_name, property_name, property_value }) =>
		editorTools.UEBlueprintTool("set_component_property", {
			blueprint_name,
			component_name,
			property_name,
			property_value,
		}),
)

registerPythonTool(
	"set_physics_properties",
	"Apply common physics settings to a Blueprint component template.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		component_name: z.string().describe("Blueprint component name"),
		simulate_physics: z.boolean().optional(),
		gravity_enabled: z.boolean().optional(),
		mass: z.number().optional(),
		linear_damping: z.number().optional(),
		angular_damping: z.number().optional(),
	},
	({ blueprint_name, component_name, simulate_physics, gravity_enabled, mass, linear_damping, angular_damping }) =>
		editorTools.UEBlueprintTool("set_physics_properties", {
			blueprint_name,
			component_name,
			simulate_physics,
			gravity_enabled,
			mass,
			linear_damping,
			angular_damping,
		}),
)

registerPythonTool(
	"compile_blueprint",
	"Compile and save a Blueprint asset after edits.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
	},
	({ blueprint_name }) => editorTools.UEBlueprintTool("compile_blueprint", { blueprint_name }),
)

registerPythonTool(
	"set_blueprint_property",
	"Set a class default property on a Blueprint asset.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		property_name: z.string().describe("Blueprint class default property name"),
		property_value: z.any().describe("Blueprint class default property value"),
	},
	({ blueprint_name, property_name, property_value }) =>
		editorTools.UEBlueprintTool("set_blueprint_property", {
			blueprint_name,
			property_name,
			property_value,
		}),
)

/// Blueprint Node Graph Tools
registerPythonTool(
	"add_blueprint_event_node",
	"Add an event node to a Blueprint event graph.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		event_name: z.string().describe("Event name such as ReceiveBeginPlay"),
		graph_name: z.string().optional().describe("Optional graph name"),
		node_position: vector2InputSchema.optional().describe("Optional graph position"),
	},
	({ blueprint_name, event_name, graph_name, node_position }) =>
		editorTools.UEBlueprintGraphTool("add_blueprint_event_node", {
			blueprint_name,
			event_name,
			graph_name,
			node_position: toVector2Array(node_position),
		}),
)

registerPythonTool(
	"add_blueprint_input_action_node",
	"Add an input action event node to a Blueprint event graph.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		action_name: z.string().describe("Input action name"),
		graph_name: z.string().optional().describe("Optional graph name"),
		node_position: vector2InputSchema.optional().describe("Optional graph position"),
	},
	({ blueprint_name, action_name, graph_name, node_position }) =>
		editorTools.UEBlueprintGraphTool("add_blueprint_input_action_node", {
			blueprint_name,
			action_name,
			graph_name,
			node_position: toVector2Array(node_position),
		}),
)

registerPythonTool(
	"add_blueprint_function_node",
	"Add a function call node to a Blueprint graph.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		function_name: z.string().describe("Function name to call"),
		target: z.string().optional().describe("Call target, such as self or a component name"),
		params: recordSchema.optional().describe("Optional pin default values"),
		graph_name: z.string().optional().describe("Optional graph name"),
		node_position: vector2InputSchema.optional().describe("Optional graph position"),
	},
	({ blueprint_name, function_name, target, params, graph_name, node_position }) =>
		editorTools.UEBlueprintGraphTool("add_blueprint_function_node", {
			blueprint_name,
			function_name,
			target,
			params,
			graph_name,
			node_position: toVector2Array(node_position),
		}),
)

registerPythonTool(
	"connect_blueprint_nodes",
	"Connect two Blueprint graph pins by node id and pin name.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		source_node_id: z.string().describe("Source node id or node name"),
		source_pin: z.string().describe("Source pin name"),
		target_node_id: z.string().describe("Target node id or node name"),
		target_pin: z.string().describe("Target pin name"),
	},
	({ blueprint_name, source_node_id, source_pin, target_node_id, target_pin }) =>
		editorTools.UEBlueprintGraphTool("connect_blueprint_nodes", {
			blueprint_name,
			source_node_id,
			source_pin,
			target_node_id,
			target_pin,
		}),
)

registerPythonTool(
	"add_blueprint_variable",
	"Add a variable declaration to a Blueprint asset.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		variable_name: z.string().describe("New Blueprint variable name"),
		variable_type: z.string().describe("Variable type such as bool, float, vector, or object:Actor"),
		is_exposed: z.boolean().optional().describe("Whether the variable should be exposed"),
	},
	({ blueprint_name, variable_name, variable_type, is_exposed }) =>
		editorTools.UEBlueprintGraphTool("add_blueprint_variable", {
			blueprint_name,
			variable_name,
			variable_type,
			is_exposed,
		}),
)

registerPythonTool(
	"add_blueprint_get_self_component_reference",
	"Add a Blueprint node that gets a component reference from self.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		component_name: z.string().describe("Blueprint component name"),
		graph_name: z.string().optional().describe("Optional graph name"),
		node_position: vector2InputSchema.optional().describe("Optional graph position"),
	},
	({ blueprint_name, component_name, graph_name, node_position }) =>
		editorTools.UEBlueprintGraphTool("add_blueprint_get_self_component_reference", {
			blueprint_name,
			component_name,
			graph_name,
			node_position: toVector2Array(node_position),
		}),
)

registerPythonTool(
	"add_blueprint_self_reference",
	"Add a self reference node to a Blueprint graph.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		graph_name: z.string().optional().describe("Optional graph name"),
		node_position: vector2InputSchema.optional().describe("Optional graph position"),
	},
	({ blueprint_name, graph_name, node_position }) =>
		editorTools.UEBlueprintGraphTool("add_blueprint_self_reference", {
			blueprint_name,
			graph_name,
			node_position: toVector2Array(node_position),
		}),
)

registerPythonTool(
	"find_blueprint_nodes",
	"Search Blueprint graphs for matching node titles, names, or classes.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		search_term: z.string().optional().describe("Optional search term"),
		graph_name: z.string().optional().describe("Optional graph name"),
		node_class: z.string().optional().describe("Optional node class filter"),
	},
	({ blueprint_name, search_term, graph_name, node_class }) =>
		editorTools.UEBlueprintGraphTool("find_blueprint_nodes", {
			blueprint_name,
			search_term,
			graph_name,
			node_class,
		}),
)

/// Blueprint Graph Editing Tools
registerPythonTool(
	"add_node",
	"Add a low-level Blueprint graph node using a helper node_type or raw node_class.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		node_type: z.string().optional().describe("Helper node type such as event, input_action, function, self, component_reference"),
		node_class: z.string().optional().describe("Raw BlueprintGraph node class name or /Script path"),
		graph_name: z.string().optional().describe("Optional graph name"),
		node_position: vector2InputSchema.optional().describe("Optional graph position"),
		event_name: z.string().optional(),
		action_name: z.string().optional(),
		function_name: z.string().optional(),
		target: z.string().optional(),
		component_name: z.string().optional(),
		params: recordSchema.optional(),
	},
	({ blueprint_name, node_type, node_class, graph_name, node_position, event_name, action_name, function_name, target, component_name, params }) =>
		editorTools.UEBlueprintGraphTool("add_node", {
			blueprint_name,
			node_type,
			node_class,
			graph_name,
			node_position: toVector2Array(node_position),
			event_name,
			action_name,
			function_name,
			target,
			component_name,
			params,
		}),
)

registerPythonTool(
	"connect_nodes",
	"Connect low-level Blueprint graph pins by node id and pin name.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		source_node: z.string().describe("Source node id or node name"),
		source_pin: z.string().describe("Source pin name"),
		target_node: z.string().describe("Target node id or node name"),
		target_pin: z.string().describe("Target pin name"),
	},
	({ blueprint_name, source_node, source_pin, target_node, target_pin }) =>
		editorTools.UEBlueprintGraphTool("connect_nodes", {
			blueprint_name,
			source_node,
			source_pin,
			target_node,
			target_pin,
		}),
)

registerPythonTool(
	"disconnect_nodes",
	"Disconnect low-level Blueprint graph links for a pin or a specific pin-to-pin connection.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		source_node: z.string().describe("Source node id or node name"),
		source_pin: z.string().describe("Source pin name"),
		target_node: z.string().optional().describe("Optional target node id or node name"),
		target_pin: z.string().optional().describe("Optional target pin name"),
	},
	({ blueprint_name, source_node, source_pin, target_node, target_pin }) =>
		editorTools.UEBlueprintGraphTool("disconnect_nodes", {
			blueprint_name,
			source_node,
			source_pin,
			target_node,
			target_pin,
		}),
)

registerPythonTool(
	"create_variable",
	"Create a low-level Blueprint variable declaration.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		variable_name: z.string().describe("New Blueprint variable name"),
		variable_type: z.string().describe("Variable type such as bool, int, float, string, vector, rotator"),
		default_value: z.any().optional().describe("Optional default value"),
		is_public: z.boolean().optional().describe("Whether the variable should be public/editable"),
		tooltip: z.string().optional().describe("Optional tooltip"),
		category: z.string().optional().describe("Optional variable category"),
	},
	({ blueprint_name, variable_name, variable_type, default_value, is_public, tooltip, category }) =>
		editorTools.UEBlueprintGraphTool("create_variable", {
			blueprint_name,
			variable_name,
			variable_type,
			default_value,
			is_public,
			tooltip,
			category,
		}),
)

/// Physics & Materials Tools
registerPythonTool(
	"spawn_physics_blueprint_actor",
	"Spawn a Blueprint actor and enable physics on a material-capable component.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		name: z.string().optional().describe("Optional actor label"),
		location: vector3InputSchema.optional().describe("Optional world location"),
		rotation: rotatorInputSchema.optional().describe("Optional world rotation"),
		scale: vector3InputSchema.optional().describe("Optional world scale"),
		component_name: z.string().optional().describe("Optional target component name"),
		material_path: z.string().optional().describe("Optional material to apply"),
		slot_index: z.number().int().optional().describe("Optional material slot index"),
		simulate_physics: z.boolean().optional(),
		gravity_enabled: z.boolean().optional(),
		mass: z.number().optional(),
		linear_damping: z.number().optional(),
		angular_damping: z.number().optional(),
	},
	({ blueprint_name, name, location, rotation, scale, component_name, material_path, slot_index, simulate_physics, gravity_enabled, mass, linear_damping, angular_damping }) =>
		editorTools.UEMaterialTool("spawn_physics_blueprint_actor", {
			blueprint_name,
			name,
			location: toVector3Array(location),
			rotation: toRotatorArray(rotation),
			scale: toVector3Array(scale),
			component_name,
			material_path,
			slot_index,
			simulate_physics,
			gravity_enabled,
			mass,
			linear_damping,
			angular_damping,
		}),
)

registerPythonTool(
	"get_available_materials",
	"List project or engine materials available for assignment.",
	{
		search_term: z.string().optional().describe("Optional material search term"),
		include_engine: z.boolean().optional().describe("Include /Engine materials"),
		limit: z.number().int().optional().describe("Maximum number of results"),
	},
	({ search_term, include_engine, limit }) =>
		editorTools.UEMaterialTool("get_available_materials", {
			search_term,
			include_engine,
			limit,
		}),
)

registerPythonTool(
	"apply_material_to_actor",
	"Apply a material asset to an actor's mesh component.",
	{
		actor_name: z.string().describe("Actor name or label"),
		component_name: z.string().optional().describe("Optional component name"),
		material_path: z.string().describe("Material asset path"),
		slot_index: z.number().int().optional().describe("Optional material slot index"),
	},
	({ actor_name, component_name, material_path, slot_index }) =>
		editorTools.UEMaterialTool("apply_material_to_actor", {
			actor_name,
			component_name,
			material_path,
			slot_index,
		}),
)

registerPythonTool(
	"apply_material_to_blueprint",
	"Apply a material asset to a Blueprint component template.",
	{
		blueprint_name: z.string().describe("Blueprint asset name or path"),
		component_name: z.string().describe("Blueprint component name"),
		material_path: z.string().describe("Material asset path"),
		slot_index: z.number().int().optional().describe("Optional material slot index"),
	},
	({ blueprint_name, component_name, material_path, slot_index }) =>
		editorTools.UEMaterialTool("apply_material_to_blueprint", {
			blueprint_name,
			component_name,
			material_path,
			slot_index,
		}),
)

registerPythonTool(
	"set_mesh_material_color",
	"Tint a mesh material by editing or generating a material instance constant.",
	{
		actor_name: z.string().optional().describe("Optional actor name or label"),
		blueprint_name: z.string().optional().describe("Optional Blueprint asset name or path"),
		component_name: z.string().optional().describe("Optional component name"),
		material_path: z.string().optional().describe("Optional source material path"),
		slot_index: z.number().int().optional().describe("Optional material slot index"),
		color: colorInputSchema.describe("RGBA color"),
		parameter_name: z.string().optional().describe("Optional vector parameter name"),
		instance_name: z.string().optional().describe("Optional generated material instance name"),
		instance_path: z.string().optional().describe("Optional generated material instance folder"),
	},
	({ actor_name, blueprint_name, component_name, material_path, slot_index, color, parameter_name, instance_name, instance_path }) =>
		editorTools.UEMaterialTool("set_mesh_material_color", {
			actor_name,
			blueprint_name,
			component_name,
			material_path,
			slot_index,
			color: toColorArray(color),
			parameter_name,
			instance_name,
			instance_path,
		}),
)

/// Project / Input Tools
registerPythonTool(
	"create_input_mapping",
	"Create an Action or Axis mapping in DefaultInput.ini for the current project.",
	{
		mapping_name: z.string().optional().describe("Action or axis mapping name"),
		action_name: z.string().optional().describe("Legacy alias for mapping_name"),
		key: z.string().describe("Input key, optionally with modifiers such as Ctrl+SpaceBar"),
		input_type: z.string().optional().describe("Action or Axis"),
		scale: z.number().optional().describe("Axis scale"),
	},
	({ mapping_name, action_name, key, input_type, scale }) =>
		editorTools.UEProjectTool("create_input_mapping", {
			mapping_name,
			action_name,
			key,
			input_type,
			scale,
		}),
)

/// World Building Tools
registerPythonTool(
	"create_town",
	"Create a procedural small town using UE basic shapes.",
	{
		...worldBuildBaseSchema,
		rows: z.number().int().optional().describe("Number of town rows"),
		cols: z.number().int().optional().describe("Number of town columns"),
		spacing: z.number().optional().describe("Spacing between houses"),
	},
	({ location, material_path, prefix, rows, cols, spacing }) =>
		editorTools.UEWorldBuildingTool("create_town", {
			location: toVector3Array(location),
			material_path,
			prefix,
			rows,
			cols,
			spacing,
		}),
)

registerPythonTool(
	"construct_house",
	"Construct a house preset from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		width: z.number().optional().describe("House width"),
		depth: z.number().optional().describe("House depth"),
		wall_height: z.number().optional().describe("Wall height"),
		wall_thickness: z.number().optional().describe("Wall thickness"),
		roof_height: z.number().optional().describe("Roof height"),
	},
	({ location, material_path, prefix, width, depth, wall_height, wall_thickness, roof_height }) =>
		editorTools.UEWorldBuildingTool("construct_house", {
			location: toVector3Array(location),
			material_path,
			prefix,
			width,
			depth,
			wall_height,
			wall_thickness,
			roof_height,
		}),
)

registerPythonTool(
	"construct_mansion",
	"Construct a mansion preset from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		wing_offset: z.number().optional().describe("Offset for mansion wings"),
	},
	({ location, material_path, prefix, wing_offset }) =>
		editorTools.UEWorldBuildingTool("construct_mansion", {
			location: toVector3Array(location),
			material_path,
			prefix,
			wing_offset,
		}),
)

registerPythonTool(
	"create_tower",
	"Create a tower preset from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		width: z.number().optional().describe("Tower width"),
		floors: z.number().int().optional().describe("Number of floors"),
		floor_height: z.number().optional().describe("Height per floor"),
	},
	({ location, material_path, prefix, width, floors, floor_height }) =>
		editorTools.UEWorldBuildingTool("create_tower", {
			location: toVector3Array(location),
			material_path,
			prefix,
			width,
			floors,
			floor_height,
		}),
)

registerPythonTool(
	"create_arch",
	"Create an arch preset from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		span_width: z.number().optional().describe("Arch span width"),
		pillar_height: z.number().optional().describe("Pillar height"),
		pillar_width: z.number().optional().describe("Pillar width"),
		beam_height: z.number().optional().describe("Top beam height"),
	},
	({ location, material_path, prefix, span_width, pillar_height, pillar_width, beam_height }) =>
		editorTools.UEWorldBuildingTool("create_arch", {
			location: toVector3Array(location),
			material_path,
			prefix,
			span_width,
			pillar_height,
			pillar_width,
			beam_height,
		}),
)

registerPythonTool(
	"create_staircase",
	"Create a staircase preset from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		steps: z.number().int().optional().describe("Number of steps"),
		step_width: z.number().optional().describe("Step width"),
		step_height: z.number().optional().describe("Step height"),
		step_depth: z.number().optional().describe("Step depth"),
	},
	({ location, material_path, prefix, steps, step_width, step_height, step_depth }) =>
		editorTools.UEWorldBuildingTool("create_staircase", {
			location: toVector3Array(location),
			material_path,
			prefix,
			steps,
			step_width,
			step_height,
			step_depth,
		}),
)

/// Epic Structures Tools
registerPythonTool(
	"create_castle_fortress",
	"Create a castle fortress preset from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		size: z.number().optional().describe("Overall fortress size"),
		segments: z.number().int().optional().describe("Wall segment count per side"),
		height: z.number().optional().describe("Wall height"),
		thickness: z.number().optional().describe("Wall thickness"),
		tower_width: z.number().optional().describe("Corner tower width"),
	},
	({ location, material_path, prefix, size, segments, height, thickness, tower_width }) =>
		editorTools.UEWorldBuildingTool("create_castle_fortress", {
			location: toVector3Array(location),
			material_path,
			prefix,
			size,
			segments,
			height,
			thickness,
			tower_width,
		}),
)

registerPythonTool(
	"create_suspension_bridge",
	"Create a suspension bridge preset from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		segments: z.number().int().optional().describe("Deck segment count"),
		segment_length: z.number().optional().describe("Length of each deck segment"),
		width: z.number().optional().describe("Bridge deck width"),
		thickness: z.number().optional().describe("Bridge deck thickness"),
		tower_height: z.number().optional().describe("Support tower height"),
	},
	({ location, material_path, prefix, segments, segment_length, width, thickness, tower_height }) =>
		editorTools.UEWorldBuildingTool("create_suspension_bridge", {
			location: toVector3Array(location),
			material_path,
			prefix,
			segments,
			segment_length,
			width,
			thickness,
			tower_height,
		}),
)

registerPythonTool(
	"create_bridge",
	"Create a simple bridge preset from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		segments: z.number().int().optional().describe("Deck segment count"),
		segment_length: z.number().optional().describe("Length of each deck segment"),
		width: z.number().optional().describe("Bridge deck width"),
		thickness: z.number().optional().describe("Bridge deck thickness"),
		rail_height: z.number().optional().describe("Rail height"),
	},
	({ location, material_path, prefix, segments, segment_length, width, thickness, rail_height }) =>
		editorTools.UEWorldBuildingTool("create_bridge", {
			location: toVector3Array(location),
			material_path,
			prefix,
			segments,
			segment_length,
			width,
			thickness,
			rail_height,
		}),
)

registerPythonTool(
	"create_aqueduct",
	"Create an aqueduct preset from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		arches: z.number().int().optional().describe("Number of arches"),
		spacing: z.number().optional().describe("Spacing between arches"),
	},
	({ location, material_path, prefix, arches, spacing }) =>
		editorTools.UEWorldBuildingTool("create_aqueduct", {
			location: toVector3Array(location),
			material_path,
			prefix,
			arches,
			spacing,
		}),
)

/// Level Design Tools
registerPythonTool(
	"create_maze",
	"Create a procedural maze from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		rows: z.number().int().optional().describe("Maze rows"),
		cols: z.number().int().optional().describe("Maze columns"),
		cell_size: z.number().optional().describe("Maze cell size"),
		wall_height: z.number().optional().describe("Maze wall height"),
		wall_thickness: z.number().optional().describe("Maze wall thickness"),
		seed: z.number().int().optional().describe("Maze random seed"),
	},
	({ location, material_path, prefix, rows, cols, cell_size, wall_height, wall_thickness, seed }) =>
		editorTools.UEWorldBuildingTool("create_maze", {
			location: toVector3Array(location),
			material_path,
			prefix,
			rows,
			cols,
			cell_size,
			wall_height,
			wall_thickness,
			seed,
		}),
)

registerPythonTool(
	"create_pyramid",
	"Create a stepped pyramid from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		levels: z.number().int().optional().describe("Pyramid levels"),
		block_size: z.number().optional().describe("Block size"),
	},
	({ location, material_path, prefix, levels, block_size }) =>
		editorTools.UEWorldBuildingTool("create_pyramid", {
			location: toVector3Array(location),
			material_path,
			prefix,
			levels,
			block_size,
		}),
)

registerPythonTool(
	"create_wall",
	"Create a reusable wall segment preset from UE basic shapes.",
	{
		...worldBuildBaseSchema,
		segments: z.number().int().optional().describe("Number of wall segments"),
		segment_length: z.number().optional().describe("Length of each wall segment"),
		height: z.number().optional().describe("Wall height"),
		thickness: z.number().optional().describe("Wall thickness"),
		axis: z.string().optional().describe("Wall axis: x or y"),
	},
	({ location, material_path, prefix, segments, segment_length, height, thickness, axis }) =>
		editorTools.UEWorldBuildingTool("create_wall", {
			location: toVector3Array(location),
			material_path,
			prefix,
			segments,
			segment_length,
			height,
			thickness,
			axis,
		}),
)

/// UMG Tools
server.tool(
	"editor_umg_add_widget",
	"Add a UMG widget to a Widget Blueprint. Without a parent, this creates the root widget. With a parent, this adds the widget under that parent panel. Position changes are only supported for CanvasPanel children.",
	{
		widget_blueprint_path: z
			.string()
			.describe("Widget Blueprint asset path such as '/Game/UI/WBP_MainMenu'"),
		widget_class: z
			.string()
			.describe(
				"Native UMG widget class name or class path such as 'CanvasPanel', 'Border', 'Button', 'TextBlock', or '/Script/UMG.CanvasPanel'",
			),
		widget_name: z.string().describe("Name to assign to the new widget inside the widget tree"),
		parent_widget_name: z
			.string()
			.optional()
			.describe("Optional parent panel widget name. Leave empty to create the root widget."),
		position: z
			.object({
				x: z.number(),
				y: z.number(),
			})
			.optional()
			.describe("Optional CanvasPanel slot position for the new widget"),
		z_order: z.number().int().optional().describe("Optional CanvasPanel z-order"),
	},
	async ({ widget_blueprint_path, widget_class, widget_name, parent_widget_name, position, z_order }) => {
		const result = await tryRunCommand(
			editorTools.UEUMGAddWidget(
				widget_blueprint_path,
				widget_class,
				widget_name,
				parent_widget_name,
				position,
				z_order,
			),
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
	"editor_umg_remove_widget",
	"Remove a UMG widget from a Widget Blueprint by widget name. This can also remove the current root widget.",
	{
		widget_blueprint_path: z
			.string()
			.describe("Widget Blueprint asset path such as '/Game/UI/WBP_MainMenu'"),
		widget_name: z.string().describe("Name of the widget to remove from the widget tree"),
	},
	async ({ widget_blueprint_path, widget_name }) => {
		const result = await tryRunCommand(editorTools.UEUMGRemoveWidget(widget_blueprint_path, widget_name))
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
	"editor_umg_set_widget_position",
	"Set the position of a UMG widget inside a Widget Blueprint. This currently supports widgets attached to a CanvasPanel slot in UE4.27.",
	{
		widget_blueprint_path: z
			.string()
			.describe("Widget Blueprint asset path such as '/Game/UI/WBP_MainMenu'"),
		widget_name: z.string().describe("Name of the widget to reposition"),
		position: z
			.object({
				x: z.number(),
				y: z.number(),
			})
			.describe("CanvasPanel slot position"),
		z_order: z.number().int().optional().describe("Optional CanvasPanel z-order"),
	},
	async ({ widget_blueprint_path, widget_name, position, z_order }) => {
		const result = await tryRunCommand(
			editorTools.UEUMGSetWidgetPosition(widget_blueprint_path, widget_name, position, z_order),
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
	"editor_umg_reparent_widget",
	"Change the parent panel of an existing UMG widget inside a Widget Blueprint. The current root widget cannot be reparented by this tool.",
	{
		widget_blueprint_path: z
			.string()
			.describe("Widget Blueprint asset path such as '/Game/UI/WBP_MainMenu'"),
		widget_name: z.string().describe("Name of the widget to move"),
		new_parent_widget_name: z.string().describe("Name of the new parent panel widget"),
		position: z
			.object({
				x: z.number(),
				y: z.number(),
			})
			.optional()
			.describe("Optional CanvasPanel slot position after reparenting"),
		z_order: z.number().int().optional().describe("Optional CanvasPanel z-order after reparenting"),
	},
	async ({ widget_blueprint_path, widget_name, new_parent_widget_name, position, z_order }) => {
		const result = await tryRunCommand(
			editorTools.UEUMGReparentWidget(
				widget_blueprint_path,
				widget_name,
				new_parent_widget_name,
				position,
				z_order,
			),
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
	"editor_umg_add_child_widget",
	"Add a child widget to a parent panel inside a Widget Blueprint. This uses the UMG term 'child widget' instead of 'component'. Position changes are only supported for CanvasPanel children.",
	{
		widget_blueprint_path: z
			.string()
			.describe("Widget Blueprint asset path such as '/Game/UI/WBP_MainMenu'"),
		parent_widget_name: z.string().describe("Name of the parent panel widget"),
		child_widget_class: z
			.string()
			.describe(
				"Native UMG widget class name or class path such as 'Border', 'Button', 'TextBlock', or '/Script/UMG.Border'",
			),
		child_widget_name: z.string().describe("Name to assign to the new child widget"),
		position: z
			.object({
				x: z.number(),
				y: z.number(),
			})
			.optional()
			.describe("Optional CanvasPanel slot position for the new child widget"),
		z_order: z.number().int().optional().describe("Optional CanvasPanel z-order"),
	},
	async ({ widget_blueprint_path, parent_widget_name, child_widget_class, child_widget_name, position, z_order }) => {
		const result = await tryRunCommand(
			editorTools.UEUMGAddChildWidget(
				widget_blueprint_path,
				parent_widget_name,
				child_widget_class,
				child_widget_name,
				position,
				z_order,
			),
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
	"editor_umg_remove_child_widget",
	"Remove a direct child widget from a parent panel inside a Widget Blueprint.",
	{
		widget_blueprint_path: z
			.string()
			.describe("Widget Blueprint asset path such as '/Game/UI/WBP_MainMenu'"),
		parent_widget_name: z.string().describe("Name of the parent panel widget"),
		child_widget_name: z.string().describe("Name of the direct child widget to remove"),
	},
	async ({ widget_blueprint_path, parent_widget_name, child_widget_name }) => {
		const result = await tryRunCommand(
			editorTools.UEUMGRemoveChildWidget(widget_blueprint_path, parent_widget_name, child_widget_name),
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
	"editor_umg_set_child_widget_position",
	"Set the position of a direct child widget on a parent panel inside a Widget Blueprint. This currently supports CanvasPanel children in UE4.27.",
	{
		widget_blueprint_path: z
			.string()
			.describe("Widget Blueprint asset path such as '/Game/UI/WBP_MainMenu'"),
		parent_widget_name: z.string().describe("Name of the parent panel widget"),
		child_widget_name: z.string().describe("Name of the direct child widget to reposition"),
		position: z
			.object({
				x: z.number(),
				y: z.number(),
			})
			.describe("CanvasPanel slot position"),
		z_order: z.number().int().optional().describe("Optional CanvasPanel z-order"),
	},
	async ({ widget_blueprint_path, parent_widget_name, child_widget_name, position, z_order }) => {
		const result = await tryRunCommand(
			editorTools.UEUMGSetChildWidgetPosition(
				widget_blueprint_path,
				parent_widget_name,
				child_widget_name,
				position,
				z_order,
			),
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

registerPythonTool(
	"create_umg_widget_blueprint",
	"Create a Widget Blueprint asset for UMG authoring.",
	{
		widget_name: z.string().describe("Widget Blueprint asset name or full package path"),
		parent_class: z.string().optional().describe("Optional UserWidget parent class"),
		path: z.string().optional().describe("Optional content browser folder such as /Game/UI"),
	},
	({ widget_name, parent_class, path }) =>
		editorTools.UEUMGTool("create_umg_widget_blueprint", {
			widget_name,
			parent_class,
			path,
		}),
)

registerPythonTool(
	"add_text_block_to_widget",
	"Add a TextBlock to a Widget Blueprint and optionally position it on a CanvasPanel.",
	{
		widget_name: z.string().describe("Widget Blueprint asset name or path"),
		text_block_name: z.string().describe("TextBlock widget name"),
		text: z.string().optional().describe("Optional text value"),
		position: vector2InputSchema.optional().describe("Optional CanvasPanel position"),
		size: vector2InputSchema.optional().describe("Optional CanvasPanel size"),
		font_size: z.number().optional().describe("Optional font size"),
		color: colorInputSchema.optional().describe("Optional RGBA text color"),
	},
	({ widget_name, text_block_name, text, position, size, font_size, color }) =>
		editorTools.UEUMGTool("add_text_block_to_widget", {
			widget_name,
			text_block_name,
			text,
			position: toVector2Array(position),
			size: toVector2Array(size),
			font_size,
			color: toColorArray(color),
		}),
)

registerPythonTool(
	"add_button_to_widget",
	"Add a Button to a Widget Blueprint and optionally place it on a CanvasPanel.",
	{
		widget_name: z.string().describe("Widget Blueprint asset name or path"),
		button_name: z.string().describe("Button widget name"),
		text: z.string().optional().describe("Optional button label text"),
		position: vector2InputSchema.optional().describe("Optional CanvasPanel position"),
		size: vector2InputSchema.optional().describe("Optional CanvasPanel size"),
		font_size: z.number().optional().describe("Optional label font size"),
		color: colorInputSchema.optional().describe("Optional text color"),
		background_color: colorInputSchema.optional().describe("Optional button background color"),
	},
	({ widget_name, button_name, text, position, size, font_size, color, background_color }) =>
		editorTools.UEUMGTool("add_button_to_widget", {
			widget_name,
			button_name,
			text,
			position: toVector2Array(position),
			size: toVector2Array(size),
			font_size,
			color: toColorArray(color),
			background_color: toColorArray(background_color),
		}),
)

registerPythonTool(
	"bind_widget_event",
	"Bind a widget event to a Blueprint function when delegate editing is exposed by UE4.27 Python.",
	{
		widget_name: z.string().describe("Widget Blueprint asset name or path"),
		widget_member_name: z.string().describe("Widget name inside the widget tree"),
		event_name: z.string().describe("Widget delegate property name"),
		function_name: z.string().optional().describe("Optional function name to bind"),
	},
	({ widget_name, widget_member_name, event_name, function_name }) =>
		editorTools.UEUMGTool("bind_widget_event", {
			widget_name,
			widget_member_name,
			event_name,
			function_name,
		}),
)

registerPythonTool(
	"add_widget_to_viewport",
	"Instantiate a Widget Blueprint and add it to the active PIE or game viewport.",
	{
		widget_name: z.string().describe("Widget Blueprint asset name or path"),
		z_order: z.number().int().optional().describe("Optional viewport z-order"),
	},
	({ widget_name, z_order }) =>
		editorTools.UEUMGTool("add_widget_to_viewport", {
			widget_name,
			z_order,
		}),
)

registerPythonTool(
	"set_text_block_binding",
	"Configure a TextBlock binding when delegate editing is exposed by UE4.27 Python.",
	{
		widget_name: z.string().describe("Widget Blueprint asset name or path"),
		text_block_name: z.string().describe("TextBlock widget name"),
		binding_property: z.string().optional().describe("Binding property name such as TextDelegate"),
		function_name: z.string().optional().describe("Optional function name"),
		source_property: z.string().optional().describe("Optional source property name"),
	},
	({ widget_name, text_block_name, binding_property, function_name, source_property }) =>
		editorTools.UEUMGTool("set_text_block_binding", {
			widget_name,
			text_block_name,
			binding_property,
			function_name,
			source_property,
		}),
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
	"Domain Blueprint namespace for Blueprint creation, component editing, graph editing, compilation, and Blueprint inspection actions.",
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
		add_node: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintGraphTool("add_node", {
					blueprint_name: blueprintNameParam(params),
					node_type: optionalStringParam(params, ["node_type"]),
					node_class: optionalStringParam(params, ["node_class"]),
					graph_name: optionalStringParam(params, ["graph_name"]),
					node_position: toVector2Array(params.node_position as any),
					event_name: optionalStringParam(params, ["event_name"]),
					action_name: optionalStringParam(params, ["action_name"]),
					function_name: optionalStringParam(params, ["function_name"]),
					target: optionalStringParam(params, ["target"]),
					component_name: optionalStringParam(params, ["component_name"]),
					params: params.params,
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
		create_variable: (params) =>
			pythonDispatch(
				editorTools.UEBlueprintGraphTool("create_variable", {
					blueprint_name: blueprintNameParam(params),
					variable_name: requiredStringParam(params, ["variable_name", "name"]),
					variable_type: requiredStringParam(params, ["variable_type"]),
					default_value: params.default_value,
					is_public: params.is_public,
					tooltip: optionalStringParam(params, ["tooltip"]),
					category: optionalStringParam(params, ["category"]),
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
	"Domain widget namespace for UMG Blueprint creation, widget-tree edits, viewport spawning, and basic binding actions.",
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
		bind_event: (params) =>
			pythonDispatch(
				editorTools.UEUMGTool("bind_widget_event", {
					widget_name: widgetBlueprintParam(params),
					widget_member_name: requiredStringParam(params, ["widget_member_name", "widget_name_in_tree"]),
					event_name: requiredStringParam(params, ["event_name"]),
					function_name: optionalStringParam(params, ["function_name"]),
				}),
			),
		add_to_viewport: (params) =>
			pythonDispatch(
				editorTools.UEUMGTool("add_widget_to_viewport", {
					widget_name: widgetBlueprintParam(params),
					z_order: params.z_order,
				}),
			),
		set_text_binding: (params) =>
			pythonDispatch(
				editorTools.UEUMGTool("set_text_block_binding", {
					widget_name: widgetBlueprintParam(params),
					text_block_name: requiredStringParam(params, ["text_block_name"]),
					binding_property: optionalStringParam(params, ["binding_property"]),
					function_name: optionalStringParam(params, ["function_name"]),
					source_property: optionalStringParam(params, ["source_property"]),
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
