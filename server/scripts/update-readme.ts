import fs from "node:fs"
import path from "node:path"

interface ToolInfo {
	category: string
	description: string
	index: number
	name: string
}

type SupportStatus = "Supported" | "Partial"

interface ToolSupportInfo {
	note?: string
	status: SupportStatus
}

interface ExcludedCapabilityInfo {
	affectedSurface: string
	capability: string
	reason: string
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

const categoryOrder = [
	"Editor Session Paths",
	"Actor / Level Tools",
	"Core Tool Namespaces",
	"World & Environment Tool Namespaces",
	"Content & Authoring Tool Namespaces",
	"Gameplay & Systems Tool Namespaces",
]

const toolSupport: Record<string, ToolSupportInfo> = {
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
	analyze_blueprint_graph: {
		status: "Partial",
		note: "Only Blueprint graphs exposed by UE4.27 Python can be inspected.",
	},
	get_blueprint_variable_details: {
		status: "Partial",
		note: "Reads existing variable metadata only when UE4.27 Python exposes it.",
	},
	get_blueprint_function_details: {
		status: "Partial",
		note: "Only function graphs exposed by UE4.27 Python can be inspected.",
	},
	add_component_to_blueprint: {
		status: "Partial",
		note: "Basic component adds work; parent_component_name and some hierarchy edits require SimpleConstructionScript exposure.",
	},
	connect_blueprint_nodes: {
		status: "Partial",
		note: "Requires Blueprint graphs and pins to be visible through UE4.27 Python.",
	},
	find_blueprint_nodes: {
		status: "Partial",
		note: "Searches only the Blueprint graphs that UE4.27 Python exposes.",
	},
	connect_nodes: {
		status: "Partial",
		note: "Requires Blueprint graphs and pins to be visible through UE4.27 Python.",
	},
	disconnect_nodes: {
		status: "Partial",
		note: "Requires Blueprint graphs and pins to be visible through UE4.27 Python.",
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
		note: "Asset, actor, project, and map inspection work; Blueprint graph inspection is limited by UE4.27 Python exposure.",
	},
	manage_blueprint: {
		status: "Partial",
		note: "Blueprint asset and component edits work; graph inspection and pin wiring remain limited by UE4.27 Python exposure, and unsupported node or variable creation helpers are excluded from the MCP surface.",
	},
	manage_widget_authoring: {
		status: "Partial",
		note: "create_widget_blueprint, add_text_block, and add_button work; add_to_viewport requires PIE, and unsupported binding helpers are excluded from the MCP surface.",
	},
	manage_source_control: {
		status: "Supported",
		note: "provider_info works broadly, but file and package operations require a configured and available Unreal source-control provider.",
	},
}

const excludedCapabilities: ExcludedCapabilityInfo[] = [
	{
		capability: "Blueprint event-graph event insertion",
		affectedSurface:
			"Related event-node and input-action helpers are excluded from the MCP surface.",
		reason:
			"The current UE4.27 Python environment does not expose reliable event graph access or K2 event reference setup.",
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

function supportForTool(name: string): ToolSupportInfo {
	return toolSupport[name] ?? {
		status: "Supported",
	}
}

function extractCategoryMarkers(content: string) {
	const markers: Array<{ category: string; index: number }> = []
	const categoryRegex = /^\s*\/\/\/\s+(.+)$/gm

	for (const match of content.matchAll(categoryRegex)) {
		markers.push({
			category: match[1].trim(),
			index: match.index ?? 0,
		})
	}

	return markers
}

function fallbackCategory(toolName: string): string {
	if (
		toolName === "manage_asset" ||
		toolName === "manage_actor" ||
		toolName === "manage_editor" ||
		toolName === "manage_level" ||
		toolName === "manage_system" ||
		toolName === "manage_inspection" ||
		toolName === "manage_tools" ||
		toolName === "manage_source_control"
	) {
		return "Core Tool Namespaces"
	}

	if (
		toolName === "manage_lighting" ||
		toolName === "manage_level_structure" ||
		toolName === "manage_volumes" ||
		toolName === "manage_navigation" ||
		toolName === "manage_environment" ||
		toolName === "manage_splines" ||
		toolName === "manage_geometry" ||
		toolName === "manage_effect"
	) {
		return "World & Environment Tool Namespaces"
	}

	if (
		toolName === "manage_data" ||
		toolName === "manage_skeleton" ||
		toolName === "manage_material_authoring" ||
		toolName === "manage_texture" ||
		toolName === "manage_blueprint" ||
		toolName === "manage_sequence" ||
		toolName === "manage_audio" ||
		toolName === "manage_widget_authoring"
	) {
		return "Content & Authoring Tool Namespaces"
	}

	if (
		toolName === "manage_animation_physics" ||
		toolName === "manage_input" ||
		toolName === "manage_behavior_tree" ||
		toolName === "manage_gas"
	) {
		return "Gameplay & Systems Tool Namespaces"
	}

	if (toolName.includes("umg") || toolName.includes("widget")) {
		return "UMG Tools"
	}

	if (toolName.includes("source_control")) {
		return "Source Control Tools"
	}

	if (toolName.includes("material") || toolName.includes("physics")) {
		return "Physics & Materials Tools"
	}

	if (toolName.includes("blueprint")) {
		if (
			toolName.includes("read_") ||
			toolName.includes("analyze_") ||
			toolName.includes("variable_details") ||
			toolName.includes("function_details")
		) {
			return "Blueprint Analysis Tools"
		}

		if (
			toolName === "add_node" ||
			toolName === "connect_nodes" ||
			toolName === "disconnect_nodes" ||
			toolName === "create_variable"
		) {
			return "Blueprint Graph Editing Tools"
		}

		if (toolName.includes("node") || toolName.includes("self_reference")) {
			return "Blueprint Node Graph Tools"
		}
		return "Blueprint Asset / Component Tools"
	}

	if (toolName.includes("input")) {
		return "Project / Input Tools"
	}

	if (
		toolName.includes("create_town") ||
		toolName.includes("construct_house") ||
		toolName.includes("construct_mansion") ||
		toolName.includes("create_tower") ||
		toolName.includes("create_arch") ||
		toolName.includes("create_staircase")
	) {
		return "World Building Tools"
	}

	if (
		toolName.includes("create_castle_fortress") ||
		toolName.includes("create_suspension_bridge") ||
		toolName.includes("create_aqueduct") ||
		toolName.includes("create_bridge")
	) {
		return "Epic Structures Tools"
	}

	if (
		toolName.includes("create_maze") ||
		toolName.includes("create_pyramid") ||
		toolName.includes("create_wall")
	) {
		return "Level Design Tools"
	}

	if (
		toolName.includes("actor") ||
		toolName.includes("world") ||
		toolName.includes("map") ||
		toolName.includes("camera") ||
		toolName.includes("screenshot")
	) {
		return "Actor / Level Tools"
	}

	if (
		toolName.includes("asset") ||
		toolName.includes("project") ||
		toolName.includes("console") ||
		toolName.includes("python")
	) {
		return "Editor & Asset Tools"
	}

	if (toolName.includes("path")) {
		return "Editor Session Paths"
	}

	return "Editor & Asset Tools"
}

function categoryForIndex(
	markers: Array<{ category: string; index: number }>,
	matchIndex: number,
	toolName: string,
): string {
	let activeCategory: string | undefined

	for (const marker of markers) {
		if (marker.index > matchIndex) {
			break
		}
		activeCategory = marker.category
	}

	if (activeCategory === "Tool Namespaces") {
		return fallbackCategory(toolName)
	}

	return activeCategory ?? fallbackCategory(toolName)
}

function extractToolsFromSourceFile(): ToolInfo[] {
	const indexPath = path.join(__dirname, "../../server/index.ts")
	const content = fs.readFileSync(indexPath, "utf-8")
	const markers = extractCategoryMarkers(content)
	const toolRegex =
		/(?:server\.tool|registerPythonTool|registerZeroArgPythonTool|registerToolNamespace)\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g

	const tools: ToolInfo[] = []
	for (const match of content.matchAll(toolRegex)) {
		const name = match[1]
		const description = match[2].split(". ")[0].split("\\n")[0].split("\n")[0]
		const index = match.index ?? 0

		tools.push({
			category: categoryForIndex(markers, index, name),
			description,
			index,
			name,
		})
	}

	return tools.sort((a, b) => a.index - b.index)
}

function formatTableCell(value?: string): string {
	return value && value.trim() ? value.replace(/\|/g, "\\|") : "-"
}

function escapeHtml(value?: string, emptyValue: string = "-"): string {
	if (!value || !value.trim()) {
		return emptyValue
	}

	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
}

function generateToolsTable(tools: ToolInfo[]): string {
	const rows = tools
		.map((tool) => {
			const support = supportForTool(tool.name)
			return [
				"\t<tr>",
				`\t\t<td width="18%"><code>${escapeHtml(tool.name)}</code></td>`,
				`\t\t<td width="52%">${escapeHtml(tool.description)}</td>`,
				`\t\t<td width="30%">${escapeHtml(support.note, "&nbsp;")}</td>`,
				"\t</tr>",
			].join("\n")
		})
		.join("\n")

	return [
		'<table width="100%">',
		'\t<colgroup>',
		'\t\t<col width="18%">',
		'\t\t<col width="52%">',
		'\t\t<col width="30%">',
		'\t</colgroup>',
		'\t<thead>',
		'\t\t<tr>',
		'\t\t\t<th width="18%">Tool</th>',
		'\t\t\t<th width="52%">Description</th>',
		'\t\t\t<th width="30%">Notes</th>',
		'\t\t</tr>',
		'\t</thead>',
		'\t<tbody>',
		rows,
		'\t</tbody>',
		'</table>',
	].join("\n")
}

function generateToolsSections(tools: ToolInfo[]): string {
	const sections: string[] = []

	for (const category of categoryOrder) {
		const categoryTools = tools.filter((tool) => tool.category === category)
		if (categoryTools.length === 0) {
			continue
		}

		sections.push(`### ${category}\n\n${generateToolsTable(categoryTools)}`)
	}

	const uncategorizedTools = tools.filter((tool) => !categoryOrder.includes(tool.category))
	if (uncategorizedTools.length > 0) {
		sections.push(`### Other Tools\n\n${generateToolsTable(uncategorizedTools)}`)
	}

	return sections.join("\n\n")
}

function generateExcludedCapabilitiesTable(entries: ExcludedCapabilityInfo[]): string {
	const header =
		"| Capability Area | Effect on MCP Surface | Why It Is Excluded |\n|-----------------|-----------------------|---------------------|\n"
	const rows = entries
		.map((entry) => {
			return `| ${formatTableCell(entry.capability)} | ${formatTableCell(entry.affectedSurface)} | ${formatTableCell(entry.reason)} |`
		})
		.join("\n")
	return header + rows
}

function updateReadmeWithTools() {
	const readmePath = path.join(__dirname, "../../README.md")
	const readmeContent = fs.readFileSync(readmePath, "utf-8")

	const tools = extractToolsFromSourceFile()
	const toolsSection = `## Available Tools

Notes call out important requirements or UE4.27 limitations when they matter. Empty notes mean there are no additional caveats beyond normal editor setup.

${generateToolsSections(tools)}

### Excluded Capability Areas

These capability areas are intentionally not exposed through the MCP surface in this UE4.27 port because they fail reliably in the current Python environment and only add prompt or context overhead until a native bridge exists.

${generateExcludedCapabilitiesTable(excludedCapabilities)}

`

	const updatedContent = replaceToolsSection(readmeContent, toolsSection)

	fs.writeFileSync(readmePath, updatedContent)
	console.log(
		`Updated README.md with ${tools.length} tools and ${excludedCapabilities.length} excluded capability areas`,
	)
}

function replaceToolsSection(content: string, toolsSection: string): string {
	const sectionHeaderRegex = /^##.*Available Tools\s*$/m
	const headerMatch = sectionHeaderRegex.exec(content)

	if (!headerMatch || headerMatch.index === undefined) {
		return insertToolsSection(content, toolsSection)
	}

	const sectionStart = headerMatch.index
	const contentAfterHeader = content.slice(sectionStart + headerMatch[0].length)
	const nextTopLevelHeaderIndex = contentAfterHeader.search(/\n##\s/)
	const sectionEnd =
		nextTopLevelHeaderIndex === -1
			? content.length
			: sectionStart + headerMatch[0].length + nextTopLevelHeaderIndex + 1

	return content.slice(0, sectionStart) + toolsSection + content.slice(sectionEnd)
}

function insertToolsSection(content: string, toolsSection: string): string {
	const insertMarkers = [
		"## Contributing",
		"## License",
		"## ?뱞 License",
		"## ?쩃 Contributing",
	]
	const insertPoints = insertMarkers
		.map((marker) => ({ found: content.indexOf(marker), marker }))
		.filter((point) => point.found !== -1)
		.sort((a, b) => a.found - b.found)

	const insertPoint = insertPoints[0]
	return insertPoint
		? content.slice(0, insertPoint.found) + toolsSection + content.slice(insertPoint.found)
		: content + "\n" + toolsSection
}

updateReadmeWithTools()
