import { createHash } from "node:crypto";

export interface CommunicationDraftFingerprintInput {
  subject?: string | null;
  body: string;
  providerTemplateName?: string | null;
  providerTemplateLanguage?: string | null;
  providerTemplateComponents?: unknown;
}

/** Fingerprint every field that can change the provider-visible content. */
export function communicationDraftFingerprint(input: CommunicationDraftFingerprintInput): string {
  const canonical = JSON.stringify({
    subject: input.subject ?? null,
    body: input.body,
    providerTemplateName: input.providerTemplateName ?? null,
    providerTemplateLanguage: input.providerTemplateLanguage ?? null,
    providerTemplateComponents: input.providerTemplateComponents ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
