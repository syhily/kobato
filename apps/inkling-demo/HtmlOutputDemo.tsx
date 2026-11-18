import { HtmlOutputPlugin } from '@kobato/inkling'
import { DemoEditorShell } from '@kobato/inkling-demo/components/DemoEditorShell'
import { useState } from 'react'

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
