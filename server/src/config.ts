import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  APP_ORIGIN: z.string().url(),
  API_PUBLIC_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SIGNING_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY_BASE64: z.string().min(40),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  GMAIL_EXPECTED_SENDER: z.string().email(),
  PLATFORM_ADMIN_EMAIL: z.string().email(),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  LOG_LEVEL: z.string().default("info"),
  METRICS_TOKEN: z.string().min(20),
  SESSION_COOKIE_NAME: z.string().default("cargoform_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  AUTH_TOKEN_TTL_MINUTES: z.coerce.number().int().min(10).max(120).default(30),
});

export const config = schema.parse(process.env);
