import fs from "node:fs"
import path from "node:path"

export function readEditorScript(filePath: string): string {
	return fs.readFileSync(path.join(__dirname, filePath), "utf8")
}

export function buildOrderedPrelude(relativeDir: string): string {
	const absoluteDir = path.join(__dirname, relativeDir)
	if (!fs.existsSync(absoluteDir)) {
		return ""
	}

	return fs
		.readdirSync(absoluteDir)
		.filter((fileName) => fileName.endsWith(".py"))
		.sort()
		.map((fileName) => readEditorScript(`${relativeDir}/${fileName}`))
		.join("\n\n")
}

function buildFilteredPrelude(relativeDir: string, prefixFilter: (name: string) => boolean): string {
	const absoluteDir = path.join(__dirname, relativeDir)
	if (!fs.existsSync(absoluteDir)) {
		return ""
	}

	return fs
		.readdirSync(absoluteDir)
		.filter((fileName) => fileName.endsWith(".py") && prefixFilter(fileName))
		.sort()
		.map((fileName) => readEditorScript(`${relativeDir}/${fileName}`))
		.join("\n\n")
}

const isCore = (f: string) => f < "09"
const isWidget = (f: string) => f >= "09" && f < "18"
const isBlueprint = (f: string) => f >= "18" && f < "25"
const isReporting = (f: string) => f >= "25"

/**
 * Layered compat preludes — scripts should pull only what they need.
 *
 * - compatCore  (00-04, ~16 KB): asset helpers, editor world, property utils
 * - compatWidget (09-12, ~21 KB): widget class/tree/editing/creation
 * - compatBlueprint (18-24, ~44 KB): blueprint components, graphs, persistence
 * - compatReporting (25-31, ~20 KB): actor/material reporting, physics shapes
 * - compat (all, ~108 KB): full prelude (legacy, avoid in new code)
 */
export const editorPreludes = {
	compatCore: buildFilteredPrelude("./scripts/ue_compat", isCore),
	compatWidget: buildFilteredPrelude("./scripts/ue_compat", isWidget),
	compatBlueprint: buildFilteredPrelude("./scripts/ue_compat", isBlueprint),
	compatReporting: buildFilteredPrelude("./scripts/ue_compat", isReporting),
	compat: buildOrderedPrelude("./scripts/ue_compat"),
	actor: buildOrderedPrelude("./scripts/ue_actor"),
	blueprint: buildOrderedPrelude("./scripts/ue_blueprint"),
	blueprintGraph: buildOrderedPrelude("./scripts/ue_blueprint_graph"),
	contentFactory: buildOrderedPrelude("./scripts/ue_content_factory"),
	data: buildOrderedPrelude("./scripts/ue_data"),
	material: buildOrderedPrelude("./scripts/ue_material"),
	sourceControl: buildOrderedPrelude("./scripts/ue_source_control"),
	umg: buildOrderedPrelude("./scripts/ue_umg"),
	worldBuilding: buildOrderedPrelude("./scripts/ue_world_building"),
}
