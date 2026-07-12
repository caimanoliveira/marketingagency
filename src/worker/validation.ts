import { z } from "zod";

export const NetworkSchema = z.enum(["instagram", "tiktok", "linkedin"]);

export const CreatePostSchema = z.object({
  body: z.string().max(5000).default(""),
  mediaId: z.string().nullable().optional(),
  networks: z.array(NetworkSchema).optional().default([]),
});

export const UpdatePostSchema = z.object({
  body: z.string().max(5000).optional(),
  mediaId: z.string().nullable().optional(),
  status: z.enum(["draft", "scheduled"]).optional(),
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

export const ViralGoalSchema = z.enum(["seguidores", "vendas", "autoridade", "engajamento"]);

export const GenerateHooksSchema = z.object({
  niche: z.string().min(2).max(200),
  topic: z.string().min(2).max(500),
  network: NetworkSchema.optional(),
});

export const GenerateReelsScriptSchema = z.object({
  niche: z.string().min(2).max(200),
  topic: z.string().min(2).max(500),
  durationSec: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(90)]),
  goal: ViralGoalSchema,
  tone: ToneSchema.optional(),
});

export const GenerateCarouselSchema = z.object({
  niche: z.string().min(2).max(200),
  topic: z.string().min(2).max(500),
  slideCount: z.number().int().min(5).max(10),
  goal: ViralGoalSchema,
  tone: ToneSchema.optional(),
});

export const RemodelViralSchema = z.object({
  reference: z.string().min(20).max(8000),
  niche: z.string().min(2).max(200),
  topic: z.string().max(500).optional(),
  tone: ToneSchema.optional(),
});

export const ViralScoreSchema = z.object({
  content: z.string().min(20).max(8000),
  network: NetworkSchema.optional(),
});
