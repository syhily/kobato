import { unsafeCast } from '@kobato/base/utils/unsafe-cast'

if (typeof window !== 'undefined') {
  unsafeCast<Record<string, unknown>>(globalThis).__zod_globalConfig = { jitless: true }
}
