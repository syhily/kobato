import type { SetURLSearchParams } from 'react-router-dom'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createParagraphNode, $getRoot } from 'lexical'
import React from 'react'

import EyeClosedIcon from './icons/eye-closed.svg?react'
import EyeOpenIcon from './icons/eye-open.svg?react'

interface InitialContentToggleProps {
  defaultContent: string
  setTitle: (title: string) => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
}

const InitialContentToggle = ({
  defaultContent,
  setTitle,
  searchParams,
  setSearchParams,
}: InitialContentToggleProps) => {
  const [editor] = useLexicalComposerContext()
  const [isOn, setIsOn] = React.useState(searchParams.get('content') !== 'false')

  const toggle = () => {
    if (!isOn) {
      const editorState = editor.parseEditorState(defaultContent)
      editor.setEditorState(editorState)
      setTitle('Meet the Inkling editor.')
      searchParams.delete('content')
      setSearchParams(searchParams)
    }
    if (isOn) {
      editor.update(() => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        root.clear()
        root.append(paragraph)
        paragraph.select()
      })
      setTitle('')
      searchParams.set('content', 'false')
      setSearchParams(searchParams)
    }
    setIsOn(!isOn)
  }

  return (
    <>
      <button
        className="absolute top-4 right-6 z-20 block h-[22px] w-[42px] cursor-pointer rounded-full bg-black transition-all ease-in-out"
        type="button"
        onClick={toggle}
      >
        <EyeOpenIcon className="absolute top-[5px] left-[6px] size-3 text-white" />
        <EyeClosedIcon className="absolute top-[5px] right-[6px] size-3 text-white" />
        <div
          className={`absolute top-[2px] size-[18px] rounded-full bg-white transition-all ease-in-out ${isOn ? 'left-[22px]' : 'left-[2px]'}`}
        ></div>
      </button>
    </>
  )
}

export default InitialContentToggle
