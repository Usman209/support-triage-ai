// Browser-safe entry point of @sta/shared: schemas, constants and types only.
// It must NOT import config.ts (which reads .env from disk and holds secrets).
// Use in client components:  import { TICKET_PRIORITIES } from '@sta/shared/client';
export * from './schemas/chat';
export * from './schemas/triage';
export * from './schemas/approvals';
