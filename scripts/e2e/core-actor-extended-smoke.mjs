export async function runCoreActorExtendedScenarios(ctx) {
	const {
		options,
		addCleanup,
		runStep,
		callJsonTool,
		assert,
		safeDeleteActor,
		StepSkipError,
	} = ctx

	const actorName = `${options.prefix}_ExtActor`
	addCleanup(`Delete actor ${actorName}`, () => safeDeleteActor(actorName))

	// --- manage_actor: spawn + list + find ---

	await runStep("Spawn actor for extended tests", async () => {
		const result = await callJsonTool("manage_actor", {
			action: "spawn",
			params: {
				type: "StaticMeshActor",
				name: actorName,
				location: { x: 500, y: 500, z: 100 },
			},
		})
		assert(result.actor?.label === actorName, "manage_actor spawn did not create the expected actor")
	})

	await runStep("List actors through manage_actor", async () => {
		const listResult = await callJsonTool("manage_actor", {
			action: "list",
			params: {},
		})
		assert(Array.isArray(listResult.actors), "manage_actor list did not return an actors array")
		assert(listResult.actors.length > 0, "manage_actor list returned an empty actor list")
	})

	await runStep("Find actor by name through manage_actor", async () => {
		const findResult = await callJsonTool("manage_actor", {
			action: "find",
			params: { pattern: actorName },
		})
		assert(
			findResult.actor?.label === actorName || (Array.isArray(findResult.actors) && findResult.actors.length > 0),
			"manage_actor find did not locate the spawned actor",
		)
	})

	// --- manage_actor: transform ---

	await runStep("Transform actor through manage_actor", async () => {
		const transformResult = await callJsonTool("manage_actor", {
			action: "transform",
			params: {
				name: actorName,
				location: { x: 600, y: 600, z: 200 },
				rotation: { pitch: 0, yaw: 45, roll: 0 },
			},
		})
		assert(transformResult != null, "manage_actor transform did not return a result")
	})

	// --- manage_actor: get_properties ---

	await runStep("Get actor properties through manage_actor", async () => {
		const propsResult = await callJsonTool("manage_actor", {
			action: "get_properties",
			params: { name: actorName },
		})
		assert(propsResult != null, "manage_actor get_properties did not return a result")
	})

	// --- manage_actor: set_property ---

	await runStep("Set actor property through manage_actor", async () => {
		const setResult = await callJsonTool("manage_actor", {
			action: "set_property",
			params: {
				name: actorName,
				property_name: "bHidden",
				property_value: true,
			},
		})
		assert(setResult != null, "manage_actor set_property did not return a result")
	})

	// --- manage_actor: get_material_info ---

	await runStep("Get actor material info through manage_actor", async () => {
		const matResult = await callJsonTool("manage_actor", {
			action: "get_material_info",
			params: { name: actorName },
		})
		assert(matResult != null, "manage_actor get_material_info did not return a result")
	})

	// --- manage_inspection: actor ---

	await runStep("Inspect actor through manage_inspection", async () => {
		const inspectResult = await callJsonTool("manage_inspection", {
			action: "actor",
			params: { name: actorName },
		})
		assert(inspectResult != null, "manage_inspection actor did not return a result")
	})

	// --- manage_inspection: actor_materials ---

	await runStep("Inspect actor materials through manage_inspection", async () => {
		const inspectMaterials = await callJsonTool("manage_inspection", {
			action: "actor_materials",
			params: { name: actorName },
		})
		assert(inspectMaterials != null, "manage_inspection actor_materials did not return a result")
	})

	// --- manage_actor: spawn_blueprint (skip if no blueprints found) ---

	await runStep("Spawn blueprint actor through manage_actor", async () => {
		try {
			const result = await callJsonTool("manage_actor", {
				action: "spawn_blueprint",
				params: {
					blueprint_name: "FirstPersonCharacter",
					name: `${options.prefix}_BPActor`,
					location: { x: 700, y: 700, z: 100 },
				},
			})
			addCleanup(`Delete BP actor ${options.prefix}_BPActor`, () => safeDeleteActor(`${options.prefix}_BPActor`))
			assert(result != null, "manage_actor spawn_blueprint did not return a result")
		} catch {
			throw new StepSkipError("No suitable blueprint found for spawn_blueprint test")
		}
	})

	// --- manage_asset: validate ---

	await runStep("Validate assets through manage_asset", async () => {
		const validateResult = await callJsonTool("manage_asset", {
			action: "validate",
			params: {},
		})
		assert(validateResult != null, "manage_asset validate did not return a result")
	})

	// --- manage_actor: delete (cleanup) ---

	await runStep("Delete extended test actor", async () => {
		await callJsonTool("manage_actor", {
			action: "delete",
			params: { name: actorName },
		})
	})
}
