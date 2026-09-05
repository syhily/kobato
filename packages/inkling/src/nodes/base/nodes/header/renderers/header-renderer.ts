import { isSafeColorValue, type RenderContext } from '@/nodes/base/render-context'
import { getFirstHtmlElement } from '@/nodes/base/utils/get-first-html-element'
import { getSrcsetAttribute } from '@/nodes/base/utils/srcset-attribute'
import { slugify } from '@/utils/slugify'

interface HeaderV2NodeData {
  alignment: string
  buttonText: string
  buttonEnabled: boolean
  buttonUrl: string
  header: string
  subheader: string
  backgroundImageSrc: string
  backgroundImageWidth: number | null
  backgroundImageHeight: number | null
  backgroundSize: string
  backgroundColor: string
  buttonColor: string
  layout: string
  textColor: string
  buttonTextColor: string
  swapped: boolean
  accentColor: string
}

// Colors come from document JSON, not just the color picker — constrain to
// values the picker can produce before interpolating into style/attributes.
// The predicate is single-sourced in the render-context module; note header
// legitimately falls back to 'transparent', which the predicate accepts.
function safeColor(value: string, fallback: string): string {
  return isSafeColorValue(value) ? value : fallback
}

function cardTemplate(nodeData: HeaderV2NodeData, context: RenderContext) {
  const cardClasses = getCardClasses(nodeData).join(' ')

  const safeBackgroundImageSrc = context.safeUrl('media', nodeData.backgroundImageSrc)
  const safeButtonUrl = context.safeUrl('navigation', nodeData.buttonUrl)
  const headerText = nodeData.header ? context.escapeText(nodeData.header) : ''
  const subheaderText = nodeData.subheader ? context.escapeText(nodeData.subheader) : ''
  const buttonText = nodeData.buttonText ? context.escapeText(nodeData.buttonText) : ''

  const textColor = safeColor(nodeData.textColor, '#000000')
  const buttonTextColor = safeColor(nodeData.buttonTextColor, '#000000')
  const buttonColor = nodeData.buttonColor === 'accent' ? 'accent' : safeColor(nodeData.buttonColor, 'transparent')
  const backgroundColor =
    nodeData.backgroundColor === 'accent' ? 'accent' : safeColor(nodeData.backgroundColor, 'transparent')

  const backgroundAccent = nodeData.backgroundColor === 'accent' ? 'inkling-style-accent' : ''
  const buttonAccent = nodeData.buttonColor === 'accent' ? 'inkling-style-accent' : ''
  const buttonStyle = nodeData.buttonColor !== 'accent' ? `background-color: ${buttonColor};` : ``
  // symmetric with the parser (inkling-align-left ⇔ 'left'): legacy '' and
  // out-of-vocabulary values emit no class, the button renderer's idiom
  const alignment =
    nodeData.alignment === 'left' || nodeData.alignment === 'center' ? `inkling-align-${nodeData.alignment}` : ''
  const backgroundImageStyle =
    nodeData.backgroundColor !== 'accent' && (!safeBackgroundImageSrc || nodeData.layout === 'split')
      ? `background-color: ${backgroundColor}`
      : ''

  let imgTemplate = ''
  if (safeBackgroundImageSrc) {
    const bgImage = {
      src: safeBackgroundImageSrc,
      width: nodeData.backgroundImageWidth,
      height: nodeData.backgroundImageHeight,
    }

    const srcsetValue =
      bgImage.width !== null
        ? getSrcsetAttribute({
            src: bgImage.src,
            width: bgImage.width,
            context,
          })
        : ''
    const srcset = srcsetValue ? `srcset="${srcsetValue}"` : ''

    imgTemplate = `
            <picture><img class="inkling-header-card-image" src="${bgImage.src}" ${srcset} loading="lazy" alt="" /></picture>
        `
  }

  const header = () => {
    if (nodeData.header) {
      return `<h2 id="${slugify(nodeData.header)}" class="inkling-header-card-heading" style="color: ${textColor};" data-text-color="${textColor}">${headerText}</h2>`
    }
    return ''
  }

  const subheader = () => {
    if (nodeData.subheader) {
      return `<p id="${slugify(nodeData.subheader)}" class="inkling-header-card-subheading" style="color: ${textColor};" data-text-color="${textColor}">${subheaderText}</p>`
    }
    return ''
  }

  const button = () => {
    if (nodeData.buttonEnabled && safeButtonUrl) {
      return `<a href="${safeButtonUrl}" class="inkling-header-card-button ${buttonAccent}" style="${buttonStyle}color: ${buttonTextColor};" data-button-color="${buttonColor}" data-button-text-color="${buttonTextColor}">${buttonText}</a>`
    }
    return ''
  }

  const wrapperStyle = backgroundImageStyle ? `style="${backgroundImageStyle};"` : ''

  return `
        <div class="${cardClasses} ${backgroundAccent}" ${wrapperStyle} data-background-color="${backgroundColor}">
            ${nodeData.layout !== 'split' ? imgTemplate : ''}
            <div class="inkling-header-card-content">
                ${nodeData.layout === 'split' ? imgTemplate : ''}
                <div class="inkling-header-card-text ${alignment}">
                    ${header()}
                    ${subheader()}
                    ${button()}
                </div>
            </div>
        </div>
        `
}

export function renderHeaderNodeV2(nodeData: HeaderV2NodeData, context: RenderContext) {
  const document = context.createDocument()

  const htmlString = cardTemplate(nodeData, context)

  const element = document.createElement('div')
  element.innerHTML = htmlString.trim()

  const rootElement = getFirstHtmlElement(element, 'renderHeaderV2Node')
  // getFirstHtmlElement validates the namespace, not the tag — tagName, not
  // instanceof: the rendered tree may be another jsdom realm's
  if (rootElement.tagName !== 'DIV') {
    throw new Error('renderHeaderV2Node must render a div root element')
  }

  return { element: rootElement as HTMLDivElement, type: 'outer' as const }
}

export function getCardClasses(nodeData: HeaderV2NodeData) {
  const cardClasses = ['inkling-card inkling-header-card inkling-v2']

  if (nodeData.layout && nodeData.layout !== 'split') {
    cardClasses.push(`inkling-width-${nodeData.layout}`)
  }

  if (nodeData.layout === 'split') {
    cardClasses.push('inkling-layout-split inkling-width-full')
  }

  if (nodeData.swapped && nodeData.layout === 'split') {
    cardClasses.push('inkling-swapped')
  }

  if (nodeData.layout && nodeData.layout === 'full') {
    cardClasses.push(`inkling-content-wide`)
  }

  if (nodeData.layout === 'split') {
    if (nodeData.backgroundSize === 'contain') {
      cardClasses.push('inkling-content-wide')
    }
  }

  return cardClasses
}
