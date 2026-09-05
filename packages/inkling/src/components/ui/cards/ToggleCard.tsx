import type { EditorState, LexicalEditor } from 'lexical'

import ArrowDownIcon from '@/assets/icons/inkling-toggle-arrow.svg?react'
import InklingNestedEditor from '@/components/InklingNestedEditor'
import { ReadOnlyOverlay } from '@/components/ui/ReadOnlyOverlay'
import { useInklingLabels } from '@/hooks/useInklingLabels'

export function ToggleCard({
  contentEditor,
  contentEditorInitialState,
  contentPlaceholder,
  headingEditor,
  headingEditorInitialState,
  headingPlaceholder,
  isEditing = false,
}: {
  contentEditor: LexicalEditor
  contentEditorInitialState?: EditorState
  contentPlaceholder?: string
  headingEditor: LexicalEditor
  headingEditorInitialState?: EditorState
  headingPlaceholder?: string
  isEditing?: boolean
}) {
  const labels = useInklingLabels()

  return (
    <>
      <div className="rounded-md border border-grey/40 px-6 py-4 dark:border-grey/30">
        <div className="flex cursor-text items-start justify-between">
          <div className="mr-2 w-full">
            <InklingNestedEditor
              autoFocus={true}
              focusNext={contentEditor}
              initialEditor={headingEditor}
              initialEditorState={headingEditorInitialState}
              nodes="minimal"
              placeholderClassName={
                '!font-sans !text-2xl !leading-[1.1] !font-bold !tracking-tight text-black dark:text-grey-50 opacity-40'
              }
              placeholderText={headingPlaceholder ?? labels['toggle.heading.placeholder']}
              singleParagraph={true}
              textClassName={
                'inkling-lexical-heading heading-xsmall whitespace-normal text-black dark:text-grey-50 opacity-100'
              }
            />
          </div>
          <div className="z-20 !mt-[-1px] ml-auto flex size-8 shrink-0 items-center justify-center">
            <ArrowDownIcon className={'size-4 stroke-2 text-grey-400 dark:text-grey/30'} />
          </div>
        </div>
        <div className={'!mt-2 w-full'}>
          <InklingNestedEditor
            initialEditor={contentEditor}
            initialEditorState={contentEditorInitialState}
            placeholderClassName={
              'font-serif text-xl font-normal !leading-[1.6em] text-grey-900 dark:text-grey-100 opacity-40'
            }
            placeholderText={contentPlaceholder ?? labels['toggle.content.placeholder']}
            textClassName={
              'whitespace-normal font-serif text-xl font-normal text-grey-900 dark:text-grey-100 opacity-100'
            }
          />
        </div>
      </div>
      {!isEditing && <ReadOnlyOverlay />}
    </>
  )
}
