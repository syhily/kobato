import type { EmojiData } from 'emoji-picker-react/data'

type EmojiDatasetModule = { default: EmojiData }

const EMOJI_DATASET_LOADERS = {
  en: () => import('emoji-picker-react/data/emojis-en'),
  zh: () => import('emoji-picker-react/data/emojis-zh'),
  'zh-hant': () => import('emoji-picker-react/data/emojis-zh-hant'),
} as const satisfies Record<string, () => Promise<EmojiDatasetModule>>

export type EmojiLocale = keyof typeof EMOJI_DATASET_LOADERS

const emojiDatasets = new Map<EmojiLocale, Promise<EmojiData>>()

export function loadEmojiDataset(locale: EmojiLocale): Promise<EmojiData> {
  let dataset = emojiDatasets.get(locale)
  if (!dataset) {
    dataset = EMOJI_DATASET_LOADERS[locale]().then((module) => module.default)
    emojiDatasets.set(locale, dataset)
  }
  return dataset
}
