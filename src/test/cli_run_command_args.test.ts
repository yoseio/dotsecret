import { assertRejects } from "@std/assert";
import { runCommand } from "../cli/commands/run.ts";

Deno.test("runCommand - throws when no command specified", async () => {
  await assertRejects(
    async () =>
      await runCommand({ _: [] } as unknown as Record<string, unknown> & { _: unknown[] }),
    Error,
    "No command specified",
  );
});

Deno.test("runCommand - throws when -- present but no command", async () => {
  await assertRejects(
    async () =>
      await runCommand(
        { _: ["run", "--"] } as unknown as Record<string, unknown> & { _: unknown[] },
      ),
    Error,
    "No command specified",
  );
});

Deno.test("runCommand - throws when passthrough array missing command", async () => {
  await assertRejects(
    // deno-lint-ignore no-explicit-any
    async () => await runCommand({ _: [], "--": [] } as any),
    Error,
    "No command specified",
  );
});
