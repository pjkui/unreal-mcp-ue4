import { RegistrationContext } from "./registration-context.js"

export function registerWorldUtilityNamespaces(ctx: RegistrationContext) {
	const {
		actorNameParam,
		editorTools,
		optionalStringParam,
		pythonDispatch,
		registerToolNamespace,
		requiredStringParam,
		toColorArray,
		toRotatorArray,
		toRotatorRecord,
		toVector3Array,
		toVector3Record,
	} = ctx

	registerToolNamespace(
		"manage_lighting",
		ctx.toolDescription("manage_lighting"),
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
		"manage_volumes",
		ctx.toolDescription("manage_volumes"),
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
		ctx.toolDescription("manage_navigation"),
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
		"manage_splines",
		ctx.toolDescription("manage_splines"),
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
		"manage_effect",
		ctx.toolDescription("manage_effect"),
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
