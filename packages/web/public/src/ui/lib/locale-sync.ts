import type { AppLocale } from '@kobato/i18n/locales'

import { SUPPORTED_LOCALES } from '@kobato/i18n/locales'

export const SETTINGS_LOCALE_CHANNEL = 'kobato.settings.locale'

const MESSAGE_KIND = 'settings.locale-changed'

export interface LocaleChangeAnnouncement {
  locale: AppLocale
  revision?: string
}

interface LocaleChangeMessage {
  kind: typeof MESSAGE_KIND
  locale: AppLocale
  source: string
  revision?: string
}

function randomOrigin(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function createLocaleSyncOrigin(): string {
  return randomOrigin()
}

export function publishLocaleChange(locale: AppLocale, origin: string, revision?: string): void {
  if (typeof BroadcastChannel === 'undefined') {
    return
  }
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(SETTINGS_LOCALE_CHANNEL)
    const message: LocaleChangeMessage = {
      kind: MESSAGE_KIND,
      locale,
      source: origin,
      ...(revision === undefined ? {} : { revision }),
    }
    channel.postMessage(message)
  } catch {
  } finally {
    channel?.close()
  }
}

function parseAnnouncement(data: unknown, origin: string): LocaleChangeAnnouncement | null {
  if (typeof data !== 'object' || data === null) {
    return null
  }
  const message = data as Partial<LocaleChangeMessage>
  if (message.kind !== MESSAGE_KIND) {
    return null
  }
  if (typeof message.source !== 'string' || message.source === origin) {
    return null
  }
  const locale = message.locale
  if (typeof locale !== 'string' || !(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return null
  }
  return {
    locale: locale as AppLocale,
    ...(typeof message.revision === 'string' ? { revision: message.revision } : {}),
  }
}

export function subscribeLocaleChange(
  origin: string,
  onLocaleChange: (announcement: LocaleChangeAnnouncement) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => undefined
  }
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(SETTINGS_LOCALE_CHANNEL)
  } catch {
    return () => undefined
  }
  const open = channel
  const listener = (event: MessageEvent<unknown>) => {
    const announcement = parseAnnouncement(event.data, origin)
    if (announcement !== null) {
      onLocaleChange(announcement)
    }
  }
  open.addEventListener('message', listener)
  return () => {
    open.removeEventListener('message', listener)
    open.close()
  }
}
