import { RegistrationContext } from "./registration-context.js"

export function registerWorldNavigationVolumeNamespaces(ctx: RegistrationContext) {
	const {
		actorNameParam,
		editorTools,
		optionalStringParam,
		pythonDispatch,
		registerToolNamespace,
		toRotatorArray,
		toRotatorRecord,
		toVector3Array,
		toVector3Record,
	} = ctx

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
}
