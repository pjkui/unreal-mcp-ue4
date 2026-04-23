#!/usr/bin/env node
// Publish the same built artifact under two npm package names:
//   1) @pjkui/unreal-mcp-ue4  (the canonical scoped name in package.json)
//   2) ue4-mcp                (shorter alias name)
//
// Both publishes point at https://registry.npmjs.org/ (public npm), use
// --access public, and tag the release as "latest".
//
// Usage:
//   NPM_TOKEN=npm_xxx node scripts/publish-both.mjs [--dry-run] [--skip-build]
// or
//   node scripts/publish-both.mjs --otp=123456 [--dry-run] [--skip-build]
//
// The script never writes the token to ~/.npmrc. It passes authentication
// through a temporary process-scoped environment variable only.

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const pkgJsonPath = path.join(repoRoot, "package.json")
const registry = "https://registry.npmjs.org/"
const aliasName = "ue4-mcp"
const tokenEnvKey = registry.replace(/^https?:/, "").replace(/\/$/, "")
const npmConfigAuthKey = `npm_config_${tokenEnvKey}/:_authToken`

function parseArgs(argv) {
	const args = { dryRun: false, skipBuild: false, otp: undefined }
	for (const token of argv) {
		if (token === "--dry-run") args.dryRun = true
		else if (token === "--skip-build") args.skipBuild = true
		else if (token.startsWith("--otp=")) args.otp = token.slice("--otp=".length)
		else if (token === "--help" || token === "-h") {
			console.log(
				"Usage: node scripts/publish-both.mjs [--dry-run] [--skip-build] [--otp=123456]",
			)
			process.exit(0)
		} else {
			console.error(`Unknown argument: ${token}`)
			process.exit(2)
		}
	}
	return args
}

function run(cmd, cmdArgs, { env, description }) {
	console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`)
	const result = spawnSync(cmd, cmdArgs, {
		cwd: repoRoot,
		stdio: "inherit",
		env,
		shell: process.platform === "win32",
	})
	if (result.status !== 0) {
		throw new Error(`${description ?? cmd} failed with exit code ${result.status}`)
	}
}

function readPkg() {
	return JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"))
}

function writePkg(pkg) {
	fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

function buildEnv(token) {
	const env = { ...process.env }
	env.npm_config_registry = registry
	if (token) {
		env[npmConfigAuthKey] = token
	}
	return env
}

function publish({ packageName, version, env, dryRun, otp }) {
	const args = [
		"publish",
		"--access",
		"public",
		"--tag",
		"latest",
		"--registry",
		registry,
	]
	if (dryRun) args.push("--dry-run")
	if (otp) args.push(`--otp=${otp}`)
	run("npm", args, { env, description: `npm publish (${packageName}@${version})` })
}

async function main() {
	const args = parseArgs(process.argv.slice(2))
	const token = process.env.NPM_TOKEN?.trim()
	if (!token && !args.otp && !args.dryRun) {
		console.error(
			"[publish-both] No NPM_TOKEN env var and no --otp=... provided. " +
				"Set NPM_TOKEN to a granular token (with Bypass 2FA enabled), or pass --otp=<code>, " +
				"or re-run with --dry-run to simulate without auth.",
		)
		process.exit(1)
	}

	const originalPkg = readPkg()
	const canonicalName = originalPkg.name
	const version = originalPkg.version
	if (!canonicalName || !version) {
		throw new Error("package.json is missing name or version")
	}
	if (canonicalName === aliasName) {
		throw new Error(
			`package.json name is already "${aliasName}"; publish-both expects the scoped canonical name.`,
		)
	}
	console.log(
		`[publish-both] canonical=${canonicalName}@${version}, alias=${aliasName}@${version}, registry=${registry}`,
	)

	if (!args.skipBuild) {
		run("npm", ["run", "build"], { env: process.env, description: "npm run build" })
	}

	const env = buildEnv(token)

	// 1) Publish the scoped canonical package with package.json untouched.
	publish({ packageName: canonicalName, version, env, dryRun: args.dryRun, otp: args.otp })

	// 2) Temporarily rewrite package.json.name to the alias, publish, then restore.
	//    We rely on npm honouring the on-disk name at publish time, and "files"
	//    already listing dist/README/LICENSE/NOTICE so both tarballs stay identical
	//    except for the name field inside package.json.
	let aliasPublishError
	try {
		const aliasPkg = { ...originalPkg, name: aliasName }
		writePkg(aliasPkg)
		publish({ packageName: aliasName, version, env, dryRun: args.dryRun, otp: args.otp })
	} catch (err) {
		aliasPublishError = err
	} finally {
		writePkg(originalPkg)
	}

	if (aliasPublishError) {
		throw aliasPublishError
	}

	console.log(
		`\n[publish-both] Done. Published ${canonicalName}@${version} and ${aliasName}@${version} to ${registry}.`,
	)
}

main().catch((err) => {
	console.error(`[publish-both] ${err?.message ?? err}`)
	process.exit(1)
})
