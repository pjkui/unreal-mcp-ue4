import { Template } from "../utils.js"
import { editorPreludes, readEditorScript } from "./prelude-loader.js"

export type CompatLevel = "core" | "widget" | "blueprint" | "reporting" | "full"

const compatPreludeForLevel = (level: CompatLevel): string => {
	switch (level) {
		case "core":
			return editorPreludes.compatCore
		case "widget":
			return [editorPreludes.compatCore, editorPreludes.compatWidget].join("\n\n")
		case "blueprint":
			return [editorPreludes.compatCore, editorPreludes.compatBlueprint].join("\n\n")
		case "reporting":
			return [editorPreludes.compatCore, editorPreludes.compatReporting].join("\n\n")
		case "full":
		default:
			return editorPreludes.compat
	}
}

function readWithPrelude(filePath: string, extraPrelude = "", compatLevel: CompatLevel = "full"): string {
	return [compatPreludeForLevel(compatLevel), extraPrelude, readEditorScript(filePath)].filter(Boolean).join("\n\n")
}

export function renderEditorScript(
	filePath: string,
	vars: Record<string, string>,
	options: { extraPrelude?: string; compatLevel?: CompatLevel } = {},
) {
	return Template(readWithPrelude(filePath, options.extraPrelude, options.compatLevel), vars)
}

export function jsonArg(value: unknown): string {
	return Buffer.from(JSON.stringify(value === undefined ? null : value), "utf8").toString("base64")
}
