import journal from "./meta/_journal.json"

type Entry = { idx: number; version: string; when: number; tag: string }
type Journal = { version: string; dialect: string; entries: Entry[] }

describe("_journal.json", () => {
  const j = journal as Journal
  const entries = j.entries

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

  it("top-level version is the drizzle-kit journal format version (7)", () => {
    // drizzle-kit 0.31.x writes the JOURNAL format version at the top level
    // (snapshotVersion = "7" in bin.cjs:5601) and the per-entry SNAPSHOT
    // version inside each entry (for sqlite the dialect snapshot version is
    // "6" in bin.cjs:8144). These intentionally differ — top-level "7" and
    // per-entry "6" is correct, not a bug. This assertion exists so a
    // well-meaning hand-edit doesn't "reconcile" them and silently break
    // future drizzle-kit reads.
    expect(j.version).toBe("7")
    expect(j.dialect).toBe("sqlite")
  })

  it("all entries share the same snapshot version", () => {
    const versions = new Set(entries.map((e) => e.version))
    expect(versions.size).toBe(1)
    expect(entries[0].version).toBe("6")
  })
})
