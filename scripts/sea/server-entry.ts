// SEA server entry — the injected `main` of the single-executable binary.
// Import order is the bootstrap order: sea-cli argv handling, then
// sea-bootstrap native extraction, then the server graph — all one static
// import (a filesystem `import()` is forbidden in the injected script).

import '@/server/infra/sea-cli'
import '@/server/infra/sea-bootstrap'
import '../../build/server/index.js'
