import { assertEquals, assertRejects } from "@std/assert";
import { getPipeRegistry } from "../core/pipes/index.ts";
import type { PipeContext } from "../core/types.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";

const mockContext: PipeContext = {
  policy: new DefaultPolicy(),
  audit: new NoOpAuditLogger(),
};

Deno.test("Pipe - trim", async () => {
  const pipes = getPipeRegistry();
  const trim = pipes.get("trim")!;

  assertEquals(await trim.apply("  hello  ", {}, mockContext), "hello");
  assertEquals(await trim.apply("\n\tworld\n\t", {}, mockContext), "world");
  assertEquals(await trim.apply("no-trim", {}, mockContext), "no-trim");
});

Deno.test("Pipe - upper", async () => {
  const pipes = getPipeRegistry();
  const upper = pipes.get("upper")!;

  assertEquals(await upper.apply("hello", {}, mockContext), "HELLO");
  assertEquals(await upper.apply("Hello World", {}, mockContext), "HELLO WORLD");
  assertEquals(await upper.apply("123abc", {}, mockContext), "123ABC");
});

Deno.test("Pipe - lower", async () => {
  const pipes = getPipeRegistry();
  const lower = pipes.get("lower")!;

  assertEquals(await lower.apply("HELLO", {}, mockContext), "hello");
  assertEquals(await lower.apply("Hello World", {}, mockContext), "hello world");
  assertEquals(await lower.apply("123ABC", {}, mockContext), "123abc");
});

Deno.test("Pipe - replace", async () => {
  const pipes = getPipeRegistry();
  const replace = pipes.get("replace")!;

  assertEquals(
    await replace.apply("hello world", { search: "world", replace: "deno" }, mockContext),
    "hello deno",
  );

  assertEquals(
    await replace.apply("foo bar foo", { from: "foo", to: "baz" }, mockContext),
    "baz bar baz",
  );

  // Regex mode
  assertEquals(
    await replace.apply(
      "test123test",
      { search: "\\d+", replace: "XXX", flags: "gr" },
      mockContext,
    ),
    "testXXXtest",
  );

  // Regex + ignore case
  assertEquals(
    await replace.apply(
      "Hello hello",
      { search: "hello", replace: "hi", flags: "gri" },
      mockContext,
    ),
    "hi hi",
  );

  await assertRejects(
    async () => await replace.apply("test", {}, mockContext),
    Error,
    "search",
  );
});

Deno.test("Pipe - base64encode", async () => {
  const pipes = getPipeRegistry();
  const base64encode = pipes.get("base64encode")!;

  assertEquals(
    await base64encode.apply("hello", {}, mockContext),
    "aGVsbG8=",
  );

  assertEquals(
    await base64encode.apply("hello world", {}, mockContext),
    "aGVsbG8gd29ybGQ=",
  );

  // Binary data
  const bytes = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
  assertEquals(
    await base64encode.apply(bytes, {}, mockContext),
    "SGVsbG8=",
  );
});

Deno.test("Pipe - base64decode", async () => {
  const pipes = getPipeRegistry();
  const base64decode = pipes.get("base64decode")!;

  assertEquals(
    await base64decode.apply("aGVsbG8=", {}, mockContext),
    "hello",
  );

  assertEquals(
    await base64decode.apply("aGVsbG8gd29ybGQ=", {}, mockContext),
    "hello world",
  );

  await assertRejects(
    async () => await base64decode.apply("invalid!base64", {}, mockContext),
    Error,
  );
});

Deno.test("Pipe - json", async () => {
  const pipes = getPipeRegistry();
  const json = pipes.get("json")!;

  const jsonStr = JSON.stringify({
    name: "test",
    nested: {
      value: "hello",
    },
    array: [1, 2, 3],
  });

  assertEquals(
    await json.apply(jsonStr, { path: "name" }, mockContext),
    "test",
  );

  assertEquals(
    await json.apply(jsonStr, { path: "nested.value" }, mockContext),
    "hello",
  );

  // Array access would need index support
  assertEquals(
    await json.apply(jsonStr, {}, mockContext),
    jsonStr, // Returns original if no path
  );

  await assertRejects(
    async () => await json.apply("invalid json", { path: "test" }, mockContext),
    Error,
    "parse",
  );

  // Note: missing path currently returns undefined (no throw)

  // Extracting object yields stringified JSON
  const jsonObjStr = JSON.stringify({ obj: { a: 1 } });
  assertEquals(
    await json.apply(jsonObjStr, { path: "obj" }, mockContext),
    JSON.stringify({ a: 1 }),
  );
});

Deno.test("Pipe - uriEncode", async () => {
  const pipes = getPipeRegistry();
  const uriEncode = pipes.get("uriEncode")!;

  assertEquals(
    await uriEncode.apply("hello world", {}, mockContext),
    "hello%20world",
  );

  assertEquals(
    await uriEncode.apply("test@example.com", {}, mockContext),
    "test%40example.com",
  );

  assertEquals(
    await uriEncode.apply("name=value&other=test", {}, mockContext),
    "name%3Dvalue%26other%3Dtest",
  );
});

Deno.test("Pipe - uriDecode", async () => {
  const pipes = getPipeRegistry();
  const uriDecode = pipes.get("uriDecode")!;

  assertEquals(
    await uriDecode.apply("hello%20world", {}, mockContext),
    "hello world",
  );

  assertEquals(
    await uriDecode.apply("test%40example.com", {}, mockContext),
    "test@example.com",
  );

  assertEquals(
    await uriDecode.apply("name%3Dvalue%26other%3Dtest", {}, mockContext),
    "name=value&other=test",
  );
});

Deno.test("Pipe - sha256", async () => {
  const pipes = getPipeRegistry();
  const sha256 = pipes.get("sha256")!;

  // Default hex format
  assertEquals(
    await sha256.apply("hello", {}, mockContext),
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );

  // Base64 format
  const base64Result = await sha256.apply("hello", { format: "base64" }, mockContext);
  assertEquals(typeof base64Result, "string");
  assertEquals(base64Result.length > 0, true);
});

Deno.test("Pipe - lines", async () => {
  const pipes = getPipeRegistry();
  const lines = pipes.get("lines")!;

  const multiline = "line1\nline2\nline3\nline4";

  assertEquals(
    await lines.apply(multiline, { n: "1" }, mockContext),
    "line1",
  );

  assertEquals(
    await lines.apply(multiline, { n: "2" }, mockContext),
    "line1\nline2",
  );

  assertEquals(
    await lines.apply(multiline, { value: "3" }, mockContext),
    "line1\nline2\nline3",
  );

  // Default is 1 line
  assertEquals(
    await lines.apply(multiline, {}, mockContext),
    "line1",
  );

  await assertRejects(
    async () => await lines.apply("test", { n: "0" }, mockContext),
    Error,
    "positive",
  );
});

Deno.test("Pipe - dotenvEscape", async () => {
  const pipes = getPipeRegistry();
  const dotenvEscape = pipes.get("dotenvEscape")!;

  assertEquals(
    await dotenvEscape.apply("simple", {}, mockContext),
    "simple",
  );

  assertEquals(
    await dotenvEscape.apply("with spaces", {}, mockContext),
    '"with spaces"',
  );

  assertEquals(
    await dotenvEscape.apply('with "quotes"', {}, mockContext),
    '"with \\"quotes\\""',
  );

  assertEquals(
    await dotenvEscape.apply("multi\nline", {}, mockContext),
    '"multi\nline"',
  );

  assertEquals(
    await dotenvEscape.apply("path\\with\\backslash", {}, mockContext),
    "path\\with\\backslash", // No quotes needed without spaces
  );
});

Deno.test("Pipe - chaining example", async () => {
  const pipes = getPipeRegistry();

  // Simulate: !file(path="cert.pem") | trim() | base64encode()
  let result = "  -----BEGIN CERTIFICATE-----\n  CONTENT\n  -----END CERTIFICATE-----  ";

  const trim = pipes.get("trim")!;
  result = await trim.apply(result, {}, mockContext) as string;
  assertEquals(result.startsWith("-----BEGIN"), true);
  assertEquals(result.endsWith("-----"), true);

  const base64encode = pipes.get("base64encode")!;
  result = await base64encode.apply(result, {}, mockContext) as string;
  assertEquals(typeof result, "string");
  assertEquals(result.includes("="), true); // Base64 often has padding
});
