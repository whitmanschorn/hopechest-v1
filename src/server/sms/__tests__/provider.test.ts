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

  it("uses the dev provider for test numbers on staging and previews", () => {
    const settings = readSmsSettings("staging", {
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
