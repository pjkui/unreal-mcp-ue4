import { RegistrationContext } from "./registration-context.js"

export function registerContentAssetNamespaces(ctx: RegistrationContext) {
	const {
		actorNameParam,
		blueprintNameParam,
		editorTools,
		optionalStringParam,
		pythonDispatch,
		registerToolNamespace,
		requiredStringParam,
		searchAssetsCommand,
		toColorArray,
	} = ctx

	registerToolNamespace(
		"manage_skeleton",
		ctx.toolDescription("manage_skeleton"),
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
		ctx.toolDescription("manage_material_authoring"),
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
		ctx.toolDescription("manage_texture"),
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
		ctx.toolDescription("manage_data"),
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
}
