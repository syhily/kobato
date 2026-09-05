import type { EditorState, LexicalEditor } from 'lexical'

import React from 'react'

import InklingCaptionEditor from '@/components/InklingCaptionEditor'
import { TextInput } from '@/components/ui/TextInput'
import { isEditorEmpty } from '@/utils/isEditorEmpty'

interface CaptionInputProps {
  captionEditor: LexicalEditor
  captionEditorInitialState?: EditorState
  placeholder?: string
  dataTestId?: string
}

function CaptionInput({ captionEditor, captionEditorInitialState, placeholder, dataTestId }: CaptionInputProps) {
  return (
    <div className={`m-0 w-full px-9 text-center`} data-testid={dataTestId} data-inkling-allow-clickthrough>
      <InklingCaptionEditor
        captionEditor={captionEditor}
        captionEditorInitialState={captionEditorInitialState}
        placeholderText={placeholder}
      />
    </div>
  )
}

interface AltTextInputProps {
  value?: string
  placeholder?: string
  onChange?: (value: string) => void
  readOnly?: boolean
  dataTestId?: string
  autoFocus?: boolean
}

function AltTextInput({ value, placeholder, onChange, readOnly, dataTestId, autoFocus = true }: AltTextInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value)
  }

  return (
    <TextInput
      autoFocus={autoFocus}
      className="not-inkling-prose w-full bg-transparent px-9 text-center font-sans text-sm leading-[1.625] font-normal tracking-wide text-grey-800 placeholder:text-grey-500 dark:text-grey-500 dark:placeholder:text-grey-800"
      data-testid={dataTestId}
      placeholder={placeholder}
      readOnly={readOnly}
      value={value}
      data-inkling-dnd-disabled
      onChange={handleChange}
    />
  )
}

interface AltToggleButtonProps {
  isEditingAlt?: boolean
  onClick: (event: React.MouseEvent) => void
}

function AltToggleButton({ isEditingAlt, onClick }: AltToggleButtonProps) {
  return (
    <button
      className={`absolute right-0 bottom-0 m-2 cursor-pointer rounded-md border px-1 font-sans text-[1.3rem] leading-7 font-normal tracking-wide transition-all duration-100 ${isEditingAlt ? 'border-green bg-green text-white' : 'border-grey text-grey'} `}
      data-testid="alt-toggle-button"
      name="alt-toggle-button"
      type="button"
      onClick={onClick}
    >
      Alt
    </button>
  )
}

interface CardCaptionEditorProps {
  altText?: string
  altTextPlaceholder?: string
  setAltText?: (value: string) => void
  captionEditor: LexicalEditor | null
  captionEditorInitialState?: EditorState
  captionPlaceholder?: string
  isSelected?: boolean
  readOnly?: boolean
  dataTestId?: string
}

export function CardCaptionEditor({
  altText,
  altTextPlaceholder,
  setAltText,
  captionEditor,
  captionEditorInitialState,
  captionPlaceholder,
  isSelected,
  readOnly,
  dataTestId,
}: CardCaptionEditorProps) {
  const [isEditingAlt, setIsEditingAlt] = React.useState(false)

  const toggleIsEditingAlt = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditingAlt(!isEditingAlt)
  }

  // always switch back to displaying caption when card is not selected —
  // adjusted during render (React re-renders immediately, before committing)
  const [prevIsSelected, setPrevIsSelected] = React.useState(isSelected)
  if (prevIsSelected !== isSelected) {
    setPrevIsSelected(isSelected)
    if (!isSelected) {
      setIsEditingAlt(false)
    }
  }

  // callers pass `captionEditor ?? null` when the node hasn't created its
  // nested editor yet — there is nothing to render without one
  if (!captionEditor) {
    return null
  }

  const isCaptionEmpty = isEditorEmpty(captionEditor)
  const showAltToggle = setAltText && isSelected

  return (
    (isSelected || !isCaptionEmpty) && (
      <figcaption className="flex min-h-[40px] w-full p-2">
        {isEditingAlt ? (
          <AltTextInput
            dataTestId={dataTestId}
            placeholder={altTextPlaceholder}
            readOnly={readOnly}
            value={altText}
            onChange={setAltText}
          />
        ) : (
          <CaptionInput
            captionEditor={captionEditor}
            captionEditorInitialState={captionEditorInitialState}
            dataTestId={dataTestId}
            placeholder={captionPlaceholder}
          />
        )}
        {showAltToggle && <AltToggleButton isEditingAlt={isEditingAlt} onClick={toggleIsEditingAlt} />}
      </figcaption>
    )
  )
}
