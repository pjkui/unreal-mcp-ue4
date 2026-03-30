export async function runContentDataTextureScenarios(state) {
	const {
		fs,
		os,
		path,
		options,
		addCleanup,
		runStep,
		callJsonTool,
		assert,
		resolveLocalPath,
		firstAssetPathFromSearch,
		setProjectInfo,
		dataAssetPath,
		dataTablePath,
		stringTablePath,
		texturePath,
		blueprintPath,
		tempTextureFile,
		inputMappingName,
		originalClassicInputActionCount,
	} = state

	await runStep("Create a DataAsset through the tool-namespace layer", async () => {
		const dataAssetResult = await callJsonTool("manage_data", {
			action: "create_data_asset",
			params: {
				name: dataAssetPath,
				data_asset_class: "DataAsset",
			},
		})
		assert(
			dataAssetResult.asset_path === dataAssetPath,
			`DataAsset was created at an unexpected path: ${dataAssetResult.asset_path}`,
		)
	})

	await runStep("Read the DataAsset metadata", async () => {
		const dataAssetInfo = await callJsonTool("manage_data", {
			action: "asset_info",
			params: { asset_path: dataAssetPath },
		})
		assert(Array.isArray(dataAssetInfo) && dataAssetInfo.length === 1, "manage_data asset_info did not return one asset record")
		assert(
			dataAssetInfo[0].package === dataAssetPath,
			`manage_data asset_info returned an unexpected asset path: ${dataAssetInfo[0]?.package}`,
		)
	})

	await runStep("Create a DataTable through the tool-namespace layer", async () => {
		const dataTableResult = await callJsonTool("manage_data", {
			action: "create_data_table",
			params: {
				name: dataTablePath,
				row_struct: "/Script/Engine.TableRowBase",
			},
		})
		assert(
			dataTableResult.asset_path === dataTablePath,
			`DataTable was created at an unexpected path: ${dataTableResult.asset_path}`,
		)
		assert(
			String(dataTableResult.row_struct) === "/Script/Engine.TableRowBase",
			`DataTable used an unexpected row struct: ${dataTableResult.row_struct}`,
		)
	})

	await runStep("Create a StringTable through the tool-namespace layer", async () => {
		const stringTableResult = await callJsonTool("manage_data", {
			action: "create_string_table",
			params: {
				name: stringTablePath,
			},
		})
		assert(
			stringTableResult.asset_path === stringTablePath,
			`StringTable was created at an unexpected path: ${stringTableResult.asset_path}`,
		)
	})

	await runStep("Search data assets through manage_data", async () => {
		const dataSearchResult = await callJsonTool("manage_data", {
			action: "search_data_assets",
			params: {
				search_term: options.prefix,
				include_engine: false,
				limit: 20,
			},
		})
		assert(Array.isArray(dataSearchResult.assets), "manage_data search_data_assets did not return an asset list")
		assert(
			dataSearchResult.assets.some(
				(asset) =>
					asset.path === dataAssetPath
					|| asset.path === dataTablePath
					|| asset.path === stringTablePath,
			),
			"manage_data search_data_assets did not find any of the created data assets",
		)
	})

	await runStep("Create a classic input mapping through manage_input", async () => {
		const inputResult = await callJsonTool("manage_input", {
			action: "create_input_mapping",
			params: {
				mapping_name: inputMappingName,
				key: "P",
				input_type: "Action",
			},
		})
		const resolvedConfigPath = resolveLocalPath(inputResult.config_path)
		assert(inputResult.mapping_name === inputMappingName, "manage_input create_input_mapping returned the wrong mapping name")
		assert(
			typeof resolvedConfigPath === "string" && resolvedConfigPath.endsWith("DefaultInput.ini"),
			"manage_input create_input_mapping did not return DefaultInput.ini",
		)
		assert(
			fs.existsSync(resolvedConfigPath) &&
				fs.readFileSync(resolvedConfigPath, "utf8").includes(inputResult.mapping_line),
			"manage_input create_input_mapping did not write the mapping line to DefaultInput.ini",
		)
	})

	await runStep("Read project info after input mapping creation", async () => {
		let refreshedProjectInfo = null
		for (let attempt = 0; attempt < 10; attempt += 1) {
			refreshedProjectInfo = await callJsonTool("manage_editor", {
				action: "project_info",
				params: {},
			})
			if (
				Array.isArray(refreshedProjectInfo.classic_input_actions) &&
				refreshedProjectInfo.classic_input_actions.includes(inputMappingName)
			) {
				break
			}

			await new Promise((resolve) => setTimeout(resolve, 300))
		}
		assert(
			Array.isArray(refreshedProjectInfo?.classic_input_actions) &&
				refreshedProjectInfo.classic_input_actions.includes(inputMappingName),
			"manage_editor project_info did not report the new classic input mapping",
		)
		assert(
			Number(refreshedProjectInfo?.classic_input_actions_count ?? 0) >= originalClassicInputActionCount + 1,
			"manage_editor project_info did not increase the classic input action count",
		)
		setProjectInfo(refreshedProjectInfo)
	})

	await runStep("Import a Texture through the tool-namespace layer", async () => {
		const textureImportResult = await callJsonTool("manage_texture", {
			action: "import_texture",
			params: {
				source_file: tempTextureFile,
				destination_path: "/Game/MCP/Tests",
				asset_name: path.basename(texturePath),
			},
		})
		assert(
			textureImportResult.asset_path === texturePath,
			`Texture was imported at an unexpected path: ${textureImportResult.asset_path}`,
		)
	})

	await runStep("Read the Texture metadata", async () => {
		const textureInfo = await callJsonTool("manage_texture", {
			action: "texture_info",
			params: { asset_path: texturePath },
		})
		assert(Array.isArray(textureInfo) && textureInfo.length === 1, "manage_texture texture_info did not return one asset record")
		assert(
			textureInfo[0].package === texturePath,
			`manage_texture texture_info returned an unexpected asset path: ${textureInfo[0]?.package}`,
		)
	})

	await runStep("Search textures through manage_texture", async () => {
		const textureSearchResult = await callJsonTool("manage_texture", {
			action: "search_textures",
			params: {
				search_term: options.prefix,
				include_engine: false,
				limit: 20,
			},
		})
		assert(Array.isArray(textureSearchResult.assets), "manage_texture search_textures did not return an asset list")
		assert(
			firstAssetPathFromSearch(textureSearchResult) === texturePath,
			"manage_texture search_textures did not find the imported texture",
		)
	})

	await runStep("List generated assets through manage_asset", async () => {
		const listedAssets = await callJsonTool("manage_asset", {
			action: "list",
			params: {
				root_path: "/Game/MCP/Tests",
				recursive: true,
				limit: 50,
			},
		})
		assert(listedAssets.root_path === "/Game/MCP/Tests", "manage_asset list returned the wrong root path")
		assert(Array.isArray(listedAssets.assets), "manage_asset list did not return an assets list")
		assert(
			listedAssets.assets.some(
				(assetPath) =>
					assetPath === blueprintPath || String(assetPath).startsWith(`${blueprintPath}.`),
			)
				&& listedAssets.assets.some(
					(assetPath) =>
						assetPath === texturePath || String(assetPath).startsWith(`${texturePath}.`),
				),
			"manage_asset list did not include the expected generated assets",
		)
	})

	const exportedTextureFile = path.join(os.tmpdir(), `${options.prefix}_TextureExport.tga`)
	if (!options.keepAssets) {
		addCleanup(`Delete exported asset ${exportedTextureFile}`, async () => {
			try {
				fs.unlinkSync(exportedTextureFile)
			} catch {
				// Best effort only.
			}
		})
	}

	await runStep("Export a generated asset through manage_asset", async () => {
		const exportResult = await callJsonTool("manage_asset", {
			action: "export",
			params: {
				asset_path: texturePath,
				destination_path: exportedTextureFile,
				overwrite: true,
			},
		})
		assert(
			resolveLocalPath(exportResult.exported_file) === exportedTextureFile,
			"manage_asset export returned the wrong destination path",
		)
		assert(
			fs.existsSync(exportedTextureFile) && fs.statSync(exportedTextureFile).size > 0,
			"manage_asset export did not create a non-empty exported file",
		)
	})

	if (options.keepAssets) {
		console.log(`[INFO] Kept Blueprint asset: ${blueprintPath}`)
		console.log(`[INFO] Kept DataAsset: ${dataAssetPath}`)
		console.log(`[INFO] Kept DataTable: ${dataTablePath}`)
		console.log(`[INFO] Kept StringTable: ${stringTablePath}`)
		console.log(`[INFO] Kept Texture asset: ${texturePath}`)
		console.log(`[INFO] Kept temp texture file: ${tempTextureFile}`)
	}
}
