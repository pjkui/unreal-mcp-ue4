import { RegistrationContext } from "./registration-context.js"
import { registerContentAssetNamespaces } from "./register-content-asset-namespaces.js"
import { registerContentAuthoringNamespaces } from "./register-content-authoring-namespaces.js"
import { registerContentMediaNamespaces } from "./register-content-media-namespaces.js"

export function registerContentNamespaces(ctx: RegistrationContext) {
	registerContentAssetNamespaces(ctx)
	registerContentAuthoringNamespaces(ctx)
	registerContentMediaNamespaces(ctx)
}
