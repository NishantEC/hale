import { useCallback, useState } from "react"

export function useExpertMode() {
  const [expert, setExpert] = useState(false)
  const handleLongPress = useCallback(() => {
    setExpert((v) => !v)
  }, [])
  return { expert, handleLongPress }
}
