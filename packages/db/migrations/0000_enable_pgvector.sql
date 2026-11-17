-- Custom migration: turn on the pgvector extension (adds the "vector" type and distance operators).
-- drizzle-kit never generates CREATE EXTENSION, so this one is written by hand and runs first.
CREATE EXTENSION IF NOT EXISTS vector;
