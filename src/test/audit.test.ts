import { assertEquals } from "@std/assert";
import {
  createAuditLogger,
  JSONAuditLogger,
  NoOpAuditLogger,
  StderrAuditLogger,
} from "../core/audit.ts";
import type { AuditEvent } from "../core/types.ts";

Deno.test("NoOpAuditLogger - does nothing", async () => {
  const logger = new NoOpAuditLogger();

  // Should not throw
  logger.log({
    timestamp: new Date(),
    action: "test",
    success: true,
  });

  await logger.flush();

  // No way to verify it did nothing, but at least it doesn't error
  assertEquals(true, true);
});

Deno.test("JSONAuditLogger - formats events as JSON", async () => {
  const tempFile = await Deno.makeTempFile({ prefix: "audit-test-", suffix: ".json" });

  try {
    const logger = new JSONAuditLogger("file", tempFile);

    const event1: AuditEvent = {
      timestamp: new Date("2024-01-01T12:00:00Z"),
      action: "provider_resolve",
      key: "API_KEY",
      provider: "gcp",
      source: "gcp://projects/test/secrets/api-key",
      success: true,
      duration: 150,
    };

    const event2: AuditEvent = {
      timestamp: new Date("2024-01-01T12:00:01Z"),
      action: "key_inject",
      key: "DATABASE_URL",
      success: false,
      error: "Connection timeout",
    };

    logger.log(event1);
    logger.log(event2);
    await logger.flush();

    // Read and verify the file
    const content = await Deno.readTextFile(tempFile);
    const lines = content.trim().split("\n");

    assertEquals(lines.length, 2);

    const parsed1 = JSON.parse(lines[0]);
    assertEquals(parsed1.action, "provider_resolve");
    assertEquals(parsed1.key, "API_KEY");
    assertEquals(parsed1.success, true);
    assertEquals(parsed1.timestamp, "2024-01-01T12:00:00.000Z");

    const parsed2 = JSON.parse(lines[1]);
    assertEquals(parsed2.action, "key_inject");
    assertEquals(parsed2.success, false);
    assertEquals(parsed2.error, "Connection timeout");
  } finally {
    await Deno.remove(tempFile);
  }
});

Deno.test("JSONAuditLogger - stderr output", async () => {
  // Can't easily capture stderr, but we can test it doesn't error
  const logger = new JSONAuditLogger("stderr");

  logger.log({
    timestamp: new Date(),
    action: "test",
    success: true,
  });

  // Flush should work without errors
  await logger.flush();
  assertEquals(true, true);
});

Deno.test("JSONAuditLogger - appends to existing file", async () => {
  const tempFile = await Deno.makeTempFile({ prefix: "audit-test-", suffix: ".json" });

  try {
    // Write initial content
    await Deno.writeTextFile(tempFile, '{"existing":"content"}\n');

    const logger = new JSONAuditLogger("file", tempFile);

    logger.log({
      timestamp: new Date("2024-01-01T12:00:00Z"),
      action: "new_event",
      success: true,
    });

    await logger.flush();

    const content = await Deno.readTextFile(tempFile);
    const lines = content.trim().split("\n");

    // Should have both lines
    assertEquals(lines.length, 2);
    assertEquals(JSON.parse(lines[0]).existing, "content");
    assertEquals(JSON.parse(lines[1]).action, "new_event");
  } finally {
    await Deno.remove(tempFile);
  }
});

Deno.test("StderrAuditLogger - formats human-readable output", async () => {
  const logger = new StderrAuditLogger();

  const event: AuditEvent = {
    timestamp: new Date("2024-01-01T12:00:00Z"),
    action: "provider_resolve",
    key: "API_KEY",
    provider: "gcp",
    source: "test.secret",
    success: true,
    duration: 150,
  };

  logger.log(event);

  // Can't capture stderr easily, but verify the formatting logic
  const formatEvent = (logger as any).formatEvent.bind(logger);
  const formatted = formatEvent(event);

  assertEquals(formatted.includes("[2024-01-01T12:00:00.000Z]"), true);
  assertEquals(formatted.includes("provider_resolve"), true);
  assertEquals(formatted.includes("SUCCESS"), true);
  assertEquals(formatted.includes("key=API_KEY"), true);
  assertEquals(formatted.includes("provider=gcp"), true);
  assertEquals(formatted.includes("duration=150ms"), true);
});

Deno.test("StderrAuditLogger - formats error events", async () => {
  const logger = new StderrAuditLogger();

  const event: AuditEvent = {
    timestamp: new Date("2024-01-01T12:00:00Z"),
    action: "provider_resolve",
    key: "SECRET",
    success: false,
    error: "Access denied",
  };

  const formatEvent = (logger as any).formatEvent.bind(logger);
  const formatted = formatEvent(event);

  assertEquals(formatted.includes("FAILED"), true);
  assertEquals(formatted.includes('error="Access denied"'), true);
});

Deno.test("createAuditLogger - creates correct logger type", () => {
  const jsonLogger = createAuditLogger("json");
  assertEquals(jsonLogger instanceof JSONAuditLogger, true);

  const stderrLogger = createAuditLogger("stderr");
  assertEquals(stderrLogger instanceof StderrAuditLogger, true);

  const noopLogger = createAuditLogger("off");
  assertEquals(noopLogger instanceof NoOpAuditLogger, true);

  // With file path
  const fileLogger = createAuditLogger("json", "/tmp/audit.log");
  assertEquals(fileLogger instanceof JSONAuditLogger, true);
});

Deno.test("Audit events - all required fields", () => {
  const logger = new NoOpAuditLogger();

  // Test various event types
  const events: AuditEvent[] = [
    {
      timestamp: new Date(),
      action: "start",
      success: true,
    },
    {
      timestamp: new Date(),
      action: "provider_resolve",
      key: "API_KEY",
      provider: "gcp",
      source: "gcp://projects/test/secrets/key",
      success: true,
      duration: 100,
    },
    {
      timestamp: new Date(),
      action: "pipe_apply",
      key: "DATA",
      success: false,
      error: "Invalid input",
    },
    {
      timestamp: new Date(),
      action: "finish",
      success: true,
    },
  ];

  // Should all be valid
  events.forEach((event) => {
    logger.log(event);
    assertEquals(event.timestamp instanceof Date, true);
    assertEquals(typeof event.action, "string");
    assertEquals(typeof event.success, "boolean");
  });
});
