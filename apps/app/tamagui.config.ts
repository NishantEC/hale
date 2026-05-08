import { defaultConfig } from "@tamagui/config/v4"
import { createTamagui } from "tamagui"

const appConfig = createTamagui(defaultConfig)

export type AppConfig = typeof appConfig
declare module "tamagui" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface TamaguiCustomConfig extends AppConfig {}
}

export default appConfig
