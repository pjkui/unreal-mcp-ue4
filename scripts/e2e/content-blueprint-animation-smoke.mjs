export async function runContentBlueprintAnimationScenarios(state) {
	const {
		options,
		addCleanup,
		runStep,
		callJsonTool,
		assert,
		safeDeleteActor,
		basicShapeMaterialPath,
		blueprintPath,
	} = state

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

	await runStep("List materials through manage_material", async () => {
		const materialsResult = await callJsonTool("manage_material", {
			action: "list_materials",
			params: {
				search_term: "BasicShapeMaterial",
				include_engine: true,
				limit: 10,
			},
		})
		assert(Array.isArray(materialsResult.materials), "manage_material list_materials did not return a materials list")
		const discoveredMaterial = materialsResult.materials.find((material) =>
			String(material.path).includes("BasicShapeMaterial"),
		)
		assert(discoveredMaterial, "manage_material list_materials did not find BasicShapeMaterial")
		state.resolvedBlueprintMaterialPath = discoveredMaterial.path
	})

	await runStep("Apply a material to the Blueprint through manage_material", async () => {
		const applyResult = await callJsonTool("manage_material", {
			action: "apply_to_blueprint",
			params: {
				blueprint_name: blueprintPath,
				component_name: "SmokeMesh",
				material_path: state.resolvedBlueprintMaterialPath,
			},
		})
		assert(applyResult.blueprint === blueprintPath, "manage_material apply_to_blueprint returned the wrong blueprint")
		assert(
			String(applyResult.component).includes("SmokeMesh"),
			"manage_material apply_to_blueprint returned the wrong component",
		)
		assert(
			applyResult.material?.path === state.resolvedBlueprintMaterialPath,
			"manage_material apply_to_blueprint returned the wrong material path",
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
				material_path: state.resolvedBlueprintMaterialPath ?? basicShapeMaterialPath,
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
}
