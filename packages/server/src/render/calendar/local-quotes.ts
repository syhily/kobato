// Built-in daily-quote bank (final fallback for the calendar image), complete
// from the source with no editorial filtering. The vendored BullshitGenerator
// `data.json` snapshot lives in the adjacent JSON data file; this module only
// types the runtime import.
import type { DailyQuote } from '@kobato/server/render/calendar/daily-quote.ts'

import localQuotes from '@kobato/server/render/calendar/local-quotes.json'

export const LOCAL_QUOTES: readonly DailyQuote[] = localQuotes
