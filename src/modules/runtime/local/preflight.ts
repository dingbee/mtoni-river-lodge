/**
 * NOVA Hospitality — Restaurant & Bar OS
 * Installer pre-flight evaluation (PRODUCTIZATION-4, Phase B).
 *
 * Pure decision logic so the installer's verdicts are testable without a host.
 * The shell script collects the facts; this module judges them.
 */
import { MIN_POSTGRES_MAJOR } from "../version";

export const HOST_REQUIREMENTS = {
  supportedPlatforms: ["linux", "windows"] as const,
  supportedArchitectures: ["x86_64", "amd64", "aarch64", "arm64"] as const,
  minMemoryMb: 4096,
  minDiskMb: 20480,
  minPostgresMajor: MIN_POSTGRES_MAJOR,
  /** Ports the appliance owns. Only the gateway is LAN-exposed. */
  requiredPorts: [
    { port: 5432, component: "database", exposure: "loopback" },
    { port: 3001, component: "data-service", exposure: "loopback" },
    { port: 8000, component: "gateway", exposure: "lan" },
    { port: 8443, component: "gateway-tls", exposure: "lan" },
  ] as const,
};

export type CheckStatus = "pass" | "warn" | "fail";

export interface PreflightCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface PreflightFacts {
  platform: string;
  architecture: string;
  memoryMb: number;
  diskFreeMb: number;
  postgresVersion?: string | null;
  /** Ports already bound on the host, with the owning process when known. */
  portsInUse?: { port: number; process?: string; ownedByNova?: boolean }[];
}

export interface PreflightReport {
  ok: boolean;
  blocking: number;
  warnings: number;
  checks: PreflightCheck[];
}

const norm = (value: string) => value.trim().toLowerCase();

export function evaluatePreflight(facts: PreflightFacts): PreflightReport {
  const checks: PreflightCheck[] = [];
  const platform = norm(facts.platform);
  const arch = norm(facts.architecture);

  checks.push({
    id: "platform",
    label: "Operating system",
    status: (HOST_REQUIREMENTS.supportedPlatforms as readonly string[]).includes(platform)
      ? "pass"
      : "fail",
    detail: facts.platform,
  });

  checks.push({
    id: "architecture",
    label: "CPU architecture",
    status: (HOST_REQUIREMENTS.supportedArchitectures as readonly string[]).includes(arch)
      ? "pass"
      : "fail",
    detail: facts.architecture,
  });

  checks.push({
    id: "memory",
    label: "Memory",
    status:
      facts.memoryMb >= HOST_REQUIREMENTS.minMemoryMb
        ? "pass"
        : facts.memoryMb >= HOST_REQUIREMENTS.minMemoryMb / 2
          ? "warn"
          : "fail",
    detail: `${facts.memoryMb} MB available, ${HOST_REQUIREMENTS.minMemoryMb} MB required`,
  });

  checks.push({
    id: "disk",
    label: "Disk space",
    status: facts.diskFreeMb >= HOST_REQUIREMENTS.minDiskMb ? "pass" : "fail",
    detail: `${facts.diskFreeMb} MB free, ${HOST_REQUIREMENTS.minDiskMb} MB required`,
  });

  const pgMajor = facts.postgresVersion ? Number(/^(\d+)/.exec(facts.postgresVersion.trim())?.[1]) : null;
  checks.push({
    id: "postgres",
    label: "PostgreSQL",
    status:
      pgMajor === null || Number.isNaN(pgMajor)
        ? "fail"
        : pgMajor >= HOST_REQUIREMENTS.minPostgresMajor
          ? "pass"
          : "fail",
    detail:
      pgMajor && !Number.isNaN(pgMajor)
        ? `PostgreSQL ${pgMajor} detected`
        : "PostgreSQL not detected — install PostgreSQL 16 or newer",
  });

  // A port held by a previous NOVA install is an upgrade signal, not a conflict.
  for (const required of HOST_REQUIREMENTS.requiredPorts) {
    const conflict = (facts.portsInUse ?? []).find((p) => p.port === required.port);
    checks.push({
      id: `port-${required.port}`,
      label: `Port ${required.port} (${required.component})`,
      status: !conflict ? "pass" : conflict.ownedByNova ? "warn" : "fail",
      detail: !conflict
        ? "free"
        : conflict.ownedByNova
          ? `held by an existing NOVA ${required.component}`
          : `in use by ${conflict.process ?? "another service"}`,
    });
  }

  const blocking = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  return { ok: blocking === 0, blocking, warnings, checks };
}
