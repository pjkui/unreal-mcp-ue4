export async function runContentWidgetAuthoringScenarios(state) {
	const {
		options,
		logSkip,
		runStep,
		callJsonTool,
		assert,
		isUnsupportedWidgetTreeAuthoring,
		StepSkipError,
		widgetPath,
	} = state

	let widgetAuthoringUnsupportedReason = ""

	await runStep("Create a Widget Blueprint through the tool-namespace layer", async () => {
		const createWidgetResult = await callJsonTool("manage_widget", {
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
			const textResult = await callJsonTool("manage_widget", {
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
		return
	}

	await runStep("Add a Button to the Widget Blueprint", async () => {
		try {
			const buttonResult = await callJsonTool("manage_widget", {
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
		const moveTextResult = await callJsonTool("manage_widget", {
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
		const moveButtonResult = await callJsonTool("manage_widget", {
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
		const panelResult = await callJsonTool("manage_widget", {
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
		const movePanelResult = await callJsonTool("manage_widget", {
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
		const childResult = await callJsonTool("manage_widget", {
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
		const moveChildResult = await callJsonTool("manage_widget", {
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
		const panelResult = await callJsonTool("manage_widget", {
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
		const reparentResult = await callJsonTool("manage_widget", {
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
		const removeChildResult = await callJsonTool("manage_widget", {
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
		const removePanelResult = await callJsonTool("manage_widget", {
			action: "remove_widget",
			params: {
				widget_blueprint_path: widgetPath,
				widget_name: "SmokePanel",
			},
		})
		assert(removePanelResult.widget_name === "SmokePanel", "CanvasPanel was not removed through advanced widget tooling")
	})

	await runStep("Remove the second CanvasPanel through advanced widget tooling", async () => {
		const removePanelResult = await callJsonTool("manage_widget", {
			action: "remove_widget",
			params: {
				widget_blueprint_path: widgetPath,
				widget_name: "SmokePanelHost",
			},
		})
		assert(removePanelResult.widget_name === "SmokePanelHost", "Second CanvasPanel was not removed through advanced widget tooling")
	})

	if (options.keepAssets) {
		console.log(`[INFO] Kept Widget Blueprint asset: ${widgetPath}`)
	}
}
