const supportedEngineVersionPatterns = [/\b4\.26\.2\b/, /\b4\.27(?:\.\d+)?\b/]

export function isSupportedEngineVersion(value) {
	const engineVersion = String(value || "").trim()
	return supportedEngineVersionPatterns.some((pattern) => pattern.test(engineVersion))
}

export function getSupportedEngineVersionLabel() {
	return "UE4.26.2 or UE4.27.x"
}
