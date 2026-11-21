export const RUM_PRIVACY_PIPELINE_NAME = 'kobato_rum_privacy'
export const RUM_PRIVACY_FUNCTION_NAME = 'kobato_rum_privacy_drop'
export const RUM_STREAM_NAME = '_rumdata'
export const RUM_PRIVACY_PIPELINE_VERSION = 2
export const RUM_PRIVACY_VERSION_MARKER = `allowlist-version=${RUM_PRIVACY_PIPELINE_VERSION}`

export const RUM_PRIVACY_VRL_SHA256 = '9b174c3cebd9d890284f433c61589196f06caa87d087f2788f93971693ed2da8'
export const RUM_PRIVACY_HASH_MARKER = `vrl-sha256=${RUM_PRIVACY_VRL_SHA256}`

export const RUM_PRIVACY_PIPELINE_DESCRIPTION = `Second, storage-time RUM privacy boundary: fail-closed allowlist (${RUM_PRIVACY_VERSION_MARKER}, ${RUM_PRIVACY_HASH_MARKER})`
