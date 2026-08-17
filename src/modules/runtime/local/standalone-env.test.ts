import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Standalone packages carry exactly one environment file: standalone/.env.
// Installer/runtime scripts must inherit it instead of falling back to the
// legacy host-appliance defaults (5432 / nova_local).
function loadEnv(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "nova-env-"));
  mkdirSync(join(root, "local", "scripts"), { recursive: true });
  copyFileSync("local/scripts/lib.sh", join(root, "local", "scripts", "lib.sh"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  const out = execFileSync(
    "bash",
    [
      "-c",
      `source "${root}/local/scripts/lib.sh"; nova_load_env; ` +
        `printf '%s|%s|%s|%s\\n' "$PGPORT" "$PGDATABASE" "$NOVA_POSTGREST_PORT" "$NOVA_ENV_FILE"`,
    ],
    { encoding: "utf8", env: { ...process.env, NOVA_ENV_FILE: undefined } as NodeJS.ProcessEnv },
  ).trim();
  const [port, database, postgrestPort, envFile] = out.split("|");
  return { port, database, postgrestPort, envFile, root };
}

const STANDALONE_ENV = [
  "NOVA_DB_HOST=127.0.0.1",
  "NOVA_DB_PORT=55432",
  "NOVA_DB_NAME=nova_fnb",
  "NOVA_DB_SUPERUSER=nova_superuser",
  "NOVA_DB_AUTHENTICATOR=nova_authenticator",
  "NOVA_POSTGREST_PORT=53000",
  "",
].join("\n");

describe("standalone environment wiring", () => {
  it("repair/install scripts read standalone/.env, not the legacy defaults", () => {
    const env = loadEnv({ "standalone/.env": STANDALONE_ENV });
    expect(env.port).toBe("55432");
    expect(env.database).toBe("nova_fnb");
    expect(env.postgrestPort).toBe("53000");
    expect(env.envFile).toBe(join(env.root, "standalone/.env"));
    expect(env.port).not.toBe("5432");
    expect(env.database).not.toBe("nova_local");
  });

  it("standalone/.env wins over a stray local/.env", () => {
    const env = loadEnv({
      "standalone/.env": STANDALONE_ENV,
      "local/.env": "NOVA_DB_PORT=5432\nNOVA_DB_NAME=nova_local\n",
    });
    expect(env.port).toBe("55432");
    expect(env.database).toBe("nova_fnb");
  });

  it("keeps host-appliance mode working when there is no standalone/.env", () => {
    const env = loadEnv({ "local/.env": "NOVA_DB_PORT=5432\nNOVA_DB_NAME=nova_local\n" });
    expect(env.port).toBe("5432");
    expect(env.database).toBe("nova_local");
    expect(env.envFile).toBe(join(env.root, "local/.env"));
  });
});
