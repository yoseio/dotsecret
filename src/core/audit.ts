import type { AuditEvent, AuditLogger } from "./types.ts";
import { writeAll } from "@std/io/write-all";

export class JSONAuditLogger implements AuditLogger {
  private events: AuditEvent[] = [];
  private output: "stderr" | "file";
  private filePath?: string;

  constructor(output: "stderr" | "file" = "stderr", filePath?: string) {
    this.output = output;
    this.filePath = filePath;
  }

  log(event: AuditEvent): void {
    this.events.push(event);
  }

  async flush(): Promise<void> {
    if (this.events.length === 0) return;

    const logs = this.events.map((event) => JSON.stringify({
      ...event,
      timestamp: event.timestamp.toISOString(),
    })).join("\n") + "\n";

    if (this.output === "stderr") {
      const encoder = new TextEncoder();
      await writeAll(Deno.stderr, encoder.encode(logs));
    } else if (this.output === "file" && this.filePath) {
      await Deno.writeTextFile(this.filePath, logs, { append: true });
    }

    this.events = [];
  }
}

export class NoOpAuditLogger implements AuditLogger {
  log(_event: AuditEvent): void {}
  async flush(): Promise<void> {}
}

export class StderrAuditLogger implements AuditLogger {
  private events: AuditEvent[] = [];

  log(event: AuditEvent): void {
    this.events.push(event);
  }

  async flush(): Promise<void> {
    if (this.events.length === 0) return;

    const encoder = new TextEncoder();
    for (const event of this.events) {
      const message = this.formatEvent(event);
      await writeAll(Deno.stderr, encoder.encode(message + "\n"));
    }

    this.events = [];
  }

  private formatEvent(event: AuditEvent): string {
    const time = event.timestamp.toISOString();
    const status = event.success ? "SUCCESS" : "FAILED";
    let message = `[${time}] ${event.action} ${status}`;

    if (event.key) message += ` key=${event.key}`;
    if (event.provider) message += ` provider=${event.provider}`;
    if (event.source) message += ` source=${event.source}`;
    if (event.duration) message += ` duration=${event.duration}ms`;
    if (event.error) message += ` error="${event.error}"`;

    return message;
  }
}

export function createAuditLogger(type: "json" | "stderr" | "off", filePath?: string): AuditLogger {
  switch (type) {
    case "json":
      return new JSONAuditLogger(filePath ? "file" : "stderr", filePath);
    case "stderr":
      return new StderrAuditLogger();
    case "off":
      return new NoOpAuditLogger();
    default:
      return new NoOpAuditLogger();
  }
}