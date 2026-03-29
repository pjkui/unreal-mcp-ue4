import { runSourceControlMutationScenarios } from "./source-control-mutation-smoke.mjs"

export async function runAssetAuthoringScenarios(ctx) {
	const {
		fs,
		os,
		path,
		options,
		addCleanup,
		logSkip,
		runStep,
		callJsonTool,
		assert,
		resolveLocalPath,
		safeDeleteActor,
		safeDeleteAssets,
		safeStopPie,
		pollPieStatus,
		isUnsupportedWidgetTreeAuthoring,
		firstAssetPathFromSearch,
		projectRepoHasGitRemote,
		StepSkipError,
		paths: {
			basicShapeMaterialPath,
			actorTintMaterialPath,
			debugTintMaterialPath,
		},
		getProjectInfo,
		setProjectInfo,
		getProjectFilePath,
	} = ctx

	const projectInfo = getProjectInfo()
	const projectFilePath = getProjectFilePath()
	const blueprintPath = `/Game/MCP/Tests/BP_${options.prefix}`
	const sequencePath = `/Game/MCP/Tests/LS_${options.prefix}`
	const behaviorTreePath = `/Game/MCP/Tests/BT_${options.prefix}`
	const gasAbilityPath = `/Game/MCP/Tests/GA_${options.prefix}`
	const dataAssetPath = `/Game/MCP/Tests/DA_${options.prefix}`
	const dataTablePath = `/Game/MCP/Tests/DT_${options.prefix}`
	const stringTablePath = `/Game/MCP/Tests/ST_${options.prefix}`
	const texturePath = `/Game/MCP/Tests/T_${options.prefix}`
	const widgetPath = `/Game/MCP/Tests/WBP_${options.prefix}`
	const sourceControlAddAssetPath = `/Game/MCP/Tests/SC_Add_DA_${options.prefix}`
	const sourceControlDataAssetPath = `/Game/MCP/Tests/SC_DA_${options.prefix}`
	const tempTextureFile = path.join(os.tmpdir(), `${options.prefix}_Texture.png`)
	const tempAudioFile = path.join(os.tmpdir(), `${options.prefix}_Audio.wav`)
	const inputMappingName = `${options.prefix}_Action`
	const generatedAssetPaths = [
		widgetPath,
		texturePath,
		blueprintPath,
		sequencePath,
		behaviorTreePath,
		gasAbilityPath,
		dataAssetPath,
		dataTablePath,
		stringTablePath,
		sourceControlAddAssetPath,
		sourceControlDataAssetPath,
		actorTintMaterialPath,
		debugTintMaterialPath,
	]
	const projectDirectoryPath = path.dirname(projectFilePath)
	const defaultInputConfigPath = path.join(projectDirectoryPath, "Config", "DefaultInput.ini")
	const defaultEngineConfigPath = path.join(projectDirectoryPath, "Config", "DefaultEngine.ini")
	const projectHasGitRemote = projectRepoHasGitRemote(projectDirectoryPath)
	const originalDefaultInputConfig = fs.existsSync(defaultInputConfigPath)
		? fs.readFileSync(defaultInputConfigPath, "utf8")
		: null
	const originalClassicInputActionCount = Number(projectInfo.classic_input_actions_count ?? 0)
	let widgetAuthoringUnsupportedReason = ""
	let resolvedBlueprintMaterialPath = basicShapeMaterialPath
	const texturePixelBase64 =
		"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZSURBVBhXY/jPAEQNIAoO/oMBlEMQMDAAAO2DCXg4buGUAAAAAElFTkSuQmCC"
	fs.writeFileSync(tempTextureFile, Buffer.from(texturePixelBase64, "base64"))
	const createSilenceWavBuffer = (sampleRate = 8000, durationSeconds = 0.1) => {
		const numSamples = Math.max(1, Math.floor(sampleRate * durationSeconds))
		const dataSize = numSamples
		const buffer = Buffer.alloc(44 + dataSize)
		buffer.write("RIFF", 0, "ascii")
		buffer.writeUInt32LE(36 + dataSize, 4)
		buffer.write("WAVE", 8, "ascii")
		buffer.write("fmt ", 12, "ascii")
		buffer.writeUInt32LE(16, 16)
		buffer.writeUInt16LE(1, 20)
		buffer.writeUInt16LE(1, 22)
		buffer.writeUInt32LE(sampleRate, 24)
		buffer.writeUInt32LE(sampleRate, 28)
		buffer.writeUInt16LE(1, 32)
		buffer.writeUInt16LE(8, 34)
		buffer.write("data", 36, "ascii")
		buffer.writeUInt32LE(dataSize, 40)
		buffer.fill(128, 44)
		return buffer
	}
	fs.writeFileSync(tempAudioFile, createSilenceWavBuffer())

	if (!options.keepAssets) {
		addCleanup(
			`Delete assets for ${options.prefix}`,
			() => safeDeleteAssets(generatedAssetPaths),
		)
		addCleanup(`Delete temp image ${tempTextureFile}`, async () => {
			try {
				fs.unlinkSync(tempTextureFile)
			} catch {
				// Best effort only.
			}
		})
		addCleanup(`Delete temp audio ${tempAudioFile}`, async () => {
			try {
				fs.unlinkSync(tempAudioFile)
			} catch {
				// Best effort only.
			}
		})
		addCleanup(`Restore input config ${defaultInputConfigPath}`, async () => {
			try {
				if (originalDefaultInputConfig === null) {
					if (fs.existsSync(defaultInputConfigPath)) {
						fs.unlinkSync(defaultInputConfigPath)
					}
					return
				}

				fs.writeFileSync(defaultInputConfigPath, originalDefaultInputConfig, "utf8")
			} catch {
				// Best effort only.
			}
		})
	}

	await runStep("Create a Blueprint asset", async () => {
		const createResult = await callJsonTool("manage_blueprint", {
			action: "create_blueprint",
			params: {
				name: blueprintPath,
				parent_class: "Actor",
			},
		})
		assert(
			createResult.asset_path === blueprintPath,
			`manage_blueprint create_blueprint returned an unexpected asset path: ${createResult.asset_path}`,
		)
	})

	await runStep("Add a StaticMeshComponent to the Blueprint", async () => {
		const componentResult = await callJsonTool("manage_blueprint", {
			action: "add_component",
			params: {
				blueprint_name: blueprintPath,
				component_type: "StaticMeshComponent",
				component_name: "SmokeMesh",
			},
		})
		assert(componentResult.component?.name === "SmokeMesh", "Blueprint component was not created")
	})

	await runStep("Assign a mesh to the Blueprint component", async () => {
		await callJsonTool("manage_blueprint", {
			action: "set_static_mesh",
			params: {
				blueprint_name: blueprintPath,
				component_name: "SmokeMesh",
				static_mesh: "/Engine/BasicShapes/Cube",
			},
		})
	})

	await runStep("List materials through manage_material_authoring", async () => {
		const materialsResult = await callJsonTool("manage_material_authoring", {
			action: "list_materials",
			params: {
				search_term: "BasicShapeMaterial",
				include_engine: true,
				limit: 10,
			},
		})
		assert(Array.isArray(materialsResult.materials), "manage_material_authoring list_materials did not return a materials list")
		const discoveredMaterial = materialsResult.materials.find((material) =>
			String(material.path).includes("BasicShapeMaterial"),
		)
		assert(discoveredMaterial, "manage_material_authoring list_materials did not find BasicShapeMaterial")
		resolvedBlueprintMaterialPath = discoveredMaterial.path
	})

	await runStep("Apply a material to the Blueprint through manage_material_authoring", async () => {
		const applyResult = await callJsonTool("manage_material_authoring", {
			action: "apply_to_blueprint",
			params: {
				blueprint_name: blueprintPath,
				component_name: "SmokeMesh",
				material_path: resolvedBlueprintMaterialPath,
			},
		})
		assert(applyResult.blueprint === blueprintPath, "manage_material_authoring apply_to_blueprint returned the wrong blueprint")
		assert(
			String(applyResult.component).includes("SmokeMesh"),
			"manage_material_authoring apply_to_blueprint returned the wrong component",
		)
		assert(
			applyResult.material?.path === resolvedBlueprintMaterialPath,
			"manage_material_authoring apply_to_blueprint returned the wrong material path",
		)
	})

	await runStep("Set a Blueprint component property through manage_blueprint", async () => {
		const componentPropertyResult = await callJsonTool("manage_blueprint", {
			action: "set_component_property",
			params: {
				blueprint_name: blueprintPath,
				component_name: "SmokeMesh",
				property_name: "cast_shadow",
				property_value: false,
			},
		})
		assert(
			componentPropertyResult.blueprint === blueprintPath,
			"manage_blueprint set_component_property returned the wrong blueprint path",
		)
		assert(
			componentPropertyResult.component?.name === "SmokeMesh",
			"manage_blueprint set_component_property returned the wrong component summary",
		)
	})

	await runStep("Set Blueprint physics properties through manage_blueprint", async () => {
		const physicsPropertyResult = await callJsonTool("manage_blueprint", {
			action: "set_physics_properties",
			params: {
				blueprint_name: blueprintPath,
				component_name: "SmokeMesh",
				simulate_physics: false,
				gravity_enabled: false,
				mass: 2.0,
				linear_damping: 0.2,
				angular_damping: 0.1,
			},
		})
		assert(
			physicsPropertyResult.blueprint === blueprintPath,
			"manage_blueprint set_physics_properties returned the wrong blueprint path",
		)
		assert(
			physicsPropertyResult.component?.name === "SmokeMesh",
			"manage_blueprint set_physics_properties returned the wrong component summary",
		)
	})

	await runStep("Set a Blueprint default property through manage_blueprint", async () => {
		const blueprintPropertyResult = await callJsonTool("manage_blueprint", {
			action: "set_blueprint_property",
			params: {
				blueprint_name: blueprintPath,
				property_name: "can_be_damaged",
				property_value: true,
			},
		})
		assert(
			blueprintPropertyResult.blueprint === blueprintPath,
			"manage_blueprint set_blueprint_property returned the wrong blueprint path",
		)
		assert(
			blueprintPropertyResult.property_name === "can_be_damaged",
			"manage_blueprint set_blueprint_property returned the wrong property name",
		)
		assert(
			blueprintPropertyResult.property_value === true,
			"manage_blueprint set_blueprint_property returned the wrong property value",
		)
	})

	await runStep("Compile the Blueprint asset", async () => {
		const compileResult = await callJsonTool("manage_blueprint", {
			action: "compile",
			params: {
				blueprint_name: blueprintPath,
			},
		})
		assert(compileResult.blueprint === blueprintPath, "manage_blueprint compile returned an unexpected asset path")
	})

	await runStep("Set Blueprint physics properties through manage_animation_physics", async () => {
		const animationPhysicsResult = await callJsonTool("manage_animation_physics", {
			action: "set_physics_properties",
			params: {
				blueprint_name: blueprintPath,
				component_name: "SmokeMesh",
				simulate_physics: true,
				gravity_enabled: true,
				mass: 3.0,
				linear_damping: 0.15,
				angular_damping: 0.05,
			},
		})
		assert(
			animationPhysicsResult.blueprint === blueprintPath,
			"manage_animation_physics set_physics_properties returned the wrong blueprint path",
		)
		assert(
			animationPhysicsResult.component?.name === "SmokeMesh",
			"manage_animation_physics set_physics_properties returned the wrong component summary",
		)
	})

	await runStep("Compile the Blueprint through manage_animation_physics", async () => {
		const animationCompileResult = await callJsonTool("manage_animation_physics", {
			action: "compile_blueprint",
			params: {
				blueprint_name: blueprintPath,
			},
		})
		assert(
			animationCompileResult.blueprint === blueprintPath,
			"manage_animation_physics compile_blueprint returned the wrong blueprint path",
		)
		assert(
			animationCompileResult.compiled === true || animationCompileResult.saved === true,
			"manage_animation_physics compile_blueprint did not compile or save the Blueprint",
		)
	})

	await runStep("Read the Blueprint contents through manage_blueprint", async () => {
		const blueprintReadResult = await callJsonTool("manage_blueprint", {
			action: "read",
			params: {
				blueprint_name: blueprintPath,
				include_nodes: false,
			},
		})
		assert(
			blueprintReadResult.blueprint?.asset_path === blueprintPath,
			"manage_blueprint read returned the wrong asset path",
		)
		assert(
			typeof blueprintReadResult.blueprint?.generated_class === "string" &&
				blueprintReadResult.blueprint.generated_class.length > 0,
			"manage_blueprint read did not report a generated class",
		)
		assert(
			Array.isArray(blueprintReadResult.blueprint?.components),
			"manage_blueprint read did not return a components list",
		)
		assert(
			Array.isArray(blueprintReadResult.blueprint?.graphs),
			"manage_blueprint read did not return a graphs list",
		)
	})

	await runStep("Inspect the Blueprint through manage_inspection", async () => {
		const inspectionBlueprintResult = await callJsonTool("manage_inspection", {
			action: "blueprint",
			params: {
				blueprint_name: blueprintPath,
				include_nodes: false,
			},
		})
		assert(
			inspectionBlueprintResult.blueprint?.asset_path === blueprintPath,
			"manage_inspection blueprint returned the wrong asset path",
		)
		assert(
			typeof inspectionBlueprintResult.blueprint?.generated_class === "string" &&
				inspectionBlueprintResult.blueprint.generated_class.length > 0,
			"manage_inspection blueprint did not report a generated class",
		)
	})

	const blueprintActorName = `${options.prefix}_BlueprintActor`
	addCleanup(`Delete actor ${blueprintActorName}`, () => safeDeleteActor(blueprintActorName))
	const physicsBlueprintActorName = `${options.prefix}_PhysicsBlueprintActor`
	addCleanup(
		`Delete actor ${physicsBlueprintActorName}`,
		() => safeDeleteActor(physicsBlueprintActorName),
	)

	await runStep("Spawn the Blueprint through manage_actor", async () => {
		const blueprintSpawnResult = await callJsonTool("manage_actor", {
			action: "spawn_blueprint",
			params: {
				blueprint_name: blueprintPath,
				name: blueprintActorName,
				location: { x: 180, y: -180, z: 150 },
			},
		})
		assert(
			blueprintSpawnResult.blueprint === blueprintPath,
			"manage_actor spawn_blueprint returned the wrong blueprint path",
		)
		assert(
			blueprintSpawnResult.actor?.label === blueprintActorName,
			"manage_actor spawn_blueprint did not create the expected actor label",
		)
	})

	await runStep("Spawn a physics-enabled Blueprint actor through manage_animation_physics", async () => {
		const physicsSpawnResult = await callJsonTool("manage_animation_physics", {
			action: "spawn_physics_blueprint_actor",
			params: {
				blueprint_name: blueprintPath,
				name: physicsBlueprintActorName,
				location: { x: 320, y: -220, z: 220 },
				material_path: resolvedBlueprintMaterialPath,
				simulate_physics: true,
				gravity_enabled: true,
				mass: 3.0,
				linear_damping: 0.15,
				angular_damping: 0.05,
			},
		})
		assert(
			physicsSpawnResult.blueprint === blueprintPath,
			"manage_animation_physics spawn_physics_blueprint_actor returned the wrong blueprint path",
		)
		assert(
			physicsSpawnResult.actor?.label === physicsBlueprintActorName,
			"manage_animation_physics spawn_physics_blueprint_actor did not create the expected actor label",
		)
		assert(
			physicsSpawnResult.physics?.simulate_physics === true,
			"manage_animation_physics spawn_physics_blueprint_actor did not enable physics",
		)
		assert(
			Array.isArray(physicsSpawnResult.materials),
			"manage_animation_physics spawn_physics_blueprint_actor did not return component material info",
		)
	})

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

	await runStep("Create a Widget Blueprint through the tool-namespace layer", async () => {
		const createWidgetResult = await callJsonTool("manage_widget_authoring", {
			action: "create_widget_blueprint",
			params: { widget_name: widgetPath },
		})
		assert(
			createWidgetResult.asset_path === widgetPath,
			`Widget Blueprint was created at an unexpected path: ${createWidgetResult.asset_path}`,
		)
	})

	await runStep("Add a TextBlock to the Widget Blueprint", async () => {
		try {
			const textResult = await callJsonTool("manage_widget_authoring", {
				action: "add_text_block",
				params: {
					widget_name: widgetPath,
					text_block_name: "SmokeText",
					text: "UE4 smoke test",
					position: { x: 32, y: 32 },
				},
			})
			assert(textResult.widget?.name === "SmokeText", "TextBlock was not added to the widget blueprint")
		} catch (error) {
			if (isUnsupportedWidgetTreeAuthoring(error)) {
				widgetAuthoringUnsupportedReason =
					error instanceof Error ? error.message : "Widget tree authoring is unavailable in this UE4.27 Python environment."
				throw new StepSkipError(widgetAuthoringUnsupportedReason)
			}

			throw error
		}
	})

	if (widgetAuthoringUnsupportedReason) {
		logSkip("Add a Button to the Widget Blueprint", widgetAuthoringUnsupportedReason)
	} else {
		await runStep("Add a Button to the Widget Blueprint", async () => {
			try {
				const buttonResult = await callJsonTool("manage_widget_authoring", {
					action: "add_button",
					params: {
						widget_name: widgetPath,
						button_name: "SmokeButton",
						text: "Smoke",
						position: { x: 32, y: 96 },
					},
				})
				assert(buttonResult.widget?.name === "SmokeButton", "Button was not added to the widget blueprint")
			} catch (error) {
				if (isUnsupportedWidgetTreeAuthoring(error)) {
					widgetAuthoringUnsupportedReason =
						error instanceof Error ? error.message : "Widget tree authoring is unavailable in this UE4.27 Python environment."
					throw new StepSkipError(widgetAuthoringUnsupportedReason)
				}

				throw error
			}
		})

		await runStep("Move the TextBlock through advanced widget tooling", async () => {
			const moveTextResult = await callJsonTool("manage_widget_authoring", {
				action: "position_widget",
				params: {
					widget_blueprint_path: widgetPath,
					widget_name: "SmokeText",
					position: { x: 48, y: 40 },
					z_order: 1,
				},
			})
			assert(
				Math.abs(Number(moveTextResult.layout?.position?.x ?? 0) - 48) < 0.1,
				"Advanced widget move did not update the TextBlock X position",
			)
		})

		await runStep("Move the Button through advanced widget tooling", async () => {
			const moveButtonResult = await callJsonTool("manage_widget_authoring", {
				action: "position_widget",
				params: {
					widget_blueprint_path: widgetPath,
					widget_name: "SmokeButton",
					position: { x: 48, y: 112 },
					z_order: 2,
				},
			})
			assert(
				Math.abs(Number(moveButtonResult.layout?.position?.x ?? 0) - 48) < 0.1,
				"Advanced widget move did not update the Button X position",
			)
		})

		await runStep("Add a CanvasPanel through advanced widget tooling", async () => {
			const panelResult = await callJsonTool("manage_widget_authoring", {
				action: "add_widget",
				params: {
					widget_blueprint_path: widgetPath,
					widget_class: "CanvasPanel",
					widget_name: "SmokePanel",
					parent_widget_name: "CanvasPanel_0",
					position: { x: 160, y: 24 },
				},
			})
			assert(panelResult.widget_name === "SmokePanel", "CanvasPanel was not added through advanced widget tooling")
		})

		await runStep("Move the CanvasPanel through advanced widget tooling", async () => {
			const movePanelResult = await callJsonTool("manage_widget_authoring", {
				action: "position_widget",
				params: {
					widget_blueprint_path: widgetPath,
					widget_name: "SmokePanel",
					position: { x: 196, y: 40 },
					z_order: 1,
				},
			})
			assert(
				Math.abs(Number(movePanelResult.layout?.position?.x ?? 0) - 196) < 0.1,
				"Advanced widget move did not update the CanvasPanel X position",
			)
		})

		await runStep("Add a child widget through advanced widget tooling", async () => {
			const childResult = await callJsonTool("manage_widget_authoring", {
				action: "add_child_widget",
				params: {
					widget_blueprint_path: widgetPath,
					parent_widget_name: "SmokePanel",
					child_widget_class: "TextBlock",
					child_widget_name: "SmokeChildText",
					position: { x: 12, y: 18 },
				},
			})
			assert(childResult.child_widget_name === "SmokeChildText", "Child widget was not added through advanced widget tooling")
		})

		await runStep("Move the child widget through advanced widget tooling", async () => {
			const moveChildResult = await callJsonTool("manage_widget_authoring", {
				action: "position_child_widget",
				params: {
					widget_blueprint_path: widgetPath,
					parent_widget_name: "SmokePanel",
					child_widget_name: "SmokeChildText",
					position: { x: 48, y: 72 },
					z_order: 2,
				},
			})
			assert(
				Math.abs(Number(moveChildResult.layout?.position?.x ?? 0) - 48) < 0.1,
				"Advanced child widget move did not update the expected X position",
			)
		})

		await runStep("Add a second CanvasPanel through advanced widget tooling", async () => {
			const panelResult = await callJsonTool("manage_widget_authoring", {
				action: "add_widget",
				params: {
					widget_blueprint_path: widgetPath,
					widget_class: "CanvasPanel",
					widget_name: "SmokePanelHost",
					parent_widget_name: "CanvasPanel_0",
					position: { x: 320, y: 40 },
				},
			})
			assert(panelResult.widget_name === "SmokePanelHost", "Second CanvasPanel was not added through advanced widget tooling")
		})

		await runStep("Reparent the CanvasPanel through advanced widget tooling", async () => {
			const reparentResult = await callJsonTool("manage_widget_authoring", {
				action: "reparent_widget",
				params: {
					widget_blueprint_path: widgetPath,
					widget_name: "SmokePanel",
					new_parent_widget_name: "SmokePanelHost",
					position: { x: 24, y: 16 },
					z_order: 3,
				},
			})
			assert(
				reparentResult.old_parent_widget_name === "CanvasPanel_0",
				`Advanced widget reparent reported an unexpected old parent: ${reparentResult.old_parent_widget_name}`,
			)
			assert(
				reparentResult.new_parent_widget_name === "SmokePanelHost",
				"Advanced widget reparent did not report the expected new parent",
			)
			assert(
				Math.abs(Number(reparentResult.layout?.position?.x ?? 0) - 24) < 0.1,
				"Advanced widget reparent did not preserve the requested X position",
			)
		})

		await runStep("Remove the child widget through advanced widget tooling", async () => {
			const removeChildResult = await callJsonTool("manage_widget_authoring", {
				action: "remove_child_widget",
				params: {
					widget_blueprint_path: widgetPath,
					parent_widget_name: "SmokePanel",
					child_widget_name: "SmokeChildText",
				},
			})
			assert(removeChildResult.child_widget_name === "SmokeChildText", "Child widget was not removed through advanced widget tooling")
		})

		await runStep("Remove the CanvasPanel through advanced widget tooling", async () => {
			const removePanelResult = await callJsonTool("manage_widget_authoring", {
				action: "remove_widget",
				params: {
					widget_blueprint_path: widgetPath,
					widget_name: "SmokePanel",
				},
			})
			assert(removePanelResult.widget_name === "SmokePanel", "CanvasPanel was not removed through advanced widget tooling")
		})

		await runStep("Remove the second CanvasPanel through advanced widget tooling", async () => {
			const removePanelResult = await callJsonTool("manage_widget_authoring", {
				action: "remove_widget",
				params: {
					widget_blueprint_path: widgetPath,
					widget_name: "SmokePanelHost",
				},
			})
			assert(removePanelResult.widget_name === "SmokePanelHost", "Second CanvasPanel was not removed through advanced widget tooling")
		})
	}

	if (options.keepAssets) {
		console.log(`[INFO] Kept Widget Blueprint asset: ${widgetPath}`)
	}

	await runStep("Read PIE status through manage_editor", async () => {
		await safeStopPie()
		const pieStatus = await callJsonTool("manage_editor", {
			action: "is_pie_running",
			params: {},
		})
		assert(typeof pieStatus.is_pie_running === "boolean", "manage_editor is_pie_running did not return a boolean status")
		assert(pieStatus.is_pie_running === false, "manage_editor is_pie_running reported PIE before the test started")
	})

	await runStep("Start PIE through manage_editor", async () => {
		const pieStart = await callJsonTool("manage_editor", {
			action: "start_pie",
			params: { timeout_seconds: 10, poll_interval: 0.25 },
		})
		assert(pieStart.success === true, "manage_editor start_pie did not acknowledge the request")
		const pieStatus = await pollPieStatus(true)
		assert(pieStatus?.is_pie_running === true, "manage_editor start_pie did not lead to a running PIE session")
		assert(Number.isFinite(pieStatus?.pie_world_count), "manage_editor is_pie_running did not return pie_world_count")
	})

	await runStep("Add the Widget Blueprint to the viewport", async () => {
		const viewportResult = await callJsonTool("manage_widget_authoring", {
			action: "add_to_viewport",
			params: {
				widget_name: widgetPath,
				z_order: 5,
			},
		})
		assert(
			viewportResult.widget_blueprint === widgetPath,
			"manage_widget_authoring add_to_viewport returned the wrong widget blueprint path",
		)
		assert(
			typeof viewportResult.widget_class === "string" && viewportResult.widget_class.length > 0,
			"manage_widget_authoring add_to_viewport did not return a widget class",
		)
	})

	await runStep("Stop PIE through manage_editor", async () => {
		const pieStop = await callJsonTool("manage_editor", {
			action: "stop_pie",
			params: { timeout_seconds: 10, poll_interval: 0.25 },
		})
		assert(pieStop.success === true, "manage_editor stop_pie did not acknowledge the request")
		const pieStatus = await pollPieStatus(false)
		assert(pieStatus?.is_pie_running === false, "manage_editor stop_pie did not stop the PIE session")
	})

	if (options.withSourceControlMutations) {
		await runSourceControlMutationScenarios(ctx, {
			sourceControlAddAssetPath,
			sourceControlDataAssetPath,
			defaultEngineConfigPath,
			projectHasGitRemote,
		})
	}
}
