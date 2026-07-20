import { z } from "zod";

const booleanText = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
  SERVICE_NAME: z.string().trim().min(1).default("margem-clara-api"),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  AUTH_LOOKUP_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(28_800),
  AUTH_FAILURE_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  AUTH_MAX_FAILURES_PER_EMAIL: z.coerce.number().int().min(3).max(20).default(5),
  AUTH_MAX_FAILURES_PER_IP: z.coerce.number().int().min(5).max(100).default(20),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  TRUST_PROXY: booleanText,
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }

  return result.data;
}
