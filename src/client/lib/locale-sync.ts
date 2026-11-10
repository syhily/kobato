import type { AppLocale } from '@/shared/i18n/locales'

import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

/**
 * Cross-tab settings-locale announcements. The channel carries an
 * ANNOUNCEMENT, never state: peers reload from the server after flushing
 * their own dirty cards and never re-publish, so a message cannot bounce back
 * and forth. `origin` is per mounted provider, not per tab — BroadcastChannel
 * delivers to every same-named channel object in the same document too, so a
 * provider must ignore its own echo.
 */

export const SETTINGS_LOCALE_CHANNEL = 'kobato.settings.locale'

const MESSAGE_KIND = 'settings.locale-changed'

/** What a peer tab receives: the committed locale plus the sender's representation token. */
export interface LocaleChangeAnnouncement {
  locale: AppLocale
  /**
   * The sender's bootstrap settings `revision` (`<bootId>:<counter>`). An
   * OPAQUE dedupe token, never an ordering key: a repeated announcement from a
   * third tab carries the same token and is ignored after the first handling.
   * Absent when the publisher has no bootstrap payload.
   */
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

/** Fresh id for one mounted sync provider. */
export function createLocaleSyncOrigin(): string {
  return randomOrigin()
}

/** Announce a successfully committed locale. No-op when the API is unavailable. */
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
    // Unsupported or blocked (older Safari, sandboxed iframe): cross-tab sync
    // degrades to "the peer picks the new locale up on its next navigation".
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
  // Own echo — this provider is the one that published.
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

/**
 * Listen for peer announcements. Returns an unsubscribe function; a missing or
 * blocked `BroadcastChannel` yields a no-op unsubscribe (never a throw).
 */
export function subscribeLocaleChange(
  origin: string,
  onLocaleChange: (announcement: LocaleChangeAnnouncement) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => {
      /* nothing to tear down */
    }
  }
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(SETTINGS_LOCALE_CHANNEL)
  } catch {
    return () => {
      /* nothing to tear down */
    }
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
