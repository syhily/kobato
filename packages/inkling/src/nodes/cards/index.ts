import { audioDeclaration } from '@kobato/inkling-internal/nodes/cards/audio.declaration'
import { bookmarkDeclaration } from '@kobato/inkling-internal/nodes/cards/bookmark.declaration'
import { buttonDeclaration } from '@kobato/inkling-internal/nodes/cards/button.declaration'
import { calloutDeclaration } from '@kobato/inkling-internal/nodes/cards/callout.declaration'
import { codeBlockDeclaration } from '@kobato/inkling-internal/nodes/cards/codeblock.declaration'
import { fileDeclaration } from '@kobato/inkling-internal/nodes/cards/file.declaration'
import { footnoteDefinitionDeclaration } from '@kobato/inkling-internal/nodes/cards/footnotedefinition.declaration'
import { galleryDeclaration } from '@kobato/inkling-internal/nodes/cards/gallery.declaration'
import { headerDeclaration } from '@kobato/inkling-internal/nodes/cards/header.declaration'
import { horizontalRuleDeclaration } from '@kobato/inkling-internal/nodes/cards/horizontalrule.declaration'
import { htmlDeclaration } from '@kobato/inkling-internal/nodes/cards/html.declaration'
import { imageDeclaration } from '@kobato/inkling-internal/nodes/cards/image.declaration'
import { mathDeclaration } from '@kobato/inkling-internal/nodes/cards/math.declaration'
import { toggleDeclaration } from '@kobato/inkling-internal/nodes/cards/toggle.declaration'
import { videoDeclaration } from '@kobato/inkling-internal/nodes/cards/video.declaration'

export type { AnyCardDeclaration, CardDeclaration } from '@kobato/inkling-internal/nodes/cards/card-declaration'

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
