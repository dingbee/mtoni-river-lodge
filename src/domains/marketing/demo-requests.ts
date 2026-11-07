import { z } from "zod";

export const stayNasDemoRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().default(""),
  company: z.string().trim().max(160).optional().default(""),
  country: z.string().trim().max(100).optional().default(""),
  propertyType: z.string().trim().min(2).max(80),
  properties: z.enum(["1", "2-5", "6-20", "21+"]),
  interests: z.array(z.string().trim().min(2).max(80)).max(12).default([]),
  message: z.string().trim().max(2000).optional().default(""),
  website: z.string().max(500).optional().default(""),
});

export type StayNasDemoRequest = z.infer<typeof stayNasDemoRequestSchema>;
