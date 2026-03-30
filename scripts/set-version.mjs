#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const repoRoot = process.cwd()
const packageJsonPath = path.join(repoRoot, "package.json")
const packageLockPath = path.join(repoRoot, "package-lock.json")
const serverVersionPath = path.join(repoRoot, "server", "version.ts")

const nextVersion = process.argv[2]

if (!nextVersion) {
	console.error("Usage: node scripts/set-version.mjs <YYYY.MM.DD.N>")
	process.exit(1)
}

if (!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(nextVersion)) {
	console.error(`Invalid version format: ${nextVersion}`)
	console.error("Expected format: YYYY.MM.DD.N")
	process.exit(1)
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
packageJson.version = nextVersion
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

if (fs.existsSync(packageLockPath)) {
	const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"))
	packageLock.version = nextVersion
	if (packageLock.packages?.[""]) {
		packageLock.packages[""].version = nextVersion
	}
	fs.writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`)
}

const serverVersionSource = `export const projectVersion = "${nextVersion}"\n`
fs.writeFileSync(serverVersionPath, serverVersionSource)

console.log(`Updated project version to ${nextVersion}`)
