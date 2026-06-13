// Local type shim for `pg-copy-streams` v7.
//
// The published `@types/pg-copy-streams` package targets runtime v1 and is
// four majors stale. Kobato only uses `from()` (COPY FROM STDIN) in
// `src/server/infra/db/copy-batcher.ts`, but the v7 module also exports
// `to()` and `both()`, so we declare the full surface to keep the shim
// accurate against the runtime's `index.js`.
//
// The returned streams extend Node's `Writable`/`Readable` AND implement
// `pg`'s `Submittable` interface (a `submit(connection)` method), which is
// how `client.query(copyFrom(...))` discovers and drives them.
//
// Upstream API reference: https://github.com/brianc/node-pg-copy-streams

declare module 'pg-copy-streams' {
  import type { Readable, ReadableOptions, Writable, WritableOptions } from 'node:stream'
  import type { Connection, Submittable } from 'pg'

  /**
   * A COPY FROM STDIN stream. Rows piped into the `Writable` side are
   * streamed to PostgreSQL via the bound `pg` connection. Used by
   * `CopyBatcher` to bulk-insert analytics + audit events.
   */
  export class CopyStreamQuery extends Writable implements Submittable {
    /** The COPY SQL text passed to `from()`. */
    readonly text: string
    /** Number of rows PostgreSQL reports as inserted. */
    rowCount: number
    /** Called by `pg` once the query is submitted on a connection. */
    submit(connection: Connection): void
  }

  /**
   * A COPY TO STDOUT stream. Data read from PostgreSQL is pushed out the
   * `Readable` side. Declared for completeness; not currently used by Kobato.
   */
  export class CopyToStreamQuery extends Readable implements Submittable {
    readonly text: string
    rowCount: number
    submit(connection: Connection): void
  }

  /**
   * Run `COPY ... FROM STDIN`. Returns a {@link CopyStreamQuery} that rows
   * are piped into and that is itself passable to `client.query(...)`.
   *
   * `options` is forwarded to Node's `Writable` constructor.
   */
  export function from(sqlText: string, options?: WritableOptions): CopyStreamQuery

  /**
   * Run `COPY ... TO STDOUT`. Returns a {@link CopyToStreamQuery} whose
   * `Readable` side yields the result.
   *
   * `options` is forwarded to Node's `Readable` constructor.
   */
  export function to(sqlText: string, options?: ReadableOptions): CopyToStreamQuery
}
