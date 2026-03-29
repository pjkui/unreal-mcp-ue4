export async function runWorldActorScenarios(ctx) {
	const {
		options,
		path,
		addCleanup,
		runStep,
		callJsonTool,
		assert,
		safeDeleteActor,
		paths: { tintableMaterialPath, debugTintMaterialPath },
	} = ctx

	const lightActorName = `${options.prefix}_PointLight`
	const directionalLightActorName = `${options.prefix}_DirectionalLight`
	const spotLightActorName = `${options.prefix}_SpotLight`
	const navBoundsVolumeName = `${options.prefix}_NavBounds`
	const navModifierVolumeName = `${options.prefix}_NavModifier`
	const navLinkProxyName = `${options.prefix}_NavLinkProxy`
	const triggerVolumeName = `${options.prefix}_TriggerVolume`
	const blockingVolumeName = `${options.prefix}_BlockingVolume`
	const physicsVolumeName = `${options.prefix}_PhysicsVolume`
	const audioVolumeName = `${options.prefix}_AudioVolume`
	const debugShapeActorName = `cube_${options.prefix}_DebugShape`
	const splineActorName = `${options.prefix}_SplineHost`

	addCleanup(`Delete actor ${lightActorName}`, () => safeDeleteActor(lightActorName))
	addCleanup(`Delete actor ${directionalLightActorName}`, () => safeDeleteActor(directionalLightActorName))
	addCleanup(`Delete actor ${spotLightActorName}`, () => safeDeleteActor(spotLightActorName))
	addCleanup(`Delete actor ${navBoundsVolumeName}`, () => safeDeleteActor(navBoundsVolumeName))
	addCleanup(`Delete actor ${navModifierVolumeName}`, () => safeDeleteActor(navModifierVolumeName))
	addCleanup(`Delete actor ${navLinkProxyName}`, () => safeDeleteActor(navLinkProxyName))
	addCleanup(`Delete actor ${triggerVolumeName}`, () => safeDeleteActor(triggerVolumeName))
	addCleanup(`Delete actor ${blockingVolumeName}`, () => safeDeleteActor(blockingVolumeName))
	addCleanup(`Delete actor ${physicsVolumeName}`, () => safeDeleteActor(physicsVolumeName))
	addCleanup(`Delete actor ${audioVolumeName}`, () => safeDeleteActor(audioVolumeName))
	addCleanup(`Delete actor ${debugShapeActorName}`, () => safeDeleteActor(debugShapeActorName))
	addCleanup(`Delete actor ${splineActorName}`, () => safeDeleteActor(splineActorName))

	await runStep("Spawn a point light through manage_lighting", async () => {
		const lightResult = await callJsonTool("manage_lighting", {
			action: "spawn_point_light",
			params: {
				name: lightActorName,
				location: { x: -300, y: 300, z: 240 },
			},
		})
		assert(lightResult.actor?.label === lightActorName, "manage_lighting spawn_point_light did not create the expected actor")
	})

	await runStep("Spawn a directional light through manage_lighting", async () => {
		const directionalLightResult = await callJsonTool("manage_lighting", {
			action: "spawn_directional_light",
			params: {
				name: directionalLightActorName,
				location: { x: -420, y: 320, z: 320 },
				rotation: { pitch: -35, yaw: 15, roll: 0 },
			},
		})
		assert(
			directionalLightResult.actor?.label === directionalLightActorName,
			"manage_lighting spawn_directional_light did not create the expected actor",
		)
	})

	await runStep("Spawn a spot light through manage_lighting", async () => {
		const spotLightResult = await callJsonTool("manage_lighting", {
			action: "spawn_spot_light",
			params: {
				name: spotLightActorName,
				location: { x: -80, y: 300, z: 280 },
				rotation: { pitch: -45, yaw: 0, roll: 0 },
			},
		})
		assert(
			spotLightResult.actor?.label === spotLightActorName,
			"manage_lighting spawn_spot_light did not create the expected actor",
		)
	})

	await runStep("Move the point light through manage_lighting", async () => {
		const transformResult = await callJsonTool("manage_lighting", {
			action: "transform_light",
			params: {
				name: lightActorName,
				location: { x: -180, y: 300, z: 260 },
			},
		})
		assert(
			Math.abs(Number(transformResult.actor?.location?.x ?? 0) - -180) < 0.1,
			"manage_lighting transform_light did not update the expected X location",
		)
	})

	await runStep("Inspect lighting through manage_lighting", async () => {
		const lightingInfo = await callJsonTool("manage_lighting", {
			action: "inspect_lighting",
			params: {},
		})
		assert(typeof lightingInfo.map_name === "string" && lightingInfo.map_name.length > 0, "manage_lighting inspect_lighting did not return map_name")
		assert(Number.isFinite(lightingInfo.lighting?.point_lights), "manage_lighting inspect_lighting did not return point_lights")
	})

	await runStep("Delete the point light smoke-test actor", async () => {
		await callJsonTool("manage_actor", {
			action: "delete",
			params: { name: lightActorName },
		})
	})

	await runStep("Spawn a nav-mesh bounds volume through manage_navigation", async () => {
		const navVolumeResult = await callJsonTool("manage_navigation", {
			action: "spawn_nav_mesh_bounds_volume",
			params: {
				name: navBoundsVolumeName,
				location: { x: 420, y: 320, z: 0 },
				scale: { x: 4, y: 4, z: 2 },
			},
		})
		assert(
			navVolumeResult.actor_label === navBoundsVolumeName,
			"manage_navigation spawn_nav_mesh_bounds_volume did not create the expected actor label",
		)
	})

	await runStep("Spawn a nav modifier volume through manage_navigation", async () => {
		const navModifierResult = await callJsonTool("manage_navigation", {
			action: "spawn_nav_modifier_volume",
			params: {
				name: navModifierVolumeName,
				location: { x: 470, y: 250, z: 0 },
				scale: { x: 2, y: 2, z: 2 },
			},
		})
		assert(
			navModifierResult.actor_label === navModifierVolumeName,
			"manage_navigation spawn_nav_modifier_volume did not create the expected actor label",
		)
	})

	await runStep("Spawn a nav link proxy through manage_navigation", async () => {
		const navLinkResult = await callJsonTool("manage_navigation", {
			action: "spawn_nav_link_proxy",
			params: {
				name: navLinkProxyName,
				location: { x: 520, y: 250, z: 0 },
			},
		})
		assert(
			navLinkResult.actor_label === navLinkProxyName,
			"manage_navigation spawn_nav_link_proxy did not create the expected actor label",
		)
	})

	await runStep("Inspect navigation through manage_navigation", async () => {
		const navigationInfo = await callJsonTool("manage_navigation", {
			action: "inspect_navigation",
			params: {},
		})
		assert(
			typeof navigationInfo.map_name === "string" && navigationInfo.map_name.length > 0,
			"manage_navigation inspect_navigation did not return map_name",
		)
		assert(
			Number.isFinite(navigationInfo.total_actors),
			"manage_navigation inspect_navigation did not return total_actors",
		)
	})

	await runStep("Delete the nav-mesh bounds volume", async () => {
		await callJsonTool("manage_actor", {
			action: "delete",
			params: { name: navBoundsVolumeName },
		})
	})

	await runStep("Delete the nav modifier volume", async () => {
		await callJsonTool("manage_actor", {
			action: "delete",
			params: { name: navModifierVolumeName },
		})
	})

	await runStep("Delete the nav link proxy", async () => {
		await callJsonTool("manage_actor", {
			action: "delete",
			params: { name: navLinkProxyName },
		})
	})

	await runStep("Spawn a trigger volume through manage_volumes", async () => {
		const triggerVolumeResult = await callJsonTool("manage_volumes", {
			action: "spawn_trigger_volume",
			params: {
				name: triggerVolumeName,
				location: { x: 520, y: 320, z: 0 },
				scale: { x: 2, y: 2, z: 2 },
			},
		})
		assert(
			triggerVolumeResult.actor_label === triggerVolumeName,
			"manage_volumes spawn_trigger_volume did not create the expected actor label",
		)
	})

	await runStep("Spawn a blocking volume through manage_volumes", async () => {
		const blockingVolumeResult = await callJsonTool("manage_volumes", {
			action: "spawn_blocking_volume",
			params: {
				name: blockingVolumeName,
				location: { x: 600, y: 260, z: 0 },
				scale: { x: 2, y: 2, z: 2 },
			},
		})
		assert(
			blockingVolumeResult.actor_label === blockingVolumeName,
			"manage_volumes spawn_blocking_volume did not create the expected actor label",
		)
	})

	await runStep("Spawn a physics volume through manage_volumes", async () => {
		const physicsVolumeResult = await callJsonTool("manage_volumes", {
			action: "spawn_physics_volume",
			params: {
				name: physicsVolumeName,
				location: { x: 650, y: 260, z: 0 },
				scale: { x: 2, y: 2, z: 2 },
			},
		})
		assert(
			physicsVolumeResult.actor_label === physicsVolumeName,
			"manage_volumes spawn_physics_volume did not create the expected actor label",
		)
	})

	await runStep("Spawn an audio volume through manage_volumes", async () => {
		const audioVolumeResult = await callJsonTool("manage_volumes", {
			action: "spawn_audio_volume",
			params: {
				name: audioVolumeName,
				location: { x: 700, y: 260, z: 0 },
				scale: { x: 2, y: 2, z: 2 },
			},
		})
		assert(
			audioVolumeResult.actor_label === audioVolumeName,
			"manage_volumes spawn_audio_volume did not create the expected actor label",
		)
	})

	await runStep("Transform the trigger volume through manage_volumes", async () => {
		const transformVolumeResult = await callJsonTool("manage_volumes", {
			action: "transform_volume",
			params: {
				name: triggerVolumeName,
				location: { x: 560, y: 320, z: 32 },
				scale: { x: 3, y: 2, z: 2 },
			},
		})
		assert(
			Math.abs(Number(transformVolumeResult.actor?.location?.x ?? 0) - 560) < 0.1,
			"manage_volumes transform_volume did not update the expected X location",
		)
	})

	await runStep("Delete the trigger volume through manage_volumes", async () => {
		await callJsonTool("manage_volumes", {
			action: "delete_volume",
			params: { name: triggerVolumeName },
		})
	})

	await runStep("Delete the blocking volume through manage_volumes", async () => {
		await callJsonTool("manage_volumes", {
			action: "delete_volume",
			params: { name: blockingVolumeName },
		})
	})

	await runStep("Delete the physics volume through manage_volumes", async () => {
		await callJsonTool("manage_volumes", {
			action: "delete_volume",
			params: { name: physicsVolumeName },
		})
	})

	await runStep("Delete the audio volume through manage_volumes", async () => {
		await callJsonTool("manage_volumes", {
			action: "delete_volume",
			params: { name: audioVolumeName },
		})
	})

	await runStep("Spawn a debug shape through manage_effect", async () => {
		const effectResult = await callJsonTool("manage_effect", {
			action: "spawn_debug_shape",
			params: {
				shape: "cube",
				name: `${options.prefix}_DebugShape`,
				location: { x: 640, y: 320, z: 100 },
				scale: { x: 1.25, y: 1.25, z: 1.25 },
			},
		})
		assert(
			effectResult.actor_label === debugShapeActorName,
			"manage_effect spawn_debug_shape did not create the expected actor label",
		)
	})

	await runStep("Apply a material to the debug shape through manage_effect", async () => {
		const applyResult = await callJsonTool("manage_effect", {
			action: "apply_material",
			params: {
				name: debugShapeActorName,
				material_path: tintableMaterialPath,
			},
		})
		assert(applyResult.actor?.label === debugShapeActorName, "manage_effect apply_material returned the wrong actor")
		assert(
			applyResult.material?.path === tintableMaterialPath,
			"manage_effect apply_material returned the wrong material path",
		)
	})

	await runStep("Tint the debug shape through manage_effect", async () => {
		const tintResult = await callJsonTool("manage_effect", {
			action: "tint_debug_shape",
			params: {
				name: debugShapeActorName,
				color: { r: 0.9, g: 0.2, b: 0.2, a: 1.0 },
				material_path: tintableMaterialPath,
				parameter_name: "Color",
				instance_name: path.basename(debugTintMaterialPath),
				instance_path: path.dirname(debugTintMaterialPath).replace(/\\/g, "/"),
			},
		})
		assert(tintResult.actor?.label === debugShapeActorName, "manage_effect tint_debug_shape returned the wrong actor")
		assert(
			tintResult.material?.path === debugTintMaterialPath,
			`manage_effect tint_debug_shape returned an unexpected material path: ${tintResult.material?.path}`,
		)
		assert(
			typeof tintResult.parameter_name === "string" && tintResult.parameter_name.length > 0,
			"manage_effect tint_debug_shape did not report a parameter name",
		)
	})

	await runStep("Delete the debug shape through manage_effect", async () => {
		await callJsonTool("manage_effect", {
			action: "delete_debug_shape",
			params: { name: debugShapeActorName },
		})
	})

	await runStep("Spawn a spline host actor through manage_splines", async () => {
		const splineSpawnResult = await callJsonTool("manage_splines", {
			action: "spawn_actor",
			params: {
				object_class: "/Script/Engine.Actor",
				name: splineActorName,
				location: { x: 760, y: 320, z: 100 },
			},
		})
		assert(
			splineSpawnResult.actor_label === splineActorName,
			"manage_splines spawn_actor did not create the expected actor label",
		)
	})

	await runStep("Transform the spline host actor through manage_splines", async () => {
		const splineTransformResult = await callJsonTool("manage_splines", {
			action: "transform_actor",
			params: {
				name: splineActorName,
				location: { x: 800, y: 340, z: 120 },
			},
		})
		assert(
			Math.abs(Number(splineTransformResult.actor?.location?.x ?? 0) - 800) < 0.1,
			"manage_splines transform_actor did not update the expected X location",
		)
	})

	await runStep("Delete the spline host actor through manage_splines", async () => {
		await callJsonTool("manage_splines", {
			action: "delete_actor",
			params: { name: splineActorName },
		})
	})
}
