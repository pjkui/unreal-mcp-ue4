export async function runCoreProjectEditorScenarios(ctx) {
	const {
		fs,
		options,
		addCleanup,
		runStep,
		callJsonTool,
		callTextTool,
		assert,
		resolveLocalPath,
		firstAssetPathFromSearch,
		StepSkipError,
		getProjectInfo,
		setProjectInfo,
		getCurrentMapInfo,
		setCurrentMapInfo,
		getProjectFilePath,
		setProjectFilePath,
	} = ctx

	let projectInfo = getProjectInfo()
	let currentMapInfo = getCurrentMapInfo()
	let projectFilePath = getProjectFilePath()

	await runStep("Read project info", async () => {
		projectInfo = await callJsonTool("manage_editor", {
			action: "project_info",
			params: {},
		})
		assert(typeof projectInfo.project_name === "string" && projectInfo.project_name.length > 0, "project_name is missing")
		assert(typeof projectInfo.engine_version === "string" && projectInfo.engine_version.includes("4.27"), "engine_version does not look like UE4.27")
		setProjectInfo(projectInfo)
	})

	await runStep("Read Unreal Engine path through direct tool", async () => {
		const enginePathText = await callTextTool("get_unreal_engine_path")
		assert(
			enginePathText.startsWith("Unreal Engine path: "),
			"get_unreal_engine_path did not return the expected text format",
		)
		assert(
			enginePathText.slice("Unreal Engine path: ".length).trim().length > 0,
			"get_unreal_engine_path returned an empty path",
		)
	})

	await runStep("Read Unreal project path through direct tool", async () => {
		const projectPathText = await callTextTool("get_unreal_project_path")
		assert(
			projectPathText.startsWith("Unreal Project path: "),
			"get_unreal_project_path did not return the expected text format",
		)
		projectFilePath = projectPathText.slice("Unreal Project path: ".length).trim()
		assert(
			projectFilePath.toLowerCase().includes(".uproject"),
			"get_unreal_project_path did not return a .uproject path",
		)
		setProjectFilePath(projectFilePath)
	})

	await runStep("Read Unreal version through direct tool", async () => {
		const versionText = await callTextTool("get_unreal_version")
		assert(
			versionText.startsWith("Unreal version: "),
			"get_unreal_version did not return the expected text format",
		)
		assert(
			versionText.includes("4.27"),
			"get_unreal_version did not report a UE4.27 engine version",
		)
		assert(
			typeof projectInfo.engine_version === "string" &&
				versionText.includes(projectInfo.engine_version),
			"get_unreal_version did not match manage_editor.project_info",
		)
	})

	await runStep("Read current map info", async () => {
		currentMapInfo = await callJsonTool("manage_editor", {
			action: "map_info",
			params: {},
		})
		assert(typeof currentMapInfo.map_name === "string" && currentMapInfo.map_name.length > 0, "map_name is missing")
		assert(Number.isFinite(currentMapInfo.total_actors), "total_actors is missing")
		setCurrentMapInfo(currentMapInfo)
	})

	await runStep("Read current world outliner", async () => {
		const outliner = await callJsonTool("manage_editor", {
			action: "world_outliner",
			params: {},
		})
		assert(Array.isArray(outliner.actors), "world outliner did not return an actor list")
	})

	await runStep("Read map info through manage_level", async () => {
		const levelInfo = await callJsonTool("manage_level", {
			action: "info",
			params: {},
		})
		assert(levelInfo.map_name === currentMapInfo.map_name, "manage_level info returned a different map name")
		assert(Number.isFinite(levelInfo.total_actors), "manage_level info did not return total_actors")
	})

	await runStep("Inspect the current map through manage_inspection", async () => {
		const mapInfo = await callJsonTool("manage_inspection", {
			action: "map",
			params: {},
		})
		assert(mapInfo.map_name === currentMapInfo.map_name, "manage_inspection map returned a different map name")
		assert(Number.isFinite(mapInfo.total_actors), "manage_inspection map did not return total_actors")
	})

	await runStep("Read world outliner through manage_level", async () => {
		const outliner = await callJsonTool("manage_level", {
			action: "world_outliner",
			params: {},
		})
		assert(Array.isArray(outliner.actors), "manage_level world_outliner did not return an actor list")
		assert(Number.isFinite(outliner.total_actors), "manage_level world_outliner did not return total_actors")
	})

	await runStep("Search assets through manage_asset", async () => {
		const searchResult = await callJsonTool("manage_asset", {
			action: "search",
			params: {
				search_term: "Cube",
				asset_class: "StaticMesh",
			},
		})
		assert(Array.isArray(searchResult.assets), "manage_asset search did not return an asset list")
		assert(
			searchResult.assets.some((asset) => asset.package_name === "/Engine/BasicShapes/Cube"),
			"manage_asset search did not find /Engine/BasicShapes/Cube",
		)
	})

	await runStep("Read asset info through manage_asset", async () => {
		const assetInfo = await callJsonTool("manage_asset", {
			action: "info",
			params: { asset_path: "/Engine/BasicShapes/Cube" },
		})
		assert(Array.isArray(assetInfo) && assetInfo.length === 1, "manage_asset info did not return one asset record")
		assert(assetInfo[0].package === "/Engine/BasicShapes/Cube", "manage_asset info returned the wrong asset package")
	})

	await runStep("Read asset references through manage_asset", async () => {
		const references = await callJsonTool("manage_asset", {
			action: "references",
			params: { asset_path: "/Engine/BasicShapes/Cube" },
		})
		assert(Array.isArray(references), "manage_asset references did not return an array")
	})

	await runStep("Inspect an asset through manage_inspection", async () => {
		const assetInfo = await callJsonTool("manage_inspection", {
			action: "asset",
			params: { asset_path: "/Engine/BasicShapes/Cube" },
		})
		assert(Array.isArray(assetInfo) && assetInfo.length === 1, "manage_inspection asset did not return one asset record")
		assert(assetInfo[0].package === "/Engine/BasicShapes/Cube", "manage_inspection asset returned the wrong asset package")
	})

	await runStep("Inspect asset references through manage_inspection", async () => {
		const references = await callJsonTool("manage_inspection", {
			action: "asset_references",
			params: { asset_path: "/Engine/BasicShapes/Cube" },
		})
		assert(Array.isArray(references), "manage_inspection asset_references did not return an array")
	})

	let skeletonAssetPath = ""
	await runStep("Search skeleton assets through manage_skeleton", async () => {
		const skeletonSearchResult = await callJsonTool("manage_skeleton", {
			action: "search_skeletons",
			params: { search_term: "" },
		})
		assert(Array.isArray(skeletonSearchResult.assets), "manage_skeleton search_skeletons did not return an asset list")
		skeletonAssetPath = firstAssetPathFromSearch(skeletonSearchResult)
		if (!skeletonAssetPath) {
			throw new StepSkipError("No Skeleton assets were found in the active project or engine content.")
		}
	})

	let skeletalMeshAssetPath = ""
	await runStep("Search skeletal meshes through manage_skeleton", async () => {
		const skeletalMeshSearchResult = await callJsonTool("manage_skeleton", {
			action: "search_skeletal_meshes",
			params: { search_term: "" },
		})
		assert(Array.isArray(skeletalMeshSearchResult.assets), "manage_skeleton search_skeletal_meshes did not return an asset list")
		skeletalMeshAssetPath = firstAssetPathFromSearch(skeletalMeshSearchResult)
		if (!skeletalMeshAssetPath) {
			throw new StepSkipError("No SkeletalMesh assets were found in the active project or engine content.")
		}
	})

	await runStep("Read skeleton-related metadata through manage_skeleton", async () => {
		const skeletonInfoTarget = skeletonAssetPath || skeletalMeshAssetPath
		if (!skeletonInfoTarget) {
			throw new StepSkipError("No Skeleton or SkeletalMesh asset was available for asset_info.")
		}
		const skeletonInfo = await callJsonTool("manage_skeleton", {
			action: "asset_info",
			params: { asset_path: skeletonInfoTarget },
		})
		assert(Array.isArray(skeletonInfo) && skeletonInfo.length === 1, "manage_skeleton asset_info did not return one asset record")
		assert(
			skeletonInfo[0].package === skeletonInfoTarget,
			"manage_skeleton asset_info returned the wrong asset package",
		)
	})

	await runStep("Validate an asset through manage_system", async () => {
		const validationResult = await callJsonTool("manage_system", {
			action: "validate_assets",
			params: { asset_paths: "/Engine/BasicShapes/Cube" },
		})
		assert(validationResult.total_validated === 1, "manage_system validate_assets did not validate one asset")
		assert(
			validationResult.validation_summary?.valid_count === 1,
			"manage_system validate_assets did not mark the engine cube as valid",
		)
	})

	await runStep("Validate an asset through manage_asset", async () => {
		const validationResult = await callJsonTool("manage_asset", {
			action: "validate",
			params: { asset_paths: "/Engine/BasicShapes/Cube" },
		})
		assert(validationResult.total_validated === 1, "manage_asset validate did not validate one asset")
		assert(
			validationResult.validation_summary?.valid_count === 1,
			"manage_asset validate did not mark the engine cube as valid",
		)
	})

	await runStep("Read source control provider info", async () => {
		const sourceControlInfo = await callJsonTool("manage_source_control", {
			action: "provider_info",
			params: {},
		})
		assert(typeof sourceControlInfo.provider === "string", "provider is missing")
		assert(typeof sourceControlInfo.enabled === "boolean", "enabled is missing")
		assert(typeof sourceControlInfo.available === "boolean", "available is missing")
	})

	await runStep("Query source control state", async () => {
		const sourceControlState = await callJsonTool("manage_source_control", {
			action: "query_state",
			params: { file: "/Game" },
		})
		assert(typeof sourceControlState.state?.filename === "string", "state filename is missing")
		assert(typeof sourceControlState.state?.is_valid === "boolean", "state validity is missing")
	})

	await runStep("Query source control states in bulk", async () => {
		const sourceControlStates = await callJsonTool("manage_source_control", {
			action: "query_states",
			params: { files: ["/Game", "/Engine/BasicShapes/Cube"] },
		})
		assert(sourceControlStates.count === 2, "manage_source_control query_states did not return the expected count")
		assert(Array.isArray(sourceControlStates.states), "manage_source_control query_states did not return a states list")
		assert(
			sourceControlStates.states.every(
				(state) =>
					typeof state?.filename === "string" && typeof state?.is_valid === "boolean",
			),
			"manage_source_control query_states returned an invalid state entry",
		)
	})

	await runStep("Take an editor screenshot through manage_editor", async () => {
		const screenshotText = (await callTextTool("manage_editor", {
			action: "screenshot",
			params: {},
		})).trim()
		assert(
			screenshotText.length > 0 && !screenshotText.includes("Failed to take screenshot"),
			"manage_editor screenshot did not return a screenshot path",
		)
		const screenshotPath = resolveLocalPath(screenshotText)
		assert(fs.existsSync(screenshotPath), `manage_editor screenshot did not create a file at ${screenshotPath}`)
		addCleanup(`Delete screenshot ${screenshotPath}`, async () => {
			try {
				fs.unlinkSync(screenshotPath)
			} catch {
				// Best effort only.
			}
		})
	})

	await runStep("Execute Python through manage_editor", async () => {
		const marker = `${options.prefix}_run_python_ok`
		const pythonOutput = (await callTextTool("manage_editor", {
			action: "run_python",
			params: {
				code: `print("${marker}")`,
			},
		})).trim()
		assert(
			pythonOutput === marker,
			`manage_editor run_python returned unexpected output: ${pythonOutput}`,
		)
	})

	const smokeConsoleVariableName = "t.MaxFPS"
	addCleanup(`Reset console variable ${smokeConsoleVariableName}`, async () => {
		try {
			await callJsonTool("manage_editor", {
				action: "console_command",
				params: { command: `${smokeConsoleVariableName} 0` },
			})
		} catch {
			// Best effort only.
		}
	})

	await runStep("Execute a console command through manage_editor", async () => {
		const consoleResult = await callJsonTool("manage_editor", {
			action: "console_command",
			params: { command: `${smokeConsoleVariableName} 87` },
		})
		assert(
			consoleResult.command === `${smokeConsoleVariableName} 87`,
			"manage_editor console_command did not echo the executed command",
		)
	})

	await runStep("Read a console variable through manage_editor", async () => {
		const consoleVariable = await callJsonTool("manage_editor", {
			action: "get_console_variable",
			params: { variable_name: smokeConsoleVariableName },
		})
		assert(
			consoleVariable.variable_name === smokeConsoleVariableName,
			"manage_editor get_console_variable returned the wrong variable name",
		)
		assert(
			Math.abs(Number(consoleVariable.float_value ?? 0) - 87) < 0.5
				|| Number(consoleVariable.int_value ?? -1) === 87
				|| String(consoleVariable.string_value ?? "").includes("87"),
			"manage_editor get_console_variable did not report the expected value",
		)
	})

	await runStep("Execute a console command through manage_system", async () => {
		const consoleResult = await callJsonTool("manage_system", {
			action: "console_command",
			params: { command: `${smokeConsoleVariableName} 91` },
		})
		assert(
			consoleResult.command === `${smokeConsoleVariableName} 91`,
			"manage_system console_command did not echo the executed command",
		)
	})

	await runStep("Read a console variable through manage_system", async () => {
		const consoleVariable = await callJsonTool("manage_system", {
			action: "get_console_variable",
			params: { variable_name: smokeConsoleVariableName },
		})
		assert(
			consoleVariable.variable_name === smokeConsoleVariableName,
			"manage_system get_console_variable returned the wrong variable name",
		)
		assert(
			Math.abs(Number(consoleVariable.float_value ?? 0) - 91) < 0.5
				|| Number(consoleVariable.int_value ?? -1) === 91
				|| String(consoleVariable.string_value ?? "").includes("91"),
			"manage_system get_console_variable did not report the expected value",
		)
	})

	await runStep("Move the viewport camera through manage_editor", async () => {
		const cameraResult = await callJsonTool("manage_editor", {
			action: "move_camera",
			params: {
				location: { x: 180, y: -420, z: 360 },
				rotation: { pitch: -20, yaw: 35, roll: 0 },
			},
		})
		assert(
			Math.abs(Number(cameraResult.location?.x ?? 0) - 180) < 0.1,
			"manage_editor move_camera did not update the expected X location",
		)
		assert(
			Math.abs(Number(cameraResult.rotation?.yaw ?? 0) - 35) < 0.1,
			"manage_editor move_camera did not update the expected yaw",
		)
	})
}
