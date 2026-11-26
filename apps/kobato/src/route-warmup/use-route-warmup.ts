import type { WarmupManifest } from '@kobato/distribution/warmup-manifest'

import { isWarmupManifest } from '@kobato/distribution/warmup-manifest'
import { useEffect } from 'react'

import { startRouteWarmup } from '@/route-warmup/idle-script'

const WARMUP_MANIFEST_URL = '/admin/assets/warmup-manifest.json'

export interface RouteWarmupOptions {
  admin: boolean
  pathname: string
}

interface RouteWarmupState {
  manifest: Promise<WarmupManifest | null> | null
  injected: Set<string>
  tier1Done: boolean
}

const state: RouteWarmupState = {
  manifest: null,
  injected: new Set<string>(),
  tier1Done: false,
}

export function __resetRouteWarmupForTests(): void {
  state.manifest = null
  state.injected = new Set<string>()
  state.tier1Done = false
}

function fetchManifest(): Promise<WarmupManifest | null> {
  return fetch(WARMUP_MANIFEST_URL)
    .then(async (response) => {
      if (!response.ok) {
        return null
      }
      const raw: unknown = await response.json()
      return isWarmupManifest(raw) ? raw : null
    })
    .catch(() => null)
}

function loadManifest(): Promise<WarmupManifest | null> {
  if (state.manifest === null) {
    state.manifest = fetchManifest()
  }
  return state.manifest
}

function existingPreloadUrls(): Set<string> {
  const urls = new Set<string>()
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')
  for (const link of links) {
    const href = link.getAttribute('href')
    if (href) {
      urls.add(new URL(href, document.baseURI).href)
    }
  }
  return urls
}

function injectLink(chunk: string): void {
  const link = document.createElement('link')
  link.rel = 'modulepreload'
  link.href = chunk
  document.head.appendChild(link)
}

export function useRouteWarmup({ admin, pathname }: RouteWarmupOptions): void {
  useEffect(() => {
    if (import.meta.env.DEV) {
      return undefined
    }
    let cancelled = false
    void loadManifest().then((manifest) => {
      if (cancelled || manifest === null) {
        return
      }
      const existing = existingPreloadUrls()
      const freshUrl = (chunk: string): string | null => {
        const url = new URL(chunk, document.baseURI).href
        return existing.has(url) || state.injected.has(url) ? null : url
      }
      if (!state.tier1Done) {
        state.tier1Done = true
        for (const chunk of manifest.tier1) {
          const url = freshUrl(chunk)
          if (url !== null) {
            state.injected.add(url)
            injectLink(chunk)
          }
        }
      }
      const roleChunks: string[] = []
      const seen = new Set<string>()
      const buckets = admin ? [manifest.tier2_admin, manifest.tier2_editor, manifest.tier2_auth] : [manifest.tier2_auth]
      for (const bucket of buckets) {
        for (const chunk of bucket) {
          const url = freshUrl(chunk)
          if (url !== null && !seen.has(url)) {
            seen.add(url)
            state.injected.add(url)
            roleChunks.push(chunk)
          }
        }
      }
      if (roleChunks.length > 0) {
        startRouteWarmup(roleChunks)
      }
    })
    return () => {
      cancelled = true
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [admin, pathname])
}
