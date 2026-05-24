// Expo background task — used as the catch-up drain path when the app is
// NOT holding a live BLE link. The OS schedules this opportunistically at
// minimumInterval=15 minutes.
//
// MUTUALLY EXCLUSIVE with `androidForegroundService.ts` (RN-background-actions
// every 30s). While we're connected to a strap on Android we run the FGS path
// because the OS needs the foreground service to keep BLE alive; the FGS
// start/stop hooks call `unregisterBackgroundCatchupTask()` /
// `registerBackgroundCatchupTask()` so only one path is live at a time.
// Without this, both paths can fire at the same moment and the drain lock
// (db/schema.ts:drainLock) is the only thing preventing a double-POST — fine
// as a safety net, wrong as the OS pattern.
import * as BackgroundTask from "expo-background-task"
import * as TaskManager from "expo-task-manager"
import { runBackgroundDrain } from "./backgroundSync"

export const CATCHUP_TASK_NAME = "noop-strap-catchup-sync"

TaskManager.defineTask(CATCHUP_TASK_NAME, async () => {
  // Per Apple's BGTaskScheduler contract, Failed deprioritizes future grants.
  // "No session" and "drain ran with POST errors" are not task-level failures —
  // the task did its work, the data just didn't move. Only an uncaught throw
  // counts as Failed; drainLoop's own outcome (failed/error) is captured via
  // recordDrainOutcome telemetry, not via the OS result.
  try {
    await runBackgroundDrain(25_000)
    return BackgroundTask.BackgroundTaskResult.Success
  } catch (err) {
    console.warn("[bg-catchup] task threw", err)
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

export async function registerBackgroundCatchupTask(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync()
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return
  const isRegistered = await TaskManager.isTaskRegisteredAsync(CATCHUP_TASK_NAME)
  if (isRegistered) return
  await BackgroundTask.registerTaskAsync(CATCHUP_TASK_NAME, {
    minimumInterval: 15,
  })
}

export async function unregisterBackgroundCatchupTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(CATCHUP_TASK_NAME)
  if (!isRegistered) return
  await BackgroundTask.unregisterTaskAsync(CATCHUP_TASK_NAME)
}
