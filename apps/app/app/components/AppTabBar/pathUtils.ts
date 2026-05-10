export function isJournalEntryPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  if (pathname === "/journal-entry") return true
  if (pathname.startsWith("/journal-entry/")) return true
  return false
}
