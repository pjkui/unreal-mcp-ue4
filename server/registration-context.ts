import { z } from "zod"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import * as editorTools from "./editor/tools.js"
import { tryRunCommand } from "./remote-execution.js"
import { toolDescription } from "./tool-catalog.js"

export type NamespaceDispatchResult =
	| { kind: "python"; command: string }
	| { kind: "direct"; payload: unknown }

export type NamespaceActionHandler = (
	params: Record<string, any>,
) => NamespaceDispatchResult | Promise<NamespaceDispatchResult>

export interface RegistrationContext {
	actorNameParam: (params: Record<string, any>) => string
	blueprintNameParam: (params: Record<string, any>) => string
	colorInputSchema: z.ZodTypeAny
	directDispatch: (payload: unknown) => NamespaceDispatchResult
	editorTools: typeof editorTools
	optionalStringListParam: (params: Record<string, any>, keys: string[]) => string[] | undefined
	optionalStringParam: (params: Record<string, any>, keys: string[]) => string | undefined
	pythonDispatch: (command: string) => NamespaceDispatchResult
	rawServerTool: (...args: any[]) => unknown
	recordSchema: z.ZodRecord<z.ZodString, z.ZodAny>
	registerPythonTool: (
		name: string,
		description: string,
		schema: Record<string, z.ZodTypeAny>,
		buildCommand: (args: any) => string,
	) => void
	registerToolNamespace: (
		name: string,
		description: string,
		actions: Record<string, NamespaceActionHandler>,
	) => void
	registerZeroArgPythonTool: (
		name: string,
		description: string,
		buildCommand: () => string,
	) => void
	requiredStringListParam: (params: Record<string, any>, keys: string[]) => string[]
	requiredStringParam: (params: Record<string, any>, keys: string[]) => string
	searchAssetsCommand: (params: Record<string, any>, defaultAssetClass?: string) => string
	sourceControlFileListParam: (params: Record<string, any>) => string[]
	sourceControlFileParam: (params: Record<string, any>) => string
	sourceControlFilesCommand: (
		files: string[],
		singleOperation?: string,
		multiOperation?: string,
	) => string
	sourceControlPackageListParam: (params: Record<string, any>) => string[]
	stringListSchema: z.ZodArray<z.ZodString, "many">
	textResponse: (text: string) => { content: Array<{ type: "text"; text: string }> }
	toolDescription: (name: string) => string
	toolNamespaceRegistry: Map<string, { description: string; supportedActions: string[] }>
	toColorArray: (
		value?: { a?: number; b: number; g: number; r: number } | [number, number, number, number],
	) => number[] | undefined
	toColorRecord: (
		value?: { a?: number; b: number; g: number; r: number } | [number, number, number, number],
	) => { a: number; b: number; g: number; r: number } | undefined
	toRotatorArray: (
		value?: { pitch: number; roll: number; yaw: number } | [number, number, number],
	) => number[] | undefined
	toRotatorRecord: (
		value?: { pitch: number; roll: number; yaw: number } | [number, number, number],
	) => { pitch: number; roll: number; yaw: number } | undefined
	toVector2Array: (value?: { x: number; y: number } | [number, number]) => number[] | undefined
	toVector2Record: (
		value?: { x: number; y: number } | [number, number],
	) => { x: number; y: number } | undefined
	toVector3Array: (
		value?: { x: number; y: number; z: number } | [number, number, number],
	) => number[] | undefined
	toVector3Record: (
		value?: { x: number; y: number; z: number } | [number, number, number],
	) => { x: number; y: number; z: number } | undefined
	vector2InputSchema: z.ZodTypeAny
	vector3InputSchema: z.ZodTypeAny
	rotatorInputSchema: z.ZodTypeAny
	worldBuildBaseSchema: {
		location: z.ZodTypeAny
		material_path: z.ZodTypeAny
		prefix: z.ZodTypeAny
	}
	worldBuildCommand: (operation: string, params: Record<string, any>) => string
	widgetBlueprintParam: (params: Record<string, any>) => string
}

export function createRegistrationContext(server: McpServer): RegistrationContext {
	const rawServerTool = server.tool.bind(server) as (...args: any[]) => unknown

	const textResponse = (text: string) => ({
		content: [{ type: "text" as const, text }],
	})

	const registerPythonTool = (
		name: string,
		description: string,
		schema: Record<string, z.ZodTypeAny>,
		buildCommand: (args: any) => string,
	) => {
		rawServerTool(name, description, schema, async (args: any) =>
			textResponse(await tryRunCommand(buildCommand(args))),
		)
	}

	const registerZeroArgPythonTool = (
		name: string,
		description: string,
		buildCommand: () => string,
	) => {
		rawServerTool(name, description, async () => textResponse(await tryRunCommand(buildCommand())))
	}

	const vector2InputSchema = z.union([
		z.object({ x: z.number(), y: z.number() }),
		z.tuple([z.number(), z.number()]),
	])

	const vector3InputSchema = z.union([
		z.object({ x: z.number(), y: z.number(), z: z.number() }),
		z.tuple([z.number(), z.number(), z.number()]),
	])

	const rotatorInputSchema = z.union([
		z.object({ pitch: z.number(), yaw: z.number(), roll: z.number() }),
		z.tuple([z.number(), z.number(), z.number()]),
	])

	const colorInputSchema = z.union([
		z.object({
			r: z.number(),
			g: z.number(),
			b: z.number(),
			a: z.number().optional(),
		}),
		z.tuple([z.number(), z.number(), z.number(), z.number()]),
	])

	const recordSchema = z.record(z.any())
	const stringListSchema = z.array(z.string().min(1)).min(1)

	const toolNamespaceRegistry = new Map<string, { description: string; supportedActions: string[] }>()

	const pythonDispatch = (command: string): NamespaceDispatchResult => ({ kind: "python", command })
	const directDispatch = (payload: unknown): NamespaceDispatchResult => ({ kind: "direct", payload })
	const normalizeActionName = (action: string) => action.trim().toLowerCase()

	const requiredStringParam = (params: Record<string, any>, keys: string[]) => {
		for (const key of keys) {
			const value = params[key]
			if (typeof value === "string" && value.trim()) {
				return value.trim()
			}
		}

		throw new Error(`${keys[0]} is required`)
	}

	const optionalStringParam = (params: Record<string, any>, keys: string[]) => {
		for (const key of keys) {
			const value = params[key]
			if (typeof value === "string" && value.trim()) {
				return value.trim()
			}
		}

		return undefined
	}

	const optionalStringListParam = (params: Record<string, any>, keys: string[]) => {
		for (const key of keys) {
			const value = params[key]
			if (Array.isArray(value)) {
				const normalizedValues = value
					.filter((entry) => typeof entry === "string")
					.map((entry) => entry.trim())
					.filter(Boolean)

				if (normalizedValues.length > 0) {
					return normalizedValues
				}
			}

			if (typeof value === "string" && value.trim()) {
				return [value.trim()]
			}
		}

		return undefined
	}

	const requiredStringListParam = (params: Record<string, any>, keys: string[]) => {
		const values = optionalStringListParam(params, keys)
		if (values && values.length > 0) {
			return values
		}

		throw new Error(`${keys[0]} is required`)
	}

	const toVector2Record = (value: any) => {
		if (!value) {
			return undefined
		}

		if (Array.isArray(value)) {
			return { x: Number(value[0] ?? 0), y: Number(value[1] ?? 0) }
		}

		return { x: Number(value.x ?? 0), y: Number(value.y ?? 0) }
	}

	const toVector3Record = (value: any) => {
		if (!value) {
			return undefined
		}

		if (Array.isArray(value)) {
			return {
				x: Number(value[0] ?? 0),
				y: Number(value[1] ?? 0),
				z: Number(value[2] ?? 0),
			}
		}

		return {
			x: Number(value.x ?? 0),
			y: Number(value.y ?? 0),
			z: Number(value.z ?? 0),
		}
	}

	const toRotatorRecord = (value: any) => {
		if (!value) {
			return undefined
		}

		if (Array.isArray(value)) {
			return {
				pitch: Number(value[0] ?? 0),
				yaw: Number(value[1] ?? 0),
				roll: Number(value[2] ?? 0),
			}
		}

		return {
			pitch: Number(value.pitch ?? 0),
			yaw: Number(value.yaw ?? 0),
			roll: Number(value.roll ?? 0),
		}
	}

	const unsupportedNamespaceAction = (
		toolName: string,
		action: string,
		supportedActions: string[],
	): NamespaceDispatchResult =>
		directDispatch({
			success: false,
			message: `Action '${action}' is not supported by ${toolName} in this UE4.27 port.`,
			supported_actions: supportedActions,
		})

	const runNamespaceDispatch = async (result: NamespaceDispatchResult) => {
		if (result.kind === "python") {
			return textResponse(await tryRunCommand(result.command))
		}

		return textResponse(JSON.stringify(result.payload, null, 2))
	}

	const registerToolNamespace = (
		name: string,
		description: string,
		actions: Record<string, NamespaceActionHandler>,
	) => {
		const supportedActions = Object.keys(actions).sort()
		toolNamespaceRegistry.set(name, { description, supportedActions })

		rawServerTool(
			name,
			description,
			{
				action: z.string().describe(`Action to execute inside tool namespace ${name}`),
				params: recordSchema.optional().describe("Optional action parameter object"),
			},
			async ({ action, params }: { action: string; params?: Record<string, any> }) => {
				const normalizedAction = normalizeActionName(action)

				try {
					const handler = actions[normalizedAction]
					const result = handler
						? await handler(params ?? {})
						: unsupportedNamespaceAction(name, normalizedAction, supportedActions)

					return await runNamespaceDispatch(result)
				} catch (error) {
					return textResponse(
						JSON.stringify(
							{
								success: false,
								tool: name,
								action: normalizedAction,
								message: error instanceof Error ? error.message : String(error),
							},
							null,
							2,
						),
					)
				}
			},
		)
	}

	const worldBuildBaseSchema = {
		location: vector3InputSchema.optional().describe("Optional world location"),
		material_path: z.string().optional().describe("Optional material path to apply"),
		prefix: z.string().optional().describe("Optional actor label prefix"),
	}

	const toVector2Array = (value?: { x: number; y: number } | [number, number]) =>
		!value ? undefined : Array.isArray(value) ? value : [value.x, value.y]

	const toVector3Array = (
		value?: { x: number; y: number; z: number } | [number, number, number],
	) => (!value ? undefined : Array.isArray(value) ? value : [value.x, value.y, value.z])

	const toRotatorArray = (
		value?: { pitch: number; yaw: number; roll: number } | [number, number, number],
	) => (!value ? undefined : Array.isArray(value) ? value : [value.pitch, value.yaw, value.roll])

	const toColorRecord = (
		value?: { r: number; g: number; b: number; a?: number } | [number, number, number, number],
	) => {
		if (!value) {
			return undefined
		}

		return Array.isArray(value)
			? { r: value[0], g: value[1], b: value[2], a: value[3] ?? 1 }
			: { r: value.r, g: value.g, b: value.b, a: value.a ?? 1 }
	}

	const toColorArray = (
		value?: { r: number; g: number; b: number; a?: number } | [number, number, number, number],
	) => {
		const colorRecord = toColorRecord(value)
		return colorRecord
			? [colorRecord.r, colorRecord.g, colorRecord.b, colorRecord.a]
			: undefined
	}

	const searchAssetsCommand = (params: Record<string, any>, defaultAssetClass?: string) =>
		editorTools.UESearchAssets(
			optionalStringParam(params, ["search_term", "query", "pattern", "name"]) ?? "",
			optionalStringParam(params, ["asset_class", "class_name", "class"]) ?? defaultAssetClass,
		)

	const worldBuildCommand = (operation: string, params: Record<string, any>) =>
		editorTools.UEWorldBuildingTool(operation, {
			...params,
			location: toVector3Array(params.location),
		})

	const actorNameParam = (params: Record<string, any>) =>
		requiredStringParam(params, ["name", "actor_name"])

	const blueprintNameParam = (params: Record<string, any>) =>
		requiredStringParam(params, ["blueprint_name", "asset_path", "name"])

	const widgetBlueprintParam = (params: Record<string, any>) =>
		requiredStringParam(params, [
			"widget_blueprint",
			"widget_blueprint_path",
			"widget_name",
			"blueprint_name",
		])

	const sourceControlFileParam = (params: Record<string, any>) =>
		requiredStringParam(params, ["file", "path", "asset_path", "package", "name"])

	const sourceControlFileListParam = (params: Record<string, any>) =>
		requiredStringListParam(params, [
			"files",
			"paths",
			"asset_paths",
			"packages",
			"file",
			"path",
			"asset_path",
			"package",
			"name",
		])

	const sourceControlPackageListParam = (params: Record<string, any>) =>
		requiredStringListParam(params, [
			"packages",
			"package_names",
			"paths",
			"asset_paths",
			"package",
			"path",
		])

	const sourceControlFilesCommand = (
		files: string[],
		singleOperation?: string,
		multiOperation?: string,
	) => {
		if (singleOperation && files.length === 1) {
			return editorTools.UESourceControlTool(singleOperation, { file: files[0] })
		}

		return editorTools.UESourceControlTool(multiOperation ?? singleOperation!, { files })
	}

	return {
		actorNameParam,
		blueprintNameParam,
		colorInputSchema,
		directDispatch,
		editorTools,
		optionalStringListParam,
		optionalStringParam,
		pythonDispatch,
		rawServerTool,
		recordSchema,
		registerPythonTool,
		registerToolNamespace,
		registerZeroArgPythonTool,
		requiredStringListParam,
		requiredStringParam,
		searchAssetsCommand,
		sourceControlFileListParam,
		sourceControlFileParam,
		sourceControlFilesCommand,
		sourceControlPackageListParam,
		stringListSchema,
		textResponse,
		toolDescription,
		toolNamespaceRegistry,
		toColorArray,
		toColorRecord,
		toRotatorArray,
		toRotatorRecord,
		toVector2Array,
		toVector2Record,
		toVector3Array,
		toVector3Record,
		vector2InputSchema,
		vector3InputSchema,
		rotatorInputSchema,
		worldBuildBaseSchema,
		worldBuildCommand,
		widgetBlueprintParam,
	}
}
