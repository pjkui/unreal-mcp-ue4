import { RegistrationContext } from "./registration-context.js"

export function registerCoreSourceControlNamespaces(ctx: RegistrationContext) {
	const {
		editorTools,
		pythonDispatch,
		registerToolNamespace,
		requiredStringParam,
		sourceControlFileListParam,
		sourceControlFileParam,
		sourceControlFilesCommand,
		sourceControlPackageListParam,
	} = ctx

	registerToolNamespace(
		"manage_source_control",
		ctx.toolDescription("manage_source_control"),
		{
			provider_info: () =>
				pythonDispatch(editorTools.UESourceControlTool("get_source_control_provider")),
			query_state: (params) =>
				pythonDispatch(
					editorTools.UESourceControlTool("query_source_control_state", {
						file: sourceControlFileParam(params),
					}),
				),
			query_states: (params) =>
				pythonDispatch(
					editorTools.UESourceControlTool("query_source_control_states", {
						files: sourceControlFileListParam(params),
					}),
				),
			checkout: (params) =>
				pythonDispatch(
					sourceControlFilesCommand(
						sourceControlFileListParam(params),
						"check_out_file",
						"check_out_files",
					),
				),
			checkout_or_add: (params) =>
				pythonDispatch(
					sourceControlFilesCommand(
						sourceControlFileListParam(params),
						"check_out_or_add_file",
						"check_out_or_add_files",
					),
				),
			add: (params) =>
				pythonDispatch(
					sourceControlFilesCommand(
						sourceControlFileListParam(params),
						"mark_file_for_add",
						"mark_files_for_add",
					),
				),
			delete: (params) =>
				pythonDispatch(
					sourceControlFilesCommand(
						sourceControlFileListParam(params),
						"mark_file_for_delete",
						"mark_files_for_delete",
					),
				),
			revert: (params) =>
				pythonDispatch(
					sourceControlFilesCommand(
						sourceControlFileListParam(params),
						"revert_file",
						"revert_files",
					),
				),
			revert_unchanged: (params) =>
				pythonDispatch(
					editorTools.UESourceControlTool("revert_unchanged_files", {
						files: sourceControlFileListParam(params),
					}),
				),
			sync: (params) =>
				pythonDispatch(
					sourceControlFilesCommand(
						sourceControlFileListParam(params),
						"sync_file",
						"sync_files",
					),
				),
			submit: (params) =>
				pythonDispatch(
					editorTools.UESourceControlTool("check_in_files", {
						files: sourceControlFileListParam(params),
						description: requiredStringParam(params, ["description", "message"]),
						keep_checked_out: Boolean(params.keep_checked_out),
					}),
				),
			revert_and_reload_packages: (params) =>
				pythonDispatch(
					editorTools.UESourceControlTool("revert_and_reload_packages", {
						packages: sourceControlPackageListParam(params),
						revert_all: Boolean(params.revert_all),
						reload_world: Boolean(params.reload_world),
					}),
				),
		},
	)
}
