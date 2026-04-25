import { z } from "zod";

export const NetworkSchema = z.enum(["instagram", "tiktok", "linkedin"]);

export const CreatePostSchema = z.object({
  body: z.string().max(5000).default(""),
  mediaId: z.string().nullable().optional(),
  pillarId: z.string().nullable().optional(),
  networks: z.array(NetworkSchema).optional().default([]),
});

export const UpdatePostSchema = z.object({
  body: z.string().max(5000).optional(),
  mediaId: z.string().nullable().optional(),
  pillarId: z.string().nullable().optional(),
  status: z.enum(["draft", "needs_review", "scheduled", "published", "failed"]).optional(),
});

export const UpdateTargetSchema = z.object({
  bodyOverride: z.string().max(5000).nullable().optional(),
  scheduledAt: z.number().int().nullable().optional(),
  targetRef: z.string().max(256).nullable().optional(),
});

export const PresignedUploadSchema = z.object({
  filename: z.string().min(1).max(256),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().max(500 * 1024 * 1024),
});

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);

export const ToneSchema = z.enum(["formal", "casual", "playful", "direct"]);

export const GenerateVariationsSchema = z.object({
  brief: z.string().min(3).max(2000),
  network: NetworkSchema.optional(),
  tone: ToneSchema.optional(),
});

export const RewriteForNetworkSchema = z.object({
  body: z.string().min(1).max(5000),
  network: NetworkSchema,
});

export const AdjustToneSchema = z.object({
  body: z.string().min(1).max(5000),
  tone: ToneSchema,
});
