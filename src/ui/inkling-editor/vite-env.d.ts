// yufan.me: trimmed on vendoring — `vite/client`, `*.svg?react` (via
// vite-plugin-svgr/client) and `__APP_VERSION__` are declared globally by
// src/env.d.ts; `*.svg` lives in nodes/base/svg.d.ts. Only the analytics
// window augmentations used by utils/analytics.ts remain.

interface PlausibleWindow {
  plausible?: ((...args: unknown[]) => void) & { q?: unknown[] }
}

interface PosthogWindow {
  capture: (event: string, props?: Record<string, unknown>) => void
}

interface Window {
  plausible?: PlausibleWindow['plausible']
  posthog?: PosthogWindow
}
