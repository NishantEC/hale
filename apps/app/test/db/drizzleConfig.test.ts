import fs from "fs"
import path from "path"

describe("drizzle-kit configuration", () => {
  const root = path.resolve(__dirname, "..", "..")

  it("exists at ./drizzle.config.ts and targets expo sqlite", () => {
    const cfg = path.resolve(root, "drizzle.config.ts")
    expect(fs.existsSync(cfg)).toBe(true)
    const src = fs.readFileSync(cfg, "utf8")
    expect(src).toContain('dialect: "sqlite"')
    expect(src).toContain('driver: "expo"')
    expect(src).toContain("./app/services/db/schema.ts")
    expect(src).toContain("./app/services/db/migrations")
  })

  it("declares the runtime and devtool packages + db:generate script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(root, "package.json"), "utf8"))
    expect(pkg.dependencies["@op-engineering/op-sqlite"]).toBeDefined()
    expect(pkg.dependencies["drizzle-orm"]).toBeDefined()
    expect(pkg.devDependencies["drizzle-kit"]).toBeDefined()
    expect(pkg.scripts["db:generate"]).toBe("drizzle-kit generate")
  })
})
