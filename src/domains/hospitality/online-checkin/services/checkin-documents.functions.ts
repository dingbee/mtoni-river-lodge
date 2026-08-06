import { createServerFn } from "@tanstack/react-start";
import { documentIdSchema, documentSessionSchema, documentUploadSchema } from "./documents-shared";

export const listCheckInDocuments = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => documentSessionSchema.parse(d))
  .handler(async ({ data }) => {
    const mod = await import("./checkin-documents.server");
    return mod.listDocuments(data);
  });

export const uploadCheckInDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => documentUploadSchema.parse(d))
  .handler(async ({ data }) => {
    const mod = await import("./checkin-documents.server");
    return mod.uploadDocument(data);
  });

export const removeCheckInDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => documentIdSchema.parse(d))
  .handler(async ({ data }) => {
    const mod = await import("./checkin-documents.server");
    return mod.removeDocument(data);
  });

export const previewCheckInDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => documentIdSchema.parse(d))
  .handler(async ({ data }) => {
    const mod = await import("./checkin-documents.server");
    return mod.previewDocument(data);
  });
