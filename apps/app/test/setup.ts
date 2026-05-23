// we always make sure 'react-native' gets included first
// eslint-disable-next-line no-restricted-imports
import * as ReactNative from "react-native"

import mockFile from "./mockFile"

// libraries to mock
jest.doMock("react-native", () => {
  // Extend ReactNative
  return Object.setPrototypeOf(
    {
      Image: {
        ...ReactNative.Image,
        resolveAssetSource: jest.fn((_source) => mockFile), // eslint-disable-line @typescript-eslint/no-unused-vars
        getSize: jest.fn(
          (
            uri: string, // eslint-disable-line @typescript-eslint/no-unused-vars
            success: (width: number, height: number) => void,
            failure?: (_error: any) => void, // eslint-disable-line @typescript-eslint/no-unused-vars
          ) => success(100, 100),
        ),
      },
    },
    ReactNative,
  )
})

// react-native-reanimated + react-native-worklets fail to initialize under
// jest ("Native part of Worklets doesn't seem to be initialized"). The
// shipped reanimated/mock pulls worklets in transitively so it's not enough
// — we replace both modules with inert stubs sufficient for component tests
// that just need useSharedValue / useAnimatedStyle / withTiming / runOnJS
// not to throw.
jest.mock("react-native-worklets", () => ({}))
jest.mock("react-native-reanimated", () => {
  const View = require("react-native").View
  return {
    __esModule: true,
    default: { View, ScrollView: View, createAnimatedComponent: (c: unknown) => c },
    View,
    ScrollView: View,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useAnimatedScrollHandler: () => () => {},
    withTiming: (v: unknown, _opts?: unknown, cb?: (finished: boolean) => void) => {
      if (cb) cb(true)
      return v
    },
    withSpring: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
    Easing: { inOut: () => () => 0, out: () => () => 0, ease: () => 0, linear: () => 0 },
  }
})

// op-sqlite is a native turbomodule; it can't load under Jest. The manual
// mock at __mocks__/@op-engineering/op-sqlite.ts ships a fully-stubbed
// `open()` so any test that transitively imports app/services/db/index.ts
// doesn't crash at module-init. DB tests still run against better-sqlite3
// via test/db/helpers.ts.
jest.mock("@op-engineering/op-sqlite")

jest.mock("react-native-gesture-handler", () => {
  const actual = jest.requireActual("react-native-gesture-handler")
  const React = require("react")
  const chainable: any = new Proxy(() => chainable, { get: () => () => chainable })
  return {
    ...actual,
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: new Proxy({}, { get: () => () => chainable }),
  }
})

jest.mock("i18next", () => ({
  currentLocale: "en",
  t: (key: string, params: Record<string, string>) => {
    return `${key} ${JSON.stringify(params)}`
  },
  translate: (key: string, params: Record<string, string>) => {
    return `${key} ${JSON.stringify(params)}`
  },
}))

jest.mock("expo-localization", () => ({
  ...jest.requireActual("expo-localization"),
  getLocales: () => [{ languageTag: "en-US", textDirection: "ltr" }],
}))

jest.mock("../app/i18n/index.ts", () => ({
  i18n: {
    isInitialized: true,
    language: "en",
    t: (key: string, params: Record<string, string>) => {
      return `${key} ${JSON.stringify(params)}`
    },
    numberToCurrency: jest.fn(),
  },
}))

declare const tron // eslint-disable-line @typescript-eslint/no-unused-vars

declare global {
  let __TEST__: boolean
}
