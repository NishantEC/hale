// react-native-background-actions foreground service — used while a BLE link
// is alive. Android requires a visible foreground service of type
// `connectedDevice` to keep BLE notifications flowing when the app is
// backgrounded; this loop runs every 30s and drains the outbound queue.
//
// MUTUALLY EXCLUSIVE with `backgroundCatchupTask.ts` (expo-background-task,
// 15-min OS-scheduled). Start unregisters the catchup task, stop re-registers
// it, so only one of the two paths is active at any moment. The drain lock
// (db/schema.ts:drainLock) is the last-resort safety net for the brief window
// between these two transitions.
import { Platform } from "react-native"
import BackgroundService from "react-native-background-actions"
import { runBackgroundDrain } from "./backgroundSync"
import {
  registerBackgroundCatchupTask,
  unregisterBackgroundCatchupTask,
} from "./backgroundCatchupTask"

const TASK_INTERVAL_MS = 30_000

const options = {
  taskName: "noop-strap-sync",
  taskTitle: "Noop is syncing your strap",
  taskDesc: "Keeping your sleep and recovery data up to date",
  taskIcon: { name: "ic_launcher", type: "mipmap" },
  linkingURI: "app://",
  parameters: { delay: TASK_INTERVAL_MS },
  foregroundServiceType: ["connectedDevice"],
} as const

const veryLongTask = async (taskParams?: { delay?: number }) => {
  const delay = taskParams?.delay ?? TASK_INTERVAL_MS
  while (BackgroundService.isRunning()) {
    try {
      await runBackgroundDrain(20_000)
    } catch (err) {
      console.warn("[android-fgs] drain iteration failed", err)
    }
    await new Promise((r) => setTimeout(r, delay))
  }
}

export async function startAndroidForegroundService(): Promise<void> {
  if (Platform.OS !== "android") return
  if (BackgroundService.isRunning()) return
  // Suppress the expo-background-task catch-up path while the FGS is live:
  // the two paths would otherwise race on the same outbound rows.
  await unregisterBackgroundCatchupTask().catch((err) =>
    console.warn("[android-fgs] unregister catchup failed", err),
  )
  await BackgroundService.start(veryLongTask, options as never)
}

export async function stopAndroidForegroundService(): Promise<void> {
  if (Platform.OS !== "android") return
  if (!BackgroundService.isRunning()) return
  await BackgroundService.stop()
  // Re-enable the OS-scheduled catch-up path so a backgrounded, disconnected
  // app can still drain its queue every ~15 minutes.
  await registerBackgroundCatchupTask().catch((err) =>
    console.warn("[android-fgs] re-register catchup failed", err),
  )
}
