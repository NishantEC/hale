// Jest mock for @op-engineering/op-sqlite. The real module requires native
// bindings (RN turbomodule) that aren't available in the Node/Jest test
// environment. Production DB tests run against better-sqlite3 via
// test/db/helpers.ts; this mock just keeps module-init imports from
// throwing for any code path that statically imports from
// "@op-engineering/op-sqlite" but isn't actually exercised in tests.

const noop = () => {}

function makeStubDb() {
  return {
    execute: jest.fn(async () => ({ rows: { _array: [] }, rowsAffected: 0 })),
    executeSync: jest.fn(() => ({ rows: { _array: [] }, rowsAffected: 0 })),
    executeBatch: jest.fn(async () => ({ rowsAffected: 0 })),
    transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb({})),
    close: jest.fn(noop),
    delete: jest.fn(noop),
    getDbPath: jest.fn(() => ":memory:"),
    attach: jest.fn(noop),
    detach: jest.fn(noop),
    reactiveExecute: jest.fn(noop),
  }
}

export const open = jest.fn(() => makeStubDb())
export const moveAssetsDatabase = jest.fn(async () => true)
export const isLibsql = jest.fn(() => false)
export const isSQLCipher = jest.fn(() => false)
export const isIOSEmbedded = jest.fn(() => false)

export type DB = ReturnType<typeof makeStubDb>

export default { open, moveAssetsDatabase, isLibsql, isSQLCipher, isIOSEmbedded }
