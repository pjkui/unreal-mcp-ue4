export async function runContentWidgetAdvancedScenarios(state) {
	const {
		runStep,
		callJsonTool,
		assert,
		widgetPath,
	} = state

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
}
