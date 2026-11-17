// Env contract for the real-browser journeys. The runner (`scripts/browser/run.ts`,
// `pnpm run sea:browser`) injects it after booting a throwaway SEA instance and seeding
// the admin; exporting the same variables targets an external instance.

export interface BrowserEnv {
  /** Base URL of the live instance, no trailing slash. */
  baseUrl: string
  adminEmail: string
  adminPassword: string
  /** Slug of the post staged by `support/global-setup.ts`. */
  postSlug: string
}

export const DEFAULT_POST_SLUG = 'browser-journey-post'

export function browserEnv(): BrowserEnv {
  const { KOBATO_BROWSER_BASE_URL, KOBATO_BROWSER_ADMIN_EMAIL, KOBATO_BROWSER_ADMIN_PASSWORD } = process.env
  if (!KOBATO_BROWSER_BASE_URL || !KOBATO_BROWSER_ADMIN_EMAIL || !KOBATO_BROWSER_ADMIN_PASSWORD) {
    throw new Error(
      'KOBATO_BROWSER_* env vars are not set — run the suite via `pnpm run test:browser` / `pnpm run sea:browser`, ' +
        'or point it at a running instance with KOBATO_BROWSER_BASE_URL + KOBATO_BROWSER_ADMIN_EMAIL/PASSWORD.',
    )
  }
  return {
    baseUrl: KOBATO_BROWSER_BASE_URL.replace(/\/+$/, ''),
    adminEmail: KOBATO_BROWSER_ADMIN_EMAIL,
    adminPassword: KOBATO_BROWSER_ADMIN_PASSWORD,
    postSlug: process.env.KOBATO_BROWSER_POST_SLUG ?? DEFAULT_POST_SLUG,
  }
}
