import { Platform } from "react-native"
import BackgroundService from "react-native-background-actions"
import { runBackgroundDrain } from "./backgroundSync"

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
  await BackgroundService.start(veryLongTask, options as never)
}

export async function stopAndroidForegroundService(): Promise<void> {
  if (Platform.OS !== "android") return
  if (!BackgroundService.isRunning()) return
  await BackgroundService.stop()
}
