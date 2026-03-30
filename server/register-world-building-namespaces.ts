import { RegistrationContext } from "./registration-context.js"

export function registerWorldBuildingNamespaces(ctx: RegistrationContext) {
	const {
		editorTools,
		pythonDispatch,
		registerToolNamespace,
		worldBuildCommand,
	} = ctx

	registerToolNamespace(
		"manage_level",
		ctx.toolDescription("manage_level"),
		{
			info: () => pythonDispatch(editorTools.UEGetMapInfo()),
			world_outliner: () => pythonDispatch(editorTools.UEGetWorldOutliner()),
			list_actors: () => pythonDispatch(editorTools.UEActorTool("get_actors_in_level")),
			create_wall: (params) => pythonDispatch(worldBuildCommand("create_wall", params)),
			create_maze: (params) => pythonDispatch(worldBuildCommand("create_maze", params)),
			create_pyramid: (params) => pythonDispatch(worldBuildCommand("create_pyramid", params)),
			create_bridge: (params) => pythonDispatch(worldBuildCommand("create_bridge", params)),
			create_town: (params) => pythonDispatch(worldBuildCommand("create_town", params)),
		},
	)

	registerToolNamespace(
		"manage_level_structure",
		ctx.toolDescription("manage_level_structure"),
		{
			world_outliner: () => pythonDispatch(editorTools.UEGetWorldOutliner()),
			create_town: (params) => pythonDispatch(worldBuildCommand("create_town", params)),
			construct_house: (params) => pythonDispatch(worldBuildCommand("construct_house", params)),
			construct_mansion: (params) =>
				pythonDispatch(worldBuildCommand("construct_mansion", params)),
			create_tower: (params) => pythonDispatch(worldBuildCommand("create_tower", params)),
			create_wall: (params) => pythonDispatch(worldBuildCommand("create_wall", params)),
			create_bridge: (params) => pythonDispatch(worldBuildCommand("create_bridge", params)),
			create_suspension_bridge: (params) =>
				pythonDispatch(worldBuildCommand("create_suspension_bridge", params)),
			create_aqueduct: (params) => pythonDispatch(worldBuildCommand("create_aqueduct", params)),
			create_castle_fortress: (params) =>
				pythonDispatch(worldBuildCommand("create_castle_fortress", params)),
		},
	)

	registerToolNamespace(
		"manage_environment",
		ctx.toolDescription("manage_environment"),
		{
			create_town: (params) => pythonDispatch(worldBuildCommand("create_town", params)),
			create_arch: (params) => pythonDispatch(worldBuildCommand("create_arch", params)),
			create_staircase: (params) => pythonDispatch(worldBuildCommand("create_staircase", params)),
			create_pyramid: (params) => pythonDispatch(worldBuildCommand("create_pyramid", params)),
			create_maze: (params) => pythonDispatch(worldBuildCommand("create_maze", params)),
		},
	)

	registerToolNamespace(
		"manage_geometry",
		ctx.toolDescription("manage_geometry"),
		{
			create_wall: (params) => pythonDispatch(worldBuildCommand("create_wall", params)),
			create_arch: (params) => pythonDispatch(worldBuildCommand("create_arch", params)),
			create_staircase: (params) => pythonDispatch(worldBuildCommand("create_staircase", params)),
			create_pyramid: (params) => pythonDispatch(worldBuildCommand("create_pyramid", params)),
		},
	)
}
