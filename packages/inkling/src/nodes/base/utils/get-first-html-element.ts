export function getFirstHtmlElement(container: HTMLElement, context: string): HTMLElement {
  const element = container.firstElementChild

  // the namespace check IS the discriminator: headless renders parse into
  // separate jsdom documents, so cross-realm nodes fail instanceof against
  // this realm's HTMLElement. namespaceURI is realm-proof; the cast is the
  // honest bridge from it (XHTML namespace ⇒ HTMLElement).
  if (container.childElementCount !== 1 || !element || element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
    throw new Error(`${context} must render a single HTML root element`)
  }

  return element as HTMLElement
}
