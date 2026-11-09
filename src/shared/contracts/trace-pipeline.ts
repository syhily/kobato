// OpenObserve RUM privacy pipeline identity, shared by `scripts/trace`
// provisioning and the DEV startup verifier. Pure constants only: scripts
// import this file directly and must never pull serverConfig/logger in.

export const RUM_PRIVACY_PIPELINE_NAME = 'kobato_rum_privacy'
export const RUM_PRIVACY_FUNCTION_NAME = 'kobato_rum_privacy_drop'
export const RUM_PRIVACY_PIPELINE_VERSION = 1
export const RUM_PRIVACY_VERSION_MARKER = `allowlist-version=${RUM_PRIVACY_PIPELINE_VERSION}`

/** SHA-256 of `rum-privacy.vrl` with leading/trailing whitespace trimmed. */
export const RUM_PRIVACY_VRL_SHA256 = '53293f74e258cabbd19455fc90e341ad01de2f5ddefa102cea136a812e366c22'
export const RUM_PRIVACY_HASH_MARKER = `vrl-sha256=${RUM_PRIVACY_VRL_SHA256}`

export const RUM_PRIVACY_PIPELINE_DESCRIPTION = `ADR-0012 second privacy boundary: fail-closed RUM allowlist (${RUM_PRIVACY_VERSION_MARKER}, ${RUM_PRIVACY_HASH_MARKER})`
