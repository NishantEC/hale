import type { DateSwitcherProps } from "./DateSwitcher"
import { DateSwitcher } from "./DateSwitcher"

// Temporarily delegates to DateSwitcher while the @expo/ui ContextMenu
// experiment is validated against the native build. Real implementation
// re-added once the link error is resolved.
export function NativeDateSwitcher(props: DateSwitcherProps) {
  return <DateSwitcher {...props} />
}
