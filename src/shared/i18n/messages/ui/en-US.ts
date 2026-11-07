// English is the baseline catalog: it defines `UiMessageId`, and every other
// locale is type-checked against it. English plural categories are also the
// reference shape for reviewers — writing the countable message in English
// forces the author to decide one/other before translating.
//
// Placeholders are ICU: `{name}` interpolation, `{count, plural, …}`,
// `{kind, select, …}`, and `<tag>…</tag>` rich text (rendered via react-intl).

export const uiMessagesEnUS = {
  'common.action.back': 'Back',
  'common.action.cancel': 'Cancel',
  'common.action.close': 'Close',
  'common.action.confirm': 'Confirm',
  'common.action.delete': 'Delete',
  'common.action.edit': 'Edit',
  'common.action.reload': 'Reload',
  'common.action.retry': 'Retry',
  'common.action.save': 'Save',
  'common.action.search': 'Search',
  'common.count.items': '{count, plural, one {# item} other {# items}}',
  'common.state.loading': 'Loading…',
  'error.boundary.description': 'Sorry, the site hit an internal error. Reload the page to try again.',
  'error.boundary.title': 'Internal error',
  'error.notFound.description': 'Sorry, we could not find what you were looking for.',
  'error.notFound.title': 'Page not found',
  'validation.form.invalidEmail': 'Enter a valid email address.',
  'validation.form.invalidUrl': 'Enter a complete URL, including https://.',
  'validation.form.maxLength': 'At most {max} characters.',
  'validation.form.minLength': 'At least {min} characters.',
  'validation.form.required': 'This field is required.',
} as const

export type UiMessageId = keyof typeof uiMessagesEnUS

export type UiMessages = Record<UiMessageId, string>
