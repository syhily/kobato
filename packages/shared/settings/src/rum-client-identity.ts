import { z } from 'zod'

/**
 * How much request identity the intake relay forwards to OpenObserve.
 * `anonymous` (the default) forwards nothing — O2 enriches from the relay's own
 * peer address, which the privacy pipeline then drops. `forward` attaches the
 * trusted-proxy-resolved client address and the original User-Agent, and is
 * gated by the visitor's explicit privacy consent.
 */
export const rumClientIdentitySchema = z.enum(['anonymous', 'forward'])

export type RumClientIdentity = z.infer<typeof rumClientIdentitySchema>
