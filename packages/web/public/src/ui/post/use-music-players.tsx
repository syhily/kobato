import type { MusicPlayerCardProps } from '@kobato/ui/components/music-player/music-player'

import { I18nProvider, type I18nMessages, useI18n } from '@kobato/ui/lib/I18nProvider'
import { isHttpUrl } from '@kobato/utils/safe-url'
import { type RefObject, useContext, useEffect, useEffectEvent } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { IntlContext } from 'react-intl'

export function safeMediaSrc(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return undefined
  }
  if (trimmed.startsWith('/')) {
    return trimmed.startsWith('//') ? undefined : trimmed
  }
  return isHttpUrl(trimmed) ? trimmed : undefined
}

export function useMusicPlayers(containerRef: RefObject<HTMLElement | null>, bodyHtml: string): void {
  const intl = useContext(IntlContext)
  const { locale } = useI18n()
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const getI18nProps = useEffectEvent(() => ({ locale, messages: intl?.messages as I18nMessages }))

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }

    const mounts = container.querySelectorAll('.aplayer[data-url]')
    if (mounts.length === 0) {
      return
    }

    let cancelled = false
    const roots: Root[] = []

    void import('@kobato/ui/components/music-player/music-player').then(({ MusicPlayerCard }) => {
      if (cancelled) {
        return
      }
      for (const mount of mounts) {
        const url = safeMediaSrc(mount.getAttribute('data-url'))
        if (url === undefined) {
          continue
        }
        const audio: MusicPlayerCardProps = {
          name: mount.getAttribute('data-name') ?? '',
          artist: mount.getAttribute('data-artist') ?? '',
          url,
          cover: safeMediaSrc(mount.getAttribute('data-cover')),
          lrc: mount.getAttribute('data-lrc') || undefined,
        }
        mount.replaceChildren()
        const root = createRoot(mount)
        root.render(
          <I18nProvider {...getI18nProps()}>
            <MusicPlayerCard {...audio} />
          </I18nProvider>,
        )
        roots.push(root)
      }
    })

    return () => {
      cancelled = true
      setTimeout(() => {
        for (const root of roots) {
          root.unmount()
        }
      })
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [containerRef, bodyHtml])
}
