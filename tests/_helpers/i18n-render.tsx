import type { ReactElement, ReactNode } from 'react'

import { render } from '@testing-library/react'

import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'
import { I18nProvider } from '@/ui/lib/I18nProvider'

/** Wrap client components that call `useI18n()` (zh-CN catalog) for RTL tests. */
export function wrapWithI18n(node: ReactNode): ReactElement {
  return (
    <I18nProvider locale="zh-CN" messages={uiMessagesZhCN}>
      {node}
    </I18nProvider>
  )
}

export function renderWithI18n(ui: ReactElement) {
  return render(wrapWithI18n(ui))
}
