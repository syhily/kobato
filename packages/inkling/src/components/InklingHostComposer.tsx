import type { InklingComposerProps } from '@kobato/inkling-internal/components/InklingComposer'
import type { InklingLabelsInput } from '@kobato/inkling-internal/labels/inkling-labels'

import { toEmojiLocale } from '@kobato/i18n/locales'
import InklingComposer from '@kobato/inkling-internal/components/InklingComposer'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useTheme } from '@kobato/ui/lib/ThemeProvider'

export interface InklingHostComposerProps extends Omit<
  InklingComposerProps,
  'labels' | 'darkMode' | 'wordCountLanguage' | 'emojiLocale'
> {
  labels?: InklingLabelsInput
}

const InklingHostComposer = ({ labels, ...props }: InklingHostComposerProps) => {
  const { locale } = useI18n()
  const { resolvedTheme } = useTheme()
  return (
    <InklingComposer
      {...props}
      labels={labels}
      wordCountLanguage={locale}
      emojiLocale={toEmojiLocale(locale)}
      darkMode={resolvedTheme === 'dark'}
    />
  )
}

export default InklingHostComposer
