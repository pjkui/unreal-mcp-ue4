import fs from "node:fs"
import path from "node:path"

interface ToolInfo {
	category: string
	description: string
	index: number
	name: string
}

const categoryOrder = [
	"Connection & Setup",
	"Editor & Asset Tools",
	"Actor / Level Tools",
	"Physics & Materials Tools",
	"Blueprint Analysis Tools",
	"Blueprint Asset / Component Tools",
	"Blueprint Node Graph Tools",
	"Blueprint Graph Editing Tools",
	"Project / Input Tools",
	"World Building Tools",
	"Epic Structures Tools",
	"Level Design Tools",
	"UMG Tools",
	"Domain Tools",
]

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
		toolName === "control_actor" ||
		toolName === "control_editor" ||
		toolName === "manage_level" ||
		toolName === "system_control" ||
		toolName === "inspect" ||
		toolName === "manage_pipeline" ||
		toolName === "manage_tools" ||
		toolName === "manage_lighting" ||
		toolName === "manage_level_structure" ||
		toolName === "manage_volumes" ||
		toolName === "manage_navigation" ||
		toolName === "build_environment" ||
		toolName === "manage_splines" ||
		toolName === "animation_physics" ||
		toolName === "manage_skeleton" ||
		toolName === "manage_geometry" ||
		toolName === "manage_effect" ||
		toolName === "manage_material_authoring" ||
		toolName === "manage_texture" ||
		toolName === "manage_blueprint" ||
		toolName === "manage_sequence" ||
		toolName === "manage_performance" ||
		toolName === "manage_audio" ||
		toolName === "manage_input" ||
		toolName === "manage_behavior_tree" ||
		toolName === "manage_ai" ||
		toolName === "manage_gas" ||
		toolName === "manage_character" ||
		toolName === "manage_combat" ||
		toolName === "manage_inventory" ||
		toolName === "manage_interaction" ||
		toolName === "manage_widget_authoring" ||
		toolName === "manage_networking" ||
		toolName === "manage_game_framework" ||
		toolName === "manage_sessions"
	) {
		return "Domain Tools"
	}

	if (toolName.includes("umg") || toolName.includes("widget")) {
		return "UMG Tools"
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
		return "Connection & Setup"
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

	return activeCategory ?? fallbackCategory(toolName)
}

function extractToolsFromSourceFile(): ToolInfo[] {
	const indexPath = path.join(__dirname, "../../server/index.ts")
	const content = fs.readFileSync(indexPath, "utf-8")
	const markers = extractCategoryMarkers(content)
	const toolRegex =
		/(?:server\.tool|registerPythonTool|registerZeroArgPythonTool|registerDomainTool)\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g

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

function generateToolsTable(tools: ToolInfo[]): string {
	const header = "| Tool | Description |\n|------|-------------|\n"
	const rows = tools.map((tool) => `| \`${tool.name}\` | ${tool.description} |`).join("\n")
	return header + rows
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

function updateReadmeWithTools() {
	const readmePath = path.join(__dirname, "../../README.md")
	const readmeContent = fs.readFileSync(readmePath, "utf-8")

	const tools = extractToolsFromSourceFile()
	const toolsSection = `## 🛠️ Available Tools

${generateToolsSections(tools)}

`

	const updatedContent = replaceToolsSection(readmeContent, toolsSection)

	fs.writeFileSync(readmePath, updatedContent)
	console.log(`Updated README.md with ${tools.length} tools`)
}

function replaceToolsSection(content: string, toolsSection: string): string {
	const sectionHeaderRegex = /^##(?:\s+🛠️)?\s+Available Tools\s*$/m
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
		"## 🤝 Contributing",
		"## Contributing",
		"## 📄 License",
		"## License",
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
