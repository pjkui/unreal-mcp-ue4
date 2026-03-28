# unreal-mcp-ue4
> UE4.27.2-focused MCP server for Unreal Engine using Unreal Python Remote Execution

`unreal-mcp-ue4` is a UE4.27.2-compatible fork of [runreal/unreal-mcp](https://github.com/runreal/unreal-mcp). It keeps the original local Node.js MCP workflow, adapts the tool layer to Unreal Engine 4.27, and adds broader UE4-safe coverage for actors, assets, Blueprints, UMG, materials, world-building helpers, and domain-style namespace tools.

This port and the follow-up tool, documentation, and smoke-test work were developed with assistance from OpenAI Codex.

## Overview

- No custom Unreal C++ plugin from this repository is required.
- The server talks to the editor through Unreal's built-in Python Remote Execution path.
- The tool surface is organized into granular tools and higher-level domain tools.
- UE5-only editor scripting features are not reintroduced; unsupported operations return a clear message instead of silently failing.

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

### Windows client example

```json
{
  "mcpServers": {
    "unreal-ue4": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Users\\YourName\\dev\\unreal-mcp-ue4\\dist\\bin.js"
      ]
    }
  }
}
```

In JSON on Windows, either escape backslashes or use forward slashes.

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

- `editor_project_info`
- `editor_get_map_info`
- `editor_get_world_outliner`

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

### Blueprint or UMG commands return `unsupported`

- Some editor-only Blueprint graph and UMG binding APIs are only partially exposed in UE4.27 Python.
- In those cases this fork returns a clear unsupported response instead of pretending the operation succeeded.

## Notes and Limitations

- World-building and structure-generation tools use UE4.27-friendly preset builders based on engine basic-shape assets.
- UMG positioning currently targets `CanvasPanel` slots in UE4.27.
- Reparenting the current root widget and editing named-slot content are not currently handled.
- Some advanced Blueprint graph editing flows are limited by what UE4.27 exposes through Python.
- The tool surface includes both granular tools and action-based domain tools so different MCP clients can work at different abstraction levels.

The tool list below is generated from `server/index.ts` during build.

## 🛠️ Available Tools

### Connection & Setup

| Tool | Description |
|------|-------------|
| `set_unreal_engine_path` | Set the Unreal Engine path |
| `set_unreal_project_path` | Set the Project path |
| `get_unreal_engine_path` | Get the current Unreal Engine path |
| `get_unreal_project_path` | Get the current Unreal Project path |

### Editor & Asset Tools

| Tool | Description |
|------|-------------|
| `editor_run_python` | Execute any python within the Unreal Editor |
| `editor_list_assets` | List all Unreal assets |
| `editor_export_asset` | Export an Unreal asset to text |
| `editor_get_asset_info` | Get information about an asset, including LOD levels for StaticMesh and SkeletalMesh assets |
| `editor_get_asset_references` | Get references for an asset |
| `editor_console_command` | Run a console command in Unreal |
| `editor_project_info` | Get detailed information about the current project |
| `editor_get_map_info` | Get detailed information about the current map/level |
| `editor_search_assets` | Search for assets by name or path with optional class filter |
| `editor_get_world_outliner` | Get all actors in the current world with their properties |
| `editor_validate_assets` | Validate assets in the project to check for errors |

### Actor / Level Tools

| Tool | Description |
|------|-------------|
| `editor_create_object` | Create a new object/actor in the world |
| `editor_update_object` | Update an existing object/actor in the world |
| `editor_delete_object` | Delete an object/actor from the world |
| `editor_take_screenshot` | Take a screenshot of the Unreal Editor |
| `editor_move_camera` | Move the viewport camera to a specific location and rotation for positioning screenshots |
| `get_actors_in_level` | Get all actors currently loaded in the editor level. |
| `find_actors_by_name` | Find level actors by matching a name or label pattern. |
| `spawn_actor` | Spawn a native actor class into the current level. |
| `delete_actor` | Delete a level actor by name or actor label. |
| `set_actor_transform` | Set actor location, rotation, or scale in the current level. |
| `get_actor_properties` | Inspect common editor properties for a specific actor. |
| `get_actor_material_info` | Inspect the material slots used by an actor |
| `set_actor_property` | Set a single editor property on an existing actor. |
| `spawn_blueprint_actor` | Spawn an actor from a Blueprint asset into the current level. |

### Physics & Materials Tools

| Tool | Description |
|------|-------------|
| `spawn_physics_blueprint_actor` | Spawn a Blueprint actor and enable physics on a material-capable component. |
| `get_available_materials` | List project or engine materials available for assignment. |
| `apply_material_to_actor` | Apply a material asset to an actor |
| `apply_material_to_blueprint` | Apply a material asset to a Blueprint component template. |
| `set_mesh_material_color` | Tint a mesh material by editing or generating a material instance constant. |

### Blueprint Analysis Tools

| Tool | Description |
|------|-------------|
| `read_blueprint_content` | Read a Blueprint |
| `analyze_blueprint_graph` | Analyze Blueprint graph nodes and connections. |
| `get_blueprint_variable_details` | Inspect Blueprint variable definitions and pin metadata. |
| `get_blueprint_function_details` | Inspect Blueprint function graphs, entry nodes, and call nodes. |

### Blueprint Asset / Component Tools

| Tool | Description |
|------|-------------|
| `create_blueprint` | Create a new Blueprint asset from a parent class. |
| `add_component_to_blueprint` | Add a component to a Blueprint construction script. |
| `set_static_mesh_properties` | Assign a Static Mesh asset to a Blueprint StaticMeshComponent. |
| `set_component_property` | Set a single editor property on a Blueprint component template. |
| `set_physics_properties` | Apply common physics settings to a Blueprint component template. |
| `compile_blueprint` | Compile and save a Blueprint asset after edits. |
| `set_blueprint_property` | Set a class default property on a Blueprint asset. |

### Blueprint Node Graph Tools

| Tool | Description |
|------|-------------|
| `add_blueprint_event_node` | Add an event node to a Blueprint event graph. |
| `add_blueprint_input_action_node` | Add an input action event node to a Blueprint event graph. |
| `add_blueprint_function_node` | Add a function call node to a Blueprint graph. |
| `connect_blueprint_nodes` | Connect two Blueprint graph pins by node id and pin name. |
| `add_blueprint_variable` | Add a variable declaration to a Blueprint asset. |
| `add_blueprint_get_self_component_reference` | Add a Blueprint node that gets a component reference from self. |
| `add_blueprint_self_reference` | Add a self reference node to a Blueprint graph. |
| `find_blueprint_nodes` | Search Blueprint graphs for matching node titles, names, or classes. |

### Blueprint Graph Editing Tools

| Tool | Description |
|------|-------------|
| `add_node` | Add a low-level Blueprint graph node using a helper node_type or raw node_class. |
| `connect_nodes` | Connect low-level Blueprint graph pins by node id and pin name. |
| `disconnect_nodes` | Disconnect low-level Blueprint graph links for a pin or a specific pin-to-pin connection. |
| `create_variable` | Create a low-level Blueprint variable declaration. |

### Project / Input Tools

| Tool | Description |
|------|-------------|
| `create_input_mapping` | Create an Action or Axis mapping in DefaultInput.ini for the current project. |

### World Building Tools

| Tool | Description |
|------|-------------|
| `create_town` | Create a procedural small town using UE basic shapes. |
| `construct_house` | Construct a house preset from UE basic shapes. |
| `construct_mansion` | Construct a mansion preset from UE basic shapes. |
| `create_tower` | Create a tower preset from UE basic shapes. |
| `create_arch` | Create an arch preset from UE basic shapes. |
| `create_staircase` | Create a staircase preset from UE basic shapes. |

### Epic Structures Tools

| Tool | Description |
|------|-------------|
| `create_castle_fortress` | Create a castle fortress preset from UE basic shapes. |
| `create_suspension_bridge` | Create a suspension bridge preset from UE basic shapes. |
| `create_bridge` | Create a simple bridge preset from UE basic shapes. |
| `create_aqueduct` | Create an aqueduct preset from UE basic shapes. |

### Level Design Tools

| Tool | Description |
|------|-------------|
| `create_maze` | Create a procedural maze from UE basic shapes. |
| `create_pyramid` | Create a stepped pyramid from UE basic shapes. |
| `create_wall` | Create a reusable wall segment preset from UE basic shapes. |

### UMG Tools

| Tool | Description |
|------|-------------|
| `editor_umg_add_widget` | Add a UMG widget to a Widget Blueprint |
| `editor_umg_remove_widget` | Remove a UMG widget from a Widget Blueprint by widget name |
| `editor_umg_set_widget_position` | Set the position of a UMG widget inside a Widget Blueprint |
| `editor_umg_reparent_widget` | Change the parent panel of an existing UMG widget inside a Widget Blueprint |
| `editor_umg_add_child_widget` | Add a child widget to a parent panel inside a Widget Blueprint |
| `editor_umg_remove_child_widget` | Remove a direct child widget from a parent panel inside a Widget Blueprint. |
| `editor_umg_set_child_widget_position` | Set the position of a direct child widget on a parent panel inside a Widget Blueprint |
| `create_umg_widget_blueprint` | Create a Widget Blueprint asset for UMG authoring. |
| `add_text_block_to_widget` | Add a TextBlock to a Widget Blueprint and optionally position it on a CanvasPanel. |
| `add_button_to_widget` | Add a Button to a Widget Blueprint and optionally place it on a CanvasPanel. |
| `bind_widget_event` | Bind a widget event to a Blueprint function when delegate editing is exposed by UE4.27 Python. |
| `add_widget_to_viewport` | Instantiate a Widget Blueprint and add it to the active PIE or game viewport. |
| `set_text_block_binding` | Configure a TextBlock binding when delegate editing is exposed by UE4.27 Python. |

### Domain Tools

| Tool | Description |
|------|-------------|
| `manage_asset` | Domain asset namespace for list, search, info, references, export, and validation actions. |
| `control_actor` | Domain actor namespace for listing, searching, spawning, deleting, transforming, and inspecting level actors. |
| `control_editor` | Domain editor namespace for Python execution, console commands, project inspection, map inspection, screenshots, and camera control. |
| `manage_level` | Domain level namespace for map inspection, actor listing, world outliner inspection, and preset structure creation actions. |
| `system_control` | Domain system namespace for console commands, project state inspection, and asset validation actions. |
| `inspect` | Domain inspection namespace for asset, actor, project, map, and Blueprint analysis actions. |
| `manage_pipeline` | Domain pipeline namespace for asset validation, project inspection, and tool status reporting actions. |
| `manage_tools` | Domain tool-management namespace for listing registered domain tools and describing supported actions. |
| `manage_lighting` | Domain lighting namespace for spawning common light actors, transforming them, and inspecting level lighting state. |
| `manage_level_structure` | Domain level-structure namespace for preset town, house, mansion, tower, wall, bridge, and fortress construction actions. |
| `manage_volumes` | Domain volume namespace for spawning common engine volumes and applying delete or transform actions. |
| `manage_navigation` | Domain navigation namespace for spawning navigation volumes and proxies plus basic map inspection actions. |
| `build_environment` | Domain environment-building namespace for preset town, arch, staircase, pyramid, and maze generation actions. |
| `manage_splines` | Domain spline namespace for spawning a spline-host actor or Blueprint and then transforming or deleting it. |
| `animation_physics` | Domain animation-and-physics namespace for physics Blueprint spawning, Blueprint physics settings, and Blueprint compilation actions. |
| `manage_skeleton` | Domain skeleton namespace for searching Skeleton and SkeletalMesh assets and inspecting their metadata. |
| `manage_geometry` | Domain geometry namespace for wall, arch, staircase, and pyramid preset construction actions. |
| `manage_effect` | Domain effects namespace for spawning debug-shape actors, assigning materials, tinting them, and deleting them. |
| `manage_material_authoring` | Domain material namespace for listing materials, applying them to actors or Blueprints, and tinting them with material instances. |
| `manage_texture` | Domain texture namespace for searching texture assets and reading their asset metadata. |
| `manage_blueprint` | Domain Blueprint namespace for Blueprint creation, component editing, graph editing, compilation, and Blueprint inspection actions. |
| `manage_sequence` | Domain sequence namespace for searching LevelSequence assets and inspecting their asset metadata. |
| `manage_performance` | Domain performance namespace for editor console commands and screenshot capture actions. |
| `manage_audio` | Domain audio namespace for searching audio assets and inspecting their asset metadata. |
| `manage_input` | Domain input namespace for creating classic UE4 input mappings and inspecting project input settings. |
| `manage_behavior_tree` | Domain behavior-tree namespace for searching BehaviorTree assets and inspecting their asset metadata. |
| `manage_ai` | Domain AI namespace for searching AI-related assets through the existing asset registry and project inspection actions. |
| `manage_gas` | Domain GAS namespace for searching gameplay-ability-related assets and inspecting their asset metadata. |
| `manage_character` | Domain character namespace for creating Blueprint characters, spawning Blueprint actors, and inspecting project character data. |
| `manage_combat` | Domain combat namespace for combat Blueprint scaffolding, Blueprint actor spawning, and actor property edits. |
| `manage_inventory` | Domain inventory namespace for Blueprint scaffolding, Blueprint default-property edits, and Blueprint compilation actions. |
| `manage_interaction` | Domain interaction namespace for Blueprint scaffolding, component wiring, and Blueprint actor spawning actions. |
| `manage_widget_authoring` | Domain widget namespace for UMG Blueprint creation, widget-tree edits, viewport spawning, and basic binding actions. |
| `manage_networking` | Domain networking namespace for project inspection and console-command driven networking diagnostics. |
| `manage_game_framework` | Domain game-framework namespace for project inspection and gameplay Blueprint scaffolding actions. |
| `manage_sessions` | Domain sessions namespace for project inspection and console-command driven local session diagnostics. |

## 📄 License

Licensed under the [MIT License](LICENSE).
