import { useState } from 'react'

import { HtmlOutputPlugin } from '@/'

import { DemoEditorShell } from './components/DemoEditorShell'

function HtmlOutputDemo() {
  const [html, setHtml] = useState(
    '<p><span>check</span> <a href="https://inkling.local/changelog/markdown/" dir="ltr"><span data-lexical-text="true">inkling.local/changelog/markdown/</span></a></p>',
  )

  return (
    <>
      <div data-testid="html-output" hidden>
        {html}
      </div>
      <DemoEditorShell>
        <HtmlOutputPlugin html={html} setHtml={setHtml} />
      </DemoEditorShell>
    </>
  )
}

export default HtmlOutputDemo
