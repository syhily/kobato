// Bot detection — replaces the `isbot` package.
//
// Two consumers, both fail-soft:
//   - `entry.server`: bots get `onAllReady` (a complete document) instead
//     of a streamed shell — a miss just streams, which modern crawlers
//     render fine;
//   - analytics enrichment: bot UAs are excluded from visitor stats.
//
// The pattern pairs the generic crawler vocabulary with the well-known
// headless browsers, HTTP libraries, preview fetchers, and monitoring
// services seen in real access logs. Case-insensitive over the raw UA.

const BOT_TOKENS = [
  // Generic crawler vocabulary (covers googlebot, bingbot, gptbot,
  // claudebot, baiduspider, ahrefsbot, semrushbot, …).
  'bot',
  'crawler',
  'spider',
  'slurp', // Yahoo
  'mediapartners', // Google AdSense
  // Social / chat preview fetchers without the generic tokens.
  'facebookexternalhit',
  'meta-externalagent',
  'whatsapp',
  'embedly',
  'pinterest',
  'quora link preview',
  // Headless browsers / automation frameworks.
  'headlesschrome',
  'phantomjs',
  'playwright',
  'puppeteer',
  'selenium',
  // SEO tools / uptime monitoring.
  'lighthouse',
  'pagespeed',
  'pingdom',
  'uptimerobot',
  'statuscake',
  'gtmetrix',
  // HTTP libraries / CLI clients.
  'curl',
  'wget',
  'python-requests',
  'python-urllib',
  'aiohttp',
  'go-http-client',
  'okhttp',
  'apache-httpclient',
  'java/',
  'node-fetch',
  'undici',
  'axios',
  'scrapy',
  'postmanruntime',
  'httpie',
  // Feed fetchers.
  'feedfetcher',
]

const BOT_PATTERN = new RegExp(BOT_TOKENS.join('|'), 'i')

/** Whether a User-Agent string looks like a bot, crawler, or HTTP client. */
export function isBot(userAgent: string | null | undefined): boolean {
  return !!userAgent && BOT_PATTERN.test(userAgent)
}
