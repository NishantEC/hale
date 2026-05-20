// syncStoreBridge — the eventual home for any subscription that pushes
// SyncService / sync-pipeline events into syncStore.
//
// Today's situation: SyncService (apps/app/app/services/sync/SyncService.ts)
// is a pure interval-driven drain/pull scheduler and emits no events. All
// sync-state mutations (isSyncing, syncStage, syncProgress, …) are written
// directly from BleContext.syncNow into syncStore via the mutators exported
// from ./syncStore. There is therefore nothing for this bridge to subscribe
// to today, and initSyncStoreBridge() is a no-op.
//
// Why keep the file: when SyncService grows an event surface (or when we
// move syncNow itself into a SyncService method that emits state changes),
// the subscription code lands here next to initBleStoreBridge so the
// architectural mirror remains obvious. Until then, this file exists to
// document that lifecycle and to give src/app/_layout.tsx a symmetric
// `initSyncStoreBridge()` call alongside `initBleStoreBridge()`.

let initialized = false

export function initSyncStoreBridge(): () => void {
  if (initialized) return () => {}
  initialized = true
  // No-op today. See file header.
  return () => {
    initialized = false
  }
}
