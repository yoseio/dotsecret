import { assertEquals } from "@std/assert";
import { maskEnv, maskValue, OutputMasker, shouldMaskKey } from "../core/security/mask.ts";

Deno.test("maskValue - on mode", () => {
  assertEquals(maskValue("secret123", "on"), "***MASKED***");
  assertEquals(maskValue("a", "on"), "***MASKED***");
  assertEquals(maskValue("very long secret value", "on"), "***MASKED***");
  assertEquals(maskValue("", "on"), "***MASKED***");
});

Deno.test("maskValue - off mode", () => {
  assertEquals(maskValue("secret123", "off"), "secret123");
  assertEquals(maskValue("plaintext", "off"), "plaintext");
  assertEquals(maskValue("", "off"), "");
});

Deno.test("maskValue - partial mode", () => {
  // Long values show first and last 4 chars
  assertEquals(maskValue("1234567890abcdef", "partial"), "1234...cdef");
  assertEquals(maskValue("this-is-a-long-secret-value", "partial"), "this...alue");

  // Short values are fully masked
  assertEquals(maskValue("short", "partial"), "***MASKED***");
  assertEquals(maskValue("12345678", "partial"), "***MASKED***"); // Exactly 8 chars
  assertEquals(maskValue("123456789", "partial"), "1234...6789"); // 9 chars shows partial
});

Deno.test("maskEnv - masks all values", () => {
  const env = {
    API_KEY: "secret-key-123",
    DATABASE_URL: "postgres://user:pass@host:5432/db",
    DEBUG: "true",
  };

  const masked = maskEnv(env, "on");
  assertEquals(masked.API_KEY, "***MASKED***");
  assertEquals(masked.DATABASE_URL, "***MASKED***");
  assertEquals(masked.DEBUG, "***MASKED***");

  const unmasked = maskEnv(env, "off");
  assertEquals(unmasked.API_KEY, "secret-key-123");
  assertEquals(unmasked.DATABASE_URL, "postgres://user:pass@host:5432/db");
  assertEquals(unmasked.DEBUG, "true");

  const partial = maskEnv(env, "partial");
  assertEquals(partial.API_KEY, "secr...-123");
  assertEquals(partial.DATABASE_URL, "post...2/db");
  assertEquals(partial.DEBUG, "***MASKED***"); // Too short
});

Deno.test("shouldMaskKey - identifies sensitive keys", () => {
  // Should mask
  assertEquals(shouldMaskKey("PASSWORD"), true);
  assertEquals(shouldMaskKey("password"), true);
  assertEquals(shouldMaskKey("DB_PASSWORD"), true);
  assertEquals(shouldMaskKey("SECRET"), true);
  assertEquals(shouldMaskKey("secret_key"), true);
  assertEquals(shouldMaskKey("API_SECRET"), true);
  assertEquals(shouldMaskKey("TOKEN"), true);
  assertEquals(shouldMaskKey("AUTH_TOKEN"), true);
  assertEquals(shouldMaskKey("API_KEY"), true);
  assertEquals(shouldMaskKey("PRIVATE_KEY"), true);
  assertEquals(shouldMaskKey("CREDENTIAL"), true);
  assertEquals(shouldMaskKey("AWS_SECRET_ACCESS_KEY"), true);

  // Should not mask (but we mask all values anyway in practice)
  assertEquals(shouldMaskKey("DEBUG"), false);
  assertEquals(shouldMaskKey("PORT"), false);
  assertEquals(shouldMaskKey("HOST"), false);
  assertEquals(shouldMaskKey("USER"), false);
  assertEquals(shouldMaskKey("LOG_LEVEL"), false);
});

Deno.test("OutputMasker - masks secrets in output", () => {
  const masker = new OutputMasker();

  masker.addSecret("API_KEY", "secret-123-key");
  masker.addSecret("PASSWORD", "my-password-456");
  masker.addSecret("SHORT", "ab"); // Too short, won't be added

  const output = `
    Connecting with API_KEY=secret-123-key
    Using password: my-password-456
    Short value: ab
    Other text that doesn't contain secrets
  `;

  const masked = masker.maskOutput(output);

  assertEquals(masked.includes("secret-123-key"), false);
  assertEquals(masked.includes("***API_KEY***"), true);
  assertEquals(masked.includes("my-password-456"), false);
  assertEquals(masked.includes("***PASSWORD***"), true);
  assertEquals(masked.includes("ab"), true); // Not masked (too short)
  assertEquals(masked.includes("Other text"), true);
});

Deno.test("OutputMasker - handles regex special characters", () => {
  const masker = new OutputMasker();

  masker.addSecret("REGEX", "test$123.456*end");

  const output = "Value is test$123.456*end in the output";
  const masked = masker.maskOutput(output);

  assertEquals(masked, "Value is ***REGEX*** in the output");
});

Deno.test("OutputMasker - clear secrets", () => {
  const masker = new OutputMasker();

  masker.addSecret("SECRET", "value123");
  assertEquals(masker.maskOutput("value123"), "***SECRET***");

  masker.clear();
  assertEquals(masker.maskOutput("value123"), "value123"); // No longer masked
});

Deno.test("OutputMasker - multiple occurrences", () => {
  const masker = new OutputMasker();

  masker.addSecret("TOKEN", "abc123");

  const output = "Token: abc123, repeated: abc123, and again abc123";
  const masked = masker.maskOutput(output);

  assertEquals(masked, "Token: ***TOKEN***, repeated: ***TOKEN***, and again ***TOKEN***");
});

Deno.test("OutputMasker - overlapping secrets", () => {
  const masker = new OutputMasker();

  masker.addSecret("KEY1", "secret123");
  masker.addSecret("KEY2", "123secret");

  const output = "Values: secret123 and 123secret and secret123secret";
  const masked = masker.maskOutput(output);

  // Should handle overlapping replacements gracefully
  assertEquals(masked.includes("secret123"), false);
  assertEquals(masked.includes("123secret"), false);
  assertEquals(masked.includes("***KEY1***"), true);
  assertEquals(masked.includes("***KEY2***"), true);
});
