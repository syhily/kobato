// Calendar copy per AppLocale (plan 001, 5c).
//
// Month / weekday / lunar labels and the 宜 term table are HAND-REVIEWED
// static data — never a runtime simplified→traditional conversion. `en-US`
// renders neither the lunar line nor the 宜 line; zh-TW / zh-HK share the
// traditional table and leave an unknown 宜 term out (a missing entry is
// visible in the completeness test, never silently transliterated).
//
// The date/URL machine format (`/images/calendar/:year/:MMdd.png`) is
// locale-independent and lives outside this module.

import type { AppLocale } from '@/shared/i18n/locales'

export interface LunarCopy {
  /** Month label by 1-based lunar month (leap months reuse the base name). */
  months: readonly string[]
  /** Day label by 1-based lunar day (1–30). */
  days: readonly string[]
  leapPrefix: string
  yearSuffix: string
  monthSuffix: string
}

export interface AuspiciousCopy {
  prefix: string
  /**
   * Simplified term → traditional term. `null` for zh-CN (the library's own
   * text IS the target). A lookup miss yields `null` (omit the line).
   */
  terms: Readonly<Record<string, string>> | null
}

export interface CalendarCopy {
  months: readonly string[]
  weekdays: readonly string[]
  lunar: LunarCopy | null
  auspicious: AuspiciousCopy | null
}

const ZH_MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

const ZH_WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']

const ZH_LUNAR_DAYS = [
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十',
]

/** Hand-reviewed traditional forms of every 宜 term `lunar-typescript` emits. */
const TRADITIONAL_YI_TERMS: Readonly<Record<string, string>> = {
  上梁: '上梁',
  习艺: '習藝',
  交易: '交易',
  伐木: '伐木',
  会亲友: '會親友',
  问名: '問名',
  分居: '分居',
  归岫: '歸岫',
  作梁: '作梁',
  作灶: '作灶',
  修坟: '修墳',
  修造: '修造',
  修门: '修門',
  修饰垣墙: '修飾垣牆',
  入学: '入學',
  入宅: '入宅',
  入殓: '入殮',
  冠笄: '冠笄',
  出火: '出火',
  出行: '出行',
  出货财: '出貨財',
  割蜜: '割蜜',
  动土: '動土',
  取渔: '取漁',
  合寿木: '合壽木',
  合帐: '合帳',
  合脊: '合脊',
  启钻: '啟鑽',
  坏垣: '壞垣',
  塑绘: '塑繪',
  塞穴: '塞穴',
  嫁娶: '嫁娶',
  安床: '安床',
  安机械: '安機械',
  安碓磑: '安碓磑',
  安葬: '安葬',
  安门: '安門',
  安香: '安香',
  定磉: '定磉',
  平治道涂: '平治道塗',
  开仓: '開倉',
  开光: '開光',
  开厕: '開廁',
  开市: '開市',
  开柱眼: '開柱眼',
  开池: '開池',
  开渠: '開渠',
  开生坟: '開生墳',
  归宁: '歸寧',
  成服: '成服',
  扫舍: '掃舍',
  拆卸: '拆卸',
  挂匾: '掛匾',
  捕捉: '捕捉',
  掘井: '掘井',
  放水: '放水',
  教牛马: '教牛馬',
  整手足甲: '整手足甲',
  斋醮: '齋醮',
  断蚁: '斷蟻',
  无: '無',
  普渡: '普渡',
  架马: '架馬',
  栽种: '栽種',
  求医: '求醫',
  求嗣: '求嗣',
  沐浴: '沐浴',
  治病: '治病',
  牧养: '牧養',
  理发: '理髮',
  畋猎: '畋獵',
  盖屋: '蓋屋',
  破土: '破土',
  破屋: '破屋',
  祈福: '祈福',
  祭祀: '祭祀',
  移徙: '移徙',
  移柩: '移柩',
  立券: '立券',
  立碑: '立碑',
  竖柱: '豎柱',
  筑堤: '築堤',
  纳婿: '納婿',
  纳畜: '納畜',
  纳财: '納財',
  纳采: '納采',
  经络: '經絡',
  结网: '結網',
  置产: '置產',
  补垣: '補垣',
  裁衣: '裁衣',
  解除: '解除',
  订盟: '訂盟',
  诸事不宜: '諸事不宜',
  谢土: '謝土',
  赴任: '赴任',
  起基: '起基',
  进人口: '進人口',
  造仓: '造倉',
  造庙: '造廟',
  造桥: '造橋',
  造畜稠: '造畜稠',
  造船: '造船',
  造车器: '造車器',
  酬神: '酬神',
  针灸: '針灸',
  除服: '除服',
  雇佣: '僱傭',
  雕刻: '雕刻',
  馀事勿取: '餘事勿取',
}

const ZH_CN: CalendarCopy = {
  months: ZH_MONTHS,
  weekdays: ZH_WEEKDAYS,
  lunar: {
    months: ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'],
    days: ZH_LUNAR_DAYS,
    leapPrefix: '闰',
    yearSuffix: '年',
    monthSuffix: '月',
  },
  auspicious: { prefix: '宜', terms: null },
}

const ZH_TRADITIONAL: CalendarCopy = {
  months: ZH_MONTHS,
  weekdays: ZH_WEEKDAYS,
  lunar: {
    months: ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '臘'],
    days: ZH_LUNAR_DAYS,
    leapPrefix: '閏',
    yearSuffix: '年',
    monthSuffix: '月',
  },
  auspicious: { prefix: '宜', terms: TRADITIONAL_YI_TERMS },
}

const EN: CalendarCopy = {
  months: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  lunar: null,
  auspicious: null,
}

const COPY_BY_LOCALE = {
  'en-US': EN,
  'zh-CN': ZH_CN,
  'zh-TW': ZH_TRADITIONAL,
  'zh-HK': ZH_TRADITIONAL,
} as const satisfies Record<AppLocale, CalendarCopy>

export function calendarCopyFor(locale: AppLocale): CalendarCopy {
  return COPY_BY_LOCALE[locale]
}

export interface LunarParts {
  /** Gan-zhi year, e.g. `甲辰` (identical glyphs in traditional). */
  yearGanZhi: string
  /** Signed lunar month: negative = leap month. */
  month: number
  /** 1-based lunar day. */
  day: number
}

/** `甲辰年 正月初一` — the existing zh layout; `null` when the locale has no lunar line. */
export function lunarLabel(copy: CalendarCopy, parts: LunarParts): string | null {
  if (copy.lunar === null) {
    return null
  }
  const leap = parts.month < 0 ? copy.lunar.leapPrefix : ''
  const monthName = copy.lunar.months[Math.abs(parts.month) - 1]
  const dayName = copy.lunar.days[parts.day - 1]
  if (monthName === undefined || dayName === undefined) {
    return null
  }
  return `${parts.yearGanZhi}${copy.lunar.yearSuffix} ${leap}${monthName}${copy.lunar.monthSuffix}${dayName}`
}

/** `宜祭祀` in the locale's own terms; `null` when the locale has no 宜 line or the term is unmapped. */
export function auspiciousLabel(copy: CalendarCopy, term: string): string | null {
  if (copy.auspicious === null || term === '') {
    return null
  }
  const translated = copy.auspicious.terms === null ? term : copy.auspicious.terms[term]
  return translated === undefined ? null : `${copy.auspicious.prefix}${translated}`
}

/** Test/contract surface: every term the library can emit must be mapped. */
export const TRADITIONAL_YI_TERM_MAP = TRADITIONAL_YI_TERMS
