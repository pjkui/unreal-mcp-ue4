import { Template } from "../utils.js"
import { editorPreludes, readEditorScript } from "./prelude-loader.js"

function readWithPrelude(filePath: string, extraPrelude = ""): string {
	return [editorPreludes.compat, extraPrelude, readEditorScript(filePath)].filter(Boolean).join("\n\n")
}

export function renderEditorScript(
	filePath: string,
	vars: Record<string, string>,
	options: { extraPrelude?: string } = {},
) {
	return Template(readWithPrelude(filePath, options.extraPrelude), vars)
}

export function jsonArg(value: unknown): string {
	return Buffer.from(JSON.stringify(value === undefined ? null : value), "utf8").toString("base64")
}
