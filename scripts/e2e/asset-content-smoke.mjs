export async function runAssetContentScenarios(state) {
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
		StepSkipError,
		setProjectInfo,
		sequencePath,
		behaviorTreePath,
		gasAbilityPath,
		dataAssetPath,
		dataTablePath,
		stringTablePath,
		texturePath,
		blueprintPath,
		tempAudioFile,
		tempTextureFile,
		inputMappingName,
		generatedAssetPaths,
		originalClassicInputActionCount,
	} = state

	await runStep("Create a LevelSequence through manage_sequence", async () => {
		const sequenceCreateResult = await callJsonTool("manage_sequence", {
			action: "create_sequence",
			params: {
				name: sequencePath,
			},
		})
		assert(
			sequenceCreateResult.asset_path === sequencePath,
			`manage_sequence create_sequence returned an unexpected asset path: ${sequenceCreateResult.asset_path}`,
		)
	})

	await runStep("Search sequence assets through manage_sequence", async () => {
		const sequenceSearchResult = await callJsonTool("manage_sequence", {
			action: "search_sequences",
			params: { search_term: options.prefix },
		})
		assert(Array.isArray(sequenceSearchResult.assets), "manage_sequence search_sequences did not return an asset list")
		assert(
			firstAssetPathFromSearch(sequenceSearchResult) === sequencePath,
			"manage_sequence search_sequences did not find the created LevelSequence",
		)
	})

	await runStep("Read sequence metadata through manage_sequence", async () => {
		const sequenceInfo = await callJsonTool("manage_sequence", {
			action: "sequence_info",
			params: { asset_path: sequencePath },
		})
		assert(Array.isArray(sequenceInfo) && sequenceInfo.length === 1, "manage_sequence sequence_info did not return one asset record")
		assert(
			sequenceInfo[0].package === sequencePath,
			"manage_sequence sequence_info returned the wrong asset package",
		)
	})

	await runStep("Create a BehaviorTree through manage_behavior_tree", async () => {
		const behaviorTreeCreateResult = await callJsonTool("manage_behavior_tree", {
			action: "create_behavior_tree",
			params: {
				name: behaviorTreePath,
			},
		})
		assert(
			behaviorTreeCreateResult.asset_path === behaviorTreePath,
			`manage_behavior_tree create_behavior_tree returned an unexpected asset path: ${behaviorTreeCreateResult.asset_path}`,
		)
	})

	await runStep("Search behavior trees through manage_behavior_tree", async () => {
		const behaviorTreeSearchResult = await callJsonTool("manage_behavior_tree", {
			action: "search_behavior_trees",
			params: { search_term: options.prefix },
		})
		assert(Array.isArray(behaviorTreeSearchResult.assets), "manage_behavior_tree search_behavior_trees did not return an asset list")
		assert(
			firstAssetPathFromSearch(behaviorTreeSearchResult) === behaviorTreePath,
			"manage_behavior_tree search_behavior_trees did not find the created BehaviorTree",
		)
	})

	await runStep("Search AI assets through manage_behavior_tree", async () => {
		const aiAssetSearchResult = await callJsonTool("manage_behavior_tree", {
			action: "search_ai_assets",
			params: { search_term: options.prefix },
		})
		assert(Array.isArray(aiAssetSearchResult.assets), "manage_behavior_tree search_ai_assets did not return an asset list")
		assert(
			firstAssetPathFromSearch(aiAssetSearchResult) === behaviorTreePath,
			"manage_behavior_tree search_ai_assets did not find the created BehaviorTree",
		)
	})

	await runStep("Read behavior-tree metadata through manage_behavior_tree", async () => {
		const behaviorTreeInfo = await callJsonTool("manage_behavior_tree", {
			action: "behavior_tree_info",
			params: { asset_path: behaviorTreePath },
		})
		assert(Array.isArray(behaviorTreeInfo) && behaviorTreeInfo.length === 1, "manage_behavior_tree behavior_tree_info did not return one asset record")
		assert(
			behaviorTreeInfo[0].package === behaviorTreePath,
			"manage_behavior_tree behavior_tree_info returned the wrong asset package",
		)
	})

	let importedAudioCuePath = ""
	await runStep("Import audio through manage_audio", async () => {
		const audioImportResult = await callJsonTool("manage_audio", {
			action: "import_audio",
			params: {
				source_file: tempAudioFile,
				destination_path: "/Game/MCP/Tests",
				asset_name: `A_${options.prefix}`,
				auto_create_cue: true,
				cue_suffix: "_Cue",
			},
		})
		assert(
			typeof audioImportResult.sound_wave_path === "string" &&
				audioImportResult.sound_wave_path.includes(`/Game/MCP/Tests/A_${options.prefix}`),
			"manage_audio import_audio did not return the expected SoundWave path",
		)
		assert(
			typeof audioImportResult.sound_cue_path === "string" &&
				audioImportResult.sound_cue_path.endsWith(`A_${options.prefix}_Cue`),
			"manage_audio import_audio did not return the expected SoundCue path",
		)
		importedAudioCuePath = audioImportResult.sound_cue_path
		for (const importedAssetPath of [
			audioImportResult.sound_wave_path,
			audioImportResult.sound_cue_path,
		]) {
			if (
				typeof importedAssetPath === "string" &&
				importedAssetPath.length > 0 &&
				!generatedAssetPaths.includes(importedAssetPath)
			) {
				generatedAssetPaths.push(importedAssetPath)
			}
		}
	})

	await runStep("Search audio assets through manage_audio", async () => {
		const audioSearchResult = await callJsonTool("manage_audio", {
			action: "search_audio_assets",
			params: { search_term: options.prefix },
		})
		assert(Array.isArray(audioSearchResult.assets), "manage_audio search_audio_assets did not return an asset list")
		assert(
			firstAssetPathFromSearch(audioSearchResult) === importedAudioCuePath,
			"manage_audio search_audio_assets did not find the imported SoundCue",
		)
	})

	await runStep("Read audio metadata through manage_audio", async () => {
		const audioInfo = await callJsonTool("manage_audio", {
			action: "audio_info",
			params: { asset_path: importedAudioCuePath },
		})
		assert(Array.isArray(audioInfo) && audioInfo.length === 1, "manage_audio audio_info did not return one asset record")
		assert(
			audioInfo[0].package === importedAudioCuePath,
			"manage_audio audio_info returned the wrong asset package",
		)
	})

	let gasAbilityCreated = false
	await runStep("Create a GameplayAbility Blueprint for GAS smoke coverage", async () => {
		try {
			const gasBlueprintCreateResult = await callJsonTool("manage_blueprint", {
				action: "create_blueprint",
				params: {
					name: gasAbilityPath,
					parent_class: "/Script/GameplayAbilities.GameplayAbility",
				},
			})
			assert(
				gasBlueprintCreateResult.asset_path === gasAbilityPath,
				`GameplayAbility Blueprint was created at an unexpected path: ${gasBlueprintCreateResult.asset_path}`,
			)
			gasAbilityCreated = true
		} catch (error) {
			throw new StepSkipError(
				error instanceof Error
					? error.message
					: "GameplayAbility Blueprint creation is unavailable in this project or engine configuration.",
			)
		}
	})

	await runStep("Search GAS assets through manage_gas", async () => {
		if (!gasAbilityCreated) {
			throw new StepSkipError("GameplayAbility Blueprint creation is unavailable in this project or engine configuration.")
		}
		const gasSearchResult = await callJsonTool("manage_gas", {
			action: "search_gas_assets",
			params: { search_term: `GA_${options.prefix}` },
		})
		assert(Array.isArray(gasSearchResult.assets), "manage_gas search_gas_assets did not return an asset list")
		assert(
			firstAssetPathFromSearch(gasSearchResult) === gasAbilityPath,
			"manage_gas search_gas_assets did not find the created GameplayAbility Blueprint",
		)
	})

	await runStep("Read GAS asset metadata through manage_gas", async () => {
		if (!gasAbilityCreated) {
			throw new StepSkipError("GameplayAbility Blueprint creation is unavailable in this project or engine configuration.")
		}
		const gasAssetInfo = await callJsonTool("manage_gas", {
			action: "asset_info",
			params: { asset_path: gasAbilityPath },
		})
		assert(Array.isArray(gasAssetInfo) && gasAssetInfo.length === 1, "manage_gas asset_info did not return one asset record")
		assert(
			gasAssetInfo[0].package === gasAbilityPath,
			"manage_gas asset_info returned the wrong asset package",
		)
	})

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
