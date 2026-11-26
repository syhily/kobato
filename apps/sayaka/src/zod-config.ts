import { unsafeCast } from '@kobato/utils/unsafe-cast'

if (typeof window !== 'undefined') {
  unsafeCast<Record<string, unknown>>(globalThis).__zod_globalConfig = { jitless: true }
}
