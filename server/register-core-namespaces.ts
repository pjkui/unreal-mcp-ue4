import { RegistrationContext } from "./registration-context.js"

export function registerCoreNamespaces(ctx: RegistrationContext) {
	const {
		actorNameParam,
		blueprintNameParam,
		directDispatch,
		editorTools,
		optionalStringParam,
		pythonDispatch,
		recordSchema,
		registerToolNamespace,
		requiredStringParam,
		searchAssetsCommand,
		sourceControlFileListParam,
		sourceControlFileParam,
		sourceControlFilesCommand,
		sourceControlPackageListParam,
		stringListSchema,
		textResponse,
		toolDescription,
		toolNamespaceRegistry,
		toColorArray,
		toColorRecord,
		toRotatorArray,
		toRotatorRecord,
		toVector2Array,
		toVector2Record,
		toVector3Array,
		toVector3Record,
		vector2InputSchema,
		vector3InputSchema,
		rotatorInputSchema,
		widgetBlueprintParam,
		colorInputSchema,
		worldBuildBaseSchema,
		worldBuildCommand,
	} = ctx

registerToolNamespace(
	"manage_asset",
	toolDescription("manage_asset"),
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
	toolDescription("manage_actor"),
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
	toolDescription("manage_editor"),
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
	toolDescription("manage_level"),
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
	toolDescription("manage_system"),
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
	toolDescription("manage_inspection"),
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
		map: () => pythonDispatch(editorTools.UEGetMapInfo()),
	},
)

registerToolNamespace(
	"manage_tools",
	toolDescription("manage_tools"),
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


registerToolNamespace(
	"manage_source_control",
	toolDescription("manage_source_control"),
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

}
