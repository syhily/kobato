import type { DOMConversionMap, DOMExportOutput, EditorConfig, LexicalEditor, NodeKey } from 'lexical'
import type { JSX } from 'react'

import { DecoratorNode } from 'lexical'

import type {
  InklingCodeBlockNode,
  InklingHorizontalRuleNode,
  InklingImageCardNode,
  InklingMathBlockNode,
  InklingMusicCardNode,
  InklingNonRecursiveBlockNode,
  InklingSolutionNode,
  InklingTableNode,
  InklingTwoColumnNode,
} from '@/shared/inkling/schema'

import {
  CodeCardComponent,
  HorizontalRuleCardComponent,
  ImageCardComponent,
  MathCardComponent,
  MusicCardComponent,
  TableCardComponent,
} from '@/ui/inkling/editor/cards/card-components'

export type SerializedImageCardNode = InklingImageCardNode

export class ImageCardNode extends DecoratorNode<JSX.Element | null> {
  __src: string
  __alt: string
  __caption: string
  __layout: InklingImageCardNode['layout']
  __width?: number
  __height?: number
  __thumbhash?: string
  __storagePath?: string
  __imageId?: string

  static getType(): string {
    return 'image-card'
  }

  static clone(node: ImageCardNode): ImageCardNode {
    return new ImageCardNode(
      node.__src,
      node.__alt,
      node.__caption,
      node.__layout,
      node.__width,
      node.__height,
      node.__thumbhash,
      node.__storagePath,
      node.__imageId,
      node.__key,
    )
  }

  constructor(
    src: string,
    alt: string,
    caption: string,
    layout: InklingImageCardNode['layout'],
    width?: number,
    height?: number,
    thumbhash?: string,
    storagePath?: string,
    imageId?: string,
    key?: NodeKey,
  ) {
    super(key)
    this.__src = src
    this.__alt = alt
    this.__caption = caption
    this.__layout = layout
    this.__width = width
    this.__height = height
    this.__thumbhash = thumbhash
    this.__storagePath = storagePath
    this.__imageId = imageId
  }

  getSrc(): string {
    return this.__src
  }
  getAlt(): string {
    return this.__alt
  }
  getCaption(): string {
    return this.__caption
  }
  getLayout(): InklingImageCardNode['layout'] {
    return this.__layout
  }
  getWidth(): number | undefined {
    return this.__width
  }
  getHeight(): number | undefined {
    return this.__height
  }
  getThumbhash(): string | undefined {
    return this.__thumbhash
  }
  getStoragePath(): string | undefined {
    return this.__storagePath
  }
  getImageId(): string | undefined {
    return this.__imageId
  }

  setSrc(src: string): void {
    this.getWritable().__src = src
  }
  setAlt(alt: string): void {
    this.getWritable().__alt = alt
  }
  setCaption(caption: string): void {
    this.getWritable().__caption = caption
  }
  setLayout(layout: InklingImageCardNode['layout']): void {
    this.getWritable().__layout = layout
  }
  setWidth(width?: number): void {
    this.getWritable().__width = width
  }
  setHeight(height?: number): void {
    this.getWritable().__height = height
  }
  setThumbhash(thumbhash?: string): void {
    this.getWritable().__thumbhash = thumbhash
  }
  setStoragePath(storagePath?: string): void {
    this.getWritable().__storagePath = storagePath
  }
  setImageId(imageId?: string): void {
    this.getWritable().__imageId = imageId
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('figure')
    element.setAttribute('data-inkling-image-card', 'true')
    return element
  }

  updateDOM(): false {
    return false
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element | null {
    return <ImageCardComponent node={this} />
  }

  isInline(): boolean {
    return false
  }

  exportJSON(): SerializedImageCardNode {
    return {
      ...super.exportJSON(),
      type: 'image-card',
      version: 1,
      src: this.__src,
      alt: this.__alt,
      caption: this.__caption,
      layout: this.__layout,
      width: this.__width,
      height: this.__height,
      thumbhash: this.__thumbhash,
      storagePath: this.__storagePath,
      imageId: this.__imageId,
    }
  }

  static importJSON(serializedNode: SerializedImageCardNode): ImageCardNode {
    return new ImageCardNode(
      serializedNode.src,
      serializedNode.alt ?? '',
      serializedNode.caption ?? '',
      serializedNode.layout,
      serializedNode.width,
      serializedNode.height,
      serializedNode.thumbhash,
      serializedNode.storagePath,
      serializedNode.imageId,
    )
  }

  static importDOM(): DOMConversionMap | null {
    return {
      figure: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingImageCard === 'true') {
          return { conversion: () => ({ node: new ImageCardNode('', '', '', 'center') }), priority: 1 }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('figure')
    element.setAttribute('data-inkling-image-card', 'true')
    return { element }
  }
}

export function $createImageCardNode(payload: Omit<InklingImageCardNode, 'type' | 'version'>): ImageCardNode {
  return new ImageCardNode(
    payload.src,
    payload.alt ?? '',
    payload.caption ?? '',
    payload.layout,
    payload.width,
    payload.height,
    payload.thumbhash,
    payload.storagePath,
    payload.imageId,
  )
}

export function $isImageCardNode(node: unknown): node is ImageCardNode {
  return node instanceof ImageCardNode
}

export type SerializedCodeCardNode = InklingCodeBlockNode

export class CodeCardNode extends DecoratorNode<JSX.Element | null> {
  __code: string
  __language?: string
  __highlightedHtml?: string

  static getType(): string {
    return 'code-block'
  }

  static clone(node: CodeCardNode): CodeCardNode {
    return new CodeCardNode(node.__code, node.__language, node.__highlightedHtml, node.__key)
  }

  constructor(code: string, language?: string, highlightedHtml?: string, key?: NodeKey) {
    super(key)
    this.__code = code
    this.__language = language
    this.__highlightedHtml = highlightedHtml
  }

  getCode(): string {
    return this.__code
  }
  getLanguage(): string | undefined {
    return this.__language
  }
  getHighlightedHtml(): string | undefined {
    return this.__highlightedHtml
  }

  setCode(code: string): void {
    this.getWritable().__code = code
  }
  setLanguage(language?: string): void {
    this.getWritable().__language = language
  }
  setHighlightedHtml(highlightedHtml?: string): void {
    this.getWritable().__highlightedHtml = highlightedHtml
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('pre')
    element.setAttribute('data-inkling-code-block', 'true')
    return element
  }

  updateDOM(): false {
    return false
  }

  decorate(): JSX.Element | null {
    return <CodeCardComponent node={this} />
  }

  isInline(): boolean {
    return false
  }

  exportJSON(): SerializedCodeCardNode {
    return {
      ...super.exportJSON(),
      type: 'code-block',
      version: 1,
      code: this.__code,
      language: this.__language,
      highlightedHtml: this.__highlightedHtml,
    }
  }

  static importJSON(serializedNode: SerializedCodeCardNode): CodeCardNode {
    return new CodeCardNode(serializedNode.code, serializedNode.language, serializedNode.highlightedHtml)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      pre: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingCodeBlock === 'true') {
          return { conversion: () => ({ node: new CodeCardNode('') }), priority: 1 }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('pre')
    element.setAttribute('data-inkling-code-block', 'true')
    return { element }
  }
}

export function $createCodeCardNode(payload: Omit<InklingCodeBlockNode, 'type' | 'version'>): CodeCardNode {
  return new CodeCardNode(payload.code, payload.language, payload.highlightedHtml)
}

export function $isCodeCardNode(node: unknown): node is CodeCardNode {
  return node instanceof CodeCardNode
}

export type SerializedMathCardNode = InklingMathBlockNode

export class MathCardNode extends DecoratorNode<JSX.Element | null> {
  __tex: string
  __mathml?: string

  static getType(): string {
    return 'math-block'
  }

  static clone(node: MathCardNode): MathCardNode {
    return new MathCardNode(node.__tex, node.__mathml, node.__key)
  }

  constructor(tex: string, mathml?: string, key?: NodeKey) {
    super(key)
    this.__tex = tex
    this.__mathml = mathml
  }

  getTex(): string {
    return this.__tex
  }
  getMathml(): string | undefined {
    return this.__mathml
  }

  setTex(tex: string): void {
    this.getWritable().__tex = tex
  }
  setMathml(mathml?: string): void {
    this.getWritable().__mathml = mathml
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-inkling-math-block', 'true')
    return element
  }

  updateDOM(): false {
    return false
  }

  decorate(): JSX.Element | null {
    return <MathCardComponent node={this} />
  }

  isInline(): boolean {
    return false
  }

  exportJSON(): SerializedMathCardNode {
    return {
      ...super.exportJSON(),
      type: 'math-block',
      version: 1,
      tex: this.__tex,
      mathml: this.__mathml,
    }
  }

  static importJSON(serializedNode: SerializedMathCardNode): MathCardNode {
    return new MathCardNode(serializedNode.tex, serializedNode.mathml)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingMathBlock === 'true') {
          return { conversion: () => ({ node: new MathCardNode('') }), priority: 1 }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-inkling-math-block', 'true')
    return { element }
  }
}

export function $createMathCardNode(payload: Omit<InklingMathBlockNode, 'type' | 'version'>): MathCardNode {
  return new MathCardNode(payload.tex, payload.mathml)
}

export function $isMathCardNode(node: unknown): node is MathCardNode {
  return node instanceof MathCardNode
}

export type SerializedMusicCardNode = InklingMusicCardNode

export class MusicCardNode extends DecoratorNode<JSX.Element | null> {
  __playerId: string
  __auto: boolean
  __center: boolean

  static getType(): string {
    return 'music-card'
  }

  static clone(node: MusicCardNode): MusicCardNode {
    return new MusicCardNode(node.__playerId, node.__auto, node.__center, node.__key)
  }

  constructor(playerId: string, auto = false, center = false, key?: NodeKey) {
    super(key)
    this.__playerId = playerId
    this.__auto = auto
    this.__center = center
  }

  getPlayerId(): string {
    return this.__playerId
  }
  getAuto(): boolean {
    return this.__auto
  }
  getCenter(): boolean {
    return this.__center
  }

  setPlayerId(playerId: string): void {
    this.getWritable().__playerId = playerId
  }
  setAuto(auto: boolean): void {
    this.getWritable().__auto = auto
  }
  setCenter(center: boolean): void {
    this.getWritable().__center = center
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-inkling-music-card', 'true')
    return element
  }

  updateDOM(): false {
    return false
  }

  decorate(): JSX.Element | null {
    return <MusicCardComponent node={this} />
  }

  isInline(): boolean {
    return false
  }

  exportJSON(): SerializedMusicCardNode {
    return {
      ...super.exportJSON(),
      type: 'music-card',
      version: 1,
      playerId: this.__playerId,
      auto: this.__auto,
      center: this.__center,
    }
  }

  static importJSON(serializedNode: SerializedMusicCardNode): MusicCardNode {
    return new MusicCardNode(serializedNode.playerId, serializedNode.auto, serializedNode.center)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingMusicCard === 'true') {
          return { conversion: () => ({ node: new MusicCardNode('') }), priority: 1 }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-inkling-music-card', 'true')
    return { element }
  }
}

export function $createMusicCardNode(payload: Omit<InklingMusicCardNode, 'type' | 'version'>): MusicCardNode {
  return new MusicCardNode(payload.playerId, payload.auto, payload.center)
}

export function $isMusicCardNode(node: unknown): node is MusicCardNode {
  return node instanceof MusicCardNode
}

export class HorizontalRuleCardNode extends DecoratorNode<JSX.Element | null> {
  static getType(): string {
    return 'horizontal-rule'
  }

  static clone(node: HorizontalRuleCardNode): HorizontalRuleCardNode {
    return new HorizontalRuleCardNode(node.__key)
  }

  constructor(key?: NodeKey) {
    super(key)
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-inkling-horizontal-rule', 'true')
    return element
  }

  updateDOM(): false {
    return false
  }

  decorate(): JSX.Element | null {
    return <HorizontalRuleCardComponent node={this} />
  }

  isInline(): boolean {
    return false
  }

  exportJSON(): InklingHorizontalRuleNode {
    return {
      ...super.exportJSON(),
      type: 'horizontal-rule',
      version: 1,
    }
  }

  static importJSON(_serializedNode: InklingHorizontalRuleNode): HorizontalRuleCardNode {
    return new HorizontalRuleCardNode()
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingHorizontalRule === 'true') {
          return { conversion: () => ({ node: new HorizontalRuleCardNode() }), priority: 1 }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-inkling-horizontal-rule', 'true')
    return { element }
  }
}

export function $createHorizontalRuleCardNode(): HorizontalRuleCardNode {
  return new HorizontalRuleCardNode()
}

export function $isHorizontalRuleCardNode(node: unknown): node is HorizontalRuleCardNode {
  return node instanceof HorizontalRuleCardNode
}

export type SerializedTableCardNode = InklingTableNode

export class TableCardNode extends DecoratorNode<JSX.Element | null> {
  __rows: InklingTableNode['rows']

  static getType(): string {
    return 'table'
  }

  static clone(node: TableCardNode): TableCardNode {
    return new TableCardNode(node.__rows, node.__key)
  }

  constructor(rows: InklingTableNode['rows'], key?: NodeKey) {
    super(key)
    this.__rows = rows
  }

  getRows(): InklingTableNode['rows'] {
    return this.__rows
  }
  setRows(rows: InklingTableNode['rows']): void {
    this.getWritable().__rows = rows
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('div')
    element.setAttribute('data-inkling-table', 'true')
    return element
  }

  updateDOM(): false {
    return false
  }

  decorate(): JSX.Element | null {
    return <TableCardComponent node={this} />
  }

  isInline(): boolean {
    return false
  }

  exportJSON(): SerializedTableCardNode {
    return {
      ...super.exportJSON(),
      type: 'table',
      version: 1,
      rows: this.__rows,
    }
  }

  static importJSON(serializedNode: SerializedTableCardNode): TableCardNode {
    return new TableCardNode(serializedNode.rows)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingTable === 'true') {
          return { conversion: () => ({ node: new TableCardNode([]) }), priority: 1 }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-inkling-table', 'true')
    return { element }
  }
}

export function $createTableCardNode(payload: Omit<InklingTableNode, 'type' | 'version'>): TableCardNode {
  return new TableCardNode(payload.rows)
}

export function $isTableCardNode(node: unknown): node is TableCardNode {
  return node instanceof TableCardNode
}

/* ── Solution & TwoColumn (skeleton — nested editors wired in P4) ── */

export class SolutionCardNode extends DecoratorNode<JSX.Element | null> {
  __children: InklingNonRecursiveBlockNode[]

  static getType(): string {
    return 'solution'
  }

  static clone(node: SolutionCardNode): SolutionCardNode {
    return new SolutionCardNode(node.__children, node.__key)
  }

  constructor(children: InklingNonRecursiveBlockNode[], key?: NodeKey) {
    super(key)
    this.__children = children
  }

  getChildren(): InklingNonRecursiveBlockNode[] {
    return this.__children
  }
  setChildren(children: InklingNonRecursiveBlockNode[]): void {
    this.getWritable().__children = children
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('data-inkling-solution', 'true')
    return el
  }
  updateDOM(): false {
    return false
  }
  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element | null {
    // P4: wire nested editor here via NestedEditor component
    return null
  }
  isInline(): boolean {
    return false
  }

  exportJSON(): InklingSolutionNode {
    return { ...super.exportJSON(), type: 'solution', version: 1, children: this.__children }
  }

  static importJSON(serializedNode: InklingSolutionNode): SolutionCardNode {
    return new SolutionCardNode(serializedNode.children)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingSolution === 'true') {
          return { conversion: () => ({ node: new SolutionCardNode([]) }), priority: 1 }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement('div')
    el.setAttribute('data-inkling-solution', 'true')
    return { element: el }
  }
}

export function $createSolutionCardNode(payload: Omit<InklingSolutionNode, 'type' | 'version'>): SolutionCardNode {
  return new SolutionCardNode(payload.children)
}

export function $isSolutionCardNode(node: unknown): node is SolutionCardNode {
  return node instanceof SolutionCardNode
}

export class TwoColumnCardNode extends DecoratorNode<JSX.Element | null> {
  __left: InklingNonRecursiveBlockNode[]
  __right: InklingNonRecursiveBlockNode[]

  static getType(): string {
    return 'two-column'
  }

  static clone(node: TwoColumnCardNode): TwoColumnCardNode {
    return new TwoColumnCardNode(node.__left, node.__right, node.__key)
  }

  constructor(left: InklingNonRecursiveBlockNode[], right: InklingNonRecursiveBlockNode[], key?: NodeKey) {
    super(key)
    this.__left = left
    this.__right = right
  }

  getLeft(): InklingNonRecursiveBlockNode[] {
    return this.__left
  }
  setLeft(left: InklingNonRecursiveBlockNode[]): void {
    this.getWritable().__left = left
  }
  getRight(): InklingNonRecursiveBlockNode[] {
    return this.__right
  }
  setRight(right: InklingNonRecursiveBlockNode[]): void {
    this.getWritable().__right = right
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement('section')
    el.setAttribute('data-inkling-two-column', 'true')
    return el
  }
  updateDOM(): false {
    return false
  }
  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element | null {
    // P4: wire nested editors here via NestedEditor component
    return null
  }
  isInline(): boolean {
    return false
  }

  exportJSON(): InklingTwoColumnNode {
    return { ...super.exportJSON(), type: 'two-column', version: 1, left: this.__left, right: this.__right }
  }

  static importJSON(serializedNode: InklingTwoColumnNode): TwoColumnCardNode {
    return new TwoColumnCardNode(serializedNode.left, serializedNode.right)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      section: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingTwoColumn === 'true') {
          return { conversion: () => ({ node: new TwoColumnCardNode([], []) }), priority: 1 }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement('section')
    el.setAttribute('data-inkling-two-column', 'true')
    return { element: el }
  }
}

export function $createTwoColumnCardNode(payload: Omit<InklingTwoColumnNode, 'type' | 'version'>): TwoColumnCardNode {
  return new TwoColumnCardNode(payload.left, payload.right)
}

export function $isTwoColumnCardNode(node: unknown): node is TwoColumnCardNode {
  return node instanceof TwoColumnCardNode
}
