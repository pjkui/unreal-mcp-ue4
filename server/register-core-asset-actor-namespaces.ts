import { RegistrationContext } from "./registration-context.js"

export function registerCoreAssetActorNamespaces(ctx: RegistrationContext) {
	const {
		actorNameParam,
		blueprintNameParam,
		editorTools,
		optionalStringParam,
		pythonDispatch,
		registerToolNamespace,
		requiredStringParam,
		searchAssetsCommand,
		toRotatorArray,
		toVector3Array,
	} = ctx

	registerToolNamespace(
		"manage_asset",
		ctx.toolDescription("manage_asset"),
		{
			list: (params) =>
				pythonDispatch(
					editorTools.UEListAssets(
						optionalStringParam(params, ["root_path", "path"]) ?? "/Game",
						typeof params.recursive === "boolean" ? params.recursive : true,
						typeof params.limit === "number" ? params.limit : undefined,
					),
				),
			search: (params) => pythonDispatch(searchAssetsCommand(params)),
			info: (params) =>
				pythonDispatch(
					editorTools.UEGetAssetInfo(requiredStringParam(params, ["asset_path", "path", "name"])),
				),
			references: (params) =>
				pythonDispatch(
					editorTools.UEGetAssetReferences(requiredStringParam(params, ["asset_path", "path", "name"])),
				),
			export: (params) =>
				pythonDispatch(
					editorTools.UEExportAsset(
						requiredStringParam(params, ["asset_path", "path", "name"]),
						optionalStringParam(params, ["destination_path", "file_path", "output_path"]),
						typeof params.overwrite === "boolean" ? params.overwrite : true,
					),
				),
			validate: (params) =>
				pythonDispatch(editorTools.UEValidateAssets(optionalStringParam(params, ["asset_paths", "paths"]))),
		},
	)

	registerToolNamespace(
		"manage_actor",
		ctx.toolDescription("manage_actor"),
		{
			list: () => pythonDispatch(editorTools.UEActorTool("get_actors_in_level")),
			find: (params) =>
				pythonDispatch(
					editorTools.UEActorTool("find_actors_by_name", {
						pattern: requiredStringParam(params, ["pattern", "name"]),
					}),
				),
			spawn: (params) =>
				pythonDispatch(
					editorTools.UEActorTool("spawn_actor", {
						type: optionalStringParam(params, ["type", "actor_type", "class_name"]) ?? "StaticMeshActor",
						name: optionalStringParam(params, ["name", "actor_name"]),
						location: toVector3Array(params.location),
						rotation: toRotatorArray(params.rotation),
					}),
				),
			spawn_blueprint: (params) =>
				pythonDispatch(
					editorTools.UEActorTool("spawn_blueprint_actor", {
						blueprint_name: blueprintNameParam(params),
						name: optionalStringParam(params, ["name", "actor_name"]),
						location: toVector3Array(params.location),
						rotation: toRotatorArray(params.rotation),
						scale: toVector3Array(params.scale),
						properties: params.properties,
					}),
				),
			delete: (params) =>
				pythonDispatch(
					editorTools.UEActorTool("delete_actor", {
						name: actorNameParam(params),
					}),
				),
			transform: (params) =>
				pythonDispatch(
					editorTools.UEActorTool("set_actor_transform", {
						name: actorNameParam(params),
						location: toVector3Array(params.location),
						rotation: toRotatorArray(params.rotation),
						scale: toVector3Array(params.scale),
					}),
				),
			get_properties: (params) =>
				pythonDispatch(
					editorTools.UEActorTool("get_actor_properties", {
						name: actorNameParam(params),
					}),
				),
			set_property: (params) =>
				pythonDispatch(
					editorTools.UEActorTool("set_actor_property", {
						name: actorNameParam(params),
						property_name: requiredStringParam(params, ["property_name"]),
						property_value: params.property_value,
					}),
				),
			get_material_info: (params) =>
				pythonDispatch(
					editorTools.UEActorTool("get_actor_material_info", {
						name: actorNameParam(params),
					}),
				),
		},
	)
}
