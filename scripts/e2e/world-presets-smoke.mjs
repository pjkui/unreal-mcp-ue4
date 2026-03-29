export async function runWorldPresetScenarios(ctx) {
	const { options, addCleanup, runStep, callJsonTool, assert, safeDeleteActors } = ctx

	const levelPrefix = `${options.prefix}_LevelWall`
	const levelMazePrefix = `${options.prefix}_LevelMaze`
	const levelPyramidPrefix = `${options.prefix}_LevelPyramid`
	const levelBridgePrefix = `${options.prefix}_LevelBridge`
	const levelTownPrefix = `${options.prefix}_LevelTown`
	const levelStructurePrefix = `${options.prefix}_House`
	const levelStructureTownPrefix = `${options.prefix}_StructureTown`
	const levelStructureBridgePrefix = `${options.prefix}_Bridge`
	const levelStructureSuspensionBridgePrefix = `${options.prefix}_SuspensionBridge`
	const levelStructureAqueductPrefix = `${options.prefix}_Aqueduct`
	const levelStructureCastlePrefix = `${options.prefix}_CastleFortress`
	const levelStructureMansionPrefix = `${options.prefix}_Mansion`
	const levelStructureTowerPrefix = `${options.prefix}_Tower`
	const levelStructureWallPrefix = `${options.prefix}_FortWall`
	const environmentPrefix = `${options.prefix}_Arch`
	const environmentTownPrefix = `${options.prefix}_EnvTown`
	const environmentStairPrefix = `${options.prefix}_EnvStair`
	const environmentPyramidPrefix = `${options.prefix}_Pyramid`
	const environmentMazePrefix = `${options.prefix}_EnvMaze`
	const geometryPrefix = `${options.prefix}_Stairs`
	const geometryArchPrefix = `${options.prefix}_GeoArch`
	const geometryWallPrefix = `${options.prefix}_GeoWall`
	const geometryPyramidPrefix = `${options.prefix}_GeoPyramid`

	await runStep("Create a wall through manage_level", async () => {
		const levelResult = await callJsonTool("manage_level", {
			action: "create_wall",
			params: {
				prefix: levelPrefix,
				location: { x: 700, y: 320, z: 0 },
				length: 260,
				height: 160,
				thickness: 30,
			},
		})
		assert(levelResult.structure === "create_wall", "manage_level create_wall returned the wrong structure")
		assert(Number(levelResult.actor_count) > 0, "manage_level create_wall did not spawn any actors")
		addCleanup(
			`Delete level actors for ${levelPrefix}`,
			() => safeDeleteActors((levelResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a maze through manage_level", async () => {
		const mazeResult = await callJsonTool("manage_level", {
			action: "create_maze",
			params: {
				prefix: levelMazePrefix,
				location: { x: 760, y: 640, z: 0 },
				rows: 4,
				cols: 5,
				cell_size: 180,
				wall_height: 140,
				wall_thickness: 24,
				seed: 42,
			},
		})
		assert(mazeResult.structure === "create_maze", "manage_level create_maze returned the wrong structure")
		assert(Number(mazeResult.actor_count) > 0, "manage_level create_maze did not spawn any actors")
		addCleanup(
			`Delete level actors for ${levelMazePrefix}`,
			() => safeDeleteActors((mazeResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a pyramid through manage_level", async () => {
		const pyramidResult = await callJsonTool("manage_level", {
			action: "create_pyramid",
			params: {
				prefix: levelPyramidPrefix,
				location: { x: 980, y: 760, z: 0 },
				levels: 3,
				block_size: 140,
			},
		})
		assert(pyramidResult.structure === "create_pyramid", "manage_level create_pyramid returned the wrong structure")
		assert(Number(pyramidResult.actor_count) > 0, "manage_level create_pyramid did not spawn any actors")
		addCleanup(
			`Delete level actors for ${levelPyramidPrefix}`,
			() => safeDeleteActors((pyramidResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a bridge through manage_level", async () => {
		const bridgeResult = await callJsonTool("manage_level", {
			action: "create_bridge",
			params: {
				prefix: levelBridgePrefix,
				location: { x: 1120, y: 860, z: 0 },
				segments: 4,
				segment_length: 140,
				width: 120,
				thickness: 24,
				rail_height: 50,
			},
		})
		assert(bridgeResult.structure === "create_bridge", "manage_level create_bridge returned the wrong structure")
		assert(Number(bridgeResult.actor_count) > 0, "manage_level create_bridge did not spawn any actors")
		addCleanup(
			`Delete level actors for ${levelBridgePrefix}`,
			() => safeDeleteActors((bridgeResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a town through manage_level", async () => {
		const townResult = await callJsonTool("manage_level", {
			action: "create_town",
			params: {
				prefix: levelTownPrefix,
				location: { x: 1480, y: 760, z: 0 },
				rows: 1,
				cols: 2,
				spacing: 650,
			},
		})
		assert(townResult.structure === "create_town", "manage_level create_town returned the wrong structure")
		assert(Number(townResult.actor_count) >= 10, "manage_level create_town did not spawn enough actors")
		addCleanup(
			`Delete level actors for ${levelTownPrefix}`,
			() => safeDeleteActors((townResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Construct a house through manage_level_structure", async () => {
		const structureResult = await callJsonTool("manage_level_structure", {
			action: "construct_house",
			params: {
				prefix: levelStructurePrefix,
				location: { x: 960, y: 320, z: 0 },
				width: 260,
				depth: 220,
				wall_height: 180,
				roof_height: 60,
			},
		})
		assert(
			structureResult.structure === "construct_house",
			"manage_level_structure construct_house returned the wrong structure",
		)
		assert(Number(structureResult.actor_count) >= 5, "manage_level_structure construct_house did not spawn enough actors")
		addCleanup(
			`Delete level-structure actors for ${levelStructurePrefix}`,
			() => safeDeleteActors((structureResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Read world outliner through manage_level_structure", async () => {
		const outliner = await callJsonTool("manage_level_structure", {
			action: "world_outliner",
			params: {},
		})
		assert(Array.isArray(outliner.actors), "manage_level_structure world_outliner did not return an actor list")
		assert(Number.isFinite(outliner.total_actors), "manage_level_structure world_outliner did not return total_actors")
	})

	await runStep("Create a town through manage_level_structure", async () => {
		const townResult = await callJsonTool("manage_level_structure", {
			action: "create_town",
			params: {
				prefix: levelStructureTownPrefix,
				location: { x: 1260, y: 540, z: 0 },
				rows: 1,
				cols: 1,
				spacing: 650,
			},
		})
		assert(townResult.structure === "create_town", "manage_level_structure create_town returned the wrong structure")
		assert(Number(townResult.actor_count) > 0, "manage_level_structure create_town did not spawn any actors")
		addCleanup(
			`Delete level-structure actors for ${levelStructureTownPrefix}`,
			() => safeDeleteActors((townResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a bridge through manage_level_structure", async () => {
		const bridgeResult = await callJsonTool("manage_level_structure", {
			action: "create_bridge",
			params: {
				prefix: levelStructureBridgePrefix,
				location: { x: 1100, y: 480, z: 0 },
				span_length: 320,
				width: 120,
				deck_thickness: 20,
				rail_height: 45,
			},
		})
		assert(bridgeResult.structure === "create_bridge", "manage_level_structure create_bridge returned the wrong structure")
		assert(Number(bridgeResult.actor_count) > 0, "manage_level_structure create_bridge did not spawn any actors")
		addCleanup(
			`Delete level-structure actors for ${levelStructureBridgePrefix}`,
			() => safeDeleteActors((bridgeResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a suspension bridge through manage_level_structure", async () => {
		const bridgeResult = await callJsonTool("manage_level_structure", {
			action: "create_suspension_bridge",
			params: {
				prefix: levelStructureSuspensionBridgePrefix,
				location: { x: 1460, y: 620, z: 0 },
				segments: 3,
				segment_length: 140,
				tower_height: 320,
			},
		})
		assert(
			bridgeResult.structure === "create_suspension_bridge",
			"manage_level_structure create_suspension_bridge returned the wrong structure",
		)
		assert(Number(bridgeResult.actor_count) > 0, "manage_level_structure create_suspension_bridge did not spawn any actors")
		addCleanup(
			`Delete level-structure actors for ${levelStructureSuspensionBridgePrefix}`,
			() => safeDeleteActors((bridgeResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create an aqueduct through manage_level_structure", async () => {
		const aqueductResult = await callJsonTool("manage_level_structure", {
			action: "create_aqueduct",
			params: {
				prefix: levelStructureAqueductPrefix,
				location: { x: 1660, y: 760, z: 0 },
				arches: 3,
				spacing: 260,
			},
		})
		assert(
			aqueductResult.structure === "create_aqueduct",
			"manage_level_structure create_aqueduct returned the wrong structure",
		)
		assert(Number(aqueductResult.actor_count) > 0, "manage_level_structure create_aqueduct did not spawn any actors")
		addCleanup(
			`Delete level-structure actors for ${levelStructureAqueductPrefix}`,
			() => safeDeleteActors((aqueductResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Construct a mansion through manage_level_structure", async () => {
		const mansionResult = await callJsonTool("manage_level_structure", {
			action: "construct_mansion",
			params: {
				prefix: levelStructureMansionPrefix,
				location: { x: 1840, y: 360, z: 0 },
				width: 720,
				depth: 520,
				wall_height: 280,
				roof_height: 90,
				wing_offset: 520,
			},
		})
		assert(
			mansionResult.structure === "construct_mansion",
			"manage_level_structure construct_mansion returned the wrong structure",
		)
		assert(Number(mansionResult.actor_count) >= 15, "manage_level_structure construct_mansion did not spawn enough actors")
		addCleanup(
			`Delete level-structure actors for ${levelStructureMansionPrefix}`,
			() => safeDeleteActors((mansionResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a tower through manage_level_structure", async () => {
		const towerResult = await callJsonTool("manage_level_structure", {
			action: "create_tower",
			params: {
				prefix: levelStructureTowerPrefix,
				location: { x: 2100, y: 640, z: 0 },
				width: 240,
				floors: 4,
				floor_height: 180,
			},
		})
		assert(towerResult.structure === "create_tower", "manage_level_structure create_tower returned the wrong structure")
		assert(Number(towerResult.actor_count) >= 5, "manage_level_structure create_tower did not spawn enough actors")
		addCleanup(
			`Delete level-structure actors for ${levelStructureTowerPrefix}`,
			() => safeDeleteActors((towerResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a wall through manage_level_structure", async () => {
		const wallResult = await callJsonTool("manage_level_structure", {
			action: "create_wall",
			params: {
				prefix: levelStructureWallPrefix,
				location: { x: 2300, y: 520, z: 160 },
				segments: 5,
				segment_length: 160,
				height: 220,
				thickness: 40,
			},
		})
		assert(wallResult.structure === "create_wall", "manage_level_structure create_wall returned the wrong structure")
		assert(Number(wallResult.actor_count) > 0, "manage_level_structure create_wall did not spawn any actors")
		addCleanup(
			`Delete level-structure actors for ${levelStructureWallPrefix}`,
			() => safeDeleteActors((wallResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a castle fortress through manage_level_structure", async () => {
		const fortressResult = await callJsonTool("manage_level_structure", {
			action: "create_castle_fortress",
			params: {
				prefix: levelStructureCastlePrefix,
				location: { x: 2540, y: 680, z: 0 },
				size: 900,
				segments: 3,
				height: 220,
				thickness: 40,
				tower_width: 160,
			},
		})
		assert(
			fortressResult.structure === "create_castle_fortress",
			"manage_level_structure create_castle_fortress returned the wrong structure",
		)
		assert(
			Number(fortressResult.actor_count) > 0,
			"manage_level_structure create_castle_fortress did not spawn any actors",
		)
		addCleanup(
			`Delete level-structure actors for ${levelStructureCastlePrefix}`,
			() => safeDeleteActors((fortressResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create an arch through manage_environment", async () => {
		const environmentResult = await callJsonTool("manage_environment", {
			action: "create_arch",
			params: {
				prefix: environmentPrefix,
				location: { x: 1260, y: 320, z: 0 },
				span_width: 220,
				pillar_height: 180,
				pillar_width: 40,
				beam_height: 40,
			},
		})
		assert(environmentResult.structure === "create_arch", "manage_environment create_arch returned the wrong structure")
		assert(Number(environmentResult.actor_count) === 3, "manage_environment create_arch did not spawn the expected actor count")
		addCleanup(
			`Delete environment actors for ${environmentPrefix}`,
			() => safeDeleteActors((environmentResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a pyramid through manage_environment", async () => {
		const pyramidResult = await callJsonTool("manage_environment", {
			action: "create_pyramid",
			params: {
				prefix: environmentPyramidPrefix,
				location: { x: 1380, y: 520, z: 0 },
				base_size: 260,
				levels: 4,
				level_height: 36,
			},
		})
		assert(pyramidResult.structure === "create_pyramid", "manage_environment create_pyramid returned the wrong structure")
		assert(Number(pyramidResult.actor_count) > 0, "manage_environment create_pyramid did not spawn any actors")
		addCleanup(
			`Delete environment actors for ${environmentPyramidPrefix}`,
			() => safeDeleteActors((pyramidResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a staircase through manage_environment", async () => {
		const stairResult = await callJsonTool("manage_environment", {
			action: "create_staircase",
			params: {
				prefix: environmentStairPrefix,
				location: { x: 1560, y: 760, z: 0 },
				steps: 5,
				step_width: 180,
				step_height: 24,
				step_depth: 80,
			},
		})
		assert(stairResult.structure === "create_staircase", "manage_environment create_staircase returned the wrong structure")
		assert(Number(stairResult.actor_count) === 5, "manage_environment create_staircase did not spawn the expected actor count")
		addCleanup(
			`Delete environment actors for ${environmentStairPrefix}`,
			() => safeDeleteActors((stairResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a maze through manage_environment", async () => {
		const mazeResult = await callJsonTool("manage_environment", {
			action: "create_maze",
			params: {
				prefix: environmentMazePrefix,
				location: { x: 1760, y: 860, z: 0 },
				rows: 3,
				cols: 4,
				cell_size: 160,
				wall_height: 130,
				wall_thickness: 22,
				seed: 99,
			},
		})
		assert(mazeResult.structure === "create_maze", "manage_environment create_maze returned the wrong structure")
		assert(Number(mazeResult.actor_count) > 0, "manage_environment create_maze did not spawn any actors")
		addCleanup(
			`Delete environment actors for ${environmentMazePrefix}`,
			() => safeDeleteActors((mazeResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a town through manage_environment", async () => {
		const townResult = await callJsonTool("manage_environment", {
			action: "create_town",
			params: {
				prefix: environmentTownPrefix,
				location: { x: 1980, y: 860, z: 0 },
				rows: 1,
				cols: 2,
				spacing: 640,
			},
		})
		assert(townResult.structure === "create_town", "manage_environment create_town returned the wrong structure")
		assert(Number(townResult.actor_count) >= 10, "manage_environment create_town did not spawn enough actors")
		addCleanup(
			`Delete environment actors for ${environmentTownPrefix}`,
			() => safeDeleteActors((townResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a staircase through manage_geometry", async () => {
		const geometryResult = await callJsonTool("manage_geometry", {
			action: "create_staircase",
			params: {
				prefix: geometryPrefix,
				location: { x: 1500, y: 320, z: 0 },
				steps: 4,
				step_width: 180,
				step_height: 30,
				step_depth: 90,
			},
		})
		assert(geometryResult.structure === "create_staircase", "manage_geometry create_staircase returned the wrong structure")
		assert(Number(geometryResult.actor_count) === 4, "manage_geometry create_staircase did not spawn the expected actor count")
		addCleanup(
			`Delete geometry actors for ${geometryPrefix}`,
			() => safeDeleteActors((geometryResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create an arch through manage_geometry", async () => {
		const geometryArchResult = await callJsonTool("manage_geometry", {
			action: "create_arch",
			params: {
				prefix: geometryArchPrefix,
				location: { x: 1720, y: 520, z: 0 },
				span_width: 180,
				pillar_height: 150,
				pillar_width: 35,
				beam_height: 30,
			},
		})
		assert(geometryArchResult.structure === "create_arch", "manage_geometry create_arch returned the wrong structure")
		assert(Number(geometryArchResult.actor_count) > 0, "manage_geometry create_arch did not spawn any actors")
		addCleanup(
			`Delete geometry actors for ${geometryArchPrefix}`,
			() => safeDeleteActors((geometryArchResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a wall through manage_geometry", async () => {
		const geometryWallResult = await callJsonTool("manage_geometry", {
			action: "create_wall",
			params: {
				prefix: geometryWallPrefix,
				location: { x: 2220, y: 860, z: 140 },
				segments: 4,
				segment_length: 140,
				height: 200,
				thickness: 32,
			},
		})
		assert(geometryWallResult.structure === "create_wall", "manage_geometry create_wall returned the wrong structure")
		assert(Number(geometryWallResult.actor_count) > 0, "manage_geometry create_wall did not spawn any actors")
		addCleanup(
			`Delete geometry actors for ${geometryWallPrefix}`,
			() => safeDeleteActors((geometryWallResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})

	await runStep("Create a pyramid through manage_geometry", async () => {
		const geometryPyramidResult = await callJsonTool("manage_geometry", {
			action: "create_pyramid",
			params: {
				prefix: geometryPyramidPrefix,
				location: { x: 2400, y: 960, z: 0 },
				levels: 3,
				block_size: 120,
			},
		})
		assert(geometryPyramidResult.structure === "create_pyramid", "manage_geometry create_pyramid returned the wrong structure")
		assert(Number(geometryPyramidResult.actor_count) > 0, "manage_geometry create_pyramid did not spawn any actors")
		addCleanup(
			`Delete geometry actors for ${geometryPyramidPrefix}`,
			() => safeDeleteActors((geometryPyramidResult.actors || []).map((actor) => actor.label || actor.name)),
		)
	})
}
