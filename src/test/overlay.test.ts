import { assertEquals } from "@std/assert";
import { OverlayResolver } from "../core/overlay.ts";
import { ensureDir } from "@std/fs";

Deno.test("OverlayResolver - file resolution order", async () => {
  // Create a temporary directory for testing
  const tempDir = await Deno.makeTempDir({ prefix: "dotsecret-test-" });

  try {
    // Create test files
    await Deno.writeTextFile(`${tempDir}/.secret`, "BASE = true");
    await Deno.writeTextFile(`${tempDir}/.secret.local`, "LOCAL = true");
    await Deno.writeTextFile(`${tempDir}/.secret.production`, "PROD = true");
    await Deno.writeTextFile(`${tempDir}/.secret.production.local`, "PROD_LOCAL = true");

    await ensureDir(`${tempDir}/overlays`);
    await Deno.writeTextFile(`${tempDir}/overlays/custom.secret`, "CUSTOM = true");

    const resolver = new OverlayResolver(tempDir);

    // Test default resolution (no profile, no overlays)
    const defaultFiles = await resolver.resolveFiles({});
    assertEquals(defaultFiles.length, 2);
    assertEquals(defaultFiles[0].endsWith(".secret"), true);
    assertEquals(defaultFiles[1].endsWith(".secret.local"), true);

    // Test with profile
    const prodFiles = await resolver.resolveFiles({ profile: "production" });
    assertEquals(prodFiles.length, 4);
    assertEquals(prodFiles[2].endsWith(".secret.production"), true);
    assertEquals(prodFiles[3].endsWith(".secret.production.local"), true);

    // Test with overlay
    const overlayFiles = await resolver.resolveFiles({ overlays: ["custom"] });
    assertEquals(overlayFiles.length, 3);
    assertEquals(overlayFiles[2].endsWith("overlays/custom.secret"), true);

    // Test with both profile and overlay
    const allFiles = await resolver.resolveFiles({
      profile: "production",
      overlays: ["custom"],
    });
    assertEquals(allFiles.length, 5);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("OverlayResolver - missing files are skipped", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "dotsecret-test-" });

  try {
    // Only create base file
    await Deno.writeTextFile(`${tempDir}/.secret`, "BASE = true");

    const resolver = new OverlayResolver(tempDir);

    // Request files that don't exist
    const files = await resolver.resolveFiles({
      profile: "staging",
      overlays: ["nonexistent", "another"],
    });

    // Should only include the base file
    assertEquals(files.length, 1);
    assertEquals(files[0].endsWith(".secret"), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("OverlayResolver - parseAllFiles with includes", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "dotsecret-test-" });

  try {
    // Create main file with include
    await Deno.writeTextFile(
      `${tempDir}/.secret`,
      `
BASE = "base"
@include ./common.secret
    `.trim(),
    );

    // Create included file
    await Deno.writeTextFile(
      `${tempDir}/common.secret`,
      `
COMMON = "common"
SHARED = "value"
    `.trim(),
    );

    const resolver = new OverlayResolver(tempDir);
    const parsed = await resolver.parseAllFiles({});

    // Should have parsed both files
    assertEquals(parsed.length, 2);

    // Check assignments from both files
    const allAssignments = parsed
      .flatMap((f) => f.nodes)
      .filter((n) => n.type === "assignment");

    assertEquals(allAssignments.length, 3);

    const keys = allAssignments.map((a) => a.data.key);
    assertEquals(keys.includes("BASE"), true);
    assertEquals(keys.includes("COMMON"), true);
    assertEquals(keys.includes("SHARED"), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("OverlayResolver - conflict detection", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "dotsecret-test-" });

  try {
    // Create files with conflicts
    await Deno.writeTextFile(`${tempDir}/.secret`, 'KEY = "value1"');
    await Deno.writeTextFile(`${tempDir}/.secret.local`, 'KEY = "value2"');
    await Deno.writeTextFile(`${tempDir}/.secret.prod`, 'KEY = "value3"');

    const resolver = new OverlayResolver(tempDir);
    const parsed = await resolver.parseAllFiles({ profile: "prod" });

    const conflicts = resolver.detectConflicts(parsed);

    // Should detect conflict for KEY (3+ different values)
    assertEquals(conflicts.size, 1);
    assertEquals(conflicts.has("KEY"), true);

    const conflictFiles = conflicts.get("KEY")!;
    assertEquals(conflictFiles.length, 3);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("OverlayResolver - no conflicts with same values", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "dotsecret-test-" });

  try {
    // Create files with same values
    await Deno.writeTextFile(`${tempDir}/.secret`, 'KEY = "same"');
    await Deno.writeTextFile(`${tempDir}/.secret.local`, 'KEY = "same"');
    await Deno.writeTextFile(`${tempDir}/.secret.prod`, 'KEY = "same"');

    const resolver = new OverlayResolver(tempDir);
    const parsed = await resolver.parseAllFiles({ profile: "prod" });

    const conflicts = resolver.detectConflicts(parsed);

    // Should not detect conflict when values are the same
    assertEquals(conflicts.size, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("OverlayResolver - include with glob pattern", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "dotsecret-test-" });

  try {
    // Create config directory
    await ensureDir(`${tempDir}/config`);

    // Create main file with glob include
    await Deno.writeTextFile(
      `${tempDir}/.secret`,
      `
@include ./config/*.secret
    `.trim(),
    );

    // Create multiple config files
    await Deno.writeTextFile(`${tempDir}/config/db.secret`, 'DB_HOST = "localhost"');
    await Deno.writeTextFile(`${tempDir}/config/api.secret`, 'API_URL = "https://api.example.com"');
    await Deno.writeTextFile(`${tempDir}/config/ignore.txt`, 'IGNORED = "should not be included"');

    const resolver = new OverlayResolver(tempDir);
    const parsed = await resolver.parseAllFiles({});

    // Should include main + 2 config files
    assertEquals(parsed.length, 3);

    const allKeys = parsed
      .flatMap((f) => f.nodes)
      .filter((n) => n.type === "assignment")
      .map((n) => n.data.key);

    assertEquals(allKeys.includes("DB_HOST"), true);
    assertEquals(allKeys.includes("API_URL"), true);
    assertEquals(allKeys.includes("IGNORED"), false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("OverlayResolver - circular include prevention", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "dotsecret-test-" });

  try {
    // Create files that include each other
    await Deno.writeTextFile(
      `${tempDir}/.secret`,
      `
KEY1 = "value1"
@include ./other.secret
    `.trim(),
    );

    await Deno.writeTextFile(
      `${tempDir}/other.secret`,
      `
KEY2 = "value2"
@include ./.secret
    `.trim(),
    );

    const resolver = new OverlayResolver(tempDir);
    const parsed = await resolver.parseAllFiles({});

    // Should parse each file only once
    assertEquals(parsed.length, 2);

    const fileCount = parsed.filter((f) => f.path.endsWith(".secret")).length;
    assertEquals(fileCount, 1);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
