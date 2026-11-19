import type { ReactElement } from 'react'

import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN.ts'
import { I18nProvider } from '@kobato/ui/lib/I18nProvider.tsx'
import { ThemeProvider } from '@kobato/ui/lib/ThemeProvider.tsx'
import { renderToString } from 'react-dom/server'

export function renderToHtml(element: ReactElement): string {
  return renderToString(
    <ThemeProvider>
      <I18nProvider locale="zh-CN" messages={uiMessagesZhCN}>
        {element}
      </I18nProvider>
    </ThemeProvider>,
  )
}
