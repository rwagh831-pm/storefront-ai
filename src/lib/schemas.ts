import { z } from "zod";

// ---------- Shared enums ----------
export const FORMATS = [
  "ebook",
  "template_pack",
  "mini_course",
  "workshop",
  "cohort_course",
  "one_on_one",
  "community",
] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABELS: Record<Format, string> = {
  ebook: "Ebook / Guide",
  template_pack: "Template pack",
  mini_course: "Recorded mini-course",
  workshop: "Live workshop",
  cohort_course: "Cohort course",
  one_on_one: "1:1 call",
  community: "Paid community",
};

export const LANGUAGES = ["English", "Hinglish", "Hindi"] as const;
export type Language = (typeof LANGUAGES)[number];

export const TIERS = ["expert", "nano", "micro", "mid"] as const;
export type Tier = (typeof TIERS)[number];

// ---------- Creator profile (what we understood about the creator) ----------
export const CreatorProfileSchema = z.object({
  name: z.string(),
  handle: z.string().nullable(),
  niche: z.string(),
  nicheGroup: z.enum(["high_roi", "personal", "lifestyle"]),
  followers: z.number().nullable(),
  language: z.enum(LANGUAGES),
  audience: z.string(),
  strengths: z.array(z.string()),
  demandSignals: z.array(z.string()),
  credentials: z.array(z.string()),
  riskFlags: z.array(z.string()),
});
export type CreatorProfile = z.infer<typeof CreatorProfileSchema> & {
  source: "sample_instagram" | "description";
};

// LLM output for the "understand" step (description → profile)
export const UnderstandOutputSchema = z.object({
  usable: z.boolean(),
  reasonIfNotUsable: z.string(),
  profile: CreatorProfileSchema,
  followUpQuestions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      options: z.array(z.string()),
    })
  ),
});
export type UnderstandOutput = z.infer<typeof UnderstandOutputSchema>;

// ---------- Store (what the creator publishes) ----------
export const ProductSchema = z.object({
  title: z.string(),
  format: z.enum(FORMATS),
  description: z.string(),
  whoItsFor: z.string(),
  deliverables: z.array(z.string()),
  price: z.number(),
  priceReason: z.string(),
});
export type Product = z.infer<typeof ProductSchema>;

export const SafetyNoteSchema = z.object({
  issue: z.string(),
  action: z.string(),
});
export type SafetyNote = z.infer<typeof SafetyNoteSchema>;

export const StoreOutputSchema = z.object({
  displayName: z.string(),
  tagline: z.string(),
  bio: z.string(),
  products: z.array(ProductSchema),
  shareCaption: z.string(),
  safetyNotes: z.array(SafetyNoteSchema),
});
export type StoreOutput = z.infer<typeof StoreOutputSchema>;

export type Store = StoreOutput & {
  language: Language;
  theme: ThemeName;
};

export const BioOutputSchema = z.object({ tagline: z.string(), bio: z.string() });
export const SingleProductOutputSchema = z.object({ product: ProductSchema });

export const THEMES = ["sunset", "ocean", "forest", "plum"] as const;
export type ThemeName = (typeof THEMES)[number];

// ---------- API request validation ----------
export const ProfileRequestSchema = z.object({
  mode: z.enum(["handle", "description"]),
  handle: z.string().optional(),
  description: z.string().optional(),
  answers: z.record(z.string(), z.string()).optional(),
});

export const GenerateRequestSchema = z.object({
  profile: CreatorProfileSchema.extend({
    source: z.enum(["sample_instagram", "description"]),
  }),
  language: z.enum(LANGUAGES),
  target: z.union([
    z.object({ type: z.literal("all") }),
    z.object({ type: z.literal("bio") }),
    z.object({ type: z.literal("product"), index: z.number().int().min(0).max(3) }),
  ]),
  store: z.any().optional(),
});

export const PublishRequestSchema = z.object({
  store: z.object({
    displayName: z.string().min(1).max(80),
    tagline: z.string().max(160),
    bio: z.string().min(1).max(600),
    products: z
      .array(
        z.object({
          title: z.string().min(1).max(100),
          format: z.enum(FORMATS),
          description: z.string().min(1).max(700),
          whoItsFor: z.string().max(200),
          deliverables: z.array(z.string().max(120)).max(8),
          price: z.number().int().min(0).max(99999),
          priceReason: z.string().max(300),
        })
      )
      .min(1)
      .max(4),
    shareCaption: z.string().max(600),
    safetyNotes: z.array(z.object({ issue: z.string(), action: z.string() })).max(10),
    language: z.enum(LANGUAGES),
    theme: z.enum(THEMES),
  }),
  handle: z.string().nullable(),
  slug: z.string().optional(),
  editToken: z.string().optional(),
  startedAt: z.number().optional(),
});
