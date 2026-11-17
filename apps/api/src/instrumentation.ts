// Tracing setup for the API process: registers an OpenTelemetry tracer that exports to Langfuse.
//
// The AI layer (@sta/ai) only *records* observations with @langfuse/tracing. Without a registered
// tracer those calls are no-ops, so scripts and tests work without Langfuse. The app decides
// where traces go; here: Langfuse Cloud (LANGFUSE_HOST), keys from .env via config.
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { config } from '@sta/shared';

/** Starts tracing if enabled and configured. Returns a function that flushes and stops it. */
export function startTracing(): () => Promise<void> {
  const { langfusePublicKey, langfuseSecretKey, langfuseHost, langfuseTracingEnabled } =
    config.observability;

  if (!langfuseTracingEnabled) {
    console.log('[tracing] off (LANGFUSE_TRACING_ENABLED=false)');
    return async () => {};
  }
  if (!langfusePublicKey || !langfuseSecretKey || !langfuseHost) {
    console.log('[tracing] off (Langfuse keys or host not set in .env)');
    return async () => {};
  }

  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: langfusePublicKey,
        secretKey: langfuseSecretKey,
        baseUrl: langfuseHost,
        environment: config.app.nodeEnv,
      }),
    ],
  });
  provider.register();
  console.log(`[tracing] on -> ${langfuseHost}`);

  // Flush buffered spans before exit, or the last traces are lost.
  return () => provider.shutdown();
}
