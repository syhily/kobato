import React from 'react'

const SECTIONS: Array<{ title: string; items: string[] }> = [
  {
    title: 'On this page already',
    items: [
      'Every card: toggle, callout, header, image, gallery, video, audio, file, bookmark, button, code block, HTML, math, divider, table, music player (host card), footnote pair',
      'Slash menu — type / · Plus button — hover the left gutter',
      'Markdown shortcuts — ## + space, ```ts + space, --- , ==mark==, ~sub~, ^sup^',
      'Emoji — :smi · At-link — @ · Footnote — ^ + space · TK reminders — type TK',
      'Dashes — -- → – and --- → — · Replacement strings — type {name}',
      'Format toolbar — select text · Quote cycle — quote → aside → paragraph (toolbar)',
      'Drag cards to reorder · drop an image on an image → gallery · drag inside a gallery to reorder',
      'Video/audio/file cards are upload placeholders — the demo upload simulates progress; a file named "fail" errors',
    ],
  },
  {
    title: 'Host-gated (need keys or params)',
    items: [
      'GIF picker — VITE_TENOR_API_KEY or VITE_KLIPY_API_KEY, then slash menu → Gif',
      'Image editing (Pintura) — VITE_PINTURA_JS_URL + VITE_PINTURA_CSS_URL, then select an image → edit',
      'Image library — ?imageLibrary=fixture (or fixture-upload), then slash menu → Image library',
      'Math previews — ?renderMath=stub (stubbed KaTeX channel)',
      'Chinese labels — ?labels=zh · No internal linking — ?searchLinks=false',
      'Multiplayer — /multiplayer with pnpm dev:multiplayer (y-websocket on :1234)',
    ],
  },
  {
    title: 'Surfaces & chrome',
    items: [
      '/ full editor · /basic · /minimal · /contentrestricted · /html-output · /designsandbox',
      'Dark mode — top right · word + TK count — bottom · JSON/tree sidebar — right edge',
      'Snippets — select text → save as snippet (toolbar), insert via / or +',
      'Save to URL — sidebar button · initial-content toggle — top left',
    ],
  },
]

/** The collapsible "test every feature" checklist for the demo. */
export default function FeatureChecklist() {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <button
        className="absolute top-4 right-4 z-20 cursor-pointer rounded bg-white px-2 py-0.5 font-mono text-sm text-black shadow-sm dark:bg-grey-900 dark:text-grey-300"
        title="Feature checklist"
        type="button"
        onClick={() => setOpen(!open)}
      >
        ✨ {open ? '×' : 'Features'}
      </button>
      {open && (
        <div className="absolute top-10 right-4 z-20 max-h-[70vh] w-[380px] overflow-y-auto rounded-lg bg-white p-4 font-sans text-sm text-grey-900 shadow-md dark:bg-grey-950 dark:text-grey-300">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-3 last:mb-0">
              <div className="mb-1 font-mono text-xs font-bold tracking-wide text-grey-500 uppercase">
                {section.title}
              </div>
              <ul className="list-disc space-y-1 pl-4">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
