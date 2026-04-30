import { editorPreludes } from "./prelude-loader.js"
import { type CompatLevel, jsonArg as encodeJsonArg, renderEditorScript } from "./script-renderer.js"

export { editorPreludes }
export type { CompatLevel }

export const jsonArg = encodeJsonArg

export function renderScript(
	filePath: string,
	vars: Record<string, string>,
	extraPrelude = "",
	compatLevel?: CompatLevel,
) {
	return renderEditorScript(filePath, vars, { extraPrelude, compatLevel })
}
