import type { RenderContext } from '@/nodes/base/render-context'

import { formatVideoDuration } from '@/nodes/base/nodes/video/format-video-duration'
import { CARD_CAPTION_MARKER_CLASS, renderCardCaptionHtml } from '@/nodes/base/utils/append-card-caption'
import { getFirstHtmlElement } from '@/nodes/base/utils/get-first-html-element'
import { isSafeRenderableSource, renderEmptyContainer } from '@/nodes/base/utils/render-empty-container'

interface VideoNodeData {
  src: string
  width: number | null
  height: number | null
  caption: string
  loop: boolean
  duration: number
  thumbnailSrc: string
  customThumbnailSrc: string
  cardWidth: string
}

function hasVideoDimensions(node: VideoNodeData): node is VideoNodeData & { width: number; height: number } {
  return node.width !== null && node.height !== null && node.width > 0 && node.height > 0
}

function getPosterSpacerSrc(width: number, height: number) {
  return `https://img.spacergif.org/v1/${width}x${height}/0a/spacer.png`
}

export function renderVideoNode(node: VideoNodeData, context: RenderContext) {
  const document = context.createDocument()

  if (!isSafeRenderableSource(context, 'media', node.src)) {
    return renderEmptyContainer(document)
  }

  const cardClasses = getCardClasses(node).join(' ')

  const htmlString = cardTemplate({ node, cardClasses, context })

  const element = document.createElement('div')
  element.innerHTML = htmlString.trim()

  return { element: getFirstHtmlElement(element, 'renderVideoNode'), type: 'outer' as const }
}

export function cardTemplate({
  node,
  cardClasses,
  context,
}: {
  node: VideoNodeData
  cardClasses: string
  context: RenderContext
}) {
  const widthAttr = hasVideoDimensions(node) ? `width="${node.width}"` : ''
  const heightAttr = hasVideoDimensions(node) ? `height="${node.height}"` : ''
  const posterAttr = hasVideoDimensions(node) ? `poster="${getPosterSpacerSrc(node.width, node.height)}"` : ''
  const autoplayAttr = node.loop ? 'loop autoplay muted' : ''
  const safeThumbnailSrc = context.safeUrl('media', node.thumbnailSrc)
  const safeCustomThumbnailSrc = context.safeUrl('media', node.customThumbnailSrc)
  const thumbnailSrc = safeCustomThumbnailSrc || safeThumbnailSrc
  const hideControlsClass = node.loop ? ' inkling-video-hide' : ''

  return `
        <figure class="${cardClasses}" data-inkling-thumbnail="${context.escapeText(safeThumbnailSrc)}" data-inkling-custom-thumbnail="${context.escapeText(safeCustomThumbnailSrc)}">
            <div class="inkling-video-container">
                <video
                    src="${context.escapeText(context.safeUrl('media', node.src))}"
                    ${posterAttr}
                    ${widthAttr}
                    ${heightAttr}
                    ${autoplayAttr}
                    playsinline
                    preload="metadata"
                    style="background: transparent url('${context.escapeText(thumbnailSrc)}') 50% 50% / cover no-repeat;"
                ></video>
                <div class="inkling-video-overlay">
                    <button class="inkling-video-large-play-icon" aria-label="Play video">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path d="M23.14 10.608 2.253.164A1.559 1.559 0 0 0 0 1.557v20.887a1.558 1.558 0 0 0 2.253 1.392L23.14 13.393a1.557 1.557 0 0 0 0-2.785Z"/>
                        </svg>
                    </button>
                </div>
                <div class="inkling-video-player-container${hideControlsClass}">
                    <div class="inkling-video-player">
                        <button class="inkling-video-play-icon" aria-label="Play video">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path d="M23.14 10.608 2.253.164A1.559 1.559 0 0 0 0 1.557v20.887a1.558 1.558 0 0 0 2.253 1.392L23.14 13.393a1.557 1.557 0 0 0 0-2.785Z"></path>
                            </svg>
                        </button>
                        <button class="inkling-video-pause-icon inkling-video-hide" aria-label="Pause video">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <rect x="3" y="1" width="7" height="22" rx="1.5" ry="1.5"></rect>
                                <rect x="14" y="1" width="7" height="22" rx="1.5" ry="1.5"></rect>
                            </svg>
                        </button>
                        <span class="inkling-video-current-time">0:00</span>
                        <div class="inkling-video-time">
                            /<span class="inkling-video-duration">${formatVideoDuration(node.duration)}</span>
                        </div>
                        <input type="range" class="inkling-video-seek-slider" max="100" value="0">
                        <button class="inkling-video-playback-rate" aria-label="Adjust playback speed">1&#215;</button>
                        <button class="inkling-video-unmute-icon" aria-label="Unmute">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path d="M15.189 2.021a9.728 9.728 0 0 0-7.924 4.85.249.249 0 0 1-.221.133H5.25a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h1.794a.249.249 0 0 1 .221.133 9.73 9.73 0 0 0 7.924 4.85h.06a1 1 0 0 0 1-1V3.02a1 1 0 0 0-1.06-.998Z"></path>
                            </svg>
                        </button>
                        <button class="inkling-video-mute-icon inkling-video-hide" aria-label="Mute">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path d="M16.177 4.3a.248.248 0 0 0 .073-.176v-1.1a1 1 0 0 0-1.061-1 9.728 9.728 0 0 0-7.924 4.85.249.249 0 0 1-.221.133H5.25a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h.114a.251.251 0 0 0 .177-.073ZM23.707 1.706A1 1 0 0 0 22.293.292l-22 22a1 1 0 0 0 0 1.414l.009.009a1 1 0 0 0 1.405-.009l6.63-6.631A.251.251 0 0 1 8.515 17a.245.245 0 0 1 .177.075 10.081 10.081 0 0 0 6.5 2.92 1 1 0 0 0 1.061-1V9.266a.247.247 0 0 1 .073-.176Z"></path>
                            </svg>
                        </button>
                        <input type="range" class="inkling-video-volume-slider" max="100" value="100"/>
                    </div>
                </div>
            </div>
            ${node.caption ? renderCardCaptionHtml(node.caption, context, 'escape') : ''}
        </figure>
    `
}

export function getCardClasses(node: VideoNodeData) {
  const cardClasses = ['inkling-card inkling-video-card']

  if (node.cardWidth) {
    cardClasses.push(`inkling-width-${node.cardWidth}`)
  }
  if (node.caption) {
    cardClasses.push(CARD_CAPTION_MARKER_CLASS)
  }

  return cardClasses
}
