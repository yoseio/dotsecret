import { assertEquals } from "@std/assert";
import { doctorCommand } from "../cli/commands/doctor.ts";

Deno.test("doctorCommand - passes with mocked connectivity and ADC", async () => {
  // Create a fake ADC file to satisfy GCP auth check
  const adc = await Deno.makeTempFile({ prefix: "dotsecret-adc-" });
  const prevADC = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS");
  Deno.env.set("GOOGLE_APPLICATION_CREDENTIALS", adc);

  // Mock global fetch to simulate reachable endpoints
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    void init;
    const res = (
        url.startsWith("https://secretmanager.googleapis.com") ||
        url.startsWith("http://metadata.google.internal")
      )
      ? new Response("", { status: 401 })
      : new Response("", { status: 200 });
    return Promise.resolve(res);
  }) as typeof fetch;

  // Intercept exit
  const origExit = Deno.exit;
  let exitCode: number | undefined;
  // deno-lint-ignore no-explicit-any
  (Deno as any).exit = (code?: number) => {
    exitCode = code;
    throw new Error("exit");
  };

  try {
    try {
      await doctorCommand();
    } catch (e) {
      if (!(e instanceof Error && e.message === "exit")) throw e;
    }
    // doctorCommand only calls exit on failure; success leaves exitCode undefined
    assertEquals(exitCode, undefined);
  } finally {
    // Restore
    globalThis.fetch = origFetch;
    if (prevADC) Deno.env.set("GOOGLE_APPLICATION_CREDENTIALS", prevADC);
    else Deno.env.delete("GOOGLE_APPLICATION_CREDENTIALS");
    // deno-lint-ignore no-explicit-any
    (Deno as any).exit = origExit;
    await Deno.remove(adc);
  }
});
