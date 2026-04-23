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

## 致谢与版权归属（Credits & Attribution）

本项目是一个基于 MIT 协议的衍生作品，保留所有上游项目的原始版权声明，并在此向原作者致谢。

- **最上游项目**：[runreal/unreal-mcp](https://github.com/runreal/unreal-mcp) — Copyright (c) 2025 runreal。MCP 的核心理念、最初的接线以及早期工具面源自该项目。
- **UE4 专属分支与 npm 首发者**：[conaman/unreal-mcp-ue4](https://github.com/conaman/unreal-mcp-ue4) — Copyright (c) 2025-2026 Seungjee Baek / `conaman`。当前 `unreal-mcp-ue4` npm 包、UE4.27 重构、工具命名空间层、smoke 测试套件以及大量现有文档均来自该仓库，本分支大量代码仍直接基于其工作。
- **本分支**：[pjkui/unreal-mcp-ue4](https://github.com/pjkui/unreal-mcp-ue4) — Copyright (c) 2026 `pjkui`。在其基础上补充了 UE4.26.2 兼容、中文文档（`README_zh.md`）、打包相关调整以及若干修复。

感谢 `runreal` 开源最初版本，感谢 `conaman` 完成大量面向 UE4 的重构并将 `unreal-mcp-ue4` 发布到 npm。如果你在本项目之上继续构建，请同时致谢上述上游项目。

完整的版权声明见 [`LICENSE`](LICENSE) 文件。

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

全局安装（推荐最终用户使用）：

```bash
npm install -g ue4-mcp
```

使用 `npx` 单次调用：

```bash
npx --yes ue4-mcp
```

同一份代码也发布为 scoped 包 `@pjkui/unreal-mcp-ue4`，二选一均可：

```bash
npm install -g @pjkui/unreal-mcp-ue4
# 或一次性调用：
npx --yes -p @pjkui/unreal-mcp-ue4 ue4-mcp
```

两个包发布的都是同一个名为 `ue4-mcp` 的 CLI 可执行文件。

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

大多数 MCP 客户端使用本地 `stdio` 服务器命令。根据你的安装方式，从下面三种里选一种即可。

#### 方式一（推荐）——全局安装 + 直接使用 `ue4-mcp` 命令

一次性安装：

```bash
npm install -g ue4-mcp
# 等价写法：npm install -g @pjkui/unreal-mcp-ue4
```

配置文件里直接调用命令：

```json
{
  "mcpServers": {
    "unreal-ue4": {
      "command": "ue4-mcp"
    }
  }
}
```

这是启动最快的方式（不会在每次启动时重新联网下载），配置最简单，在 macOS、Linux、Windows 上只要全局 `bin` 目录在 `PATH` 中，写法完全一致。

如果你的 MCP 客户端找不到 `ue4-mcp`，请改写绝对路径：

```bash
# 定位安装目录：
npm root -g
# Windows 示例：C:\Users\<你>\AppData\Roaming\npm\node_modules
# 可执行文件通常位于：
#   C:\Users\<你>\AppData\Roaming\npm\ue4-mcp.cmd
#   macOS/Linux：/usr/local/bin/ue4-mcp
```

```json
{
  "mcpServers": {
    "unreal-ue4": {
      "command": "C:\\Users\\YourName\\AppData\\Roaming\\npm\\ue4-mcp.cmd"
    }
  }
}
```

> 走公司 npm 镜像？部分镜像在同步 `ajv` 的 tarball 时可能丢失文件，会导致本服务器启动失败。建议显式使用公网 registry 安装：`npm install -g ue4-mcp --registry=https://registry.npmjs.org/`。

#### 方式二——使用 `npx`（免全局安装，始终拿最新版）

适合希望每次启动都获取最新版本的场景：

```json
{
  "mcpServers": {
    "unreal-ue4": {
      "command": "npx",
      "args": ["--yes", "ue4-mcp@latest"]
    }
  }
}
```

如果默认走的是公司 npm 镜像，强烈建议显式指向公网 registry：

```json
{
  "mcpServers": {
    "unreal-ue4": {
      "command": "npx",
      "args": ["--yes", "ue4-mcp@latest"],
      "env": {
        "npm_config_registry": "https://registry.npmjs.org/"
      }
    }
  }
}
```

取舍：每次冷启动 `npx` 都会检查新版，会多几秒钟；若 `~/.npm/_npx` 缓存被不稳定镜像搞坏，需要手动清理。

#### 方式三——本地开发版构建（未发布代码）

在本仓库做开发、不想发布时，直接让客户端指向构建好的 `dist/bin.js`：

```json
{
  "mcpServers": {
    "unreal-ue4": {
      "command": "node",
      "args": [
        "/absolute/path/to/unreal-mcp-ue4/dist/bin.js"
      ]
    }
  }
}
```

如果 `node` 已在 `PATH` 中，`"command": "node"` 即可，否则请写 `node` 可执行文件的绝对路径。每次改动后记得先 `npm run build`。

### Codex 示例

全局安装后：

```bash
codex mcp add unreal-ue4 -- ue4-mcp
```

使用 `npx`（免全局安装）：

```bash
codex mcp add unreal-ue4 -- npx --yes ue4-mcp@latest
```

本地开发兜底：

```bash
codex mcp add unreal-ue4 -- /absolute/path/to/node /absolute/path/to/unreal-mcp-ue4/dist/bin.js
```

> 注意：CLI 可执行文件名统一为 `ue4-mcp`。两个 npm 包名（`ue4-mcp` 与 `@pjkui/unreal-mcp-ue4`）发布的是完全相同的二进制，如果两个都全局安装会互相覆盖，但因为内容一致不会造成功能差异。

### GitHub Copilot 示例

对于 VS Code，创建 `.vscode/mcp.json`。

推荐写法（全局安装）：

```json
{
  "servers": {
    "unreal-ue4": {
      "command": "ue4-mcp"
    }
  }
}
```

使用 `npx`：

```json
{
  "servers": {
    "unreal-ue4": {
      "command": "npx",
      "args": ["--yes", "ue4-mcp@latest"]
    }
  }
}
```

本地开发：

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

本仓库以双包形式发布，两个 npm 包共享完全相同的构建产物：

- `ue4-mcp`（短的公共名）
- `@pjkui/unreal-mcp-ue4`（规范 scoped 名）

项目版本号在各处统一采用与 semver 兼容的日期格式 `YYYY.M.D-N`，本分支当前版本为 `2026.4.23-2`。

推荐的维护者发布流程：

1. 使用 `npm run set:version 2026.4.23-3` 更新版本号（会同步改 `package.json`、`package-lock.json`、`server.json`、`server/version.ts`）。
2. 针对规范 scoped 包运行发布前预检：

```bash
npm run publish:check
```

3. 如果有可用的、正在运行的 UE4.26/4.27 编辑器测试环境，同时运行：

```bash
npm run test:e2e -- --with-assets --skip-build
```

4. 使用一条命令同时发布两个包名（需要一个开启了 "Bypass 2FA requirement when publishing" 的 granular npm token，或当前 TOTP 一次性验证码）：

```bash
# 使用 granular token
NPM_TOKEN=npm_xxx npm run publish:both

# 使用 2FA 一次性验证码
npm run publish:both -- --otp=123456

# 仅干跑模拟，不需要鉴权
npm run publish:both -- --dry-run
```

说明：

- `scripts/publish-both.mjs` 先用原 `package.json` 发布 `@pjkui/unreal-mcp-ue4`，再临时把 `name` 字段改成 `ue4-mcp` 发一次，最后还原 `package.json`。Token 不会写入 `~/.npmrc`。
- `prepack` 会触发 `npm run build`，因此发布的 tarball 始终使用全新的 `dist`。
- `npm run publish:check` 会做 typecheck、重新构建包并跑 `npm pack --dry-run`，以便在发布前检查 tarball 的实际内容。
- 由于统一的日期版本号带有 semver 预发布后缀，脚本在两个包上都显式指定了 `--tag latest`，`npm install` 能默认解析到最新版本。

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

## 可用工具

备注列会指出重要的前置条件或 UE4.26/4.27 限制。备注为空表示除常规编辑器设置之外没有其他注意事项。

推荐的对外公开面是 `manage_*` 命名空间层。优先使用 `manage_editor.project_info`、`manage_editor.map_info` 与 `manage_level.world_outliner` 作为规范读取入口，而一小组直连工具仅作为路径发现与 actor CRUD 的底层原语。

> 本章节为英文 README `## Available Tools` 的人工翻译版本。英文版表格会在 `npm run build` 时由 `server/scripts/update-readme.ts` 自动重新生成；本中文版不会被脚本覆盖，如新增/删除工具请同步手动更新这里。

### 编辑器会话信息（Editor Session Info）

<table width="100%">
	<colgroup>
		<col width="22%">
		<col width="48%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="22%">工具</th>
			<th width="48%">描述</th>
			<th width="30%">备注</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="22%"><code>get_unreal_engine_path</code></td>
		<td width="48%">从已连接的编辑器会话获取当前 Unreal Engine 的根路径。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>get_unreal_project_path</code></td>
		<td width="48%">从已连接的编辑器会话获取当前 Unreal 项目文件路径。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>get_unreal_version</code></td>
		<td width="48%">从已连接的编辑器会话获取当前 Unreal Engine 版本号字符串。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	</tbody>
</table>

### 核心直连工具（Core Direct Tools）

<table width="100%">
	<colgroup>
		<col width="22%">
		<col width="48%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="22%">工具</th>
			<th width="48%">描述</th>
			<th width="30%">备注</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="22%"><code>editor_create_object</code></td>
		<td width="48%">在世界中创建新的对象 / actor。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>editor_update_object</code></td>
		<td width="48%">更新世界中已存在的对象 / actor。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>editor_delete_object</code></td>
		<td width="48%">从世界中删除指定的对象 / actor。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	</tbody>
</table>

### 核心工具命名空间（Core Tool Namespaces）

<table width="100%">
	<colgroup>
		<col width="22%">
		<col width="48%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="22%">工具</th>
			<th width="48%">描述</th>
			<th width="30%">备注</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="22%"><code>manage_asset</code></td>
		<td width="48%">资产命名空间，提供 list、search、info、references、export 与 validation 等操作。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_actor</code></td>
		<td width="48%">Actor 命名空间，提供关卡 actor 的列出、搜索、生成、删除、变换与检查操作。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_editor</code></td>
		<td width="48%">编辑器命名空间，提供 Python 执行、控制台命令、项目检查、地图检查、PIE 控制、截图与相机控制。</td>
		<td width="30%">作为 project_info、map_info、world_outliner、PIE 控制、console_command 与 run_python 的规范命名空间。</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_level</code></td>
		<td width="48%">关卡命名空间，提供地图检查、actor 列出、world outliner 检查以及预设结构构建操作。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_system</code></td>
		<td width="48%">系统命名空间，提供控制台命令与资产校验操作。</td>
		<td width="30%">精简命名空间，集中了 console 与 validation 辅助方法；项目与地图的规范检查请使用 manage_editor。</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_inspection</code></td>
		<td width="48%">检查命名空间，提供资产、actor、地图以及基础 Blueprint 概览操作。</td>
		<td width="30%">资产、actor 与地图检查可用；在原生 UE4.26/4.27 Python 下，Blueprint 检查仅限于高层资产概览。</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_tools</code></td>
		<td width="48%">工具命名空间注册表，用于列出已注册的工具命名空间并描述它们支持的 action；作为命名空间优先的 MCP 面的发现入口。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_source_control</code></td>
		<td width="48%">源码控制命名空间，提供 provider 检查以及文件或包级别的源码控制操作。</td>
		<td width="30%">provider_info 广泛可用，但文件与包级操作要求 Unreal 已配置并启用了可用的源码控制 provider。</td>
	</tr>
	</tbody>
</table>

### 世界与环境命名空间（World & Environment Tool Namespaces）

<table width="100%">
	<colgroup>
		<col width="22%">
		<col width="48%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="22%">工具</th>
			<th width="48%">描述</th>
			<th width="30%">备注</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="22%"><code>manage_lighting</code></td>
		<td width="48%">光照命名空间，提供常见灯光 actor 的生成、变换以及关卡光照状态检查。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_level_structure</code></td>
		<td width="48%">关卡结构命名空间，提供预设的城镇、房屋、大宅、塔楼、城墙、桥梁与要塞构建操作。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_volumes</code></td>
		<td width="48%">Volume 命名空间，提供常见引擎 Volume 的生成以及删除、变换等操作。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_navigation</code></td>
		<td width="48%">导航命名空间，提供导航 Volume 与代理的生成，以及基础地图检查操作。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_environment</code></td>
		<td width="48%">环境构建命名空间，提供预设城镇、拱门、阶梯、金字塔与迷宫的生成操作。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_splines</code></td>
		<td width="48%">Spline 命名空间，提供生成 spline 宿主 actor 或 Blueprint，并可对其进行变换或删除。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_geometry</code></td>
		<td width="48%">几何体命名空间，提供城墙、拱门、阶梯与金字塔等预设构建操作。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_effect</code></td>
		<td width="48%">特效命名空间，提供调试用形状 actor 的生成、材质应用、着色染色与删除。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	</tbody>
</table>

### 内容与作者命名空间（Content & Authoring Tool Namespaces）

<table width="100%">
	<colgroup>
		<col width="22%">
		<col width="48%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="22%">工具</th>
			<th width="48%">描述</th>
			<th width="30%">备注</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="22%"><code>manage_skeleton</code></td>
		<td width="48%">骨骼命名空间，用于搜索 Skeleton 与 SkeletalMesh 资产并检查其元数据。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_material</code></td>
		<td width="48%">材质命名空间，用于列出材质、将材质应用到 actor 或 Blueprint，以及使用 material instance 进行染色。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_texture</code></td>
		<td width="48%">纹理命名空间，用于搜索纹理资产、从图像文件导入纹理以及读取其资产元数据。</td>
		<td width="30%">import_texture 需要 Unreal Editor 所在机器可访问的本地图像文件路径。</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_data</code></td>
		<td width="48%">数据命名空间，用于搜索数据资产、创建常见数据容器以及检查其资产元数据。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_blueprint</code></td>
		<td width="48%">Blueprint 命名空间，提供 Blueprint 创建、组件编辑、编译以及基础 Blueprint 概览操作。</td>
		<td width="30%">Blueprint 资产与组件编辑可用；Graph 检查、引脚连线以及变量或函数元数据辅助方法在原生 UE4.26/4.27 Python 下不在 MCP 面之内。</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_sequence</code></td>
		<td width="48%">Sequence 命名空间，用于 LevelSequence 资产的创建、搜索与检查。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_audio</code></td>
		<td width="48%">音频命名空间，用于音频文件导入、音频资产搜索及其元数据检查。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_widget</code></td>
		<td width="48%">Widget 命名空间，提供 UMG Blueprint 创建、widget 树编辑与 viewport 生成操作。常规嵌套布局（例如在已有的 CanvasPanel_0 下）请使用 add_child_widget；不传 parent_widget_name 的 add_widget 仅用于指定新的根 widget。</td>
		<td width="30%">create_widget_blueprint、add_text_block 与 add_button 可用；常规嵌套布局（如 CanvasPanel_0 下）使用 add_child_widget，而不传 parent_widget_name 的 add_widget 仅用于指定新的根 widget。add_to_viewport 需要进入 PIE，不支持的绑定辅助方法不在 MCP 面之内。</td>
	</tr>
	</tbody>
</table>

### 游戏玩法与系统命名空间（Gameplay & Systems Tool Namespaces）

<table width="100%">
	<colgroup>
		<col width="22%">
		<col width="48%">
		<col width="30%">
	</colgroup>
	<thead>
		<tr>
			<th width="22%">工具</th>
			<th width="48%">描述</th>
			<th width="30%">备注</th>
		</tr>
	</thead>
	<tbody>
	<tr>
		<td width="22%"><code>manage_animation_physics</code></td>
		<td width="48%">动画与物理命名空间，提供物理 Blueprint 生成、Blueprint 物理设置以及 Blueprint 编译等操作。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_input</code></td>
		<td width="48%">输入命名空间，用于创建经典的 UE4 输入映射。</td>
		<td width="30%">聚焦于经典 UE4 输入映射的编写；项目概览请使用 manage_editor.project_info。</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_behavior_tree</code></td>
		<td width="48%">行为树命名空间，用于 BehaviorTree 资产的创建、搜索与检查。</td>
		<td width="30%">聚焦于 BehaviorTree 资产的发现与检查；项目概览请使用 manage_editor.project_info。</td>
	</tr>
	<tr>
		<td width="22%"><code>manage_gas</code></td>
		<td width="48%">GAS 命名空间，用于搜索与 Gameplay Ability 相关的资产并检查其元数据。</td>
		<td width="30%">&nbsp;</td>
	</tr>
	</tbody>
</table>

### 被排除的能力区域（Excluded Capability Areas）

以下能力在这一 UE4.26/4.27 分支中被有意排除出 MCP 面，因为它们在当前 Python 环境下会稳定失败，只会在存在原生桥接之前增加 prompt 与上下文开销。

| 能力区域 | 对 MCP 面的影响 | 被排除的原因 |
|----------|------------------|---------------|
| Blueprint event graph 事件插入 | 相关的 event 节点与 input-action 辅助方法不在 MCP 面之内。 | 当前 UE4.26/4.27 Python 环境未稳定地暴露 event graph 访问或 K2 事件引用设置。 |
| Blueprint graph 检查与节点搜索 | Graph 分析、graph 检查与节点搜索辅助方法不在 MCP 面之内。 | 当前 UE4.26/4.27 Python 环境未稳定地暴露 `UbergraphPages`、`FunctionGraphs` 等 Blueprint graph 数组，不足以进行确定性检查。 |
| 低层 Blueprint graph 节点创建 | 通用 graph 节点辅助方法以及相关的 self 或组件引用插入辅助方法不在 MCP 面之内。 | 当前 UE4.26/4.27 Python 环境未稳定地暴露底层 graph 节点创建或成员引用连线。 |
| Blueprint 函数调用节点编写 | 依赖编辑器 graph 成员引用设置的函数节点辅助方法不在 MCP 面之内。 | 当前 UE4.26/4.27 Python 环境未稳定地暴露函数调用节点的引用设置。 |
| Blueprint 变量与函数元数据检查 | 变量详情与函数详情辅助方法不在 MCP 面之内。 | 当前 UE4.26/4.27 Python 环境未稳定地暴露 `NewVariables` 或 `FunctionGraphs`，不足以进行确定性检查。 |
| Blueprint 变量创建 | 变量创建辅助方法不在 MCP 面之内。 | 当前 UE4.26/4.27 Python 环境未暴露 `BPVariableDescription` 与 `EdGraphPinType`。 |
| UMG 委托绑定编写 | Widget 事件绑定与文本绑定辅助方法不在 MCP 面之内。 | 当前 UE4.26/4.27 Python 环境未暴露 `DelegateEditorBinding`。 |

## 许可证

基于 [MIT License](LICENSE) 授权发布。

本项目为衍生作品，版权由 `runreal`（上游原始项目）、`Seungjee Baek / conaman`（UE4 专属分支与 `unreal-mcp-ue4` npm 首发者）以及 `pjkui`（本分支）共同持有。依据 MIT License 的要求，所有上游版权声明均已保留。详见 [`LICENSE`](LICENSE) 文件以及 [致谢与版权归属](#致谢与版权归属credits--attribution) 章节。
