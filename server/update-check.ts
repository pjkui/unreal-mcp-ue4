import { execSync } from "node:child_process"
import https from "node:https"

import { projectVersion } from "./version.js"

const PACKAGE_NAME = "ue4-mcp"
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`
const CHECK_TIMEOUT_MS = 5000

/** Fetch the latest version from npm registry (non-blocking). */
const fetchLatestVersion = (): Promise<string | null> =>
	new Promise((resolve) => {
		const req = https.get(REGISTRY_URL, { timeout: CHECK_TIMEOUT_MS }, (res) => {
			if (res.statusCode !== 200) {
				res.resume()
				resolve(null)
				return
			}
			let body = ""
			res.on("data", (chunk: Buffer) => {
				body += chunk.toString()
			})
			res.on("end", () => {
				try {
					const data = JSON.parse(body)
					resolve(data.version ?? null)
				} catch {
					resolve(null)
				}
			})
		})
		req.on("error", () => resolve(null))
		req.on("timeout", () => {
			req.destroy()
			resolve(null)
		})
	})

/** Compare two semver-like version strings. Returns true if remote is newer. */
const isNewer = (current: string, remote: string): boolean => {
	const normalize = (v: string) =>
		v.replace(/-/g, ".").split(".").map((s) => Number.parseInt(s, 10) || 0)
	const cur = normalize(current)
	const rem = normalize(remote)
	const len = Math.max(cur.length, rem.length)
	for (let i = 0; i < len; i++) {
		const c = cur[i] ?? 0
		const r = rem[i] ?? 0
		if (r > c) return true
		if (r < c) return false
	}
	return false
}

/**
 * Background update check — logs to stderr if a newer version is available.
 * Never blocks startup, never throws.
 */
export const checkForUpdate = () => {
	fetchLatestVersion()
		.then((latest) => {
			if (latest && isNewer(projectVersion, latest)) {
				console.error(
					`\n[ue4-mcp] Update available: ${projectVersion} → ${latest}\n` +
						`[ue4-mcp] Run: npm install -g ${PACKAGE_NAME}@latest\n` +
						`[ue4-mcp]  or: ue4-mcp --update\n`,
				)
			}
		})
		.catch(() => {
			// Silently ignore — network may be unavailable.
		})
}

/**
 * Perform the actual update via npm install -g.
 * This is a blocking, synchronous operation intended for CLI use only.
 */
export const performUpdate = () => {
	console.log(`[ue4-mcp] Current version: ${projectVersion}`)
	console.log(`[ue4-mcp] Checking for updates...`)

	try {
		const latest = execSync(`npm view ${PACKAGE_NAME} version --registry https://registry.npmjs.org/`, {
			encoding: "utf8",
			timeout: 15000,
		}).trim()

		if (!latest) {
			console.log("[ue4-mcp] Could not determine latest version.")
			process.exit(1)
		}

		if (!isNewer(projectVersion, latest)) {
			console.log(`[ue4-mcp] Already up to date (${projectVersion}).`)
			process.exit(0)
		}

		console.log(`[ue4-mcp] Updating ${projectVersion} → ${latest}...`)
		execSync(`npm install -g ${PACKAGE_NAME}@latest --registry https://registry.npmjs.org/`, {
			stdio: "inherit",
			timeout: 120000,
		})
		console.log(`[ue4-mcp] Updated to ${latest} successfully.`)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`[ue4-mcp] Update failed: ${message}`)
		process.exit(1)
	}
}
