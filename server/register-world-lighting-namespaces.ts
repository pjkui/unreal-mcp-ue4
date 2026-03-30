import { RegistrationContext } from "./registration-context.js"

export function registerWorldLightingNamespaces(ctx: RegistrationContext) {
	const {
		actorNameParam,
		editorTools,
		optionalStringParam,
		pythonDispatch,
		registerToolNamespace,
		toRotatorArray,
		toVector3Array,
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
}
