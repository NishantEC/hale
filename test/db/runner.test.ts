import fs from "fs"
import path from "path"

describe("db runner + generated migrations", () => {
  const root = path.resolve(__dirname, "..", "..")

  it("ships a generated migration journal", () => {
    const journal = path.resolve(root, "app", "services", "db", "migrations", "meta", "_journal.json")
    expect(fs.existsSync(journal)).toBe(true)
    const parsed = JSON.parse(fs.readFileSync(journal, "utf8"))
    expect(parsed.entries.length).toBeGreaterThan(0)
  })

  it("db/index.ts exposes openDatabase, runMigrations, wipeDatabase", () => {
    const src = fs.readFileSync(
      path.resolve(root, "app", "services", "db", "index.ts"),
      "utf8",
    )
    expect(src).toContain("export function openDatabase")
    expect(src).toContain("export async function runMigrations")
    expect(src).toContain("export async function wipeDatabase")
    expect(src).toContain("SQLite.openDatabaseSync")
    expect(src).toContain("drizzle(")
  })
})
