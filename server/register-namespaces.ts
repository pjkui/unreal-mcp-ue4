import { RegistrationContext } from "./registration-context.js"
import { registerContentNamespaces } from "./register-content-namespaces.js"
import { registerCoreNamespaces } from "./register-core-namespaces.js"
import { registerGameplayNamespaces } from "./register-gameplay-namespaces.js"
import { registerWorldNamespaces } from "./register-world-namespaces.js"

export function registerToolNamespaces(ctx: RegistrationContext) {
	registerCoreNamespaces(ctx)
	registerWorldNamespaces(ctx)
	registerContentNamespaces(ctx)
	registerGameplayNamespaces(ctx)
}
