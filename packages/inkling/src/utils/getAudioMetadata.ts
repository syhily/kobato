// gets audio duration from a given URL

import { awaitMediaEvents } from '@/utils/awaitMediaEvents'

export interface AudioMetadata {
  duration: number
}

export async function getAudioMetadata(url: string): Promise<AudioMetadata> {
  const audio = new Audio()
  await awaitMediaEvents(audio, {
    events: ['loadedmetadata'],
    errorMessage: `Failed to load audio metadata from ${url}`,
    start: () => {
      audio.src = url
    },
  })
  return { duration: audio.duration }
}
