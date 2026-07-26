// SEA bootstrap side effect — the module that guarantees natives
// extraction happens BEFORE any native-package module evaluates inside
// the single-executable binary.
//
// Under `mainFormat: "module"` the injected entry IS the server bundle
// (see `scripts/sea/server-entry.ts`); ESM evaluates the import graph
// depth-first in import order, so this import sitting ahead of the server
// graph in the entry means `bootstrapSeaRuntime()` (natives extraction +
// `KOBATO_NATIVES_DIR` for the redirected native loads) completes before
// sharp / @napi-rs/canvas run their module-scope platform detection.
// No-op outside SEA mode (dev, vitest, `node ./build/server/index.js`).

import { bootstrapSeaRuntime } from '@/server/infra/sea-natives'

bootstrapSeaRuntime()
