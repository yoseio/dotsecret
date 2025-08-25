import type { Pipe } from "../types.ts";
import {
  Base64DecodePipe,
  Base64EncodePipe,
  DotenvEscapePipe,
  JSONPipe,
  LinesPipe,
  LowerPipe,
  ReplacePipe,
  SHA256Pipe,
  TrimPipe,
  UpperPipe,
  URIDecodePipe,
  URIEncodePipe,
} from "./builtins.ts";

const pipes = new Map<string, Pipe>();

// Register built-in pipes
pipes.set("trim", new TrimPipe());
pipes.set("upper", new UpperPipe());
pipes.set("lower", new LowerPipe());
pipes.set("replace", new ReplacePipe());
pipes.set("base64encode", new Base64EncodePipe());
pipes.set("base64decode", new Base64DecodePipe());
pipes.set("json", new JSONPipe());
pipes.set("uriEncode", new URIEncodePipe());
pipes.set("uriDecode", new URIDecodePipe());
pipes.set("sha256", new SHA256Pipe());
pipes.set("lines", new LinesPipe());
pipes.set("dotenvEscape", new DotenvEscapePipe());

export function getPipeRegistry(): Map<string, Pipe> {
  return pipes;
}

export function registerPipe(name: string, pipe: Pipe): void {
  pipes.set(name, pipe);
}
