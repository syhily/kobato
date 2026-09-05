import { audioDeclaration } from './audio.declaration'
import { bookmarkDeclaration } from './bookmark.declaration'
import { buttonDeclaration } from './button.declaration'
import { calloutDeclaration } from './callout.declaration'
import { codeBlockDeclaration } from './codeblock.declaration'
import { fileDeclaration } from './file.declaration'
import { footnoteDefinitionDeclaration } from './footnotedefinition.declaration'
import { galleryDeclaration } from './gallery.declaration'
import { headerDeclaration } from './header.declaration'
import { horizontalRuleDeclaration } from './horizontalrule.declaration'
import { htmlDeclaration } from './html.declaration'
import { imageDeclaration } from './image.declaration'
import { mathDeclaration } from './math.declaration'
import { toggleDeclaration } from './toggle.declaration'
import { videoDeclaration } from './video.declaration'

export type { CardDeclaration } from './card-declaration'

/**
 * The card declarations — the single per-card source of truth (CONTEXT.md:
 * "card declaration"). Every node-set registry is a derived view over this
 * list (`deriveCardNodes`).
 *
 * The declaration order reproduces the pre-refactor card run of
 * `@/nodes/DefaultNodes`; the base `DEFAULT_NODES` in `@/nodes/base` had a
 * different historical order and pins it explicitly at the derivation site.
 *
 * ADDING A CARD — the full touch-point list:
 *
 * 1. `src/nodes/base/nodes/<card>/` — the React-free base node (properties,
 *    renderers, importSpec) built with `generateDecoratorNode`.
 * 2. `<card>.declaration.ts` beside this file + one entry in
 *    `CARD_DECLARATIONS` below (position = node-set order). The declaration
 *    names its menu commands by string (`CardMenuCommand`) and its markdown
 *    eligibility by spec (`CardMarkdownSpec`) — it imports no registry table.
 * 3. `src/nodes/<Card>Node.ts` — the shim (assembled class, `$create*`,
 *    dataset type) and `src/nodes/<Card>NodeComponent.tsx` with its
 *    `render<Card>Card` export, paired in
 *    `card-decorate.tsx`'s `CARD_DECORATE_MODULES` (compile-time exhaustive).
 * 4. `card-commands.ts` — the `*NodeDataset` type, the `INSERT_*` constant,
 *    and one entry in `BUILTIN_INSERT_COMMANDS` (compile-time exhaustive);
 *    `card-cross-registry-consistency.test.ts` pins resolution identity.
 * 5. `src/labels/inkling-labels.ts` — `menu.<labelKey>.label`/`.desc` for
 *    each menu entry; `card-declarations.test.ts` pins both directions.
 * 6. `card-markdown-transformers.ts` — the fence payload, only for
 *    `markdown: { kind: 'fence' }` cards (compile-time exhaustive keyed by
 *    the fence declarations; module-init throw as runtime backstop);
 *    `card-transformer-drift.test.ts` pins the field vocabulary.
 * 7. A new menu icon id (only if the card needs one): the SVG asset plus one
 *    entry in `card-menus.ts`'s `CARD_ICONS` (compile-time exhaustive).
 *
 * Steps 3–6 are enforced by the guards named; `card-layering-imports.test.ts`
 * keeps the declaration modules React-free and off the wrapper layer.
 */
export const CARD_DECLARATIONS = [
  codeBlockDeclaration,
  horizontalRuleDeclaration,
  imageDeclaration,
  audioDeclaration,
  videoDeclaration,
  calloutDeclaration,
  htmlDeclaration,
  fileDeclaration,
  buttonDeclaration,
  toggleDeclaration,
  headerDeclaration,
  bookmarkDeclaration,
  galleryDeclaration,
  mathDeclaration,
  footnoteDefinitionDeclaration,
]

export type CardNodeType = (typeof CARD_DECLARATIONS)[number]['nodeType']
