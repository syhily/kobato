import { type CardConfig, type ExternalControlAPI, InklingComposableEditor, InklingComposer } from '@kobato/inkling'
import { DemoChrome, useDemoSidebar } from '@kobato/inkling-demo/components/DemoChrome'
import { fileTypes, useFileUpload } from '@kobato/inkling-demo/hooks/use-file-upload'
import { useFocusBelowCanvas } from '@kobato/inkling-demo/hooks/use-focus-below-canvas'
import { useSnippets } from '@kobato/inkling-demo/hooks/use-snippets'
import { klipyConfig, tenorConfig } from '@kobato/inkling-demo/utils/gifConfig'
import React, { useState } from 'react'

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
