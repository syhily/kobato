import React, { useState } from 'react'

import { type CardConfig, type ExternalControlAPI, InklingComposableEditor, InklingComposer } from '@/'

import { klipyConfig, tenorConfig } from '../utils/gifConfig'
import { fileTypes, useFileUpload } from '../utils/useFileUpload'
import { useFocusBelowCanvas } from '../utils/useFocusBelowCanvas'
import { useSnippets } from '../utils/useSnippets'
import { DemoChrome, useDemoSidebar } from './DemoChrome'

// The secondary demo surfaces' shared editor shell (DemoChrome owns the
// chrome; this owns the composer config assembly and the canvas layout):
// gif card config, snippets wiring, file uploader, focus-below-canvas,
// registerAPI, and the three-div canvas chain. A surface passes only its
// facts — an optional node set and its inner plugin(s).

const cardConfig: CardConfig = {
  tenor: tenorConfig ?? undefined,
  klipy: klipyConfig ?? undefined,
}

type InklingComposerNodes = React.ComponentProps<typeof InklingComposer>['nodes']

export function DemoEditorShell({ nodes, children }: { nodes?: InklingComposerNodes; children: React.ReactNode }) {
  const [editorAPI, setEditorAPI] = useState<ExternalControlAPI | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const { snippets, createSnippet, deleteSnippet } = useSnippets()
  const sidebar = useDemoSidebar()
  // the focus-below-canvas choreography lives in the shared demo chrome module
  const { onClick } = useFocusBelowCanvas({ editorAPI, containerRef })

  const handleRegisterAPI = React.useCallback((api: ExternalControlAPI | null) => {
    setEditorAPI(api)
  }, [])

  return (
    <div className="inkling-lexical top">
      <InklingComposer
        {...(nodes ? { nodes } : {})}
        cardConfig={{ ...cardConfig, snippets, createSnippet, deleteSnippet }}
        fileUploader={{ useFileUpload: useFileUpload(), fileTypes }}
      >
        <div className="relative h-full grow">
          <div ref={containerRef} className="h-full overflow-auto" onClick={onClick}>
            <div className="mx-auto max-w-[740px] px-6 py-[15vmin] lg:px-0">
              <InklingComposableEditor registerAPI={handleRegisterAPI}>{children}</InklingComposableEditor>
            </div>
          </div>
        </div>
        <DemoChrome sidebar={sidebar} />
      </InklingComposer>
    </div>
  )
}
