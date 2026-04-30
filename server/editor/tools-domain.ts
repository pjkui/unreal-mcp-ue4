import { editorPreludes, jsonArg, renderScript } from "./tools-base.js"

export const UEActorTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_actor_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, editorPreludes.actor, "reporting")

export const UEBlueprintTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_blueprint_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, editorPreludes.blueprint, "blueprint")

export const UEBlueprintAnalysisTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_blueprint_analysis_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, "", "blueprint")

export const UEBlueprintGraphTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_blueprint_graph_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, editorPreludes.blueprintGraph, "blueprint")

export const UEProjectTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_project_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, "", "core")

export const UEMaterialTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_material_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, editorPreludes.material, "reporting")

export const UETextureTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_texture_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, "", "core")

export const UEUMGTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_umg_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, editorPreludes.umg, "widget")

export const UESourceControlTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_source_control_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, editorPreludes.sourceControl, "core")

export const UEDataTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_data_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, editorPreludes.data, "core")

export const UEContentFactoryTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_content_factory_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, editorPreludes.contentFactory, "core")

export const UEWorldBuildingTool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_world_building_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, editorPreludes.worldBuilding, "core")

export const UEPIETool = (operation: string, args: Record<string, unknown> = {}) =>
	renderScript("./scripts/ue_pie_tools.py", {
		operation: jsonArg(operation),
		args: jsonArg(args),
	}, "", "core")
