import { RegistrationContext } from "./registration-context.js"

export function registerWorldEffectsSplineNamespaces(ctx: RegistrationContext) {
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
