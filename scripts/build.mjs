import fs from "node:fs"
import path from "node:path"
import { build } from "esbuild"

const rootDir = process.cwd()
const distDir = path.join(rootDir, "dist")

fs.rmSync(distDir, { recursive: true, force: true })

await build({
	entryPoints: [
		"server/bin.ts",
		"server/index.ts",
		"server/utils.ts",
		"server/editor/tools.ts",
		"server/scripts/make-executable.ts",
		"server/scripts/update-readme.ts",
	],
	outdir: "dist",
	outbase: "server",
	platform: "node",
	format: "cjs",
	target: ["node18"],
	bundle: false,
	logLevel: "info",
})

fs.mkdirSync(path.join(distDir, "editor"), { recursive: true })
fs.cpSync(
	path.join(rootDir, "server", "editor", "scripts"),
	path.join(distDir, "editor", "scripts"),
	{ recursive: true },
)
