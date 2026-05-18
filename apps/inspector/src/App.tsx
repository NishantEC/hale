import { useState } from "react"

import { signOut, tokenStorage } from "./api"
import { Inspector } from "./screens/Inspector"
import { SignIn } from "./screens/SignIn"

export default function App() {
  const [token, setToken] = useState(tokenStorage.get)

  if (!token) return <SignIn onAuthed={setToken} />
  return (
    <Inspector
      token={token}
      onLogout={() => {
        void signOut(token)
        tokenStorage.clear()
        setToken("")
      }}
    />
  )
}
