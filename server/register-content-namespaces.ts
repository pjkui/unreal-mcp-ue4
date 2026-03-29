import { RegistrationContext } from "./registration-context.js"

export function registerContentNamespaces(ctx: RegistrationContext) {
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
	"manage_skeleton",
	toolDescription("manage_skeleton"),
	{
		search_skeletons: (params) => pythonDispatch(searchAssetsCommand(params, "Skeleton")),
		search_skeletal_meshes: (params) =>
			pythonDispatch(searchAssetsCommand(params, "SkeletalMesh")),
		asset_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerToolNamespace(
	"manage_material_authoring",
	toolDescription("manage_material_authoring"),
	{
		list_materials: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("get_available_materials", {
					search_term: optionalStringParam(params, ["search_term", "query"]),
					include_engine: params.include_engine,
					limit: params.limit,
				}),
			),
		apply_to_actor: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("apply_material_to_actor", {
					actor_name: actorNameParam(params),
					component_name: optionalStringParam(params, ["component_name"]),
					material_path: requiredStringParam(params, ["material_path"]),
					slot_index: params.slot_index,
				}),
			),
		apply_to_blueprint: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("apply_material_to_blueprint", {
					blueprint_name: blueprintNameParam(params),
					component_name: requiredStringParam(params, ["component_name"]),
					material_path: requiredStringParam(params, ["material_path"]),
					slot_index: params.slot_index,
				}),
			),
		tint_material: (params) =>
			pythonDispatch(
				editorTools.UEMaterialTool("set_mesh_material_color", {
					actor_name: optionalStringParam(params, ["actor_name", "name"]),
					blueprint_name: optionalStringParam(params, ["blueprint_name", "asset_path"]),
					component_name: optionalStringParam(params, ["component_name"]),
					material_path: optionalStringParam(params, ["material_path"]),
					slot_index: params.slot_index,
					color: toColorArray(params.color as any),
					parameter_name: optionalStringParam(params, ["parameter_name"]),
					instance_name: optionalStringParam(params, ["instance_name"]),
					instance_path: optionalStringParam(params, ["instance_path"]),
				}),
			),
	},
)

registerToolNamespace(
	"manage_texture",
	toolDescription("manage_texture"),
	{
		search_textures: (params) => pythonDispatch(searchAssetsCommand(params, "Texture")),
		texture_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
		import_texture: (params) =>
			pythonDispatch(
				editorTools.UETextureTool("import_texture", {
					source_file: requiredStringParam(params, ["source_file", "file_path", "local_path"]),
					destination_path: optionalStringParam(params, ["destination_path", "content_path", "path"]),
					asset_name: optionalStringParam(params, ["asset_name", "name"]),
					replace_existing:
						typeof params.replace_existing === "boolean" ? params.replace_existing : true,
					save: typeof params.save === "boolean" ? params.save : true,
				}),
			),
	},
)

registerToolNamespace(
	"manage_data",
	toolDescription("manage_data"),
	{
		search_data_assets: (params) =>
			pythonDispatch(
				editorTools.UEDataTool("search_data_assets", {
					search_term: optionalStringParam(params, ["search_term", "query", "pattern", "name"]) ?? "",
					include_engine: Boolean(params.include_engine),
					limit: params.limit,
				}),
			),
		asset_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
		create_data_asset: (params) =>
			pythonDispatch(
				editorTools.UEDataTool("create_data_asset", {
					name: requiredStringParam(params, ["name", "asset_name"]),
					path: optionalStringParam(params, ["path"]),
					data_asset_class: optionalStringParam(params, ["data_asset_class", "class_name"]),
				}),
			),
		create_data_table: (params) =>
			pythonDispatch(
				editorTools.UEDataTool("create_data_table", {
					name: requiredStringParam(params, ["name", "asset_name"]),
					path: optionalStringParam(params, ["path"]),
					row_struct: requiredStringParam(params, ["row_struct", "struct"]),
				}),
			),
		create_string_table: (params) =>
			pythonDispatch(
				editorTools.UEDataTool("create_string_table", {
					name: requiredStringParam(params, ["name", "asset_name"]),
					path: optionalStringParam(params, ["path"]),
				}),
			),
	},
)

registerToolNamespace(
	"manage_blueprint",
	toolDescription("manage_blueprint"),
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
	"manage_sequence",
	toolDescription("manage_sequence"),
	{
		create_sequence: (params) =>
			pythonDispatch(
				editorTools.UEContentFactoryTool("create_level_sequence", {
					name: requiredStringParam(params, ["name", "asset_name"]),
					path: optionalStringParam(params, ["path"]),
				}),
			),
		search_sequences: (params) => pythonDispatch(searchAssetsCommand(params, "LevelSequence")),
		sequence_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerToolNamespace(
	"manage_audio",
	toolDescription("manage_audio"),
	{
		import_audio: (params) =>
			pythonDispatch(
				editorTools.UEContentFactoryTool("import_audio", {
					source_file: requiredStringParam(params, ["source_file", "file_path", "local_path"]),
					destination_path: optionalStringParam(params, ["destination_path", "content_path", "path"]),
					asset_name: optionalStringParam(params, ["asset_name", "name"]),
					replace_existing:
						typeof params.replace_existing === "boolean" ? params.replace_existing : true,
					save: typeof params.save === "boolean" ? params.save : true,
					auto_create_cue:
						typeof params.auto_create_cue === "boolean" ? params.auto_create_cue : true,
					cue_suffix: optionalStringParam(params, ["cue_suffix"]),
				}),
			),
		search_audio_assets: (params) => pythonDispatch(searchAssetsCommand(params, "SoundCue")),
		audio_info: (params) =>
			pythonDispatch(
				editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
			),
	},
)

registerToolNamespace(
	"manage_widget_authoring",
	toolDescription("manage_widget_authoring"),
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
