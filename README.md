# unreal-mcp-ue4
> UE4.27.2-focused MCP server for Unreal Engine using Unreal Python Remote Execution

`unreal-mcp-ue4` is a UE4.27.2-compatible fork of [runreal/unreal-mcp](https://github.com/runreal/unreal-mcp). It keeps the original local Node.js MCP workflow, adapts the tool layer to Unreal Engine 4.27, and adds broader UE4-safe coverage for actors, assets, Blueprints, UMG, materials, world-building helpers, and domain-style namespace tools.

This port and the follow-up tool, documentation, and smoke-test work were developed with assistance from OpenAI Codex.

## Overview

- No custom Unreal C++ plugin from this repository is required.
- The server talks to the editor through Unreal's built-in Python Remote Execution path.
- The tool surface is organized into granular tools and higher-level domain tools.
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

- `control_editor` with `action: "project_info"`
- `control_editor` with `action: "map_info"`
- `manage_level` with `action: "world_outliner"`

Useful first natural-language requests:

- `Get project info from the unreal-ue4 server.`
- `List the actors in the current level.`
- `Spawn a StaticMeshActor named TestCube at 0,0,100.`

### What the server can do

- Read project, map, asset, and actor information from the open editor.
- Spawn, inspect, move, and delete actors in the current level.
- Search assets and inspect references or metadata.
- Create and edit Blueprint assets where UE4.27 Python exposes the necessary editor APIs.
- Create and edit Widget Blueprint trees with UE4.27-safe UMG helpers.
- Run grouped domain tools that dispatch through `action` and `params`.

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
- domain-tool dispatch for actor control

### Asset-inclusive smoke test

```bash
npm run test:e2e -- --with-assets
```

This adds:

- Blueprint creation
- Blueprint component editing
- Blueprint compilation
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
- The asset-inclusive test creates temporary Blueprint and Widget Blueprint assets under `/Game/MCP/Tests` and then removes them before exit.

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
- Commands that are not reliable enough to keep in the MCP surface are listed under `Excluded Functions` in the tool section.

## Notes and Limitations

- World-building and structure-generation tools use UE4.27-friendly preset builders based on engine basic-shape assets.
- Common UMG widget-tree editing works well with CanvasPanel-based layouts, but delegate binding helpers remain unavailable in stock UE4.27 Python.
- UMG positioning currently targets `CanvasPanel` slots in UE4.27.
- Reparenting the current root widget and editing named-slot content are not currently handled.
- Blueprint asset and component editing work, but advanced Blueprint graph node and variable authoring remain limited by what UE4.27 exposes through Python.
- The tool surface includes both granular tools and action-based domain tools so different MCP clients can work at different abstraction levels.

The tool list below is generated from `server/index.ts` during build.

## Available Tools

Status legend:

- `Supported`: implemented and expected to work in this UE4.27.2 fork.
- `Partial`: implemented, but limited by UE4.27 Python exposure or runtime requirements.

### Connection & Setup

| Tool | Status | Notes | Description |
|------|--------|-------|-------------|
| `set_unreal_engine_path` | Supported | - | Set the Unreal Engine path |
| `set_unreal_project_path` | Supported | - | Set the Project path |
| `get_unreal_engine_path` | Supported | - | Get the current Unreal Engine path |
| `get_unreal_project_path` | Supported | - | Get the current Unreal Project path |

### Actor / Level Tools

| Tool | Status | Notes | Description |
|------|--------|-------|-------------|
| `editor_create_object` | Supported | - | Create a new object/actor in the world |
| `editor_update_object` | Supported | - | Update an existing object/actor in the world |
| `editor_delete_object` | Supported | - | Delete an object/actor from the world |

### Domain Tools

| Tool | Status | Notes | Description |
|------|--------|-------|-------------|
| `manage_asset` | Supported | - | Domain asset namespace for list, search, info, references, export, and validation actions. |
| `control_actor` | Supported | - | Domain actor namespace for listing, searching, spawning, deleting, transforming, and inspecting level actors. |
| `control_editor` | Supported | - | Domain editor namespace for Python execution, console commands, project inspection, map inspection, screenshots, and camera control. |
| `manage_level` | Supported | - | Domain level namespace for map inspection, actor listing, world outliner inspection, and preset structure creation actions. |
| `system_control` | Supported | - | Domain system namespace for console commands, project state inspection, and asset validation actions. |
| `inspect` | Partial | Asset, actor, project, and map inspection work; Blueprint graph inspection is limited by UE4.27 Python exposure. | Domain inspection namespace for asset, actor, project, map, and Blueprint analysis actions. |
| `manage_pipeline` | Supported | - | Domain pipeline namespace for asset validation, project inspection, and tool status reporting actions. |
| `manage_tools` | Supported | - | Domain tool-management namespace for listing registered domain tools and describing supported actions. |
| `manage_lighting` | Supported | - | Domain lighting namespace for spawning common light actors, transforming them, and inspecting level lighting state. |
| `manage_level_structure` | Supported | - | Domain level-structure namespace for preset town, house, mansion, tower, wall, bridge, and fortress construction actions. |
| `manage_volumes` | Supported | - | Domain volume namespace for spawning common engine volumes and applying delete or transform actions. |
| `manage_navigation` | Supported | - | Domain navigation namespace for spawning navigation volumes and proxies plus basic map inspection actions. |
| `build_environment` | Supported | - | Domain environment-building namespace for preset town, arch, staircase, pyramid, and maze generation actions. |
| `manage_splines` | Supported | - | Domain spline namespace for spawning a spline-host actor or Blueprint and then transforming or deleting it. |
| `animation_physics` | Supported | - | Domain animation-and-physics namespace for physics Blueprint spawning, Blueprint physics settings, and Blueprint compilation actions. |
| `manage_skeleton` | Supported | - | Domain skeleton namespace for searching Skeleton and SkeletalMesh assets and inspecting their metadata. |
| `manage_geometry` | Supported | - | Domain geometry namespace for wall, arch, staircase, and pyramid preset construction actions. |
| `manage_effect` | Supported | - | Domain effects namespace for spawning debug-shape actors, assigning materials, tinting them, and deleting them. |
| `manage_material_authoring` | Supported | - | Domain material namespace for listing materials, applying them to actors or Blueprints, and tinting them with material instances. |
| `manage_texture` | Supported | - | Domain texture namespace for searching texture assets and reading their asset metadata. |
| `manage_blueprint` | Partial | Blueprint asset and component edits work; graph inspection and pin wiring remain limited by UE4.27 Python exposure, and unsupported node or variable creation helpers are excluded from the MCP surface. | Domain Blueprint namespace for Blueprint creation, component editing, graph inspection, graph pin wiring, compilation, and Blueprint inspection actions. |
| `manage_sequence` | Supported | - | Domain sequence namespace for searching LevelSequence assets and inspecting their asset metadata. |
| `manage_performance` | Supported | - | Domain performance namespace for editor console commands and screenshot capture actions. |
| `manage_audio` | Supported | - | Domain audio namespace for searching audio assets and inspecting their asset metadata. |
| `manage_input` | Supported | - | Domain input namespace for creating classic UE4 input mappings and inspecting project input settings. |
| `manage_behavior_tree` | Supported | - | Domain behavior-tree namespace for searching BehaviorTree assets and inspecting their asset metadata. |
| `manage_ai` | Supported | - | Domain AI namespace for searching AI-related assets through the existing asset registry and project inspection actions. |
| `manage_gas` | Supported | - | Domain GAS namespace for searching gameplay-ability-related assets and inspecting their asset metadata. |
| `manage_character` | Supported | - | Domain character namespace for creating Blueprint characters, spawning Blueprint actors, and inspecting project character data. |
| `manage_combat` | Supported | - | Domain combat namespace for combat Blueprint scaffolding, Blueprint actor spawning, and actor property edits. |
| `manage_inventory` | Supported | - | Domain inventory namespace for Blueprint scaffolding, Blueprint default-property edits, and Blueprint compilation actions. |
| `manage_interaction` | Partial | Its add_component_to_blueprint action inherits the SimpleConstructionScript parenting limits of UE4.27 Python. | Domain interaction namespace for Blueprint scaffolding, component wiring, and Blueprint actor spawning actions. |
| `manage_widget_authoring` | Partial | create_widget_blueprint, add_text_block, and add_button work; add_to_viewport requires PIE, and unsupported binding helpers are excluded from the MCP surface. | Domain widget namespace for UMG Blueprint creation, widget-tree edits, and viewport spawning actions. |
| `manage_source_control` | Supported | provider_info works broadly, but file and package operations require a configured and available Unreal source-control provider. | Domain source-control namespace for provider inspection and file or package source-control operations. |
| `manage_networking` | Supported | - | Domain networking namespace for project inspection and console-command driven networking diagnostics. |
| `manage_game_framework` | Supported | - | Domain game-framework namespace for project inspection and gameplay Blueprint scaffolding actions. |
| `manage_sessions` | Supported | - | Domain sessions namespace for project inspection and console-command driven local session diagnostics. |

### Excluded Functions

These actions are intentionally not exposed through the MCP surface in this UE4.27 port because they fail reliably in the current Python environment and only add prompt or context overhead until a native bridge exists.

| Function | Previous Surface | Reason |
|----------|------------------|--------|
| `add_blueprint_event_node` | Direct MCP tool | Excluded because the current UE4.27 Python environment does not expose reliable event graph access or K2 event reference setup. |
| `add_blueprint_input_action_node` | Direct MCP tool | Excluded because the current UE4.27 Python environment does not expose reliable Blueprint event graph node creation. |
| `add_blueprint_function_node` | Direct MCP tool | Excluded because the current UE4.27 Python environment does not expose reliable function-call node reference setup. |
| `add_blueprint_variable` | Direct MCP tool | Excluded because BPVariableDescription and EdGraphPinType are not exposed in the current UE4.27 Python environment. |
| `add_blueprint_get_self_component_reference` | Direct MCP tool | Excluded because the current UE4.27 Python environment does not expose reliable Blueprint component-reference node setup. |
| `add_blueprint_self_reference` | Direct MCP tool | Excluded because the current UE4.27 Python environment does not expose reliable low-level Blueprint graph node creation. |
| `add_node` | Direct MCP tool | Excluded because low-level Blueprint graph node creation is not exposed in the current UE4.27 Python environment. |
| `create_variable` | Direct MCP tool | Excluded because BPVariableDescription and EdGraphPinType are not exposed in the current UE4.27 Python environment. |
| `bind_widget_event` | Direct MCP tool | Excluded because DelegateEditorBinding is not exposed in the current UE4.27 Python environment. |
| `set_text_block_binding` | Direct MCP tool | Excluded because DelegateEditorBinding is not exposed in the current UE4.27 Python environment. |
| `manage_blueprint.add_node` | Domain action | Excluded because it depends on the same unsupported low-level Blueprint graph node creation path as add_node. |
| `manage_blueprint.create_variable` | Domain action | Excluded because it depends on the same unsupported Blueprint variable authoring path as create_variable. |
| `manage_widget_authoring.bind_event` | Domain action | Excluded because it depends on DelegateEditorBinding, which is not exposed in the current UE4.27 Python environment. |
| `manage_widget_authoring.set_text_binding` | Domain action | Excluded because it depends on DelegateEditorBinding, which is not exposed in the current UE4.27 Python environment. |

## License

Licensed under the [MIT License](LICENSE).
