/**
 * Central config loader (the ONLY file allowed to read process.env).
 *
 * - Loads the nearest .env file (searching upward from the current directory).
 *   Variables already set in the environment win, so CI/containers can inject them.
 * - Validates every variable with Zod and fails fast with a readable error.
 * - Exports one typed `config` object. Every other package imports it from '@sta/shared'.
 *
 * Settings have NO defaults here: their values live in .env (see .env.example).
 * Secrets and integration URLs are optional at the skeleton stage; later tasks
 * tighten them (e.g. require ANTHROPIC_API_KEY when LLM_PROVIDER=anthropic).
 *
 * Server-side only: never import this into a Next.js client component.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

function findEnvFile(startDir: string): string | undefined {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const envFile = findEnvFile(process.cwd());
if (envFile) process.loadEnvFile(envFile);

// Relative paths in .env are resolved from the project root (the folder that holds .env),
// so scripts work no matter which package folder they run from.
const projectRoot = envFile ? dirname(envFile) : process.cwd();

// Treat blank values ("KEY=") as missing.
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const requiredString = () => z.preprocess(blankToUndefined, z.string());
const optionalString = () => z.preprocess(blankToUndefined, z.string().optional());
const optionalUrl = () => z.preprocess(blankToUndefined, z.url().optional());
const int = () => z.preprocess(blankToUndefined, z.coerce.number().int().nonnegative());
const num = () => z.preprocess(blankToUndefined, z.coerce.number().nonnegative());
const port = () => z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535));
const bool = () =>
  z.preprocess(
    blankToUndefined,
    z.enum(['true', 'false']).transform((v) => v === 'true'),
  );

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'test', 'production']),
  APP_NAME: requiredString(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
  API_PORT: port(),
  WEB_PORT: port(),
  API_URL: z.preprocess(blankToUndefined, z.url()),

  // Database
  DATABASE_URL: optionalUrl(),
  POSTGRES_USER: optionalString(),
  POSTGRES_PASSWORD: optionalString(),
  POSTGRES_DB: optionalString(),

  // LLM providers
  LLM_PROVIDER: z.enum(['anthropic', 'groq', 'openai', 'ollama']),
  ANTHROPIC_API_KEY: optionalString(),
  OPENAI_API_KEY: optionalString(),
  GROQ_API_KEY: optionalString(),
  GROQ_BASE_URL: optionalUrl(),
  VOYAGE_API_KEY: optionalString(),
  VOYAGE_BASE_URL: optionalUrl(),
  OLLAMA_BASE_URL: optionalUrl(),
  MODEL_CHAT: optionalString(),
  MODEL_CHEAP: optionalString(),
  MODEL_JUDGE: optionalString(),
  EMBEDDING_PROVIDER: z.enum(['voyage', 'openai', 'ollama']),
  MODEL_EMBEDDING: optionalString(),
  EMBEDDING_DIMENSIONS: int(),
  // Ignored by current Claude models (they reject temperature); used by openai/ollama chat only.
  LLM_TEMPERATURE: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(2)),
  // Claude: how much thinking/effort per answer. Replaces temperature as the main quality/cost knob.
  LLM_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
  // Claude: on a safety refusal, let the API retry on a fallback model ('default') or not ('off').
  LLM_REFUSAL_FALLBACK: z.enum(['default', 'off']),
  LLM_MAX_OUTPUT_TOKENS: int(),
  LLM_TIMEOUT_MS: int(),
  LLM_MAX_RETRIES: int(),

  // RAG
  RAG_CHUNK_SIZE: int(),
  RAG_CHUNK_OVERLAP: int(),
  RAG_TOP_K: int(),
  RAG_RERANK_TOP_N: int(),
  RAG_MAX_DISTANCE: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(2)),
  RAG_RERANKER: z.enum(['none', 'cohere', 'local']),
  COHERE_API_KEY: optionalString(),
  KNOWLEDGE_BASE_DIR: requiredString(),
  TICKETS_CSV_PATH: requiredString(),

  // Agent and approvals
  AGENT_MAX_STEPS: int(),
  AGENT_REQUIRE_APPROVAL: bool(),
  APPROVAL_TIMEOUT_MINUTES: int(),

  // Guardrails and privacy
  PII_REDACTION_ENABLED: bool(),
  PROMPT_INJECTION_CHECK_ENABLED: bool(),
  AUDIT_LOG_ENABLED: bool(),

  // Observability
  LANGFUSE_PUBLIC_KEY: optionalString(),
  LANGFUSE_SECRET_KEY: optionalString(),
  LANGFUSE_HOST: optionalUrl(),
  LANGFUSE_TRACING_ENABLED: bool(),
  LANGFUSE_PROJECT_ID: optionalString(),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl(),
  OTEL_SERVICE_NAME: requiredString(),

  // Cost and rate limits
  DAILY_BUDGET_USD: num(),
  RATE_LIMIT_PER_MINUTE: int(),

  // Integrations
  TICKETING_API_URL: optionalUrl(),
  TICKETING_API_KEY: optionalString(),
  OIDC_ISSUER_URL: optionalUrl(),
  OIDC_CLIENT_ID: optionalString(),
  OIDC_CLIENT_SECRET: optionalString(),

  // Object storage (MinIO). Root credentials are deliberately not loaded into the app.
  MINIO_ENDPOINT: optionalUrl(),
  MINIO_REGION: optionalString(),
  MINIO_PUBLIC_BUCKET: optionalString(),
  MINIO_APP_ACCESS_KEY: optionalString(),
  MINIO_APP_SECRET_KEY: optionalString(),

  // Feature flags
  FEATURE_AGENT_ENABLED: bool(),
  FEATURE_RAG_ENABLED: bool(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    'Invalid environment configuration (check your .env against .env.example):\n' +
      z.prettifyError(parsed.error),
  );
}
const env = parsed.data;

export const config = Object.freeze({
  app: {
    nodeEnv: env.NODE_ENV,
    name: env.APP_NAME,
    logLevel: env.LOG_LEVEL,
    apiPort: env.API_PORT,
    webPort: env.WEB_PORT,
    apiUrl: env.API_URL,
  },
  db: {
    url: env.DATABASE_URL,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
  },
  llm: {
    provider: env.LLM_PROVIDER,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    groqApiKey: env.GROQ_API_KEY,
    groqBaseUrl: env.GROQ_BASE_URL,
    voyageApiKey: env.VOYAGE_API_KEY,
    voyageBaseUrl: env.VOYAGE_BASE_URL,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    models: {
      chat: env.MODEL_CHAT,
      cheap: env.MODEL_CHEAP,
      judge: env.MODEL_JUDGE,
      embedding: env.MODEL_EMBEDDING,
    },
    embeddingProvider: env.EMBEDDING_PROVIDER,
    embeddingDimensions: env.EMBEDDING_DIMENSIONS,
    temperature: env.LLM_TEMPERATURE,
    effort: env.LLM_EFFORT,
    refusalFallback: env.LLM_REFUSAL_FALLBACK,
    maxOutputTokens: env.LLM_MAX_OUTPUT_TOKENS,
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
  },
  rag: {
    chunkSize: env.RAG_CHUNK_SIZE,
    chunkOverlap: env.RAG_CHUNK_OVERLAP,
    topK: env.RAG_TOP_K,
    rerankTopN: env.RAG_RERANK_TOP_N,
    maxDistance: env.RAG_MAX_DISTANCE,
    reranker: env.RAG_RERANKER,
    cohereApiKey: env.COHERE_API_KEY,
    /** Absolute path of the knowledge-base folder. */
    knowledgeBaseDir: resolve(projectRoot, env.KNOWLEDGE_BASE_DIR),
    /** Absolute path of the ticket dataset CSV (task 4.2). */
    ticketsCsvPath: resolve(projectRoot, env.TICKETS_CSV_PATH),
    /** Project root, used to store document sources as stable relative paths. */
    projectRoot,
  },
  agent: {
    maxSteps: env.AGENT_MAX_STEPS,
    requireApproval: env.AGENT_REQUIRE_APPROVAL,
    approvalTimeoutMinutes: env.APPROVAL_TIMEOUT_MINUTES,
  },
  guardrails: {
    piiRedactionEnabled: env.PII_REDACTION_ENABLED,
    promptInjectionCheckEnabled: env.PROMPT_INJECTION_CHECK_ENABLED,
    auditLogEnabled: env.AUDIT_LOG_ENABLED,
  },
  observability: {
    langfusePublicKey: env.LANGFUSE_PUBLIC_KEY,
    langfuseSecretKey: env.LANGFUSE_SECRET_KEY,
    langfuseHost: env.LANGFUSE_HOST,
    langfuseTracingEnabled: env.LANGFUSE_TRACING_ENABLED,
    langfuseProjectId: env.LANGFUSE_PROJECT_ID,
    otelExporterEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelServiceName: env.OTEL_SERVICE_NAME,
  },
  limits: {
    dailyBudgetUsd: env.DAILY_BUDGET_USD,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
  },
  integrations: {
    ticketingApiUrl: env.TICKETING_API_URL,
    ticketingApiKey: env.TICKETING_API_KEY,
    oidcIssuerUrl: env.OIDC_ISSUER_URL,
    oidcClientId: env.OIDC_CLIENT_ID,
    oidcClientSecret: env.OIDC_CLIENT_SECRET,
  },
  storage: {
    endpoint: env.MINIO_ENDPOINT,
    region: env.MINIO_REGION,
    publicBucket: env.MINIO_PUBLIC_BUCKET,
    accessKey: env.MINIO_APP_ACCESS_KEY,
    secretKey: env.MINIO_APP_SECRET_KEY,
  },
  features: {
    agentEnabled: env.FEATURE_AGENT_ENABLED,
    ragEnabled: env.FEATURE_RAG_ENABLED,
  },
});

export type Config = typeof config;
