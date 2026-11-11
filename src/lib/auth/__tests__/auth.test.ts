import { formatPhone, isFictionalPhone, maskPhone, normalizePhone, parsePhoneList } from "../phone";
import { allows } from "../rateLimit";
import { hashesMatch, hashToken, randomCode, randomToken } from "../tokens";

describe("normalizePhone", () => {
  it("reads common US formats", () => {
    for (const text of ["(415) 555-0123", "415.555.0123", "1 415 555 0123", "+1 415-555-0123"]) {
      expect(normalizePhone(text)).toBe("+14155550123");
    }
  });

  it("keeps international numbers that carry a country code", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects things that are not phone numbers", () => {
    for (const text of ["", "555-0123", "hello", "+1", "12345678901234567"]) {
      expect(normalizePhone(text)).toBeNull();
    }
  });
});

describe("phone helpers", () => {
  it("formats and masks", () => {
    expect(formatPhone("+14155550123")).toBe("(415) 555-0123");
    expect(formatPhone("+442079460958")).toBe("+442079460958");
    expect(maskPhone("+14155550123")).toBe("•••• 0123");
  });

  it("recognises only the reserved fictional range", () => {
    expect(isFictionalPhone("+12025550101")).toBe(true);
    expect(isFictionalPhone("+12025551234")).toBe(false);
    expect(isFictionalPhone("+12025560101")).toBe(false);
  });

  it("parses lists and drops junk", () => {
    expect(parsePhoneList(" 4155550123, +12025550101 nope ")).toEqual([
      "+14155550123",
      "+12025550101",
    ]);
    expect(parsePhoneList(undefined)).toEqual([]);
  });
});

describe("tokens", () => {
  it("makes distinct tokens and stable hashes", () => {
    const token = randomToken();
    expect(token).not.toBe(randomToken());
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashesMatch(hashToken(token), hashToken(token))).toBe(true);
    expect(hashesMatch(hashToken(token), hashToken("other"))).toBe(false);
  });

  it("makes six-digit codes, keeping leading zeros", () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });
});

describe("rate limit", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const limit = { max: 3, windowMs: 60 * 60_000 };

  it("allows attempts under the limit", () => {
    expect(allows(limit, [minutesAgo(1), minutesAgo(2)], now)).toBe(true);
  });

  it("blocks once the limit is reached inside the window", () => {
    expect(allows(limit, [minutesAgo(1), minutesAgo(2), minutesAgo(3)], now)).toBe(false);
  });

  it("forgets attempts older than the window", () => {
    expect(allows(limit, [minutesAgo(1), minutesAgo(61), minutesAgo(90)], now)).toBe(true);
  });
});
