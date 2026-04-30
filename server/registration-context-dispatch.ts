import { z } from "zod"

import { logTimingRaw, tryRunCommand } from "./remote-execution.js"

export type NamespaceDispatchResult =
	| { kind: "python"; command: string }
	| { kind: "direct"; payload: unknown }

export type NamespaceActionHandler = (
	params: Record<string, any>,
) => NamespaceDispatchResult | Promise<NamespaceDispatchResult>

type TextResponse = { content: Array<{ type: "text"; text: string }> }

interface DispatchHelperOptions {
	rawServerTool: (...args: any[]) => unknown
	recordSchema: z.ZodRecord<z.ZodString, z.ZodAny>
	textResponse: (text: string) => TextResponse
	toolNamespaceRegistry: Map<string, { description: string; supportedActions: string[] }>
}

export function createDispatchHelpers(options: DispatchHelperOptions) {
	const { rawServerTool, recordSchema, textResponse, toolNamespaceRegistry } = options

	const pythonDispatch = (command: string): NamespaceDispatchResult => ({ kind: "python", command })
	const directDispatch = (payload: unknown): NamespaceDispatchResult => ({ kind: "direct", payload })
	const normalizeActionName = (action: string) => action.trim().toLowerCase()

	const registerPythonTool = (
		name: string,
		description: string,
		schema: Record<string, z.ZodTypeAny>,
		buildCommand: (args: any) => string,
	) => {
		rawServerTool(name, description, schema, async (args: any) => {
			const t0 = performance.now()
			const result = textResponse(await tryRunCommand(buildCommand(args)))
			logTimingRaw(`[timing] tool:${name} total: ${(performance.now() - t0).toFixed(1)}ms`)
			return result
		})
	}

	const registerZeroArgPythonTool = (
		name: string,
		description: string,
		buildCommand: () => string,
	) => {
		rawServerTool(name, description, async () => {
			const t0 = performance.now()
			const result = textResponse(await tryRunCommand(buildCommand()))
			logTimingRaw(`[timing] tool:${name} total: ${(performance.now() - t0).toFixed(1)}ms`)
			return result
		})
	}

	const unsupportedNamespaceAction = (
		toolName: string,
		action: string,
		supportedActions: string[],
	): NamespaceDispatchResult =>
			directDispatch({
				success: false,
				message: `Action '${action}' is not supported by ${toolName} in this UE4.26/4.27 port.`,
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
				const t0 = performance.now()

				try {
					const handler = actions[normalizedAction]
					const result = handler
						? await handler(params ?? {})
						: unsupportedNamespaceAction(name, normalizedAction, supportedActions)

					const response = await runNamespaceDispatch(result)
					logTimingRaw(`[timing] tool:${name}.${normalizedAction} total: ${(performance.now() - t0).toFixed(1)}ms`)
					return response
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

	return {
		directDispatch,
		pythonDispatch,
		registerPythonTool,
		registerToolNamespace,
		registerZeroArgPythonTool,
	}
}
