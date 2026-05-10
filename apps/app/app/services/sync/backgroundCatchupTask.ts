import * as BackgroundTask from "expo-background-task"
import * as TaskManager from "expo-task-manager"
import { runBackgroundDrain } from "./backgroundSync"

export const CATCHUP_TASK_NAME = "noop-strap-catchup-sync"

TaskManager.defineTask(CATCHUP_TASK_NAME, async () => {
  try {
    const result = await runBackgroundDrain(25_000)
    return result.ok
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed
  } catch (err) {
    console.warn("[bg-catchup] task failed", err)
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
