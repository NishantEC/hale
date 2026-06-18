import { Redirect } from "expo-router"

// Serverless app: no login gate — boot straight into the main UI. The
// device-local identity is resolved in AuthProvider at startup.
export default function IndexRoute() {
  return <Redirect href="/(app)/(tabs)" />
}
