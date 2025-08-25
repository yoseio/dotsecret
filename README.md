# dotsecret

A secure environment variable launcher that evaluates `.secret` files to inject secrets from external providers (GCP Secret Manager, 1Password, etc.) into subprocess environments.

## Features

- **Provider Integration**: GCP Secret Manager, 1Password, environment variables, files
- **Transformation Pipes**: Transform values with built-in pipes (trim, base64, json, etc.)
- **Profiles & Scopes**: Organize configurations by environment and command
- **Overlays**: Layer configurations with automatic conflict detection
- **Security**: Values are never stored in plaintext, output masking, audit logging
- **Policy System**: Control access with TypeScript hooks or JSON rules
- **Developer Friendly**: Auto-scope detection, comprehensive linting, explain mode

## Installation

```bash
# Install with Deno
deno install --allow-all -n dotsecret https://raw.githubusercontent.com/yourusername/dotsecret/main/src/cli/main.ts

# Or build from source
git clone https://github.com/yourusername/dotsecret.git
cd dotsecret
deno task build
```

## Quick Start

1. Create a `.secret` file:

```ini
# .secret
APP_NAME = "my-app"
LOG_LEVEL ?= "info"

# Fetch from GCP Secret Manager
DB_PASSWORD = !gcp(secret="db_password", project="my-project")

# Read from file and transform
CA_CERT = !file(path="./ca.pem") | base64encode()

# Environment with fallback
REGION = !env(name="AWS_REGION") || "us-east-1"

[production]
LOG_LEVEL = "warn"
```

2. Run your application:

```bash
# Run with injected environment
dotsecret run -- node server.js

# Use specific profile and scope
dotsecret run -p production -s node -- npm start

# Render environment variables
dotsecret render --format env
```

## Configuration

### Basic Syntax

```ini
# Simple assignment
KEY = "value"

# Conditional assignment (only if not defined)
KEY ?= "default"

# Append with separator
PATH += "/new/path"

# Protected (cannot be overridden)
!protected API_KEY = !gcp(secret="api_key")
```

### Providers

```ini
# GCP Secret Manager
SECRET = !gcp://projects/my-project/secrets/api-key#latest
SECRET = !gcp(secret="api-key", project="my-project", version="2")

# 1Password
TOKEN = !op://vaults/Production/items/API/fields/token
TOKEN = !op(vault="Production", item="API", field="token")

# Environment variable
HOME_DIR = !env(name="HOME")

# File
CONFIG = !file(path="./config.json")
```

### Transformation Pipes

```ini
# Chain transformations
VALUE = !gcp(secret="raw_value") | trim() | upper()

# Soft pipe (continue on error)
VALUE = !env(name="MIGHT_NOT_EXIST") ?| trim() || "default"

# Available pipes:
# trim, upper, lower, replace(from="x", to="y")
# base64encode, base64decode, json(path="field.subfield")
# uriEncode, uriDecode, sha256(format="hex")
# lines(n=1), dotenvEscape
```

### Profiles & Scopes

```ini
[default]
APP = "myapp"

[production]
APP_ENV = "prod"

[scope:node]
NODE_ENV = "production"

[scope:python extends node]
PYTHONPATH = "./src"
```

### Batch Operations

```ini
# Import all secrets with a label
@import gcp://projects/my-project/secrets?label.env=prod prefix=APP_

# Map multiple secrets
@from gcp://projects/my-project/secrets {
  DB_USER = "db_user#latest"
  DB_PASS = "db_pass#latest"
}
```

## Commands

### run

Execute a command with injected environment variables:

```bash
dotsecret run [options] -- <command> [args...]
```

### render

Output resolved environment variables:

```bash
dotsecret render --format env|json|shell|k8s|compose
```

### verify

Check configuration for errors:

```bash
dotsecret verify --strict
```

### explain

Show where each variable comes from:

```bash
dotsecret explain
```

### doctor

Diagnose connectivity and authentication:

```bash
dotsecret doctor
```

### shell

Start an interactive shell with injected environment:

```bash
dotsecret shell
```

### scopes

List available scopes:

```bash
dotsecret scopes
```

### lint

Check for common issues:

```bash
dotsecret lint
```

## Policy System

Control access with `dotsecret.policy.ts`:

```typescript
export default {
  onStart(ctx) {
    if (ctx.isCI && ctx.action === "render" && ctx.flags.mask === "off") {
      return { effect: "deny", reason: "Cannot render unmasked in CI" };
    }
    return { effect: "allow" };
  },

  onProvider(ref, ctx) {
    if (ref.scheme === "op" && !Deno.env.get("OP_CONNECT_TOKEN")) {
      return { effect: "deny", reason: "1Password Connect required" };
    }
    return { effect: "allow" };
  },
};
```

Or use JSON policy (`dotsecret.policy.json`):

```json
{
  "rules": {
    "provider": [{
      "match": { "ref.scheme": "file" },
      "effect": "warn",
      "reason": "File provider should be avoided in production"
    }]
  }
}
```

## Security

- Secrets are fetched just-in-time and only exist in subprocess memory
- All output is masked by default (disable with `--mask=off`)
- Audit logging tracks all secret access
- Disk cache is encrypted with AES-GCM (memory cache by default)
- Policy system enforces security rules

## License

MIT
