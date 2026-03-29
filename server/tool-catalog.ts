export interface ToolCatalogEntry {
	category: string
	description: string
	name: string
}

export type SupportStatus = "Supported" | "Partial"

export interface ToolSupportInfo {
	note?: string
	status: SupportStatus
}

export interface ExcludedCapabilityInfo {
	affectedSurface: string
	capability: string
	reason: string
}

export const categoryOrder = [
	"Editor Session Info",
	"Core Direct Tools",
	"Core Tool Namespaces",
	"World & Environment Tool Namespaces",
	"Content & Authoring Tool Namespaces",
	"Gameplay & Systems Tool Namespaces",
] as const

export const toolCatalogEntries: ToolCatalogEntry[] = [
	{
		name: "get_unreal_engine_path",
		category: "Editor Session Info",
		description: "Get the active Unreal Engine root path from the connected editor session",
	},
	{
		name: "get_unreal_project_path",
		category: "Editor Session Info",
		description: "Get the active Unreal project file path from the connected editor session",
	},
	{
		name: "get_unreal_version",
		category: "Editor Session Info",
		description: "Get the active Unreal Engine version string from the connected editor session",
	},
	{
		name: "editor_create_object",
		category: "Core Direct Tools",
		description:
			"Create a new object/actor in the world\n\nExample output: {'success': true, 'actor_name': 'StaticMeshActor_1', 'actor_label': 'MyCube', 'class': 'StaticMeshActor', 'location': {'x': 100.0, 'y': 200.0, 'z': 0.0}, 'rotation': {'pitch': 0.0, 'yaw': 45.0, 'roll': 0.0}, 'scale': {'x': 1.0, 'y': 1.0, 'z': 1.0}}\n\nReturns created actor details with final transform values.",
	},
	{
		name: "editor_update_object",
		category: "Core Direct Tools",
		description:
			"Update an existing object/actor in the world\n\nExample output: {'success': true, 'actor_name': 'StaticMeshActor_1', 'actor_label': 'UpdatedCube', 'class': 'StaticMeshActor', 'location': {'x': 150.0, 'y': 200.0, 'z': 50.0}, 'rotation': {'pitch': 0.0, 'yaw': 90.0, 'roll': 0.0}, 'scale': {'x': 2.0, 'y': 2.0, 'z': 2.0}}\n\nReturns updated actor details with new transform values.",
	},
	{
		name: "editor_delete_object",
		category: "Core Direct Tools",
		description:
			"Delete an object/actor from the world\n\nExample output: {'success': true, 'message': 'Successfully deleted actor: MyCube', 'deleted_actor': {'actor_name': 'StaticMeshActor_1', 'actor_label': 'MyCube', 'class': 'StaticMeshActor', 'location': {'x': 100.0, 'y': 200.0, 'z': 0.0}}}\n\nReturns deletion confirmation with details of the deleted actor.",
	},
	{
		name: "manage_asset",
		category: "Core Tool Namespaces",
		description: "Asset tool namespace for list, search, info, references, export, and validation actions.",
	},
	{
		name: "manage_actor",
		category: "Core Tool Namespaces",
		description: "Actor tool namespace for listing, searching, spawning, deleting, transforming, and inspecting level actors.",
	},
	{
		name: "manage_editor",
		category: "Core Tool Namespaces",
		description: "Editor tool namespace for Python execution, console commands, project inspection, map inspection, PIE control, screenshots, and camera control.",
	},
	{
		name: "manage_level",
		category: "Core Tool Namespaces",
		description: "Level tool namespace for map inspection, actor listing, world outliner inspection, and preset structure creation actions.",
	},
	{
		name: "manage_system",
		category: "Core Tool Namespaces",
		description: "System tool namespace for console commands and asset validation actions.",
	},
	{
		name: "manage_inspection",
		category: "Core Tool Namespaces",
		description: "Inspection tool namespace for asset, actor, map, and basic Blueprint summary actions.",
	},
	{
		name: "manage_tools",
		category: "Core Tool Namespaces",
		description: "Tool-namespace registry for listing registered tool namespaces and describing supported actions. Use this as the discovery entry point for the namespace-first MCP surface.",
	},
	{
		name: "manage_source_control",
		category: "Core Tool Namespaces",
		description: "Source-control tool namespace for provider inspection and file or package source-control operations.",
	},
	{
		name: "manage_lighting",
		category: "World & Environment Tool Namespaces",
		description: "Lighting tool namespace for spawning common light actors, transforming them, and inspecting level lighting state.",
	},
	{
		name: "manage_level_structure",
		category: "World & Environment Tool Namespaces",
		description: "Level-structure tool namespace for preset town, house, mansion, tower, wall, bridge, and fortress construction actions.",
	},
	{
		name: "manage_volumes",
		category: "World & Environment Tool Namespaces",
		description: "Volume tool namespace for spawning common engine volumes and applying delete or transform actions.",
	},
	{
		name: "manage_navigation",
		category: "World & Environment Tool Namespaces",
		description: "Navigation tool namespace for spawning navigation volumes and proxies plus basic map inspection actions.",
	},
	{
		name: "manage_environment",
		category: "World & Environment Tool Namespaces",
		description: "Environment-building tool namespace for preset town, arch, staircase, pyramid, and maze generation actions.",
	},
	{
		name: "manage_splines",
		category: "World & Environment Tool Namespaces",
		description: "Spline tool namespace for spawning a spline-host actor or Blueprint and then transforming or deleting it.",
	},
	{
		name: "manage_geometry",
		category: "World & Environment Tool Namespaces",
		description: "Geometry tool namespace for wall, arch, staircase, and pyramid preset construction actions.",
	},
	{
		name: "manage_effect",
		category: "World & Environment Tool Namespaces",
		description: "Effects tool namespace for spawning debug-shape actors, assigning materials, tinting them, and deleting them.",
	},
	{
		name: "manage_skeleton",
		category: "Content & Authoring Tool Namespaces",
		description: "Skeleton tool namespace for searching Skeleton and SkeletalMesh assets and inspecting their metadata.",
	},
	{
		name: "manage_material_authoring",
		category: "Content & Authoring Tool Namespaces",
		description: "Material tool namespace for listing materials, applying them to actors or Blueprints, and tinting them with material instances.",
	},
	{
		name: "manage_texture",
		category: "Content & Authoring Tool Namespaces",
		description: "Texture tool namespace for searching texture assets, importing image files as textures, and reading their asset metadata.",
	},
	{
		name: "manage_data",
		category: "Content & Authoring Tool Namespaces",
		description: "Data tool namespace for searching data assets, creating common data containers, and inspecting their asset metadata.",
	},
	{
		name: "manage_blueprint",
		category: "Content & Authoring Tool Namespaces",
		description: "Blueprint tool namespace for Blueprint creation, component editing, compilation, and basic Blueprint summary actions.",
	},
	{
		name: "manage_sequence",
		category: "Content & Authoring Tool Namespaces",
		description: "Sequence tool namespace for creating, searching, and inspecting LevelSequence assets.",
	},
	{
		name: "manage_audio",
		category: "Content & Authoring Tool Namespaces",
		description: "Audio tool namespace for importing audio files, searching audio assets, and inspecting their asset metadata.",
	},
	{
		name: "manage_widget_authoring",
		category: "Content & Authoring Tool Namespaces",
		description: "Widget tool namespace for UMG Blueprint creation, widget-tree edits, and viewport spawning actions. Use add_child_widget for typical nested layout work under an existing root such as CanvasPanel_0; add_widget without parent_widget_name is only for assigning a new root widget.",
	},
	{
		name: "manage_animation_physics",
		category: "Gameplay & Systems Tool Namespaces",
		description: "Animation-and-physics tool namespace for physics Blueprint spawning, Blueprint physics settings, and Blueprint compilation actions.",
	},
	{
		name: "manage_input",
		category: "Gameplay & Systems Tool Namespaces",
		description: "Input tool namespace for creating classic UE4 input mappings.",
	},
	{
		name: "manage_behavior_tree",
		category: "Gameplay & Systems Tool Namespaces",
		description: "Behavior-tree tool namespace for creating, searching, and inspecting BehaviorTree assets.",
	},
	{
		name: "manage_gas",
		category: "Gameplay & Systems Tool Namespaces",
		description: "GAS tool namespace for searching gameplay-ability-related assets and inspecting their asset metadata.",
	},
]

export const toolCatalog = Object.fromEntries(
	toolCatalogEntries.map((entry) => [entry.name, entry]),
) as Record<string, ToolCatalogEntry>

export const toolDescription = (name: string) => {
	const entry = toolCatalog[name]
	if (!entry) {
		throw new Error(`Unknown tool metadata: ${name}`)
	}

	return entry.description
}

const sourceControlProviderNote =
	"Requires a configured and available Unreal source-control provider in the active editor session."

const sourceControlQueryNote =
	"Returns structured state even when source control is disabled, but meaningful revision status requires a configured and available provider."

const sourceControlPackageReloadNote =
	"Requires a configured and available Unreal source-control provider plus valid long package names to reload."

const sourceControlProviderDependentTools = [
	"check_out_file",
	"check_out_files",
	"check_out_or_add_file",
	"check_out_or_add_files",
	"mark_file_for_add",
	"mark_files_for_add",
	"mark_file_for_delete",
	"mark_files_for_delete",
	"revert_file",
	"revert_files",
	"revert_unchanged_files",
	"sync_file",
	"sync_files",
	"check_in_files",
] as const

export const toolSupport: Record<string, ToolSupportInfo> = {
	...Object.fromEntries(
		sourceControlProviderDependentTools.map((name) => [
			name,
			{
				status: "Supported" as const,
				note: sourceControlProviderNote,
			},
		]),
	),
	get_source_control_provider: {
		status: "Supported",
		note: "Reports provider name plus enabled or available status even when source control is disabled.",
	},
	query_source_control_state: {
		status: "Supported",
		note: sourceControlQueryNote,
	},
	query_source_control_states: {
		status: "Supported",
		note: sourceControlQueryNote,
	},
	revert_and_reload_packages: {
		status: "Supported",
		note: sourceControlPackageReloadNote,
	},
	read_blueprint_content: {
		status: "Partial",
		note: "Blueprint graph listings depend on what UE4.27 Python exposes; asset and component reads still work.",
	},
	add_component_to_blueprint: {
		status: "Partial",
		note: "Basic component adds work; parent_component_name and some hierarchy edits require SimpleConstructionScript exposure.",
	},
	editor_umg_add_widget: {
		status: "Partial",
		note: "Widget tree edits work, but nested UserWidget subclasses are not supported and positioning is reliable only on CanvasPanel children.",
	},
	editor_umg_set_widget_position: {
		status: "Partial",
		note: "Only widgets attached to CanvasPanel slots can be repositioned.",
	},
	editor_umg_reparent_widget: {
		status: "Partial",
		note: "Cannot reparent the current root widget, and CanvasPanel slot positioning rules still apply after reparenting.",
	},
	editor_umg_add_child_widget: {
		status: "Partial",
		note: "Supports native widget classes; nested UserWidget subclasses are not supported, and positioning is reliable only on CanvasPanel children.",
	},
	editor_umg_set_child_widget_position: {
		status: "Partial",
		note: "Only direct children attached to CanvasPanel slots can be repositioned.",
	},
	add_widget_to_viewport: {
		status: "Partial",
		note: "Requires an active PIE or game world and successful UserWidget instancing in the editor session.",
	},
	manage_inspection: {
		status: "Partial",
		note: "Asset, actor, and map inspection work; Blueprint inspection is limited to high-level asset summaries in stock UE4.27 Python.",
	},
	manage_editor: {
		status: "Supported",
		note: "Canonical namespace for project_info, map_info, world_outliner, PIE control, console_command, and run_python.",
	},
	manage_system: {
		status: "Supported",
		note: "Slim namespace for console and validation helpers; use manage_editor for canonical project and map inspection.",
	},
	manage_blueprint: {
		status: "Partial",
		note: "Blueprint asset and component edits work; graph inspection, pin wiring, and variable or function metadata helpers are excluded from the MCP surface in stock UE4.27 Python.",
	},
	manage_widget_authoring: {
		status: "Partial",
		note: "create_widget_blueprint, add_text_block, and add_button work; use add_child_widget for normal nested layout under an existing root such as CanvasPanel_0, while add_widget without parent_widget_name is only for assigning a new root. add_to_viewport requires PIE, and unsupported binding helpers are excluded from the MCP surface.",
	},
	manage_texture: {
		status: "Supported",
		note: "import_texture requires a local image file path that is accessible from the machine running the Unreal Editor session.",
	},
	manage_input: {
		status: "Supported",
		note: "Focused on classic UE4 input-mapping authoring; use manage_editor.project_info for the canonical project summary.",
	},
	manage_behavior_tree: {
		status: "Supported",
		note: "Focused on BehaviorTree asset discovery and inspection; use manage_editor.project_info for the canonical project summary.",
	},
	manage_source_control: {
		status: "Supported",
		note: "provider_info works broadly, but file and package operations require a configured and available Unreal source-control provider.",
	},
}

export const supportForTool = (name: string): ToolSupportInfo =>
	toolSupport[name] ?? {
		status: "Supported",
	}

export const excludedCapabilities: ExcludedCapabilityInfo[] = [
	{
		capability: "Blueprint event-graph event insertion",
		affectedSurface:
			"Related event-node and input-action helpers are excluded from the MCP surface.",
		reason:
			"The current UE4.27 Python environment does not expose reliable event graph access or K2 event reference setup.",
	},
	{
		capability: "Blueprint graph inspection and node search",
		affectedSurface:
			"Graph-analysis, graph-inspection, and node-search helpers are excluded from the MCP surface.",
		reason:
			"The current UE4.27 Python environment does not expose Blueprint graph arrays such as UbergraphPages or FunctionGraphs reliably enough for deterministic inspection.",
	},
	{
		capability: "Low-level Blueprint graph node creation",
		affectedSurface:
			"Generic graph-node helpers and related self or component reference insertion helpers are excluded from the MCP surface.",
		reason:
			"The current UE4.27 Python environment does not expose stable low-level graph node creation or member-reference wiring.",
	},
	{
		capability: "Blueprint function-call node authoring",
		affectedSurface:
			"Function-node helpers that depend on editor graph member-reference setup are excluded from the MCP surface.",
		reason:
			"The current UE4.27 Python environment does not expose reliable function-call node reference setup.",
	},
	{
		capability: "Blueprint variable and function metadata inspection",
		affectedSurface:
			"Variable-detail and function-detail helpers are excluded from the MCP surface.",
		reason:
			"The current UE4.27 Python environment does not expose NewVariables or FunctionGraphs reliably enough for deterministic inspection.",
	},
	{
		capability: "Blueprint variable authoring",
		affectedSurface:
			"Variable-creation helpers are excluded from the MCP surface.",
		reason:
			"BPVariableDescription and EdGraphPinType are not exposed in the current UE4.27 Python environment.",
	},
	{
		capability: "UMG delegate-binding authoring",
		affectedSurface:
			"Widget event-binding and text-binding helpers are excluded from the MCP surface.",
		reason:
			"DelegateEditorBinding is not exposed in the current UE4.27 Python environment.",
	},
]
