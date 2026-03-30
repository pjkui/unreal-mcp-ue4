import { RegistrationContext } from "./registration-context.js"

export function registerCoreEditorSystemNamespaces(ctx: RegistrationContext) {
	const {
		actorNameParam,
		blueprintNameParam,
		directDispatch,
		editorTools,
		pythonDispatch,
		registerToolNamespace,
		requiredStringParam,
		toRotatorRecord,
		toVector3Record,
		toolNamespaceRegistry,
	} = ctx

	registerToolNamespace(
		"manage_editor",
		ctx.toolDescription("manage_editor"),
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
		"manage_system",
		ctx.toolDescription("manage_system"),
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
				pythonDispatch(editorTools.UEValidateAssets(requiredStringParam(params, ["asset_paths", "paths"]))),
		},
	)

	registerToolNamespace(
		"manage_inspection",
		ctx.toolDescription("manage_inspection"),
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
		ctx.toolDescription("manage_tools"),
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
}
