import { assertEquals } from "@std/assert";
import { getPipeRegistry } from "../core/pipes/index.ts";
import { DefaultPolicy } from "../core/policy.ts";
import { NoOpAuditLogger } from "../core/audit.ts";
import type { PipeContext } from "../core/types.ts";

const ctx: PipeContext = { policy: new DefaultPolicy(), audit: new NoOpAuditLogger() };

Deno.test("Pipes - base64 encode/decode roundtrip", async () => {
  const pipes = getPipeRegistry();
  const enc = pipes.get("base64encode")!;
  const dec = pipes.get("base64decode")!;
  const orig = "RoundTrip✓";
  const b64 = await enc.apply(orig, {}, ctx) as string;
  const back = await dec.apply(b64, {}, ctx) as string;
  assertEquals(back, orig);
});

Deno.test("Pipes - uri encode/decode roundtrip", async () => {
  const pipes = getPipeRegistry();
  const en = pipes.get("uriEncode")!;
  const de = pipes.get("uriDecode")!;
  const orig = "hello world & x=y@z";
  const enc = await en.apply(orig, {}, ctx) as string;
  const back = await de.apply(enc, {}, ctx) as string;
  assertEquals(back, orig);
});
