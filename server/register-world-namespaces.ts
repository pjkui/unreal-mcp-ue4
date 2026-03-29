import { RegistrationContext } from "./registration-context.js"

export function registerWorldNamespaces(ctx: RegistrationContext) {
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
	"manage_lighting",
	toolDescription("manage_lighting"),
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
	toolDescription("manage_level_structure"),
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
	toolDescription("manage_volumes"),
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
	toolDescription("manage_navigation"),
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
	toolDescription("manage_environment"),
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
	toolDescription("manage_splines"),
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

registerToolNamespace(
	"manage_geometry",
	toolDescription("manage_geometry"),
	{
		create_wall: (params) => pythonDispatch(worldBuildCommand("create_wall", params)),
		create_arch: (params) => pythonDispatch(worldBuildCommand("create_arch", params)),
		create_staircase: (params) => pythonDispatch(worldBuildCommand("create_staircase", params)),
		create_pyramid: (params) => pythonDispatch(worldBuildCommand("create_pyramid", params)),
	},
)

registerToolNamespace(
	"manage_effect",
	toolDescription("manage_effect"),
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

}
