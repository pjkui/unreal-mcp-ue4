export async function runCoreActorMaterialScenarios(ctx) {
	const {
		path,
		options,
		addCleanup,
		runStep,
		callJsonTool,
		assert,
		safeDeleteActor,
		paths: {
			basicShapeMaterialPath,
			tintableMaterialPath,
			actorTintMaterialPath,
		},
	} = ctx

	const directActorName = `${options.prefix}_DirectActor`
	addCleanup(`Delete actor ${directActorName}`, () => safeDeleteActor(directActorName))

	await runStep("Spawn a direct-tool smoke-test actor", async () => {
		const directCreateResult = await callJsonTool("editor_create_object", {
			object_class: "StaticMeshActor",
			object_name: directActorName,
			location: { x: 0, y: -300, z: 150 },
		})
		assert(
			directCreateResult.actor_label === directActorName,
			"editor_create_object did not create the expected actor label",
		)
	})

	await runStep("Update the direct-tool smoke-test actor", async () => {
		const directUpdateResult = await callJsonTool("editor_update_object", {
			actor_name: directActorName,
			location: { x: 300, y: -300, z: 150 },
		})
		assert(
			Math.abs(Number(directUpdateResult.location?.x ?? 0) - 300) < 0.1,
			"editor_update_object did not update the expected X location",
		)
	})

	await runStep("Delete the direct-tool smoke-test actor", async () => {
		const directDeleteResult = await callJsonTool("editor_delete_object", {
			actor_names: directActorName,
		})
		assert(
			directDeleteResult.deleted_actor?.actor_label === directActorName,
			"editor_delete_object did not delete the expected actor",
		)
	})

	const granularActorName = `${options.prefix}_Actor`
	addCleanup(`Delete actor ${granularActorName}`, () => safeDeleteActor(granularActorName))

	await runStep("Spawn a granular smoke-test actor", async () => {
		const spawnResult = await callJsonTool("manage_actor", {
			action: "spawn",
			params: {
				type: "StaticMeshActor",
				name: granularActorName,
				location: { x: 0, y: 0, z: 150 },
			},
		})
		assert(spawnResult.actor?.label === granularActorName, "manage_actor spawn did not create the expected label")
	})

	await runStep("Find the spawned actor by name", async () => {
		const findResult = await callJsonTool("manage_actor", {
			action: "find",
			params: { pattern: granularActorName },
		})
		assert(findResult.count >= 1, "manage_actor find did not locate the smoke actor")
	})

	await runStep("List actors through manage_actor", async () => {
		const actorList = await callJsonTool("manage_actor", {
			action: "list",
			params: {},
		})
		assert(Array.isArray(actorList.actors), "manage_actor list did not return an actor list")
		assert(
			actorList.actors.some((actor) => actor.label === granularActorName),
			"manage_actor list did not include the smoke actor",
		)
	})

	await runStep("List actors through manage_level", async () => {
		const actorList = await callJsonTool("manage_level", {
			action: "list_actors",
			params: {},
		})
		assert(Array.isArray(actorList.actors), "manage_level list_actors did not return an actor list")
		assert(
			actorList.actors.some((actor) => actor.label === granularActorName),
			"manage_level list_actors did not include the smoke actor",
		)
	})

	await runStep("Assign a static mesh through manage_actor", async () => {
		const propertyResult = await callJsonTool("manage_actor", {
			action: "set_property",
			params: {
				name: granularActorName,
				property_name: "StaticMesh",
				property_value: "/Engine/BasicShapes/Cube",
			},
		})
		assert(propertyResult.actor?.label === granularActorName, "manage_actor set_property returned the wrong actor")
	})

	await runStep("Apply a material to the actor through manage_material_authoring", async () => {
		const applyResult = await callJsonTool("manage_material_authoring", {
			action: "apply_to_actor",
			params: {
				actor_name: granularActorName,
				material_path: basicShapeMaterialPath,
			},
		})
		assert(applyResult.actor?.label === granularActorName, "manage_material_authoring apply_to_actor returned the wrong actor")
		assert(
			applyResult.material?.path === basicShapeMaterialPath,
			"manage_material_authoring apply_to_actor returned the wrong material path",
		)
	})

	await runStep("Inspect actor material info through manage_actor", async () => {
		const materialInfo = await callJsonTool("manage_actor", {
			action: "get_material_info",
			params: { name: granularActorName },
		})
		assert(
			Array.isArray(materialInfo.materials?.components),
			"manage_actor get_material_info did not return component materials",
		)
		assert(
			materialInfo.materials.components.some((component) =>
				Array.isArray(component.materials)
					&& component.materials.some((slot) => slot.material?.path === basicShapeMaterialPath),
			),
			"manage_actor get_material_info did not report the applied material",
		)
	})

	await runStep("Tint the actor material through manage_material_authoring", async () => {
		const tintResult = await callJsonTool("manage_material_authoring", {
			action: "tint_material",
			params: {
				actor_name: granularActorName,
				material_path: tintableMaterialPath,
				color: { r: 0.2, g: 0.8, b: 0.3, a: 1.0 },
				parameter_name: "Color",
				instance_name: path.basename(actorTintMaterialPath),
				instance_path: path.dirname(actorTintMaterialPath).replace(/\\/g, "/"),
			},
		})
		assert(tintResult.actor?.label === granularActorName, "manage_material_authoring tint_material returned the wrong actor")
		assert(
			tintResult.material?.path === actorTintMaterialPath,
			`manage_material_authoring tint_material returned an unexpected material path: ${tintResult.material?.path}`,
		)
		assert(
			typeof tintResult.parameter_name === "string" && tintResult.parameter_name.length > 0,
			"manage_material_authoring tint_material did not report a parameter name",
		)
	})

	await runStep("Move the spawned actor", async () => {
		const transformResult = await callJsonTool("manage_actor", {
			action: "transform",
			params: {
				name: granularActorName,
				location: { x: 300, y: 0, z: 150 },
				scale: { x: 1, y: 1, z: 1 },
			},
		})
		assert(
			Math.abs(Number(transformResult.actor?.location?.x ?? 0) - 300) < 0.1,
			"manage_actor transform did not update the expected X location",
		)
	})

	await runStep("Inspect actor properties", async () => {
		const propertyResult = await callJsonTool("manage_actor", {
			action: "get_properties",
			params: { name: granularActorName },
		})
		assert(propertyResult.actor?.label === granularActorName, "manage_actor get_properties returned the wrong actor")
	})

	await runStep("Inspect actor properties through manage_inspection", async () => {
		const inspectionResult = await callJsonTool("manage_inspection", {
			action: "actor",
			params: { name: granularActorName },
		})
		assert(inspectionResult.actor?.label === granularActorName, "manage_inspection actor returned the wrong actor")
	})

	await runStep("Inspect actor materials through manage_inspection", async () => {
		const materialInspection = await callJsonTool("manage_inspection", {
			action: "actor_materials",
			params: { name: granularActorName },
		})
		assert(
			Array.isArray(materialInspection.materials?.components),
			"manage_inspection actor_materials did not return component materials",
		)
		assert(
			materialInspection.materials.components.some((component) =>
				Array.isArray(component.materials)
					&& component.materials.some((slot) => slot.material?.path === actorTintMaterialPath),
			),
			"manage_inspection actor_materials did not report the tinted material",
		)
	})

	await runStep("Delete the granular smoke-test actor", async () => {
		await callJsonTool("manage_actor", {
			action: "delete",
			params: { name: granularActorName },
		})
	})
}
