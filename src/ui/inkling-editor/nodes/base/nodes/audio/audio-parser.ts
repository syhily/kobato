import type { LexicalNode } from 'lexical'

export function parseAudioNode(AudioNode: new (data: Record<string, unknown>) => LexicalNode) {
  return {
    div: (nodeElem: HTMLElement) => {
      const isKgAudioCard = nodeElem.classList?.contains('inkling-audio-card')
      if (nodeElem.tagName === 'DIV' && isKgAudioCard) {
        return {
          conversion(domNode: HTMLElement) {
            const titleNode = domNode?.querySelector('.inkling-audio-title')
            const audioNode = domNode?.querySelector('.inkling-audio-player-container audio') as HTMLAudioElement | null
            const durationNode = domNode?.querySelector('.inkling-audio-duration')
            const thumbnailNode = domNode?.querySelector('.inkling-audio-thumbnail') as HTMLImageElement | null
            const title = titleNode && titleNode.innerHTML.trim()
            const audioSrc = audioNode && audioNode.src
            const thumbnailSrc = thumbnailNode && thumbnailNode.src
            const durationText = durationNode && durationNode.innerHTML.trim()
            const payload: Record<string, unknown> = {
              src: audioSrc,
              title: title,
            }
            if (thumbnailSrc) {
              payload.thumbnailSrc = thumbnailSrc
            }

            if (durationText) {
              const [rawMinutes, rawSeconds = '0'] = durationText.split(':')
              const minutes = Number(rawMinutes.trim())
              const seconds = Number(rawSeconds.trim())

              if (Number.isInteger(minutes) && Number.isInteger(seconds)) {
                payload.duration = minutes * 60 + seconds
              }
            }

            const node = new AudioNode(payload)
            return { node }
          },
          priority: 1 as const,
        }
      }
      return null
    },
  }
}
