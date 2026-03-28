import fs from "node:fs"
import path from "node:path"
import { Template } from "../utils.js"

export function read(filePath: string): string {
	return fs.readFileSync(path.join(__dirname, filePath), "utf8")
}

const compatPrelude = read("./scripts/ue_compat.py")

function readWithCompat(filePath: string): string {
	return `${compatPrelude}\n\n${read(filePath)}`
}

export const UEGetAssetInfo = (asset_path: string) => Template(readWithCompat("./scripts/ue_get_asset_info.py"), { asset_path })

export const UEListAssets = () => Template(readWithCompat("./scripts/ue_list_assets.py"))

export const UEExportAsset = (asset_path: string) => Template(readWithCompat("./scripts/ue_export_asset.py"), { asset_path })

export const UEGetAssetReferences = (asset_path: string) =>
	Template(readWithCompat("./scripts/ue_get_asset_references.py"), { asset_path })

export const UEConsoleCommand = (command: string) => Template(readWithCompat("./scripts/ue_console_command.py"), { command })

export const UEGetProjectInfo = () => Template(readWithCompat("./scripts/ue_get_project_info.py"))

export const UEGetMapInfo = () => Template(readWithCompat("./scripts/ue_get_map_info.py"))

export const UESearchAssets = (search_term: string, asset_class?: string) =>
	Template(readWithCompat("./scripts/ue_search_assets.py"), {
		search_term,
		asset_class: asset_class || "",
	})

export const UEGetWorldOutliner = () => Template(readWithCompat("./scripts/ue_get_world_outliner.py"))

export const UEValidateAssets = (asset_paths?: string) =>
	Template(readWithCompat("./scripts/ue_validate_assets.py"), {
		asset_paths: asset_paths || "",
	})

export const UECreateObject = (
	object_class: string,
	object_name: string,
	location?: { x: number; y: number; z: number },
	rotation?: { pitch: number; yaw: number; roll: number },
	scale?: { x: number; y: number; z: number },
	properties?: Record<string, any>,
) => {
	return Template(readWithCompat("./scripts/ue_create_object.py"), {
		object_class,
		object_name,
		location: location ? JSON.stringify(location) : "null",
		rotation: rotation ? JSON.stringify(rotation) : "null",
		scale: scale ? JSON.stringify(scale) : "null",
		properties: properties ? JSON.stringify(properties) : "null",
	})
}

export const UEUpdateObject = (
	actor_name: string,
	location?: { x: number; y: number; z: number },
	rotation?: { pitch: number; yaw: number; roll: number },
	scale?: { x: number; y: number; z: number },
	properties?: Record<string, any>,
	new_name?: string,
) => {
	return Template(readWithCompat("./scripts/ue_update_object.py"), {
		actor_name,
		location: location ? JSON.stringify(location) : "null",
		rotation: rotation ? JSON.stringify(rotation) : "null",
		scale: scale ? JSON.stringify(scale) : "null",
		properties: properties ? JSON.stringify(properties) : "null",
		new_name: new_name || "null",
	})
}

export const UEDeleteObject = (actor_names: string) =>
	Template(readWithCompat("./scripts/ue_delete_object.py"), {
		actor_names,
	})

export const UETakeScreenshot = () => Template(readWithCompat("./scripts/ue_take_screenshot.py"))

export const UEMoveCamera = (
	location: { x: number; y: number; z: number },
	rotation: { pitch: number; yaw: number; roll: number },
) => {
	return Template(readWithCompat("./scripts/ue_move_camera.py"), {
		location: JSON.stringify(location),
		rotation: JSON.stringify(rotation),
	})
}
