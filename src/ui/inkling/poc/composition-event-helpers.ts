import type { LexicalEditor } from 'lexical'

export interface CompositionSequence {
  steps: Array<{ type: 'compositionupdate'; data: string } | { type: 'beforeinput'; data: string }>
  commit: string
}

export function dispatchCompositionStart(element: HTMLElement, _editor: LexicalEditor): void {
  const event = new CompositionEvent('compositionstart', {
    bubbles: true,
    cancelable: true,
    data: '',
  })
  element.dispatchEvent(event)
}

export function dispatchCompositionUpdate(element: HTMLElement, _editor: LexicalEditor, data: string): void {
  const event = new CompositionEvent('compositionupdate', {
    bubbles: true,
    cancelable: true,
    data,
  })
  element.dispatchEvent(event)
}

export function dispatchBeforeInput(
  element: HTMLElement,
  _editor: LexicalEditor,
  data: string,
  isComposing = true,
): void {
  const event = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data,
    isComposing,
  })
  element.dispatchEvent(event)
}

export function dispatchCompositionEnd(element: HTMLElement, _editor: LexicalEditor, data: string): void {
  const event = new CompositionEvent('compositionend', {
    bubbles: true,
    cancelable: true,
    data,
  })
  element.dispatchEvent(event)
}

export function dispatchInput(element: HTMLElement, _editor: LexicalEditor, data: string, isComposing = false): void {
  const event = new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data,
    isComposing,
  })
  element.dispatchEvent(event)
}

export function dispatchCompositionSequence(
  element: HTMLElement,
  editor: LexicalEditor,
  sequence: CompositionSequence,
): void {
  dispatchCompositionStart(element, editor)
  for (const step of sequence.steps) {
    if (step.type === 'compositionupdate') {
      dispatchCompositionUpdate(element, editor, step.data)
    } else {
      dispatchBeforeInput(element, editor, step.data, true)
    }
  }
  dispatchCompositionEnd(element, editor, sequence.commit)
  dispatchInput(element, editor, sequence.commit, false)
}

export function buildPinyinSequence(commit: string, intermediatePrefix?: string): CompositionSequence {
  const steps: CompositionSequence['steps'] = []
  if (intermediatePrefix !== undefined && intermediatePrefix.length > 0) {
    for (let i = 1; i <= intermediatePrefix.length; i += 1) {
      const slice = intermediatePrefix.slice(0, i)
      steps.push({ type: 'compositionupdate', data: slice })
      steps.push({ type: 'beforeinput', data: slice })
    }
  }
  steps.push({ type: 'compositionupdate', data: commit })
  steps.push({ type: 'beforeinput', data: commit })
  return { steps, commit }
}
