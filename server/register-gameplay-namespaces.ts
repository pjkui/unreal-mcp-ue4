import { RegistrationContext } from "./registration-context.js"

export function registerGameplayNamespaces(ctx: RegistrationContext) {
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
	"manage_animation_physics",
	toolDescription("manage_animation_physics"),
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
	"manage_input",
	toolDescription("manage_input"),
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

registerToolNamespace(
	"manage_behavior_tree",
	toolDescription("manage_behavior_tree"),
	{
		create_behavior_tree: (params) =>
			pythonDispatch(
				editorTools.UEContentFactoryTool("create_behavior_tree", {
					name: requiredStringParam(params, ["name", "asset_name"]),
					path: optionalStringParam(params, ["path"]),
				}),
			),
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
	toolDescription("manage_gas"),
	{
		search_gas_assets: (params) => pythonDispatch(searchAssetsCommand(params)),
		asset_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

}
