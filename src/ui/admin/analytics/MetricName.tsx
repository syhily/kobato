import type { ComponentType } from 'react'

import { Bot, Globe, Laptop, MonitorCheck, Mouse, Smartphone, Tablet, Terminal } from 'lucide-react'

import type { MetricType } from '@/shared/contracts/analytics'
import type { AppLocale } from '@/shared/i18n/locales'

import { formatDisplayName } from '@/shared/i18n/format'
import { metricValueLabelId } from '@/ui/admin/analytics/metric-labels'
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
} from '@/ui/icons/metric-brands'
import { useI18n } from '@/ui/lib/I18nProvider'

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

// Callers pass the ACTIVE UI locale, so SSR and hydration agree.
export function regionDisplayName(code: string, locale: AppLocale): string {
  const upper = code.toUpperCase()
  // `none` keeps the caller's original spelling when the code is unresolvable.
  const display = formatDisplayName('region', upper, { locale, fallback: 'none' })
  return display === upper ? code : display
}

export function languageDisplayName(code: string, locale: AppLocale): string {
  return formatDisplayName('language', code, { locale, fallback: 'none' })
}

export interface MetricNameProps {
  name: string
  type: MetricType
}

export function MetricName({ name, type }: MetricNameProps) {
  const { locale, t } = useI18n()
  if (!name) {
    return (
      <span className="text-muted-foreground">
        {type === 'referer' ? t('admin.analytics.direct') : t('admin.analytics.metrics.unknown')}
      </span>
    )
  }

  // Env bucket tokens (`other`, `none`, `1-5`, …) are machine values: the row
  // renders the catalog label while the filter keeps sending the token.
  const valueLabelId = metricValueLabelId(type, name)
  if (valueLabelId !== null) {
    return <span className="min-w-0 break-all">{t(valueLabelId)}</span>
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
        <span className="min-w-0 break-all">{regionDisplayName(name, locale)}</span>
      </span>
    )
  }

  if (type === 'language') {
    return <span className="min-w-0 break-all">{languageDisplayName(name, locale)}</span>
  }

  if (type === 'referer') {
    // Deterministic local letter avatar — no third-party favicon hotlink:
    // CSP img-src 'self' forbids it, and it would leak visitors' referer hosts off-site.
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

  if (type === 'colorScheme') {
    return (
      <span className="min-w-0 break-all">
        {name === 'dark'
          ? t('admin.analytics.metrics.dark')
          : name === 'light'
            ? t('admin.analytics.metrics.light')
            : name}
      </span>
    )
  }

  if (type === 'netEffectiveType') {
    return <span className="min-w-0 break-all">{name.toUpperCase()}</span>
  }

  if (type === 'os' || type === 'browser' || type === 'browserType' || type === 'device' || type === 'deviceType') {
    // Direct member access on the module-scope map; a helper call trips the react-compiler static-components rule.
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
