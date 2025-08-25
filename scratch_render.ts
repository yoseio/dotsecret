import { renderCommand } from "./src/cli/commands/render.ts";
const dir = await Deno.makeTempDir({ prefix: "ds-cli-" });
const file = `${dir}/.secret`;
await Deno.writeTextFile(file, 'FOO = "bar"');
await renderCommand(
  { _: [], file, format: "json", mask: "off" } as unknown as Record<string, unknown> & {
    _: unknown[];
  },
);
