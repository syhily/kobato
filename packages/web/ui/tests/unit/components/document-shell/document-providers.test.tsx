// @vitest-environment happy-dom

import { FakeBroadcastChannel } from '@kobato/test/fake-broadcast-channel'
import { DocumentProviders } from '@kobato/ui/components/document-shell/DocumentProviders'
import { useAssetsSettingsOptional } from '@kobato/ui/lib/blog-settings-context'
import { DocumentFactsProvider, useDocumentFacts } from '@kobato/ui/lib/document-facts-context'
import { subscribeLocaleChange } from '@kobato/ui/lib/locale-sync'
import { useLocaleSyncPublish } from '@kobato/ui/lib/LocaleSyncProvider'
import { useTheme } from '@kobato/ui/lib/ThemeProvider'
import { documentFactsFor } from '@kobato/ui/tests/utils/document-facts'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function StackProbe() {
  const facts = useDocumentFacts()
  const { resolvedTheme } = useTheme()
  const assets = useAssetsSettingsOptional()
  return (
    <output>
      {facts.locale}|{resolvedTheme}|{assets?.asset.host ?? 'no-assets'}|{facts.revision ?? 'no-revision'}
    </output>
  )
}

function renderProviders(facts = documentFactsFor()) {
  return renderToStaticMarkup(
    wrapWithI18n(
      <DocumentFactsProvider value={facts}>
        <DocumentProviders>
          <StackProbe />
        </DocumentProviders>
      </DocumentFactsProvider>,
    ),
  )
}

function PublishProbe() {
  const publish = useLocaleSyncPublish()
  return (
    <button type="button" onClick={() => publish('en-US')}>
      publish
    </button>
  )
}

beforeEach(() => {
  FakeBroadcastChannel.instances.length = 0
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})

afterEach(() => {
  vi.unstubAllGlobals()
  FakeBroadcastChannel.instances.length = 0
})

describe('components/document-shell/DocumentProviders', () => {
  it('mounts the theme provider with the document theme as its initial resolved theme', () => {
    expect(renderProviders(documentFactsFor({ theme: 'dark' }))).toContain('|dark|')
    expect(renderProviders(documentFactsFor({ theme: null }))).toContain('|light|')
  })

  it('seeds the settings contexts from the document settings and leaves them absent without a bundle', () => {
    expect(renderProviders()).toContain('|assets.example.com|')
    expect(renderProviders(documentFactsFor({ settings: undefined }))).toContain('|no-assets|')
  })

  it('reads the document facts from the shell context, never from props', () => {
    const html = renderProviders(documentFactsFor({ locale: 'zh-TW', revision: 'boot-9' }))

    expect(html).toContain('<output>zh-TW|light|')
    expect(html).toContain('|boot-9</output>')
  })

  it('mounts locale sync under the catalog provider the shell owns: without an I18nProvider above, the wiring error surfaces', () => {
    expect(() =>
      renderToStaticMarkup(
        <DocumentFactsProvider value={documentFactsFor()}>
          <DocumentProviders>
            <StackProbe />
          </DocumentProviders>
        </DocumentFactsProvider>,
      ),
    ).toThrowError(/I18nProvider/)
  })

  it('mounts locale sync on the document locale and revision (a publish carries the revision)', () => {
    const received: unknown[] = []
    const unsubscribe = subscribeLocaleChange('listener', (announcement) => received.push(announcement))
    const { getByRole } = render(
      wrapWithI18n(
        <DocumentFactsProvider value={documentFactsFor({ revision: 'boot-9' })}>
          <DocumentProviders>
            <PublishProbe />
          </DocumentProviders>
        </DocumentFactsProvider>,
      ),
    )

    fireEvent.click(getByRole('button', { name: 'publish' }))
    unsubscribe()

    expect(received).toEqual([{ locale: 'en-US', revision: 'boot-9' }])
  })

  it('keeps the provider stack in the shared order: theme → settings → lazy motion → locale sync', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/web/ui/src/components/document-shell/DocumentProviders.tsx'),
      'utf8',
    )
    const order = ['<ThemeProvider', '<BlogSettingsProvider', '<LazyMotionConfig', '<LocaleSyncProvider'].map((tag) =>
      source.indexOf(tag),
    )
    expect(order.every((index) => index > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(source).toContain('reducedMotion="user" transition={defaultTransition}')
    expect(source).not.toContain('useRouteLoaderData')
  })
})
