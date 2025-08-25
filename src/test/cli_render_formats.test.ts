import { assertEquals, assertMatch } from "@std/assert";
import { renderCommand } from "../cli/commands/render.ts";

function captureConsole() {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  return {
    logs,
    restore() {
      console.log = origLog;
    },
  };
}

async function makeTempSecret(contents: string) {
  const dir = await Deno.makeTempDir({ prefix: "dotsecret-cli-render-" });
  const file = `${dir}/.secret`;
  await Deno.writeTextFile(file, contents);
  return { dir, file };
}

Deno.test("renderCommand - env format renders dotenv style", async () => {
  const { dir, file } = await makeTempSecret(
    [
      'ALPHA = "hello world"',
      'BETA = """',
      "line1",
      "line2",
      '"""',
    ].join("\n"),
  );
  const cap = captureConsole();
  try {
    await renderCommand({ _: [], file, format: "env", mask: "off", pure: true });
    const out = cap.logs.join("\n");
    if (!out.includes("ALPHA=")) throw new Error(`missing ALPHA in output: ${out}`);
    if (!out.includes("BETA=")) throw new Error(`missing BETA in output: ${out}`);
  } finally {
    cap.restore();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("renderCommand - json format outputs JSON", async () => {
  const { dir, file } = await makeTempSecret('FOO = "bar"');
  const cap = captureConsole();
  try {
    await renderCommand({ _: [], file, format: "json", mask: "off", pure: true });
    const json = JSON.parse(cap.logs.join("\n"));
    assertEquals(json, { FOO: "bar" });
  } finally {
    cap.restore();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("renderCommand - shell format exports values", async () => {
  const { dir, file } = await makeTempSecret('X = "y z"');
  const cap = captureConsole();
  try {
    await renderCommand({ _: [], file, format: "shell", mask: "off", pure: true });
    const out = cap.logs.join("\n");
    assertMatch(out.trim(), /^export X='y z'$/);
  } finally {
    cap.restore();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("renderCommand - k8s format prints Secret", async () => {
  const { dir, file } = await makeTempSecret('A = "1"');
  const cap = captureConsole();
  try {
    await renderCommand({ _: [], file, format: "k8s", mask: "off", pure: true });
    const obj = JSON.parse(cap.logs.join("\n"));
    assertEquals(obj.kind, "Secret");
    assertEquals(obj.apiVersion, "v1");
    assertEquals(obj.stringData, { A: "1" });
  } finally {
    cap.restore();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("renderCommand - compose format prints docker-compose env", async () => {
  const { dir, file } = await makeTempSecret('A = "1"');
  const cap = captureConsole();
  try {
    await renderCommand({ _: [], file, format: "compose", mask: "off", pure: true });
    const obj = JSON.parse(cap.logs.join("\n"));
    assertEquals(obj.version, "3.8");
    assertEquals(obj.services.app.environment, { A: "1" });
  } finally {
    cap.restore();
    await Deno.remove(dir, { recursive: true });
  }
});
