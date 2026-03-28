# unreal-mcp-ue4
> UE4.27.2-focused MCP server for Unreal Engine using Unreal Python Remote Execution

`unreal-mcp-ue4` is a UE4.27.2-compatible fork of [runreal/unreal-mcp](https://github.com/runreal/unreal-mcp). It keeps the original local Node.js MCP workflow, adapts the tool layer to Unreal Engine 4.27, and adds broader UE4-safe coverage for actors, assets, Blueprints, UMG, materials, world-building helpers, and grouped tool namespaces.

This port and the follow-up tool, documentation, and smoke-test work were developed with assistance from OpenAI Codex.

> This project is still under active development, so bugs, rough edges, and UE4.27-specific limitations may still surface.

## Overview

- No custom Unreal C++ plugin from this repository is required.
- The server talks to the editor through Unreal's built-in Python Remote Execution path.
- The tool surface is organized into granular tools and higher-level tool namespaces.
- UE5-only editor scripting features are not reintroduced; UE4.27-safe operations work normally, while unreliable graph or binding flows are either excluded from the MCP surface or return a clear message instead of silently failing.

## Origin

- Original project: [runreal/unreal-mcp](https://github.com/runreal/unreal-mcp)
- This fork adapts that workflow for Unreal Engine 4.27.2.
- Unreal Python API reference: [Unreal Engine Python API 4.27](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/?application_version=4.27)

## Safety

- This is not an official Epic Games project.
- Any connected MCP client can inspect and modify your open Unreal Editor session.
- Use a disposable test project first, especially when trying asset or world-generation tools.

## Requirements

- Unreal Engine `4.27.2`
- Node.js `18+`
- `npm`
- An MCP client such as Codex, Claude Desktop, Cursor, or GitHub Copilot in a supported IDE

## Required Unreal Editor Setup

This repository does not ship its own Unreal plugin. Instead, it depends on built-in editor features that must be enabled in your UE4.27.2 project.

### Required plugins

- `Python Editor Script Plugin`
- `Editor Scripting Utilities`

### Required project setting

- `Edit -> Project Settings -> Python -> Enable Remote Execution`

### Notes

- UMG tooling works with editor modules that already ship with Unreal Editor. There is no extra UMG plugin from this repository to install.
- Keep the target Unreal project open while using the MCP server or running tests.
- If you change plugin or Python settings, restart the editor before testing again.

## Installation

### 1. Clone and build the server

```bash
git clone https://github.com/conaman/unreal-mcp-ue4.git
cd unreal-mcp-ue4
npm install
npm run build
```

Successful build output should create `dist/bin.js`, `dist/index.js`, and `dist/editor/tools.js`.

### 2. Enable the Unreal requirements

In Unreal Editor:

1. Open the target UE4.27.2 project.
2. Go to `Edit -> Plugins`.
3. Enable `Python Editor Script Plugin`.
4. Enable `Editor Scripting Utilities`.
5. Restart the editor if prompted.
6. Go to `Edit -> Project Settings -> Python`.
7. Enable `Enable Remote Execution`.
8. Restart the editor again if needed.

### 3. Configure your MCP client

Most clients use a local `stdio` server command. The safest configuration is to point to an absolute `node` path and an absolute `dist/bin.js` path.

Generic MCP client example:

```json
{
  "mcpServers": {
    "unreal-ue4": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/unreal-mcp-ue4/dist/bin.js"
      ]
    }
  }
}
```

If `node` is already on your `PATH`, you can use `"command": "node"` instead.

### Codex example

```bash
codex mcp add unreal-ue4 -- /absolute/path/to/node /absolute/path/to/unreal-mcp-ue4/dist/bin.js
```

### GitHub Copilot example

For VS Code, create `.vscode/mcp.json`:

```json
{
  "servers": {
    "unreal-ue4": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\dev\\unreal-mcp-ue4\\dist\\bin.js"
      ]
    }
  }
}
```

Then start the server from the MCP config UI and verify that `unreal-ue4` appears in the tools picker.

Official Copilot docs:

- [Extending GitHub Copilot Chat with MCP servers](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp)
- [About Model Context Protocol in GitHub Copilot](https://docs.github.com/en/copilot/concepts/context/mcp)

## Usage

### Recommended first-run flow

1. Open your UE4.27.2 project and wait for the editor to finish loading.
2. Make sure the required plugins and `Enable Remote Execution` are enabled.
3. Build the MCP server with `npm run build`.
4. Start your MCP client or open a new session in the client that already references this server.
5. Run a small read-only command first.

Useful first commands:

- `manage_editor` with `action: "project_info"`
- `manage_editor` with `action: "map_info"`
- `manage_level` with `action: "world_outliner"`

Useful first natural-language requests:

- `Get project info from the unreal-ue4 server.`
- `List the actors in the current level.`
- `Spawn a StaticMeshActor named TestCube at 0,0,100.`

### What the server can do

- Read project, map, asset, and actor information from the open editor.
- Spawn, inspect, move, and delete actors in the current level.
- Search assets and inspect references or metadata.
- Create common UE4 data assets such as `DataAsset` and `StringTable` assets.
- Create and edit Blueprint assets where UE4.27 Python exposes the necessary editor APIs.
- Create and edit Widget Blueprint trees with UE4.27-safe UMG helpers.
- Run grouped tool namespaces that dispatch through `action` and `params`.

## Testing

### Quick smoke test

The smoke test builds the server, launches its own local MCP server process, connects to the already running Unreal Editor, and runs a deterministic validation flow. You do not need to start a separate MCP server manually before this test.

```bash
npm run test:e2e
```

This checks:

- MCP server startup
- tool discovery
- project info, map info, and world outliner reads
- actor spawn, search, transform, inspect, and delete
- tool-namespace dispatch for actor control

### Asset-inclusive smoke test

```bash
npm run test:e2e -- --with-assets
```

This adds:

- Blueprint creation
- Blueprint component editing
- Blueprint compilation
- DataAsset creation
- StringTable creation
- Widget Blueprint creation
- UMG widget insertion
- cleanup of temporary assets under `/Game/MCP/Tests`

### Windows test commands

Open PowerShell in the repository folder:

```powershell
cd C:\dev\unreal-mcp-ue4
npm install
npm run test:e2e
npm run test:e2e -- --with-assets
```

### What success looks like

- The console prints `[PASS]` for every test step.
- Actor tests visibly create and then remove temporary actors in the editor.
- The asset-inclusive test creates temporary Blueprint, DataAsset, StringTable, and Widget Blueprint assets under `/Game/MCP/Tests` and then removes them before exit.

### Recommended test workflow

1. Start with `npm run test:e2e`.
2. If that passes, run `npm run test:e2e -- --with-assets`.
3. After both pass, try the server once from your real MCP client.
4. Use a separate Unreal test project before pointing the server at production content.

## Troubleshooting

### `Remote node is not available`

- Make sure Unreal Editor is fully open before running the MCP client or smoke test.
- Verify that `Python Editor Script Plugin` is enabled.
- Verify that `Editor Scripting Utilities` is enabled.
- Verify that `Enable Remote Execution` is enabled in project settings.
- Restart Unreal Editor after changing any of the above.

### Connection or discovery problems on Windows

- Allow `UnrealEditor.exe` and `node.exe` through Windows Defender Firewall.
- The bundled `unreal-remote-execution` package uses UDP multicast discovery on `239.0.0.1:6766` and a localhost command channel on `127.0.0.1:6776`.
- If your client config uses JSON, escape backslashes or switch to forward slashes.

### Client starts but cannot find `node`

- Use an absolute path to `node` or `node.exe` in the MCP config instead of relying on `PATH`.

### Some Blueprint graph or UMG binding commands are unavailable

- Widget Blueprint creation and common widget-tree editing work in this fork; the main UMG gaps are delegate binding helpers and runtime-dependent viewport flows.
- Blueprint asset creation, component editing, and compilation work; the main Blueprint gaps are editor-only graph node and variable authoring APIs that UE4.27 Python does not expose reliably.
- Capability areas that are not reliable enough to keep in the MCP surface are listed under `Excluded Capability Areas` in the tool section.

## Notes and Limitations

- World-building and structure-generation tools use UE4.27-friendly preset builders based on engine basic-shape assets.
- Common UMG widget-tree editing works well with CanvasPanel-based layouts, but delegate binding helpers remain unavailable in stock UE4.27 Python.
- UMG positioning currently targets `CanvasPanel` slots in UE4.27.
- Reparenting the current root widget and editing named-slot content are not currently handled.
- Blueprint asset and component editing work, but advanced Blueprint graph node and variable authoring remain limited by what UE4.27 exposes through Python.
- The tool surface includes both granular tools and action-based tool namespaces so different MCP clients can work at different abstraction levels.

The tool list below is generated from `server/index.ts` during build.

## Available Tools

Notes call out important requirements or UE4.27 limitations when they matter. Empty notes mean there are no additional caveats beyond normal editor setup.

### Editor Session Paths

<table width="100%">
	<colgroup>
		<col width="18%">
		<col width="52%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="18%">Tool</th>
			<th width="52%">Description</th>
			<th width="30%">Notes</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="18%"><code>get_unreal_engine_path</code></td>
		<td width="52%">Get the active Unreal Engine root path from the connected editor session</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>get_unreal_project_path</code></td>
		<td width="52%">Get the active Unreal project file path from the connected editor session</td>
		<td width="30%">&nbsp;</td>
	</tr>
	</tbody>
</table>

### Actor / Level Tools

<table width="100%">
	<colgroup>
		<col width="18%">
		<col width="52%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="18%">Tool</th>
			<th width="52%">Description</th>
			<th width="30%">Notes</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="18%"><code>editor_create_object</code></td>
		<td width="52%">Create a new object/actor in the world</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>editor_update_object</code></td>
		<td width="52%">Update an existing object/actor in the world</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>editor_delete_object</code></td>
		<td width="52%">Delete an object/actor from the world</td>
		<td width="30%">&nbsp;</td>
	</tr>
	</tbody>
</table>

### Core Tool Namespaces

<table width="100%">
	<colgroup>
		<col width="18%">
		<col width="52%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="18%">Tool</th>
			<th width="52%">Description</th>
			<th width="30%">Notes</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="18%"><code>manage_asset</code></td>
		<td width="52%">Asset tool namespace for list, search, info, references, export, and validation actions.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_actor</code></td>
		<td width="52%">Actor tool namespace for listing, searching, spawning, deleting, transforming, and inspecting level actors.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_editor</code></td>
		<td width="52%">Editor tool namespace for Python execution, console commands, project inspection, map inspection, screenshots, and camera control.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_level</code></td>
		<td width="52%">Level tool namespace for map inspection, actor listing, world outliner inspection, and preset structure creation actions.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_system</code></td>
		<td width="52%">System tool namespace for console commands, project state inspection, and asset validation actions.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_inspection</code></td>
		<td width="52%">Inspection tool namespace for asset, actor, project, map, and Blueprint analysis actions.</td>
		<td width="30%">Asset, actor, project, and map inspection work; Blueprint graph inspection is limited by UE4.27 Python exposure.</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_tools</code></td>
		<td width="52%">Tool-namespace registry for listing registered tool namespaces and describing supported actions.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_source_control</code></td>
		<td width="52%">Source-control tool namespace for provider inspection and file or package source-control operations.</td>
		<td width="30%">provider_info works broadly, but file and package operations require a configured and available Unreal source-control provider.</td>
	</tr>
	</tbody>
</table>

### World & Environment Tool Namespaces

<table width="100%">
	<colgroup>
		<col width="18%">
		<col width="52%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="18%">Tool</th>
			<th width="52%">Description</th>
			<th width="30%">Notes</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="18%"><code>manage_lighting</code></td>
		<td width="52%">Lighting tool namespace for spawning common light actors, transforming them, and inspecting level lighting state.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_level_structure</code></td>
		<td width="52%">Level-structure tool namespace for preset town, house, mansion, tower, wall, bridge, and fortress construction actions.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_volumes</code></td>
		<td width="52%">Volume tool namespace for spawning common engine volumes and applying delete or transform actions.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_navigation</code></td>
		<td width="52%">Navigation tool namespace for spawning navigation volumes and proxies plus basic map inspection actions.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_environment</code></td>
		<td width="52%">Environment-building tool namespace for preset town, arch, staircase, pyramid, and maze generation actions.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_splines</code></td>
		<td width="52%">Spline tool namespace for spawning a spline-host actor or Blueprint and then transforming or deleting it.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_geometry</code></td>
		<td width="52%">Geometry tool namespace for wall, arch, staircase, and pyramid preset construction actions.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_effect</code></td>
		<td width="52%">Effects tool namespace for spawning debug-shape actors, assigning materials, tinting them, and deleting them.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	</tbody>
</table>

### Content & Authoring Tool Namespaces

<table width="100%">
	<colgroup>
		<col width="18%">
		<col width="52%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="18%">Tool</th>
			<th width="52%">Description</th>
			<th width="30%">Notes</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="18%"><code>manage_skeleton</code></td>
		<td width="52%">Skeleton tool namespace for searching Skeleton and SkeletalMesh assets and inspecting their metadata.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_material_authoring</code></td>
		<td width="52%">Material tool namespace for listing materials, applying them to actors or Blueprints, and tinting them with material instances.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_texture</code></td>
		<td width="52%">Texture tool namespace for searching texture assets, importing image files as textures, and reading their asset metadata.</td>
		<td width="30%">import_texture requires a local image file path that is accessible from the machine running the Unreal Editor session.</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_data</code></td>
		<td width="52%">Data tool namespace for searching data assets, creating common data containers, and inspecting their asset metadata.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_blueprint</code></td>
		<td width="52%">Blueprint tool namespace for Blueprint creation, component editing, graph inspection, graph pin wiring, compilation, and Blueprint inspection actions.</td>
		<td width="30%">Blueprint asset and component edits work; graph inspection and pin wiring remain limited by UE4.27 Python exposure, and unsupported node or variable creation helpers are excluded from the MCP surface.</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_sequence</code></td>
		<td width="52%">Sequence tool namespace for searching LevelSequence assets and inspecting their asset metadata.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_audio</code></td>
		<td width="52%">Audio tool namespace for searching audio assets and inspecting their asset metadata.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_widget_authoring</code></td>
		<td width="52%">Widget tool namespace for UMG Blueprint creation, widget-tree edits, and viewport spawning actions</td>
		<td width="30%">create_widget_blueprint, add_text_block, and add_button work; use add_child_widget for normal nested layout under an existing root such as CanvasPanel_0, while add_widget without parent_widget_name is only for assigning a new root. add_to_viewport requires PIE, and unsupported binding helpers are excluded from the MCP surface.</td>
	</tr>
	</tbody>
</table>

### Gameplay & Systems Tool Namespaces

<table width="100%">
	<colgroup>
		<col width="18%">
		<col width="52%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="18%">Tool</th>
			<th width="52%">Description</th>
			<th width="30%">Notes</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="18%"><code>manage_animation_physics</code></td>
		<td width="52%">Animation-and-physics tool namespace for physics Blueprint spawning, Blueprint physics settings, and Blueprint compilation actions.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_input</code></td>
		<td width="52%">Input tool namespace for creating classic UE4 input mappings and inspecting project input settings.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_behavior_tree</code></td>
		<td width="52%">Behavior-tree tool namespace for searching BehaviorTree assets and inspecting their asset metadata.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="18%"><code>manage_gas</code></td>
		<td width="52%">GAS tool namespace for searching gameplay-ability-related assets and inspecting their asset metadata.</td>
		<td width="30%">&nbsp;</td>
	</tr>
	</tbody>
</table>

### Excluded Capability Areas

These capability areas are intentionally not exposed through the MCP surface in this UE4.27 port because they fail reliably in the current Python environment and only add prompt or context overhead until a native bridge exists.

| Capability Area | Effect on MCP Surface | Why It Is Excluded |
|-----------------|-----------------------|---------------------|
| Blueprint event-graph event insertion | Related event-node and input-action helpers are excluded from the MCP surface. | The current UE4.27 Python environment does not expose reliable event graph access or K2 event reference setup. |
| Low-level Blueprint graph node creation | Generic graph-node helpers and related self or component reference insertion helpers are excluded from the MCP surface. | The current UE4.27 Python environment does not expose stable low-level graph node creation or member-reference wiring. |
| Blueprint function-call node authoring | Function-node helpers that depend on editor graph member-reference setup are excluded from the MCP surface. | The current UE4.27 Python environment does not expose reliable function-call node reference setup. |
| Blueprint variable authoring | Variable-creation helpers are excluded from the MCP surface. | BPVariableDescription and EdGraphPinType are not exposed in the current UE4.27 Python environment. |
| UMG delegate-binding authoring | Widget event-binding and text-binding helpers are excluded from the MCP surface. | DelegateEditorBinding is not exposed in the current UE4.27 Python environment. |

## License

Licensed under the [MIT License](LICENSE).
