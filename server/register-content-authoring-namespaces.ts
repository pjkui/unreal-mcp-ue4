import { RegistrationContext } from "./registration-context.js"

export function registerContentAuthoringNamespaces(ctx: RegistrationContext) {
	const {
		blueprintNameParam,
		editorTools,
		optionalStringParam,
		pythonDispatch,
		registerToolNamespace,
		requiredStringParam,
		toColorArray,
		toRotatorArray,
		toVector2Array,
		toVector2Record,
		toVector3Array,
		widgetBlueprintParam,
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

	registerToolNamespace(
		"manage_widget",
		ctx.toolDescription("manage_widget"),
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
			add_to_viewport: (params) =>
				pythonDispatch(
					editorTools.UEUMGTool("add_widget_to_viewport", {
						widget_name: widgetBlueprintParam(params),
						z_order: params.z_order,
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
}
