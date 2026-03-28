# unreal-mcp-ue4
> UE4.27.2-focused MCP server for Unreal Engine that uses Unreal Python Remote Execution

Based on the original project: [runreal/unreal-mcp](https://github.com/runreal/unreal-mcp)

This fork was modified to support Unreal Engine 4.27 while preserving the original Unreal MCP workflow where possible.

![hero](hero.png)

![gif](mcp.gif)

[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](https://github.com/conaman/unreal-mcp-ue4/blob/main/LICENSE)

## ⚡ Differences

This server does not require installing a new UE plugin as it uses the built-in Python remote execution protocol.

Adding new tools/features is much faster to develop since it does not require any C++ code.

This fork adds UE4.27.2 compatibility while keeping equivalent UE5 editor scripting paths where they overlap.

Original source: [runreal/unreal-mcp](https://github.com/runreal/unreal-mcp)

It can support the [Unreal Engine Python API for 4.27](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/?application_version=4.27)


## ⚠️ Note

- This is not an official Unreal Engine project.
- Your AI agents or tools will have full access to your Editor.
- Review any changes your Client suggests before you approve them.

## 📦 Installation

#### 📋 Requirements
- 🔧 Unreal Engine 4.27.2 (verified)
- 🟢 Node.js 18+ (`npm` is included with Node.js. You do not need `rpm` on Windows.)
- 🟢 npm (recommended) or pnpm
- 🤖 MCP Client (Claude, Cursor, etc.)

1. Setting up your Editor:
   - Open your Unreal Engine project
   - Go to `Edit` -> `Plugins`
   - Search for "Python Editor Script Plugin" and enable it
   - Search for "Editor Scripting Utilities" and enable it
   - Restart the editor if prompted
   - Go to `Edit` -> `Project Settings` 
   - Search for "Python" and enable the "Enable Remote Execution" option

  ![enable plugin](img1.png)
  ![enable remote execution](img2.png)

2. Set up your Client:
   - Build this local fork
```bash
npm install
npm run build

# or
pnpm install
pnpm build
```
   - Edit your Claude (or Cursor) config
```json
{
  "mcpServers": {
    "unreal-ue4": {
      "command": "node",
      "args": [
        "/absolute/path/to/runreal_unreal_mcp_ue4/dist/bin.js"
      ]
    }
  }
}
```

### 🪟 Windows Quick Start

Open PowerShell in the repository folder and run:

```powershell
cd C:\dev\unreal-mcp-ue4
npm install
npm run build
```

For Windows MCP client configs, use `node` if it is on your `PATH`:

```json
{
  "mcpServers": {
    "unreal-ue4": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\dev\\unreal-mcp-ue4\\dist\\bin.js"
      ]
    }
  }
}
```

If your client cannot find `node`, point directly to `node.exe`:

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

### 🧰 GitHub Copilot

GitHub Copilot supports MCP in VS Code, Visual Studio, JetBrains, Eclipse, Xcode, and Copilot CLI. For a local `stdio` server like this project, VS Code is the simplest setup.

1. Build the server first:

```bash
npm install
npm run build
```

2. In VS Code, create `.vscode/mcp.json` in your workspace:

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

3. Open `.vscode/mcp.json` and click `Start`.
4. Open Copilot Chat and switch to `Agent` mode.
5. Open the tools picker and confirm that `unreal-ue4` is available.

If `node` is not on your `PATH`, use `C:\\Program Files\\nodejs\\node.exe` as the `command` value instead.

If you use Copilot Business or Copilot Enterprise, your organization may need to enable the `MCP servers in Copilot` policy first.

Official setup docs:
- [GitHub Docs: Extending GitHub Copilot Chat with MCP servers](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp)
- [GitHub Docs: About Model Context Protocol in GitHub Copilot](https://docs.github.com/en/copilot/concepts/context/mcp)

### 🔧 Troubleshooting

If you get an error similar to `MCP Unreal: Unexpected token 'C', Connection...` it means that the mcp-server was not able to connect to the Unreal Editor.

- Make sure that the Python Editor Script Plugin is enabled and that the Remote Execution option is checked in your project settings.
- Make sure that the Editor Scripting Utilities plugin is also enabled for UE4.27.2.
- On Windows, allow `UnrealEditor.exe` and `node.exe` through Windows Defender Firewall if node discovery fails. The bundled `unreal-remote-execution` package uses UDP multicast discovery on `239.0.0.1:6766` and a localhost command channel on `127.0.0.1:6776`.
- In Windows JSON config files, either escape backslashes (`C:\\path\\to\\dist\\bin.js`) or use forward slashes (`C:/path/to/dist/bin.js`).
- Try also changing your bind address from `127.0.0.1` to `0.0.0.0` but note that this will allow connections from your local network.
- Restart your Unreal Editor fully.
- Fully close/open your client (Claude, Cursor, etc.) to ensure it reconnects to the MCP server. (`File -> Exit` on windows).
- Check your running processes and kill any zombie unreal-mcp Node.js processes.

### 🧩 UMG Notes

- The UMG tools work against Widget Blueprint assets such as `/Game/UI/WBP_MainMenu`.
- The nested-widget commands use the UMG term `child widget` instead of `component`.
- Position changes currently target `CanvasPanel` slots in UE4.27. Non-canvas panel layouts are not repositioned by these tools.
- Creating nested `UserWidget` blueprint instances is not included in this UE4.27 port. Use native UMG widget classes such as `CanvasPanel`, `Border`, `Button`, `TextBlock`, and `Image`.
- Reparenting the current root widget and editing named-slot content are not handled by the current UMG commands.

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `set_unreal_engine_path` | Set the Unreal Engine path |
| `set_unreal_project_path` | Set the Project path |
| `get_unreal_engine_path` | Get the current Unreal Engine path |
| `get_unreal_project_path` | Get the current Unreal Project path |
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
| `editor_create_object` | Create a new object/actor in the world |
| `editor_update_object` | Update an existing object/actor in the world |
| `editor_delete_object` | Delete an object/actor from the world |
| `editor_take_screenshot` | Take a screenshot of the Unreal Editor |
| `editor_move_camera` | Move the viewport camera to a specific location and rotation for positioning screenshots |
| `editor_umg_add_widget` | Add a UMG widget to a Widget Blueprint |
| `editor_umg_remove_widget` | Remove a UMG widget from a Widget Blueprint by widget name |
| `editor_umg_set_widget_position` | Set the position of a UMG widget inside a Widget Blueprint |
| `editor_umg_reparent_widget` | Change the parent panel of an existing UMG widget inside a Widget Blueprint |
| `editor_umg_add_child_widget` | Add a child widget to a parent panel inside a Widget Blueprint |
| `editor_umg_remove_child_widget` | Remove a direct child widget from a parent panel inside a Widget Blueprint. |
| `editor_umg_set_child_widget_position` | Set the position of a direct child widget on a parent panel inside a Widget Blueprint |

## 🤝 Contributing

Please feel free to open issues or pull requests. Contributions are welcome, especially new tools/commands.

## 📄 License

Licensed under the [MIT License](LICENSE).
