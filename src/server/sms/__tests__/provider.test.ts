import { isTestPhone, readSmsSettings, routeFor } from "../provider";

const TWILIO = {
  TWILIO_ACCOUNT_SID: "AC0",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_VERIFY_SERVICE_SID: "VA0",
};
const FICTIONAL = "+12025550101";
const REAL = "+14155551234";

describe("routeFor", () => {
  it("never shows codes on screen in production, even for test numbers", () => {
    const settings = readSmsSettings("production", { ...TWILIO, TEST_PHONE_ALLOWLIST: REAL });
    expect(isTestPhone(settings, FICTIONAL)).toBe(false);
    expect(routeFor(settings, FICTIONAL)).toBe("twilio");
    expect(routeFor(settings, REAL)).toBe("twilio");
  });

  it("refuses everyone in production when Twilio is not configured", () => {
    const settings = readSmsSettings("production", {});
    expect(routeFor(settings, REAL)).toBe("unavailable");
    expect(routeFor(settings, FICTIONAL)).toBe("unavailable");
  });

  it("gives test numbers nothing on staging unless a secret code is set", () => {
    const open = readSmsSettings("staging", {});
    expect(isTestPhone(open, FICTIONAL)).toBe(false);
    expect(routeFor(open, FICTIONAL)).toBe("unavailable");

    const secured = readSmsSettings("staging", { TEST_LOGIN_CODE: "482916" });
    expect(routeFor(secured, FICTIONAL)).toBe("dev");
    // A malformed code counts as not set.
    expect(readSmsSettings("staging", { TEST_LOGIN_CODE: "abc" }).testLoginCode).toBeNull();
  });

  it("uses the dev provider for test numbers on previews", () => {
    const settings = readSmsSettings("preview", {
      ...TWILIO,
      TEST_PHONE_ALLOWLIST: "415-555-1234",
    });
    expect(routeFor(settings, FICTIONAL)).toBe("dev");
    expect(routeFor(settings, REAL)).toBe("dev");
    expect(routeFor(settings, "+14155559999")).toBe("twilio");
  });

  it("refuses real numbers outside production when Twilio is not configured", () => {
    const settings = readSmsSettings("preview", {});
    expect(routeFor(settings, REAL)).toBe("unavailable");
    expect(routeFor(settings, FICTIONAL)).toBe("dev");
  });

  it("needs all three Twilio values", () => {
    expect(readSmsSettings("staging", { TWILIO_ACCOUNT_SID: "AC0" }).twilio).toBeNull();
  });
});
