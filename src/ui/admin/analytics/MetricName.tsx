import type { ComponentType } from 'react'

import {
  SiAcer,
  SiAndroid,
  SiApple,
  SiAppletv,
  SiArc,
  SiArchlinux,
  SiAsus,
  SiBaidu,
  SiBlackberry,
  SiBrave,
  SiCentos,
  SiDebian,
  SiDell,
  SiDiscord,
  SiDuckduckgo,
  SiEricsson,
  SiFacebook,
  SiFedora,
  SiFirefoxbrowser,
  SiFitbit,
  SiFreebsd,
  SiFujitsu,
  SiGarmin,
  SiGnu,
  SiGoogle,
  SiGooglecast,
  SiGooglechrome,
  SiGoogletv,
  SiHonor,
  SiHp,
  SiHtc,
  SiHuawei,
  SiIos,
  SiLenovo,
  SiLg,
  SiLinux,
  SiLinuxmint,
  SiMacos,
  SiMeizu,
  SiMeta,
  SiMotorola,
  SiNec,
  SiNokia,
  SiNotion,
  SiNvidia,
  SiOculus,
  SiOneplus,
  SiOppo,
  SiOpera,
  SiOperagx,
  SiPanasonic,
  SiPinterest,
  SiPlaystation,
  SiQq,
  SiRazer,
  SiRedhat,
  SiRoku,
  SiSafari,
  SiSamsung,
  SiSharp,
  SiSony,
  SiSteam,
  SiTelegram,
  SiTesla,
  SiTiktok,
  SiTorbrowser,
  SiToshiba,
  SiUbuntu,
  SiValve,
  SiVivaldi,
  SiVivo,
  SiWearos,
  SiWechat,
  SiX,
  SiXiaomi,
  SiYandexcloud,
} from '@icons-pack/react-simple-icons'
import { Bot, Globe, Laptop, MonitorCheck, Mouse, Smartphone, Tablet, Terminal } from 'lucide-react'

import type { MetricType } from '@/shared/contracts/analytics'

// Brand-icon map ported from Slite's `metrics/name/Icon.vue`
// (vue3-simple-icons → @icons-pack/react-simple-icons `Si*` names, lucide
// fallbacks unchanged). Lookup order: exact lowercase name, then the
// dimension's generic fallback icon.

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>

const ICON_MAP: Record<string, IconComponent> = {
  acer: SiAcer,
  android: SiAndroid,
  'android browser': SiAndroid,
  'apple tv': SiAppletv,
  applebot: SiApple,
  arc: SiArc,
  arch: SiArchlinux,
  'arch linux': SiArchlinux,
  asus: SiAsus,
  baidu: SiBaidu,
  'baidu browser': SiBaidu,
  baiduspider: SiBaidu,
  blackberry: SiBlackberry,
  brave: SiBrave,
  browser: Globe,
  centos: SiCentos,
  chrome: SiGooglechrome,
  'chrome headless': SiGooglechrome,
  'chrome webview': SiGooglechrome,
  chromecast: SiGooglecast,
  chromium: SiGooglechrome,
  claudebot: Bot,
  console: SiSteam,
  curl: Terminal,
  debian: SiDebian,
  dell: SiDell,
  desktop: MonitorCheck,
  discord: SiDiscord,
  discordbot: SiDiscord,
  duckduckbot: SiDuckduckgo,
  duckduckgo: SiDuckduckgo,
  ericsson: SiEricsson,
  facebook: SiFacebook,
  facebookexternalhit: SiFacebook,
  fedora: SiFedora,
  firefox: SiFirefoxbrowser,
  'firefox focus': SiFirefoxbrowser,
  'firefox reality': SiFirefoxbrowser,
  fitbit: SiFitbit,
  freebsd: SiFreebsd,
  fujitsu: SiFujitsu,
  garmin: SiGarmin,
  gnu: SiGnu,
  google: SiGoogle,
  'google tv': SiGoogletv,
  googlebot: SiGoogle,
  'googlebot-image': SiGoogle,
  gptbot: Bot,
  harmonyos: SiHuawei,
  honor: SiHonor,
  hp: SiHp,
  htc: SiHtc,
  huawei: SiHuawei,
  'huawei browser': SiHuawei,
  ios: SiIos,
  ipad: SiApple,
  iphone: SiApple,
  ipod: SiApple,
  laptop: Laptop,
  lenovo: SiLenovo,
  lg: SiLg,
  linux: SiLinux,
  'linux mint': SiLinuxmint,
  logitech: Mouse,
  macintosh: SiApple,
  macos: SiMacos,
  meizu: SiMeizu,
  meta: SiMeta,
  mint: SiLinuxmint,
  'miui browser': SiXiaomi,
  mobile: Smartphone,
  'mobile chrome': SiGooglechrome,
  'mobile firefox': SiFirefoxbrowser,
  'mobile safari': SiSafari,
  motorola: SiMotorola,
  nec: SiNec,
  nokia: SiNokia,
  notion: SiNotion,
  nvidia: SiNvidia,
  oculus: SiOculus,
  'oculus browser': SiOculus,
  oneplus: SiOneplus,
  opera: SiOpera,
  'opera coast': SiOpera,
  'opera gx': SiOperagx,
  'opera mini': SiOpera,
  'opera mobi': SiOpera,
  'opera touch': SiOpera,
  oppo: SiOppo,
  os: MonitorCheck,
  panasonic: SiPanasonic,
  pico: SiOculus,
  'pico browser': SiOculus,
  pinterestbot: SiPinterest,
  playstation: SiPlaystation,
  qqbrowser: SiQq,
  razer: SiRazer,
  realme: SiOppo,
  'red hat': SiRedhat,
  redhat: SiRedhat,
  roku: SiRoku,
  safari: SiSafari,
  samsung: SiSamsung,
  'samsung internet': SiSamsung,
  sharp: SiSharp,
  slackbot: Bot,
  smarttv: SiGoogletv,
  sony: SiSony,
  tablet: Tablet,
  telegrambot: SiTelegram,
  tesla: SiTesla,
  tiktok: SiTiktok,
  'tiktok lite': SiTiktok,
  'tor browser': SiTorbrowser,
  toshiba: SiToshiba,
  twitterbot: SiX,
  ubuntu: SiUbuntu,
  valve: SiValve,
  vivaldi: SiVivaldi,
  vivo: SiVivo,
  'vivo browser': SiVivo,
  wearable: SiWearos,
  wechat: SiWechat,
  xiaomi: SiXiaomi,
  xr: SiMeta,
  yandex: SiYandexcloud,
  yandexbot: SiYandexcloud,
}

/** Regional-indicator flag emoji for an ISO 3166-1 alpha-2 code; '' otherwise. */
export function flagEmojiFor(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) {
    return ''
  }
  const upper = code.toUpperCase()
  return String.fromCodePoint(0x1f1e6 + upper.charCodeAt(0) - 65, 0x1f1e6 + upper.charCodeAt(1) - 65)
}

// The admin UI is zh-CN only — pin the DisplayNames locale so SSR and
// hydration produce byte-identical names (the server locale differs).
const DISPLAY_LOCALE = 'zh-CN'

export function regionDisplayName(code: string): string {
  if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') {
    return code
  }
  try {
    return new Intl.DisplayNames([DISPLAY_LOCALE], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

export function languageDisplayName(code: string): string {
  if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') {
    return code
  }
  try {
    return new Intl.DisplayNames([DISPLAY_LOCALE], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

export interface MetricNameProps {
  name: string
  type: MetricType
}

export function MetricName({ name, type }: MetricNameProps) {
  if (!name) {
    return <span className="text-muted-foreground">{type === 'referer' ? '直接访问' : '未知'}</span>
  }

  if (type === 'country') {
    const flag = flagEmojiFor(name)
    return (
      <span className="flex min-w-0 items-start gap-1.5">
        {flag && (
          <span aria-hidden className="shrink-0 leading-5">
            {flag}
          </span>
        )}
        <span className="min-w-0 break-all">{regionDisplayName(name)}</span>
      </span>
    )
  }

  if (type === 'language') {
    return <span className="min-w-0 break-all">{languageDisplayName(name)}</span>
  }

  if (type === 'referer') {
    // Referer rows get a deterministic local letter avatar — no third-party
    // favicon hotlink (the CSP's img-src 'self' forbids it, and the request
    // would leak visitors' referer hosts off-site).
    return (
      <span className="flex min-w-0 items-start gap-1.5">
        <span
          aria-hidden
          className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] leading-none font-medium text-muted-foreground uppercase"
        >
          {name.charAt(0)}
        </span>
        <span className="min-w-0 break-all">{name}</span>
      </span>
    )
  }

  if (type === 'path') {
    return <span className="min-w-0 font-mono text-xs break-all">{name}</span>
  }

  if (type === 'os' || type === 'browser' || type === 'browserType' || type === 'device' || type === 'deviceType') {
    // Direct member access on the module-scope map — a helper call here
    // trips the react-compiler static-components rule.
    const Icon = ICON_MAP[name.toLowerCase()] ?? ICON_MAP[type]
    return (
      <span className="flex min-w-0 items-start gap-1.5">
        {Icon && <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />}
        <span className="min-w-0 break-all">{name}</span>
      </span>
    )
  }

  // region / city / timezone: stored as free-form names, rendered verbatim.
  return <span className="min-w-0 break-all">{name}</span>
}
