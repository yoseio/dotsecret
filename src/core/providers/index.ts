import type { Provider } from "../types.ts";
import { GCPSecretManagerProvider } from "./gcp.ts";
import { OnePasswordProvider } from "./op.ts";
import { Base64DecodeProvider, EnvProvider, FileProvider, JSONProvider } from "./builtins.ts";

const providers = new Map<string, Provider>();

// Register providers
providers.set("gcp", new GCPSecretManagerProvider());
providers.set("op", new OnePasswordProvider());
providers.set("env", new EnvProvider());
providers.set("file", new FileProvider());
providers.set("json", new JSONProvider());
providers.set("base64decode", new Base64DecodeProvider());

export function getProviderRegistry(): Map<string, Provider> {
  return providers;
}

export function registerProvider(name: string, provider: Provider): void {
  providers.set(name, provider);
}
