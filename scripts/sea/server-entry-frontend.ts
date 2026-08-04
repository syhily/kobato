// Frontend SEA server entry — the injected `main` of the frontend
// single-executable binary (`mainFormat: "module"`; see
// scripts/sea/build.ts). vite bundles this module into
// `dist-sea/intermediates-frontend/server.mjs`.
//
// The evaluation-order contract the binary relies on (ESM evaluates the
// import graph depth-first in import order; rolldown preserves it):
//
//   1. `scripts/sea/frontend-cli` — argv handling: --version/--help exit
//      with zero side effects. Flag invocations never reach the server
//      graph.
//   2. the public server graph (`apps/public/build/server/index.js`) —
//      the react-router production server. No sea-bootstrap step: the
//      frontend binary carries no native libraries (no extraction, no
//      KOBATO_NATIVES_DIR).
//
// A filesystem `import()` is forbidden in the injected script, so the
// server graph is a static import — it is all one bundle.

import './frontend-cli'
import '../../apps/public/build/server/index.js'
