import { Redirect } from "expo-router"

import { useAuth } from "@/context/AuthContext"

export default function IndexRoute() {
  const { isAuthenticated } = useAuth()

  return <Redirect href={isAuthenticated ? "/(app)/(tabs)" : "/(auth)/login"} />
}
