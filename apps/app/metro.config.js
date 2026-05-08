/* eslint-env node */
// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config")

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

config.transformer.getTransformOptions = async () => ({
  transform: {
    // Inline requires are very useful for deferring loading of large dependencies/components.
    // For example, we use it in app.tsx to conditionally load Reactotron.
    // However, this comes with some gotchas.
    // Read more here: https://reactnative.dev/docs/optimizing-javascript-loading
    // And here: https://github.com/expo/expo/issues/27279#issuecomment-1971610698
    inlineRequires: true,
  },
})

// This is a temporary fix that helps fixing an issue with axios/apisauce.
// See the following issues in Github for more details:
// https://github.com/infinitered/apisauce/issues/331
// https://github.com/axios/axios/issues/6899
// The solution was taken from the following issue:
// https://github.com/facebook/metro/issues/1272
config.resolver.unstable_conditionNames = ["require", "default", "browser"]

// Tamagui v2-RC ships `.native.js` files whose internal imports use an
// explicit `.native.js` extension. Metro's default resolver treats `.native`
// as a platform suffix and strips it, which breaks those imports. Enabling
// package-exports resolution makes Metro follow the `react-native` export
// condition correctly and resolves the internal paths as-is.
config.resolver.unstable_enablePackageExports = true

// This helps support certain popular third-party libraries
// such as Firebase that use the extension cjs.
config.resolver.sourceExts.push("cjs")

module.exports = config
