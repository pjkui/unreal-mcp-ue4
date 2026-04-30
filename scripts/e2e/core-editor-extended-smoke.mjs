export async function runCoreEditorExtendedScenarios(ctx) {
	const {
		runStep,
		callJsonTool,
		callTextTool,
		assert,
		StepSkipError,
		firstAssetPathFromSearch,
	} = ctx

	// --- manage_editor ---

	await runStep("Read map info through manage_editor", async () => {
		const mapInfo = await callJsonTool("manage_editor", {
			action: "map_info",
			params: {},
		})
		assert(typeof mapInfo.map_name === "string" && mapInfo.map_name.length > 0, "manage_editor map_info did not return map_name")
	})

	await runStep("Check PIE status through manage_editor", async () => {
		const pieStatus = await callJsonTool("manage_editor", {
			action: "is_pie_running",
			params: {},
		})
		assert(typeof pieStatus.is_pie_running === "boolean", "manage_editor is_pie_running did not return is_pie_running boolean")
	})

	// --- get_unreal_version ---

	await runStep("Read Unreal version through direct tool", async () => {
		const versionText = await callTextTool("get_unreal_version")
		assert(
			versionText.length > 0 && (versionText.includes("4.26") || versionText.includes("4.27") || versionText.includes(".")),
			"get_unreal_version did not return a valid version string",
		)
	})

	// --- manage_system ---

	await runStep("Validate assets through manage_system", async () => {
		const validateResult = await callJsonTool("manage_system", {
			action: "validate_assets",
			params: { asset_paths: "/Engine/BasicShapes/Cube" },
		})
		assert(validateResult != null, "manage_system validate_assets did not return a result")
	})

	// --- manage_inspection ---

	await runStep("Inspect map info through manage_inspection", async () => {
		const mapInfo = await callJsonTool("manage_inspection", {
			action: "map",
			params: {},
		})
		assert(typeof mapInfo.map_name === "string", "manage_inspection map did not return map_name")
	})

	// --- manage_asset ---

	await runStep("List assets in /Game through manage_asset", async () => {
		const listResult = await callJsonTool("manage_asset", {
			action: "list",
			params: { root_path: "/Game", recursive: false },
		})
		assert(Array.isArray(listResult.assets) || Array.isArray(listResult), "manage_asset list did not return an asset array")
	})

	let exportAssetPath = ""
	await runStep("Find an exportable asset for manage_asset.export", async () => {
		const searchResult = await callJsonTool("manage_asset", {
			action: "search",
			params: { search_term: "Cube", asset_class: "StaticMesh" },
		})
		exportAssetPath = firstAssetPathFromSearch(searchResult)
		if (!exportAssetPath) {
			throw new StepSkipError("No exportable asset found for manage_asset.export test")
		}
	})

	await runStep("Export an asset through manage_asset", async () => {
		if (!exportAssetPath) {
			throw new StepSkipError("Skipped: no exportable asset available")
		}
		const exportResult = await callJsonTool("manage_asset", {
			action: "export",
			params: { asset_path: exportAssetPath },
		})
		assert(exportResult != null, "manage_asset export did not return a result")
	})
}
