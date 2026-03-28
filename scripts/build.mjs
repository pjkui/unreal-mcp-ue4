import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const rootDir = process.cwd()
const distDir = path.join(rootDir, "dist")
const serverDir = path.join(rootDir, "server")

try {
	fs.rmSync(distDir, { recursive: true, force: true })
} catch (error) {
	if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
		console.warn(`Warning: could not remove ${distDir} before build (${error.code}). Continuing with in-place overwrite.`)
	} else {
		throw error
	}
}

const compilerOptions = {
	allowSyntheticDefaultImports: true,
	esModuleInterop: true,
	module: ts.ModuleKind.CommonJS,
	resolveJsonModule: true,
	target: ts.ScriptTarget.ES2018,
}

const collectTsFiles = (dirPath) =>
	fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(dirPath, entry.name)

		if (entry.isDirectory()) {
			return collectTsFiles(entryPath)
		}

		return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : []
	})

for (const sourcePath of collectTsFiles(serverDir)) {
	const outputPath = path.join(
		distDir,
		path.relative(serverDir, sourcePath).replace(/\.ts$/u, ".js"),
	)
	const source = fs.readFileSync(sourcePath, "utf8")
	const result = ts.transpileModule(source, {
		compilerOptions,
		fileName: sourcePath,
	})

	fs.mkdirSync(path.dirname(outputPath), { recursive: true })
	fs.writeFileSync(outputPath, result.outputText)
}

fs.mkdirSync(path.join(distDir, "editor"), { recursive: true })
fs.cpSync(
	path.join(rootDir, "server", "editor", "scripts"),
	path.join(distDir, "editor", "scripts"),
	{ recursive: true },
)
