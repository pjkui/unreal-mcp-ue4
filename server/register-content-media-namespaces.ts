import { RegistrationContext } from "./registration-context.js"

export function registerContentMediaNamespaces(ctx: RegistrationContext) {
	const {
		editorTools,
		optionalStringParam,
		pythonDispatch,
		registerToolNamespace,
		requiredStringParam,
		searchAssetsCommand,
	} = ctx

	registerToolNamespace(
		"manage_sequence",
		ctx.toolDescription("manage_sequence"),
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
		ctx.toolDescription("manage_audio"),
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
}
