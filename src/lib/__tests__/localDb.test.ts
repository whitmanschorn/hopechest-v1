import { databaseHost, isLocalDatabase } from "../localDb";

describe("isLocalDatabase", () => {
  it("accepts the local Docker database", () => {
    expect(isLocalDatabase("postgresql://postgres:hopechest@localhost:54329/hopechest")).toBe(true);
    expect(isLocalDatabase("postgres://u:p@127.0.0.1/db")).toBe(true);
  });

  it("rejects hosted databases, look-alikes and junk", () => {
    expect(isLocalDatabase("postgresql://u:p@ep-cool-name.us-east-1.aws.neon.tech/neondb")).toBe(
      false,
    );
    expect(isLocalDatabase("postgresql://u:p@localhost.example.com/db")).toBe(false);
    expect(isLocalDatabase("https://localhost/db")).toBe(false);
    expect(isLocalDatabase("")).toBe(false);
    expect(isLocalDatabase(undefined)).toBe(false);
  });
});

describe("databaseHost", () => {
  it("names the host without the password", () => {
    expect(databaseHost("postgresql://u:secret@db.example.com/x")).toBe("db.example.com");
    expect(databaseHost(undefined)).toBe("(none)");
  });
});
