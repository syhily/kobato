import { redirect } from 'react-router'

// Single owner of the shared HTTP redirect-throw helpers used by the core
// SSR loaders and the public frontend's canonical-slug replays.

export function redirectPermanent(location: string): never {
  throw redirect(location, { status: 301 })
}
