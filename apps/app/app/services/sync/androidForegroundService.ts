// react-native-background-actions foreground service — used while a BLE link
// is alive. Android requires a visible foreground service of type
// `connectedDevice` to keep BLE notifications flowing when the app is
// backgrounded. This service exists purely to hold that foreground
// notification open for the lifetime of the connection; it performs no
// work of its own.
import { Platform } from "react-native"
import BackgroundService from "react-native-background-actions"
import { delay } from "../../utils/delay"

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
  const intervalMs = taskParams?.delay ?? TASK_INTERVAL_MS
  // Keep the task promise unresolved while the foreground service is
  // running. The visible connectedDevice foreground notification is what
  // keeps BLE alive in the background — this loop only needs to stay
  // resident until stop() tears the service down.
  while (BackgroundService.isRunning()) {
    await delay(intervalMs)
  }
}

export async function startAndroidForegroundService(): Promise<void> {
  if (Platform.OS !== "android") return
  if (BackgroundService.isRunning()) return
  await BackgroundService.start(veryLongTask, options as never)
}

export async function stopAndroidForegroundService(): Promise<void> {
  if (Platform.OS !== "android") return
  if (!BackgroundService.isRunning()) return
  await BackgroundService.stop()
}
