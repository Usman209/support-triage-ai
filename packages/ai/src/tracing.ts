// Small tracing helpers shared by RAG answers and triage runs.
import { config } from '@sta/shared';

/** OpenTelemetry uses an all-zero trace id when tracing is off. */
const NO_TRACE = /^0+$/;

export function realTraceId(traceId: string): string | null {
  return NO_TRACE.test(traceId) ? null : traceId;
}

/** Deep link to a trace in the Langfuse UI (null when tracing is off or no project id). */
export function traceLink(traceId: string | null): string | null {
  const { langfuseHost, langfuseProjectId } = config.observability;
  if (!traceId || !langfuseHost || !langfuseProjectId) return null;
  return `${langfuseHost.replace(/\/$/, '')}/project/${langfuseProjectId}/traces/${traceId}`;
}
