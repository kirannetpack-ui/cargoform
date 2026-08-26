import { z } from "zod";
import "dotenv/config";

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

function databaseUrl(env: NodeJS.ProcessEnv) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (!env.DB_HOST || !env.DB_DATABASE || !env.DB_USERNAME || env.DB_PASSWORD == null) return undefined;
  const port = env.DB_PORT || "5432";
  return `postgresql://${encodeURIComponent(env.DB_USERNAME)}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${port}/${encodeURIComponent(env.DB_DATABASE)}?schema=public`;
}

// Laravel Cloud injects DB_* and AWS_* resource variables. Normalize those
// standard names here so the application remains portable and Prisma still
// receives its conventional DATABASE_URL.
const resolvedDatabaseUrl = databaseUrl(process.env);
if (resolvedDatabaseUrl) process.env.DATABASE_URL = resolvedDatabaseUrl;

const normalized = {
  ...process.env,
  DATABASE_URL: resolvedDatabaseUrl,
  OBJECT_STORAGE_ENDPOINT: process.env.OBJECT_STORAGE_ENDPOINT || process.env.AWS_ENDPOINT,
  OBJECT_STORAGE_REGION: process.env.OBJECT_STORAGE_REGION || process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION,
  OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET || process.env.AWS_BUCKET,
  OBJECT_STORAGE_ACCESS_KEY: process.env.OBJECT_STORAGE_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
  OBJECT_STORAGE_SECRET_KEY: process.env.OBJECT_STORAGE_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY,
};

export const config = schema.parse(normalized);
