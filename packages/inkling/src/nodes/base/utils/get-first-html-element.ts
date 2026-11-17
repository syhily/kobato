// the namespace check IS the discriminator: headless renders parse into
// separate jsdom documents, so cross-realm nodes fail instanceof against
// this realm's HTMLElement. namespaceURI is realm-proof (XHTML namespace ⇒
// HTMLElement), so the guard narrows without an assertion.
function isXhtmlRootElement(element: Element | null): element is HTMLElement {
  return element?.namespaceURI === 'http://www.w3.org/1999/xhtml'
}

export function getFirstHtmlElement(container: HTMLElement, context: string): HTMLElement {
  const element = container.firstElementChild

  if (container.childElementCount !== 1 || !isXhtmlRootElement(element)) {
    throw new Error(`${context} must render a single HTML root element`)
  }

  return element
}
