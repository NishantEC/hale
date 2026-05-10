import { isJournalEntryPath } from "./pathUtils"

describe("isJournalEntryPath", () => {
  it("matches the bare journal-entry route", () => {
    expect(isJournalEntryPath("/journal-entry")).toBe(true)
  })

  it("matches journal-entry with a trailing param segment", () => {
    expect(isJournalEntryPath("/journal-entry/123")).toBe(true)
  })

  it("does not match journal-history", () => {
    expect(isJournalEntryPath("/journal-history")).toBe(false)
  })

  it("does not match the home tab", () => {
    expect(isJournalEntryPath("/")).toBe(false)
  })

  it("does not match a partial prefix match", () => {
    expect(isJournalEntryPath("/journal-entry-list")).toBe(false)
  })

  it("treats null / undefined / empty as false", () => {
    expect(isJournalEntryPath(null)).toBe(false)
    expect(isJournalEntryPath(undefined)).toBe(false)
    expect(isJournalEntryPath("")).toBe(false)
  })
})
