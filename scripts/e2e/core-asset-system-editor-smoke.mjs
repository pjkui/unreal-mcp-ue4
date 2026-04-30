import { runCoreAssetReadScenarios } from "./core-asset-read-smoke.mjs"
import { runCoreEditorCommandScenarios } from "./core-editor-command-smoke.mjs"
import { runCoreEditorExtendedScenarios } from "./core-editor-extended-smoke.mjs"
import { runCoreSourceControlReadScenarios } from "./core-source-control-read-smoke.mjs"

export async function runCoreAssetSystemEditorScenarios(ctx) {
	await runCoreAssetReadScenarios(ctx)
	await runCoreSourceControlReadScenarios(ctx)
	await runCoreEditorCommandScenarios(ctx)
	await runCoreEditorExtendedScenarios(ctx)
}
