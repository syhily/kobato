#!/usr/bin/env node
//
// One-time codegen for the calendar's built-in daily-quote bank.
//
// Fetches the `famous` quote list from BullshitGenerator's data.json
// (pinned commit — the input is stable, so re-running is reproducible),
// cleans it, and writes `src/server/render/calendar/local-quotes.ts`.
//
//   pnpx vite-node scripts/generate-local-quotes.ts
//
// Cleaning rules (keep in sync with the header comment of the generated
// file):
//   - Entries use the generator template `作者a，内容。b` (full-width `a，`
//     or half-width `a, `; the trailing `b` is optional). Entries that do
//     not split cleanly — leftover `a`/`b` placeholders — are dropped.
//   - Garbled/truncated entries are dropped (content containing `＝`, `=`,
//     runs of Latin letters, or braces — these are formulas or template
//     residue, not quotes).
//   - Politically sensitive entries are dropped: an author blocklist
//     (Hitler, Stalin, Lenin, Marx, Engels, Mao, Deng, Zhou Enlai, …)
//     plus content keywords (革命, 社会主义, 共产, 党, 领袖, 主席).
//   - Profanity is dropped.
//   - Deduped by content; content length 6–30 chars (the calendar renders
//     ~14 chars × 2–3 lines at 36px), author ≤ 10 chars.
//   - Capped at 400 entries in FNV-1a content-hash order — hash order
//     spreads authors/topics like a shuffle, but the picks stay stable as
//     the blocklists grow, so a reviewed file survives regeneration.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_FILE = join(__dirname, '..', 'src', 'server', 'render', 'calendar', 'local-quotes.ts')

const SOURCE_URL =
  'https://raw.githubusercontent.com/liutongyang/BullshitGenerator/690988559f39f2e452b1bfd5904282d90c7ace32/data.json'

const MAX_QUOTES = 400

const BLOCKED_AUTHORS = [
  '希特勒',
  '斯大林',
  '列宁',
  '马克思',
  '恩格斯',
  '毛泽东',
  '邓小平',
  '周恩来',
  '刘少奇',
  '朱德',
  '林彪',
  '江青',
  '孙中山',
  '蒋介石',
  '拿破仑',
  '雷锋',
  '陈云',
  '李大钊',
  '加里宁',
  '季米特洛夫',
  '罗伯斯比尔',
  '徐特立',
  '谢觉哉',
  '吴玉章',
  '焦裕禄',
  '马特洛索夫',
  '艾森豪威尔',
]
// Exact-match author names that are not people: bare countries/regions
// (proverb attributions too vague to display) and misattributions spotted
// during manual review (柳絮/远嘱/松林/黑德和柯克雯 are not authors;
// 菜根潭 is a typo of the book 《菜根谭》).
const BLOCKED_AUTHORS_EXACT = new Set([
  '波兰',
  '伊朗',
  '希腊',
  '威尼斯',
  '南斯拉夫',
  '罗马',
  '阿富汉',
  '阿富汗',
  '阿拉伯',
  '缅甸',
  '莫桑比克',
  '法国',
  '德国',
  '英国',
  '美国',
  '俄国',
  '苏联',
  '印度',
  '日本',
  '西班牙',
  '丹麦',
  '埃及',
  '菜根潭',
  '柳絮',
  '远嘱',
  '松林',
  '黑德和柯克雯',
  '挪威',
  '土其耳',
  '土耳其',
  '菲律宾',
  '也门',
  '马尔加什',
  '拿破仓',
  '富勒曾经',
  '神涵光',
  '尤里披蒂',
  '古兰经',
  '杨雄',
])
const BLOCKED_CONTENT = ['革命', '社会主义', '共产', '国民党', '共产党', '领袖', '主席', '党']
const PROFANITY = ['放屁', '他妈', '牛逼', '妈的', '混蛋', '淫荡']
// Manual-review drop list: exact contents that are truncated mid-sentence,
// garbled translations, OCR typos (庞爱/罪薛/管刀/能的…), or messages we
// don't want on the calendar (有权即有理, 强权政治…). Kept as exact
// strings so a legitimate quote containing the same words survives.
const BLOCKED_CONTENT_EXACT = new Set([
  '各市有各市的风俗，各乡有各乡的。',
  '最考验的人是一个最幸运的时刻。',
  '赢得名声的艺术家常为此受苦，因此，通常他们的最佳。',
  '轻易地完成别人难以完成的工作是。',
  '习俗提供了伦理学所依存的唯一基。',
  '我们每一做一件事都应该既小心谨。',
  '经济造就大半人生，对经济的爱是。',
  '做一个星期正派人要比做十五分钟。',
  '允许孩子们以他们自己的方式获得。',
  '信仰决不是知识，而是使知识有效。',
  '一切悲剧皆因死亡而结束，一切喜。',
  '只有天赋很好的人能够认识并热心。',
  '因为原因是独特的，已形成结果的。',
  '归国宝，水若献贤而进士。',
  '刚天下者兵也。',
  '我们对违背习俗的事情要比对违背。',
  '美貌之女人犹如才智于男子，是至。',
  '简短的谈话未必是最好的，但最好。',
  '才能是上帝赏赐的无从之宝千万别。',
  '生活过，而不会宽容别人的人，是。',
  '公正无私，一言而万民刘。',
  '真正优秀的悲剧应该在人类的灵魂。',
  '皇冠、金钱都可以送人，唯有心不。',
  '如果每个人都管刀好自己的事情，地球就会比现在转得更快。',
  '财富和声誉的庞儿们在我们眼前纷纷落马，却不能改变我们的雄心。',
  '奇迹是信仰最庞爱的孩子。',
  '人人都不时地受益于自己的罪薛，就像植物都以粪便为肥料一样。',
  '能的把自己的爱说得天花乱坠的人，实际上爱得并不深。',
  '骡子或许能相互挠痒呢。',
  '每一个丑角都得意自己的帽子。',
  '用“分”来计算时间的人，比用“时”来计算时间的人，时间多倍。',
  '如果没有一个所有的错误都犯了以后，最后的结果当然是对的。',
  '科学不能或者不愿影响到自己民族以外，是不配称作科学的。',
  '为了争取将来的美好而牺牲了的人，都是一尊石质的雕像。',
  '有权即有理。',
  '无论哪种类型的强权政治，必然唤起反抗。',
  '立异而不求同，就必然变成宗派主义。',
  '令人不能自拔的，除了牙齿还有爱情。',
  '像牙齿一样，作家也有切牙和血牙之分。',
  '资格为用人之害。',
  '雌鹅喜欢吃的，雄鹅也一定喜欢吃。',
  '怕柳花轻薄，不解伤春。',
  '人心忧惧则前途之光明，幸福顷刻间为黑幕所遮。',
  '没且件事是由一种原因引起的，而。',
  '即使千言万语，也比上上一桩事实留下的印象那么深刻。',
  '在狭隘的环境中使精神狭隘，人要。',
  '人的思想如一只钟，容易停摆，需。',
  '今日之蛋，胜于明日之鸡。',
  '真正表明渊博知识的是那种突如其。',
  '伟大的发现者并不一定是伟人。谁。',
  '人性所厌恶的，习俗却偏将它们展。',
  '科学虽不是充实人的全圆，但它是这个全圆的一扇重要的弧面。',
  '一个尝试错误的人生不但无所事事的人生更荣耀，并且有意义。',
  '真正的文明在于每个人把自己应得的权利刘给他人。',
  '有所有的诡辩中，含糊其词，模棱两可可谓是最高明的诡辩。',
  '爱家的人才人爱国。',
  '谦虚常被误认为是隐讳，沉默常被。',
  '苦和甜来自外界，坚强则来自内心，来自一个的人自我努力。',
  '发号施令爱情中是行不通的。',
  '所以才智人，不肯自弃暴。力欲争上游，性灵乃其要。',
  '大家的前途不是由大家决定的，而不是少数人！',
  '杀了“现在”，也便杀了“将来”。----将来是子孙的时代。',
  '一将无谋，累死三军。',
  '所谓从礼待人，即用你喜欢别人对待你的方式对待遇别人。',
  '人们以为他们的理性支配言语，偏偏有时反而支配理性。',
  '治外物易，治已身难。',
  '人的真面貌在肚子里。',
  '诚实比起腐败会给你赢得更多的好。',
  '吃别人嚼过的馍没有味道。',
  '不要紧，以人民有利益的事情虽没轮到我，也可以做。',
  '抓住今天，才能不丢失明天。',
  '幻想就像瓦缸一样容易碎。',
  '美能激发人的感情，爱情净化人的。',
  '占据一个所不能胜任的职位，是最不道德的行为。',
  '钓鱼须钓海土鳌，结交须结失风豪。',
  '立志是事业的大门，工作是登门入室的的旅途。',
  '苦难磨炼一些人，也毁灭另一些人。',
  '结婚前眼睛要睁圆，结婚后眼睛要。',
  '一句漂亮话之所以漂亮，就在于所。',
  '人类成就中最伟大的东西大部分都。',
  '义务所限制的并不是自由，而只是。',
  '国家实际上放大了的家庭。',
  '不要慨叹生活的痛苦！---慨叹是弱者……',
  '在我们现代世界中，再没有第二种。',
  '对于新鲜事物，人们一开始总是感。',
  '懒人寻锄头总说：天哪！但愿找不到。',
  '激情由于得到表白而不断增长和加。',
  '那此忘恩的人，落在困难之中，是不能得救的。',
  '我们真实的愿望仅仅是求异，从这。',
  '姑娘的心里最珍视的东西是他们自。',
  '在热闹的宴席上不用打听哪位是主。',
  '不作什么决定的意志不是现实的意。',
  '独创性并不是首次观察某种新事物。',
  '美，什么是美？在人生每一个有趣。',
  '食物虽好，多吃伤肚子；话虽好听。',
  '天才是创造前无古人的业绩第一个。',
  '无酒之处无爱情。',
  '宁可往房顶的角上，也不可在宽敞的房子与泼妇同住。',
  '娇嫩的女子，她的心也像她的身体一样脆弱。',
  '红颜胜人多薄命。',
  '一亩之地，三蛇九鼠。',
  '意境者，文之母也。',
  '管理的第一目标是使较高工资与较低的劳动成本结合起来。',
  '科学有点儿像你呼吸的空气——它无处不在。',
  '不论处境如何，女人的痛苦总比男。',
  '一个念头往往会使我们变得比火还。',
  '管它什么金钱，管它什么财产；陈。',
  '根深蒂固的恶习决非一朝一夕就能。',
  '谦卑的心灵确实能够赢得众人的喜。',
  '没有无义务的权利，也没有无权利。',
  '剜心也不变，砍首也不变！只愿锦绣的山河，还我锦绣的面。',
  '苦瓜连概苦，甜瓜彻蒂甜。',
  '兵在精而不在多，将在谋不在勇。',
  '一个地位越高，就越难理解“粗俗”这个词的含义。',
])

interface Quote {
  content: string
  author: string
}

function parseEntry(raw: string): Quote | null {
  // `作者a，内容。b` — author precedes the `a，` / `a, ` placeholder; the
  // trailing `b` placeholder is optional.
  const match = /^(.{2,16}?)a[，,]\s*(.+?)\s*b?$/.exec(raw.trim())
  if (match === null) {
    return null
  }
  const author = match[1].trim()
  // Stray spaces before CJK punctuation sneak in from the source data.
  const content = match[2].trim().replace(/\s+([。，！？；：、])/g, '$1')
  if (author.length < 2 || author.length > 10) {
    return null
  }
  if (content.length < 6 || content.length > 30) {
    return null
  }
  // Truncated mid-sentence entries end with a dangling comma.
  if (content.endsWith('，') || content.endsWith('、') || content.endsWith('；')) {
    return null
  }
  // Garbled entries: formulas, template residue, ASCII dash runs.
  if (/[a-zA-Z=＝{}【】]/.test(content) || /-{2,}/.test(content) || /[a-zA-Z=＝{}]/.test(author)) {
    return null
  }
  if (BLOCKED_AUTHORS.some((name) => author.includes(name)) || BLOCKED_AUTHORS_EXACT.has(author)) {
    return null
  }
  if (BLOCKED_CONTENT.some((word) => content.includes(word)) || BLOCKED_CONTENT.some((word) => author.includes(word))) {
    return null
  }
  if (PROFANITY.some((word) => content.includes(word))) {
    return null
  }
  if (BLOCKED_CONTENT_EXACT.has(content)) {
    return null
  }
  return { content, author }
}

async function main() {
  const res = await fetch(SOURCE_URL)
  if (!res.ok) {
    throw new Error(`下载 data.json 失败: ${res.status}`)
  }
  const data: unknown = await res.json()
  if (typeof data !== 'object' || data === null || !('famous' in data) || !Array.isArray(data.famous)) {
    throw new Error('data.json 中没有 famous 数组')
  }
  const famous: unknown[] = data.famous

  const seen = new Set<string>()
  const quotes: Quote[] = []
  let dropped = 0
  for (const raw of famous) {
    if (typeof raw !== 'string') {
      dropped++
      continue
    }
    const parsed = parseEntry(raw)
    if (parsed === null || seen.has(parsed.content)) {
      dropped++
      continue
    }
    seen.add(parsed.content)
    quotes.push(parsed)
  }

  // Deterministic selection: sort by the FNV-1a hash of the content and
  // take the first MAX_QUOTES. Hash order spreads authors/topics like a
  // shuffle, but — unlike a seeded shuffle over the whole pool — adding
  // one drop-list entry only replaces a few picks near the cut boundary,
  // so a reviewed file stays valid as the blocklists grow.
  const hash = (text: string): number => {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
  }
  const capped = [...quotes].sort((a, b) => hash(a.content) - hash(b.content)).slice(0, MAX_QUOTES)

  const lines = capped.map((q) => `  { content: ${JSON.stringify(q.content)}, author: ${JSON.stringify(q.author)} },`)
  const output = `// GENERATED FILE — do not edit by hand.
//
// Built-in daily-quote bank for the calendar image, the final fallback
// when the configured remote provider fails (or when \`local\` is the
// configured source).
//
// Source: BullshitGenerator data.json @ 690988559f39f2e452b1bfd5904282d90c7ace32
//   ${SOURCE_URL}
// Regenerate: pnpx vite-node scripts/generate-local-quotes.ts
// Cleaning: split the \`作者a，内容。b\` template, drop unparseable /
// garbled / politically sensitive / profane entries, dedupe, content
// 6–30 chars, author ≤ 10 chars, capped at 400 in FNV-1a content-hash
// order (stable picks as the blocklists grow). Manual review on top.

import type { DailyQuote } from '@/server/render/calendar/daily-quote'

export const LOCAL_QUOTES: readonly DailyQuote[] = [
${lines.join('\n')}
]
`
  writeFileSync(OUT_FILE, output, 'utf-8')
  console.log(
    `共 ${famous.length} 条原始条目，清洗后 ${quotes.length} 条（丢弃 ${dropped} 条），截取 ${capped.length} 条 → ${OUT_FILE}`,
  )
}

await main()
