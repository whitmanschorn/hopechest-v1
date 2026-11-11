// The generated client is not loadable under Jest, and is not what is being tested.
jest.mock("@/generated/prisma/client", () => ({ PrismaClient: class {} }));
jest.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));

import { getDb } from "../db";

const HOSTED = "postgresql://user:secret@ep-example.us-east-1.aws.neon.tech/neondb";
const LOCAL = "postgresql://postgres:hopechest@localhost:54329/hopechest";
const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
  delete (globalThis as { hopechestDb?: unknown }).hopechestDb;
});

describe("getDb", () => {
  it("refuses a hosted database in development, without leaking the password", () => {
    process.env.HOPECHEST_ENV = "development";
    process.env.DATABASE_URL = HOSTED;
    expect(() => getDb()).toThrow(/points at ep-example\.us-east-1\.aws\.neon\.tech/);
    expect(() => getDb()).not.toThrow(/secret/);
  });

  it("treats a missing HOPECHEST_ENV as development", () => {
    delete process.env.HOPECHEST_ENV;
    process.env.DATABASE_URL = HOSTED;
    expect(() => getDb()).toThrow(/Development must use the local database/);
  });

  it("allows the local database in development and a hosted one on staging", () => {
    process.env.HOPECHEST_ENV = "development";
    process.env.DATABASE_URL = LOCAL;
    expect(getDb()).toBeDefined();
    delete (globalThis as { hopechestDb?: unknown }).hopechestDb;
    process.env.HOPECHEST_ENV = "staging";
    process.env.DATABASE_URL = HOSTED;
    expect(getDb()).toBeDefined();
  });
});
