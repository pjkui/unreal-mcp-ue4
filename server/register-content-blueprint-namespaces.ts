import { RegistrationContext } from "./registration-context.js"

export function registerContentBlueprintNamespaces(ctx: RegistrationContext) {
	const {
		blueprintNameParam,
		editorTools,
		optionalStringParam,
		pythonDispatch,
		registerToolNamespace,
		requiredStringParam,
		toRotatorArray,
		toVector3Array,
	} = ctx

	registerToolNamespace(
		"manage_blueprint",
		ctx.toolDescription("manage_blueprint"),
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
		},
	)
}
