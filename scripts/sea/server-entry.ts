// SEA server entry — the injected `main` of the single-executable binary.
// Import order is the bootstrap order: sea-cli argv handling, then
// sea-bootstrap native extraction, then the server graph — all one static
// import (a filesystem `import()` is forbidden in the injected script).

// Zod 4.5 auto-compilation first, so even the config-graph schemas constructed
// by sea-cli/sea-bootstrap get compiled on first parse.
import 'zod/compile'
import '@/server/infra/sea-cli'
import '@/server/infra/sea-bootstrap'
import '../../build/server/index.js'
