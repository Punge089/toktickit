import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, validatePasswordPolicy } from "../../src/lib/password.js";

// docs/lab-03/tests.md UNIT-01, UNIT-02 — specification.md BR-07, BR-08.
describe("validatePasswordPolicy", () => {
  it("accepts a compliant password", () => {
    expect(validatePasswordPolicy("Good-Pass1")).toEqual([]);
  });

  it("rejects a password missing each rule individually", () => {
    expect(validatePasswordPolicy("short1!A")).toEqual([]); // 8 chars, all rules met — sanity check
    expect(validatePasswordPolicy("nouppercase1!")).toContain("Password must include an uppercase letter.");
    expect(validatePasswordPolicy("NOLOWERCASE1!")).toContain("Password must include a lowercase letter.");
    expect(validatePasswordPolicy("NoDigitsHere!")).toContain("Password must include a digit.");
    expect(validatePasswordPolicy("NoSpecial123")).toContain("Password must include a special character.");
    expect(validatePasswordPolicy("Short1!")).toContain("Password must be 8-72 characters.");
    expect(validatePasswordPolicy("A1!" + "a".repeat(70))).toContain("Password must be 8-72 characters.");
  });
});

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("Correct-Horse1!");
    expect(hash).not.toContain("Correct-Horse1!"); // never the plaintext
    expect(await verifyPassword("Correct-Horse1!", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never verifies true against a null stored hash", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const a = await hashPassword("Same-Password1!");
    const b = await hashPassword("Same-Password1!");
    expect(a).not.toBe(b);
    expect(await verifyPassword("Same-Password1!", a)).toBe(true);
    expect(await verifyPassword("Same-Password1!", b)).toBe(true);
  });
});
