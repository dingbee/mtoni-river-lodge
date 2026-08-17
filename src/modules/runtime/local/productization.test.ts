import { describe, expect, it } from "vitest";
import { evaluatePreflight, HOST_REQUIREMENTS } from "./preflight";
import { classifyInstall } from "./install-state";
import {
  buildDiagnosticBundle,
  canRestoreBackup,
  canRunDiagnostics,
  redactRecord,
  redactText,
} from "./diagnostics";
import { checkCompatibility, APP_VERSION, REQUIRED_SCHEMA_VERSION } from "../version";

const healthyFacts = {
  platform: "linux",
  architecture: "x86_64",
  memoryMb: 8192,
  diskFreeMb: 51200,
  postgresVersion: "17.9",
  portsInUse: [],
};

describe("installer pre-flight", () => {
  it("passes on a supported clean host", () => {
    const report = evaluatePreflight(healthyFacts);
    expect(report.ok).toBe(true);
    expect(report.blocking).toBe(0);
    expect(report.checks.length).toBe(5 + HOST_REQUIREMENTS.requiredPorts.length);
  });

  it("blocks unsupported platform, architecture, memory, disk and PostgreSQL", () => {
    const report = evaluatePreflight({
      platform: "darwin",
      architecture: "ppc64",
      memoryMb: 512,
      diskFreeMb: 1024,
      postgresVersion: "14.2",
    });
    expect(report.ok).toBe(false);
    const failed = report.checks.filter((c) => c.status === "fail").map((c) => c.id);
    expect(failed).toEqual(
      expect.arrayContaining(["platform", "architecture", "memory", "disk", "postgres"]),
    );
  });

  it("treats a foreign port holder as blocking and a NOVA port holder as a warning", () => {
    const foreign = evaluatePreflight({
      ...healthyFacts,
      portsInUse: [{ port: 8000, process: "nginx" }],
    });
    expect(foreign.ok).toBe(false);

    const ours = evaluatePreflight({
      ...healthyFacts,
      portsInUse: [{ port: 8000, process: "nova-gateway", ownedByNova: true }],
    });
    expect(ours.ok).toBe(true);
    expect(ours.warnings).toBe(1);
  });

  it("fails when PostgreSQL is absent", () => {
    const report = evaluatePreflight({ ...healthyFacts, postgresVersion: null });
    expect(report.checks.find((c) => c.id === "postgres")?.status).toBe("fail");
  });
});

describe("installation state", () => {
  it("classifies a clean machine as fresh install", () => {
    expect(classifyInstall({ installMarkerPresent: false, databasePresent: false, migrationsApplied: 0 })).toMatchObject(
      { state: "fresh", action: "install" },
    );
  });

  it("never destroys an existing installation", () => {
    const decision = classifyInstall({
      installMarkerPresent: true,
      databasePresent: true,
      migrationsApplied: 98,
      installId: "11111111-1111-1111-1111-111111111111",
      installedVersion: "1.2.0",
    });
    expect(decision.state).toBe("existing");
    expect(decision.action).toBe("upgrade");
    expect(decision.destructive).toBe(false);
  });

  it("classifies a half-finished install as repair", () => {
    expect(
      classifyInstall({ installMarkerPresent: true, databasePresent: true, migrationsApplied: 0 }),
    ).toMatchObject({ state: "interrupted", action: "repair" });
  });

  it("aborts when the database belongs to something else", () => {
    expect(
      classifyInstall({
        installMarkerPresent: false,
        databasePresent: true,
        migrationsApplied: 0,
        unknownDatabaseOwner: true,
      }),
    ).toMatchObject({ state: "foreign", action: "abort" });
  });
});

describe("diagnostics redaction", () => {
  it("removes connection strings, private keys and JWTs from text", () => {
    const text = [
      "connecting to postgresql://nova:sup3rs3cret@127.0.0.1:5432/nova_local",
      "token eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJhYmMifQ.c2lnbmF0dXJl",
      "-----BEGIN PRIVATE KEY-----MIIBVgIBADAN-----END PRIVATE KEY-----",
    ].join("\n");
    const out = redactText(text);
    expect(out).not.toMatch(/sup3rs3cret/);
    expect(out).not.toMatch(/eyJhbGciOiJFUzI1NiJ9/);
    expect(out).not.toMatch(/MIIBVgIBADAN/);
  });

  it("redacts sensitive keys in configuration records, recursively", () => {
    const out = redactRecord({
      NOVA_DB_HOST: "127.0.0.1",
      NOVA_DB_SUPERUSER_PASSWORD: "hunter2",
      nested: { refresh_token: "abc123", gatewayPort: 8000 },
    });
    expect(out["NOVA_DB_HOST"]).toBe("127.0.0.1");
    expect(out["NOVA_DB_SUPERUSER_PASSWORD"]).toBe("[redacted]");
    expect((out["nested"] as Record<string, unknown>)["refresh_token"]).toBe("[redacted]");
    expect((out["nested"] as Record<string, unknown>)["gatewayPort"]).toBe(8000);
  });

  it("builds a support bundle with versions and no secrets", () => {
    const bundle = buildDiagnosticBundle({
      system: { schemaVersion: REQUIRED_SCHEMA_VERSION, installId: "abc", health: "ok", ready: true },
      configuration: { NOVA_JWT_PRIVATE_KEY_FILE: "/opt/nova/keys/jwt-private.pem", NOVA_DB_SUPERUSER_PASSWORD: "x" },
      logs: [{ source: "gateway", lines: ["listening", "db=postgresql://u:p@localhost/nova"] }],
    });
    expect(bundle.system.appVersion).toBe(APP_VERSION);
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toMatch(/hunter2|postgresql:\/\/u:p/);
    expect(bundle.configuration["NOVA_DB_SUPERUSER_PASSWORD"]).toBe("[redacted]");
  });

  it("restricts diagnostics and restore by role", () => {
    expect(canRunDiagnostics("admin")).toBe(true);
    expect(canRunDiagnostics("cashier")).toBe(false);
    expect(canRestoreBackup("admin")).toBe(false);
    expect(canRestoreBackup("owner")).toBe(true);
  });
});

describe("version contract", () => {
  it("accepts the shipped schema and rejects drift", () => {
    expect(checkCompatibility({ schemaVersion: REQUIRED_SCHEMA_VERSION, postgresVersion: "17.9" }).compatible).toBe(true);
    expect(checkCompatibility({ schemaVersion: "2020.01.01", postgresVersion: "17.9" }).reason).toBe("schema-behind");
    expect(checkCompatibility({ schemaVersion: REQUIRED_SCHEMA_VERSION, postgresVersion: "14.1" }).reason).toBe(
      "postgres-too-old",
    );
  });
});
