# unreal-mcp-ue4
> 面向 UE4.26.2 / UE4.27 的 Unreal Engine MCP 服务器，基于 Unreal Python Remote Execution 实现。

[![npm version](https://img.shields.io/npm/v/unreal-mcp-ue4?label=npm)](https://www.npmjs.com/package/unreal-mcp-ue4)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-published-2ea44f)](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.conaman/unreal-mcp-ue4)
[![GitHub release](https://img.shields.io/github/v/release/conaman/unreal-mcp-ue4?label=release)](https://github.com/conaman/unreal-mcp-ue4/releases/latest)

> English version: [README.md](README.md)

`unreal-mcp-ue4` 源自 [runreal/unreal-mcp](https://github.com/runreal/unreal-mcp) 的核心理念与早期工作流，但在此基础上针对 Unreal Engine 4.26.2 与 4.27.2 做了大量重构，新增了大量工具、UE4 专属兼容层、文档以及端到端的 smoke 覆盖。到目前为止，原始灵感仍在，但公开 API 与日常行为已与上游项目差异较大，是一个以 UE4 为先的独立分支。

本次移植以及后续的工具、文档、smoke 测试工作，借助了 OpenAI Codex 辅助完成。

> 本项目仍在积极开发中，可能存在 Bug、粗糙之处以及 UE4.26/4.27 特有的限制。
>
> 已发布的 npm 包：[`unreal-mcp-ue4`](https://www.npmjs.com/package/unreal-mcp-ue4)
> MCP Registry 名称：`io.github.conaman/unreal-mcp-ue4`

## 概览

- 本仓库不需要额外的 Unreal C++ 插件。
- 服务器通过 Unreal 内置的 Python Remote Execution 通道与编辑器通信。
- 工具面按「细粒度工具 + 高级工具命名空间」两层组织。
- 未重新引入仅 UE5 可用的编辑器脚本能力；UE4.26/4.27 下可安全使用的操作照常工作，而不可靠的 Graph 或绑定流程要么不在 MCP 面之内，要么会返回清晰的错误信息，而不是悄悄失败。

## 项目由来

- 最初的灵感与起点：[runreal/unreal-mcp](https://github.com/runreal/unreal-mcp)
- 当前代码库经过大量面向 UE4.26/4.27 的重构、架构调整和工具扩展。
- 实际上共享的思想仍清晰可见，但实现、范围和支持的工作流已构成一个独立的、以 UE4 为先的项目。
- Unreal Python API 参考（4.26 与 4.27 通用）：[Unreal Engine Python API 4.27](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/?application_version=4.27)

## 安全性

- 本项目并非 Epic Games 官方项目。
- 任何连接到此 MCP 服务器的客户端，都可以检查与修改你打开的 Unreal Editor 会话。
- 初次尝试资产或世界生成类工具时，建议先使用一个可丢弃的测试项目。

## 环境要求

- Unreal Engine `4.26.2` 或 `4.27.2`
- Node.js `18+`
- `npm`
- 一个 MCP 客户端，例如 Codex、Claude Desktop、Cursor，或在受支持 IDE 中的 GitHub Copilot

## Unreal Editor 必需设置

本仓库不附带自己的 Unreal 插件，而是依赖 UE4.26.2 / UE4.27.2 项目中必须启用的内置编辑器功能。

### 必需插件

- `Python Editor Script Plugin`
- `Editor Scripting Utilities`

### 必需的项目设置

- `Edit -> Project Settings -> Python -> Enable Remote Execution`

### 说明

- UMG 相关工具使用 Unreal Editor 自带的编辑器模块，无需安装本仓库提供的额外 UMG 插件。
- 在使用 MCP 服务器或运行测试时，请保持目标 Unreal 项目为打开状态。
- 修改插件或 Python 设置后，需要重启编辑器再进行测试。

## 安装

### 1. 克隆并构建服务器

```bash
git clone https://github.com/conaman/unreal-mcp-ue4.git
cd unreal-mcp-ue4
npm install
npm run build
```

构建成功后应生成 `dist/bin.js`、`dist/index.js` 与 `dist/editor/tools.js`。

### 1a. 从 npm 安装

一旦包在 npm 上发布完成，你也可以直接从 npm 安装，而不必克隆仓库。

全局安装：

```bash
npm install -g unreal-mcp-ue4
```

使用 `npx` 单次调用：

```bash
npx unreal-mcp-ue4
```

如果是从 npm 安装，MCP 服务器的入口是已发布的 `unreal-mcp-ue4` 可执行文件，而不是本地的 `dist/bin.js`。

### 2. 启用 Unreal 相关要求

在 Unreal Editor 中：

1. 打开目标 UE4.26.2 或 UE4.27.2 项目。
2. 进入 `Edit -> Plugins`。
3. 启用 `Python Editor Script Plugin`。
4. 启用 `Editor Scripting Utilities`。
5. 如有提示，重启编辑器。
6. 进入 `Edit -> Project Settings -> Python`。
7. 启用 `Enable Remote Execution`。
8. 必要时再次重启编辑器。

### 3. 配置你的 MCP 客户端

大多数客户端使用本地 `stdio` 服务器命令。最稳妥的配置是同时使用 `node` 的绝对路径和 `dist/bin.js` 的绝对路径。

通用 MCP 客户端示例：

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

如果 `node` 已在 `PATH` 中，也可以使用 `"command": "node"`。

### Codex 示例

```bash
codex mcp add unreal-ue4 -- /absolute/path/to/node /absolute/path/to/unreal-mcp-ue4/dist/bin.js
```

如果从 npm 全局安装，可以让客户端直接指向已发布的可执行文件：

```bash
codex mcp add unreal-ue4 -- unreal-mcp-ue4
```

### GitHub Copilot 示例

对于 VS Code，创建 `.vscode/mcp.json`：

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

随后在 MCP 配置面板启动该服务器，并在工具选择器里确认出现 `unreal-ue4`。

官方 Copilot 文档：

- [Extending GitHub Copilot Chat with MCP servers](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp)
- [About Model Context Protocol in GitHub Copilot](https://docs.github.com/en/copilot/concepts/context/mcp)

## 使用

### 接口模型

- 主要对外面优先使用 `manage_*` 命名空间工具。
- `manage_editor.project_info` 是项目概览的规范入口。
- `manage_editor.map_info` 与 `manage_level.world_outliner` 是地图与关卡读取的规范入口。
- 仅在少量底层原语场景下使用直连工具（direct tool），例如 Unreal 会话路径发现与 actor 的 create / update / delete。
- 使用 `manage_editor.run_python` 作为调试、快速原型以及 UE4.26/4.27 API 尚未封装为稳定工具时的 "逃生舱口"。

### 推荐的首次运行流程

1. 打开你的 UE4.26.2 或 UE4.27.2 项目，等待编辑器加载完成。
2. 确认所需插件以及 `Enable Remote Execution` 已启用。
3. 执行 `npm run build` 构建 MCP 服务器。
4. 启动 MCP 客户端，或在已引用本服务器的客户端中开启新会话。
5. 先跑一个只读命令作为冒烟测试。

建议优先尝试的命令：

- `manage_editor`，`action: "project_info"`
- `manage_editor`，`action: "map_info"`
- `manage_level`，`action: "world_outliner"`
- `manage_tools`，`action: "list_namespaces"`

建议优先尝试的自然语言请求：

- `从 unreal-ue4 服务器获取项目信息。`
- `列出当前关卡的所有 actor。`
- `在 0,0,100 处生成一个名为 TestCube 的 StaticMeshActor。`

### 服务器能做什么

- 从打开的编辑器中读取项目、地图、资产与 actor 信息。
- 在当前关卡中生成、检查、移动、删除 actor。
- 搜索资产并查看其引用与元数据。
- 创建常用的 UE4 数据资产，例如 `DataAsset` 与 `StringTable`。
- 在 UE4.26/4.27 Python 暴露了相应编辑器 API 的情况下，创建和编辑 Blueprint 资产。
- 使用对 UE4.26/4.27 安全的 UMG 辅助方法创建和编辑 Widget Blueprint 的控件树。
- 运行按 `action` 与 `params` 分发的分组工具命名空间。

## 测试

### 快速 smoke 测试

smoke 测试会先构建服务器，然后启动自己的本地 MCP 服务器进程、连接已经在运行的 Unreal Editor，并跑一套确定性的校验流程。运行测试前无需再单独启动一个 MCP 服务器。

```bash
npm run test:e2e
```

测试涵盖：

- MCP 服务器启动
- 工具发现
- project info、map info 与 world outliner 读取
- 源码控制的 provider 与状态读取
- 直连工具的 actor create / update / delete
- 命名空间层的 actor 生成、搜索、变换、检查与删除
- 工具命名空间发现以及源码控制与 actor 控制的命名空间分发

### 包含资产的 smoke 测试

```bash
npm run test:e2e -- --with-assets
```

额外覆盖：

- 创建 Blueprint
- 编辑 Blueprint 组件
- Blueprint 网格资产赋值
- Blueprint 编译
- 创建 DataAsset
- DataAsset 元数据回读
- 创建 StringTable
- 纹理导入与元数据回读
- 创建 Widget Blueprint
- 添加 TextBlock 与 Button
- 更进阶的 CanvasPanel 与子控件增删改流程
- 清理 `/Game/MCP/Tests` 下的临时资产

常用选项：

- `npm run test:e2e -- --with-assets --keep-assets` 保留生成的测试资产，便于在 Content Browser 中查看。
- `npm run test:e2e -- --skip-namespace` 跳过命名空间分发部分的 smoke 流程。
- `npm run test:e2e -- --verbose` 在运行期间打印 MCP 服务器的 stderr。
- `npm run test:e2e -- --help` 不重新构建服务器，仅打印 runner 选项。

### Windows 下的测试命令

在仓库目录下打开 PowerShell：

```powershell
cd C:\dev\unreal-mcp-ue4
npm install
npm run test:e2e
npm run test:e2e -- --with-assets
```

### 成功标志

- 控制台对每个测试步骤都打印 `[PASS]`。
- actor 测试会通过直连工具面与命名空间面两条路径，在编辑器中可见地创建并清理临时 actor。
- 带资产的测试会在 `/Game/MCP/Tests` 下临时创建 Blueprint、DataAsset、StringTable、Texture 与 Widget Blueprint 资产，并在退出前清理；除非使用 `--keep-assets`。

### 推荐的测试顺序

1. 先跑 `npm run test:e2e`。
2. 通过后再跑 `npm run test:e2e -- --with-assets`。
3. 两者都通过后，再在真实 MCP 客户端中试用一次。
4. 在正式工程内容上启用之前，先在独立的 Unreal 测试项目中验证。

## 发布到 npm

本包已按公开包准备好用于 npm 发布。

项目版本号在各处统一采用与 semver 兼容的日期格式 `YYYY.M.D-N`，例如当前发布版本统一为 `2026.4.1-1`。

推荐的维护者发布流程：

1. 更新项目版本号。
2. 运行发布前预检：

```bash
npm run publish:check
```

3. 如果有可用的、正在运行的 UE4.26/4.27 编辑器测试环境，同时运行：

```bash
npm run test:e2e -- --with-assets --skip-build
```

4. 发布：

```bash
npm publish
```

说明：

- `prepack` 会触发 `npm run build`，因此发布的 tarball 始终使用全新的 `dist`。
- `npm run publish:check` 会做 typecheck、重新构建包并跑 `npm pack --dry-run`，以便在发布前检查 tarball 的实际内容。
- npm 包名 `unreal-mcp-ue4` 目前是空闲可用的。
- 由于统一的日期版本号带有 semver 预发布后缀，发布时建议显式指定 dist-tag，例如 `npm publish --tag latest`。

## 故障排查

### `Remote node is not available`

- 确认 Unreal Editor 在运行 MCP 客户端或 smoke 测试之前已完全打开。
- 确认 `Python Editor Script Plugin` 已启用。
- 确认 `Editor Scripting Utilities` 已启用。
- 确认项目设置中的 `Enable Remote Execution` 已启用。
- 修改上述任意一项后，重启 Unreal Editor。

### Windows 下连接或发现问题

- 在 Windows Defender 防火墙中允许 `UnrealEditor.exe` 与 `node.exe`。
- 内置依赖 `unreal-remote-execution` 使用 UDP 多播发现 `239.0.0.1:6766`，命令通道使用本机回环 `127.0.0.1:6776`。
- 如果客户端配置使用 JSON，请注意转义反斜杠或改用正斜杠。

### 客户端启动但找不到 `node`

- 在 MCP 配置中使用 `node` 或 `node.exe` 的绝对路径，而不是依赖 `PATH`。

### 某些 Blueprint Graph 或 UMG 绑定命令不可用

- Widget Blueprint 的创建与常见的 widget-tree 编辑在本分支可用；UMG 主要缺失的是委托绑定辅助方法，以及依赖运行时的视口流程。
- Blueprint 的资产创建、组件编辑、编译以及高层资产概览可用；Graph 检查、Graph 引脚连线、变量或函数元数据辅助方法被有意排除，因为 UE4.26/4.27 的原生 Python 并未稳定地暴露所需的 Blueprint 元数据。
- 所有因为不够可靠而未暴露到 MCP 面的能力，统一列在工具章节的 `Excluded Capability Areas`。

## 说明与限制

- 世界构建与结构生成类工具使用对 UE4.26/4.27 友好的、基于引擎基础形状资产的预设构建器。
- 常见的 UMG widget-tree 编辑对 CanvasPanel 布局工作良好，但委托绑定辅助方法在原生 UE4.26/4.27 Python 中不可用。
- UMG 定位当前针对 UE4.26/4.27 中 `CanvasPanel` 的 Slot。
- 不支持改变当前的根 widget，也不支持编辑具名 slot 的内容。
- Blueprint 的资产与组件编辑可用，但 Graph 检查、引脚连线、变量或函数元数据检查在原生 UE4.26/4.27 Python 环境下被排除。
- 工具面同时包含细粒度直连工具以及基于 `action` 分发的工具命名空间，方便不同 MCP 客户端按不同抽象层次工作。

完整的工具列表详见英文 README 的 [Available Tools](README.md#available-tools) 章节，该表由 `server/index.ts` 在构建时自动生成。

## 许可证

基于 [MIT License](LICENSE) 授权发布。
