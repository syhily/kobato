// SEA server entry — the injected `main` of the single-executable binary
// (`mainFormat: "module"`; see scripts/sea/build.ts). vite bundles this
// module into `dist-sea/intermediates/server.mjs`.
//
// The evaluation-order contract the binary relies on (ESM evaluates the
// import graph depth-first in import order; rolldown preserves it):
//
//   1. `@/server/infra/sea-cli`       — argv handling: --version/--help
//                                       exit with zero side effects;
//                                       --smoke-natives/--smoke-worker
//                                       bootstrap + run + exit. Flag
//                                       invocations never reach 2 or 3.
//   2. `@/server/infra/sea-bootstrap` — extracts the native libraries and
//                                       sets `KOBATO_NATIVES_DIR` (no-op
//                                       outside SEA) BEFORE …
//   3. the server graph               — … any native-package module
//                                       (sharp, @napi-rs/canvas) runs its
//                                       module-scope platform detection.
//
// A filesystem `import()` is forbidden in the injected script, so the
// server graph is a static import — it is all one bundle.

import '@/server/infra/sea-cli'
import '@/server/infra/sea-bootstrap'
import '../../build/server/index.js'
