import { getChestConfig, isProduction } from "../chest";

describe("getChestConfig", () => {
  it("defaults to the Bluth development chest", () => {
    expect(getChestConfig({})).toEqual({ env: "development", name: "Bluth family", slug: "bluth" });
  });

  it("reads the family from the environment", () => {
    const config = getChestConfig({
      HOPECHEST_ENV: "production",
      CHEST_NAME: " Schorn family ",
      CHEST_SLUG: "schorn",
    });
    expect(config).toEqual({ env: "production", name: "Schorn family", slug: "schorn" });
    expect(isProduction(config)).toBe(true);
  });

  it("refuses production without a named family", () => {
    expect(() => getChestConfig({ HOPECHEST_ENV: "production" })).toThrow(/CHEST_NAME/);
  });

  it("rejects unknown environments and bad slugs", () => {
    expect(() => getChestConfig({ HOPECHEST_ENV: "prod" })).toThrow(/HOPECHEST_ENV/);
    expect(() => getChestConfig({ CHEST_SLUG: "Schorn Family" })).toThrow(/CHEST_SLUG/);
  });
});
