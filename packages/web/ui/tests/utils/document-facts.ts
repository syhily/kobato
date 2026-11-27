import type { DocumentFacts } from '@kobato/ui/lib/document-facts-context'

import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'

export const TEST_DOCUMENT_FACTS: DocumentFacts = {
  locale: 'zh-CN',
  messages: uiMessagesZhCN,
  revision: 'boot-1:0000000001',
  theme: null,
  fonts: null,
  settings: TEST_BLOG_SETTINGS_BUNDLE,
  csrfToken: 'csrf-token',
}

export function documentFactsFor(overrides: Partial<DocumentFacts> = {}): DocumentFacts {
  return { ...TEST_DOCUMENT_FACTS, ...overrides }
}
