/**
 * Release switch for the General settings 语言 selector. It stays `false` until
 * every i18n surface, cache dimension and e2e journey has shipped: flipping it
 * on is the last step, so no half-localized build ever reaches a user's admin.
 * Source-level on purpose — this is not runtime configuration.
 */
export const I18N_SETTINGS_ENABLED = false
