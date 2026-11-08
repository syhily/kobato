/**
 * Release switch for the General settings language selector. It is ON: every
 * i18n surface, cache dimension and settings flow has shipped, so the admin can
 * switch the site language. Kept as a named constant (source-level, not runtime
 * configuration) so the surface can be gated again by a build if a regression
 * demands it.
 */
export const I18N_SETTINGS_ENABLED = true
