import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { createRegistrationContext } from "./registration-context.js"
import { registerDirectTools } from "./register-direct-tools.js"
import { registerToolNamespaces } from "./register-namespaces.js"
import { shutdownRemoteExecution } from "./remote-execution.js"
import { projectVersion } from "./version.js"

export { shutdownRemoteExecution }

export const server = new McpServer({
	name: "UnrealMCP-UE4",
	description: "Unreal Engine MCP for UE4.26.2 and UE4.27 with editor scripting compatibility helpers",
	version: projectVersion,
})


const registrationContext = createRegistrationContext(server)

registerDirectTools(registrationContext)
registerToolNamespaces(registrationContext)

server.registerResource(
	"unreal_python_docs",
	"docs://unreal_python",
	{
		title: "Unreal Engine Python API Documentation",
		description: "Reference links for UE4.26 / UE4.27 Python API documentation",
		mimeType: "text/markdown",
	},
	async (uri) => {
		const body = [
			"# Unreal Engine Python API Documentation",
			"",
			"- [UE 4.26 Python API](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/?application_version=4.26)",
			"- [UE 4.27 Python API](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/?application_version=4.27)",
			"",
			"These pages document the `unreal` Python module available inside the Unreal Editor",
			"and are the authoritative reference for scripting UE4.26 / UE4.27 via this MCP server.",
		].join("\n")

		return {
			contents: [
				{
					uri: uri.href,
					mimeType: "text/markdown",
					text: body,
				},
			],
		}
	},
)

