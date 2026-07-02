import type { ExportDOMOptions } from '@/ui/inkling-editor/nodes/base/export-dom'

import { addCreateDocumentOption } from '@/ui/inkling-editor/nodes/base/utils/add-create-document-option'
import { getFirstHtmlElement } from '@/ui/inkling-editor/nodes/base/utils/get-first-html-element'
import { slugify } from '@/ui/inkling-editor/nodes/base/utils/slugify'
import { getSrcsetAttribute, type ImageRenderOptions } from '@/ui/inkling-editor/nodes/base/utils/srcset-attribute'

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

interface HeaderV2DatasetNode {
  __alignment: string
  __buttonText: string
  __buttonEnabled: boolean
  __buttonUrl: string
  __header: string
  __subheader: string
  __backgroundImageSrc: string
  __backgroundImageWidth: number | null
  __backgroundImageHeight: number | null
  __backgroundSize: string
  __backgroundColor: string
  __buttonColor: string
  __layout: string
  __textColor: string
  __buttonTextColor: string
  __swapped: boolean
  __accentColor: string
}

interface HeaderV2RenderOptions extends ExportDOMOptions {
  design?: { buttonStyle?: string }
}

function cardTemplate(nodeData: HeaderV2NodeData, options: HeaderV2RenderOptions = {}) {
  const cardClasses = getCardClasses(nodeData).join(' ')

  const backgroundAccent = nodeData.backgroundColor === 'accent' ? 'inkling-style-accent' : ''
  const buttonAccent = nodeData.buttonColor === 'accent' ? 'inkling-style-accent' : ''
  const buttonStyle = nodeData.buttonColor !== 'accent' ? `background-color: ${nodeData.buttonColor};` : ``
  const alignment = nodeData.alignment === 'center' ? 'inkling-align-center' : ''
  const backgroundImageStyle =
    nodeData.backgroundColor !== 'accent' && (!nodeData.backgroundImageSrc || nodeData.layout === 'split')
      ? `background-color: ${nodeData.backgroundColor}`
      : ''

  let imgTemplate = ''
  if (nodeData.backgroundImageSrc) {
    const bgImage = {
      src: nodeData.backgroundImageSrc,
      width: nodeData.backgroundImageWidth,
      height: nodeData.backgroundImageHeight,
    }

    const srcsetValue =
      bgImage.width !== null
        ? getSrcsetAttribute({
            src: bgImage.src,
            width: bgImage.width,
            options: options as ImageRenderOptions,
          })
        : ''
    const srcset = srcsetValue ? `srcset="${srcsetValue}"` : ''

    imgTemplate = `
            <picture><img class="inkling-header-card-image" src="${bgImage.src}" ${srcset} loading="lazy" alt="" /></picture>
        `
  }

  const header = () => {
    if (nodeData.header) {
      return `<h2 id="${slugify(nodeData.header)}" class="inkling-header-card-heading" style="color: ${nodeData.textColor};" data-text-color="${nodeData.textColor}">${nodeData.header}</h2>`
    }
    return ''
  }

  const subheader = () => {
    if (nodeData.subheader) {
      return `<p id="${slugify(nodeData.subheader)}" class="inkling-header-card-subheading" style="color: ${nodeData.textColor};" data-text-color="${nodeData.textColor}">${nodeData.subheader}</p>`
    }
    return ''
  }

  const button = () => {
    if (nodeData.buttonEnabled && nodeData.buttonUrl && nodeData.buttonUrl.trim() !== '') {
      return `<a href="${nodeData.buttonUrl}" class="inkling-header-card-button ${buttonAccent}" style="${buttonStyle}color: ${nodeData.buttonTextColor};" data-button-color="${nodeData.buttonColor}" data-button-text-color="${nodeData.buttonTextColor}">${nodeData.buttonText}</a>`
    }
    return ''
  }

  const wrapperStyle = backgroundImageStyle ? `style="${backgroundImageStyle};"` : ''

  return `
        <div class="${cardClasses} ${backgroundAccent}" ${wrapperStyle} data-background-color="${nodeData.backgroundColor}">
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

function emailTemplate(nodeData: HeaderV2NodeData, options: HeaderV2RenderOptions) {
  const backgroundAccent = nodeData.backgroundColor === 'accent' ? `background-color: ${nodeData.accentColor};` : ''
  let buttonAccent =
    nodeData.buttonColor === 'accent' ? `background-color: ${nodeData.accentColor};` : nodeData.buttonColor
  let buttonStyle = nodeData.buttonColor !== 'accent' ? `background-color: ${nodeData.buttonColor};` : ''
  let buttonTextColor = nodeData.buttonTextColor
  const alignment = nodeData.alignment === 'center' ? 'text-align: center;' : ''
  const backgroundImageStyle = nodeData.backgroundImageSrc
    ? nodeData.layout !== 'split'
      ? `background-image: url(${nodeData.backgroundImageSrc}); background-size: cover; background-position: center center;`
      : `background-color: ${nodeData.backgroundColor};`
    : `background-color: ${nodeData.backgroundColor};`
  const splitImageStyle = `background-image: url(${nodeData.backgroundImageSrc}); background-size: ${nodeData.backgroundSize !== 'contain' ? 'cover' : '50%'}; background-position: center`

  if (
    (options?.feature?.emailCustomization || options?.feature?.emailCustomizationAlpha) &&
    options?.design?.buttonStyle === 'outline'
  ) {
    if (nodeData.buttonColor === 'accent') {
      buttonAccent = ''
      buttonStyle = `
                border: 1px solid ${nodeData.accentColor};
                background-color: transparent;
                color: ${nodeData.accentColor} !important;
            `
      buttonTextColor = nodeData.accentColor
    } else {
      buttonStyle = `
                border: 1px solid ${nodeData.buttonColor};
                background-color: transparent;
                color: ${nodeData.buttonColor} !important;
            `
      buttonTextColor = nodeData.buttonColor
    }
  }

  if (options?.feature?.emailCustomization || options?.feature?.emailCustomizationAlpha) {
    return `
            <div class="inkling-header-card inkling-v2" style="color:${nodeData.textColor}; ${alignment} ${backgroundImageStyle} ${backgroundAccent}">
                ${
                  nodeData.layout === 'split' && nodeData.backgroundImageSrc
                    ? `
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                            <td background="${nodeData.backgroundImageSrc}" style="${splitImageStyle}" class="inkling-header-card-image"></td>
                        </tr>
                    </table>
                `
                    : ''
                }
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="color:${nodeData.textColor}; ${alignment} ${backgroundImageStyle} ${backgroundAccent}">
                    <tr>
                        <td class="inkling-header-card-content" style="${nodeData.layout === 'split' && nodeData.backgroundSize === 'contain' ? 'padding-top: 0;' : ''}">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td align="${nodeData.alignment}">
                                        <h2 class="inkling-header-card-heading" style="color:${nodeData.textColor};">${nodeData.header}</h2>
                                    </td>
                                </tr>
                                <tr>
                                    <td class="inkling-header-card-subheading-wrapper" align="${nodeData.alignment}">
                                        <p class="inkling-header-card-subheading" style="color:${nodeData.textColor};">${nodeData.subheader}</p>
                                    </td>
                                </tr>
                                <tr>
                                    ${
                                      nodeData.buttonEnabled && nodeData.buttonUrl && nodeData.buttonUrl.trim() !== ''
                                        ? `
                                        <td class="inkling-header-button-wrapper">
                                            <table class="btn" border="0" cellspacing="0" cellpadding="0" align="${nodeData.alignment}">
                                                <tr>
                                                    <td align="center" style="${buttonStyle} ${buttonAccent}">
                                                        <a href="${nodeData.buttonUrl}" style="color: ${buttonTextColor};">${nodeData.buttonText}</a>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    `
                                        : ''
                                    }
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </div>
            `
  }

  return `
        <div class="inkling-header-card inkling-v2" style="color:${nodeData.textColor}; ${alignment} ${backgroundImageStyle} ${backgroundAccent}">
            ${
              nodeData.layout === 'split' && nodeData.backgroundImageSrc
                ? `
                <div class="inkling-header-card-image" background="${nodeData.backgroundImageSrc}" style="${splitImageStyle}"></div>
            `
                : ''
            }
            <div class="inkling-header-card-content" style="${nodeData.layout === 'split' && nodeData.backgroundSize === 'contain' ? 'padding-top: 0;' : ''}">
                <h2 class="inkling-header-card-heading" style="color:${nodeData.textColor};">${nodeData.header}</h2>
                <p class="inkling-header-card-subheading" style="color:${nodeData.textColor};">${nodeData.subheader}</p>
                ${
                  nodeData.buttonEnabled && nodeData.buttonUrl && nodeData.buttonUrl.trim() !== ''
                    ? `
                    <a class="inkling-header-card-button" href="${nodeData.buttonUrl}" style="color: ${nodeData.buttonTextColor}; ${buttonStyle} ${buttonAccent}">${nodeData.buttonText}</a>
                `
                    : ''
                }
            </div>
        </div>
        `
}

export function renderHeaderNodeV2(dataset: HeaderV2DatasetNode, options: HeaderV2RenderOptions = {}) {
  addCreateDocumentOption(options)
  const document = options.createDocument!()

  const node = {
    alignment: dataset.__alignment,
    buttonText: dataset.__buttonText,
    buttonEnabled: dataset.__buttonEnabled,
    buttonUrl: dataset.__buttonUrl,
    header: dataset.__header,
    subheader: dataset.__subheader,
    backgroundImageSrc: dataset.__backgroundImageSrc,
    backgroundImageWidth: dataset.__backgroundImageWidth,
    backgroundImageHeight: dataset.__backgroundImageHeight,
    backgroundSize: dataset.__backgroundSize,
    backgroundColor: dataset.__backgroundColor,
    buttonColor: dataset.__buttonColor,
    layout: dataset.__layout,
    textColor: dataset.__textColor,
    buttonTextColor: dataset.__buttonTextColor,
    swapped: dataset.__swapped,
    accentColor: dataset.__accentColor,
  }

  if (options.target === 'email') {
    const emailDoc = options.createDocument!()
    const emailDiv = emailDoc.createElement('div')

    emailDiv.innerHTML = emailTemplate(node, options)?.trim()

    return {
      element: getFirstHtmlElement(emailDiv, 'renderHeaderV2Node email') as HTMLDivElement,
      type: 'outer' as const,
    }
  }

  const htmlString = cardTemplate(node, options)

  const element = document.createElement('div')
  element.innerHTML = htmlString?.trim()

  if (node.header === '') {
    const h2Element = element.querySelector('.inkling-header-card-heading')
    if (h2Element) {
      h2Element.remove()
    }
  }

  if (node.subheader === '') {
    const pElement = element.querySelector('.inkling-header-card-subheading')
    if (pElement) {
      pElement.remove()
    }
  }

  return { element: getFirstHtmlElement(element, 'renderHeaderV2Node') as HTMLDivElement, type: 'outer' as const }
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
