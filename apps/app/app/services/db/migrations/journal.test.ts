import journal from "./meta/_journal.json"

type Entry = { idx: number; when: number; tag: string }

describe("_journal.json", () => {
  const entries = (journal as { entries: Entry[] }).entries

  it("has at least one entry", () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it("entries are strictly monotonic by `when`", () => {
    // Drizzle's op-sqlite migrator skips any entry whose `when` is <= the last
    // applied entry's `when` (strict <). A regressed `when` silently disables
    // the migration on every device that already ran a later one. This test
    // exists because that bug cost ~2 days of strap-sync downtime — never
    // again.
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1]
      const curr = entries[i]
      expect(curr.when).toBeGreaterThan(prev.when)
    }
  })

  it("idx is contiguous from 0", () => {
    entries.forEach((e, i) => {
      expect(e.idx).toBe(i)
    })
  })
})
