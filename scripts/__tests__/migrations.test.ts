import { checkMigrations } from "../lib/migrations";

const init = { name: "20261111000000_init", sql: 'CREATE TABLE "people" ();' };

describe("checkMigrations", () => {
  it("accepts additive migrations", () => {
    const next = {
      name: "20261201120000_add_bio",
      sql: 'ALTER TABLE "people" ADD COLUMN "bio" TEXT;',
    };
    expect(checkMigrations([init, next], [init.name])).toEqual([]);
  });

  it("accepts a new migration dated before the latest merged one", () => {
    // Two pull requests written in parallel must not block each other.
    const merged = { name: "20261205000000_later", sql: "CREATE TABLE a ();" };
    const mine = { name: "20261203000000_earlier", sql: "CREATE TABLE b ();" };
    expect(checkMigrations([init, mine, merged], [init.name, merged.name])).toEqual([]);
  });

  it("rejects two migrations with the same timestamp", () => {
    const clash = { name: "20261111000000_other", sql: "CREATE TABLE c ();" };
    expect(checkMigrations([init, clash], [init.name])[0]).toMatch(/same timestamp/);
  });

  it("rejects badly named migrations", () => {
    expect(checkMigrations([{ name: "add-bio", sql: "" }], [])[0]).toMatch(/name must be/);
  });

  it("rejects new migrations that drop or rewrite, unless they explain why", () => {
    const drop = { name: "20261201120000_drop", sql: 'ALTER TABLE "people" DROP COLUMN "bio";' };
    expect(checkMigrations([init, drop], [init.name])[0]).toMatch(/removes or rewrites/);

    const explained = { ...drop, sql: `-- destructive: bio moved to notes in #40\n${drop.sql}` };
    expect(checkMigrations([init, explained], [init.name])).toEqual([]);
  });

  it("ignores destructive words inside comments", () => {
    const next = {
      name: "20261201120000_note",
      sql: "-- we never DROP TABLE here\nCREATE TABLE d ();",
    };
    expect(checkMigrations([init, next], [init.name])).toEqual([]);
  });

  it("does not re-judge migrations that are already merged", () => {
    const old = { name: "20261101000000_old", sql: "DROP TABLE legacy;" };
    expect(checkMigrations([old, init], [old.name, init.name])).toEqual([]);
  });

  it("rejects editing or deleting merged migrations", () => {
    expect(checkMigrations([init], [init.name], [init.name])[0]).toMatch(/must not be edited/);
    expect(checkMigrations([], [init.name])[0]).toMatch(/must not be deleted/);
  });
});
