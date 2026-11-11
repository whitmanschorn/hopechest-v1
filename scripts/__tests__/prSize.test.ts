import { measure } from "../lib/prSize";

describe("measure", () => {
  it("sums added and deleted lines", () => {
    expect(measure("10\t2\tsrc/a.ts\n3\t0\tsrc/b.ts\n").counted).toBe(15);
  });

  it("leaves out lockfiles, seed data, migrations SQL and binaries", () => {
    const report = measure(
      [
        "9000\t100\tpackage-lock.json",
        "500\t0\tseed/bluth/people.json",
        "40\t0\tprisma/migrations/20260101000000_init/migration.sql",
        "-\t-\tpublic/logo.png",
        "7\t1\tprisma/schema.prisma",
      ].join("\n"),
    );
    expect(report.counted).toBe(8);
    expect(report.excluded).toBe(9640);
  });

  it("lists the largest counted files first", () => {
    const report = measure("1\t0\tsmall.ts\n50\t0\tbig.ts\n");
    expect(report.largest[0]).toEqual({ path: "big.ts", lines: 50 });
  });
});
