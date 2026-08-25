-- ===========================================================================
-- 0009_vector_optional
-- Upgrade the embeddings table to native pgvector *when the extension is
-- available*. Supabase ships pgvector, so production gets an HNSW index and
-- true ANN search; a plain PostgreSQL box without the extension keeps the
-- float8[] column and the application falls back to exact cosine similarity
-- computed in SQL. Either way the migration applies cleanly.
-- ===========================================================================

DO $$
DECLARE
  has_vector boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector')
    INTO has_vector;

  IF NOT has_vector THEN
    RAISE NOTICE 'pgvector unavailable - embeddings stay on float8[] with exact cosine fallback';
    RETURN;
  END IF;

  EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';

  -- 1536 dimensions matches the default embedding model configured in
  -- src/lib/ai/embeddings.ts. Changing it requires a re-embed, not an ALTER.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'embeddings' AND column_name = 'embedding_vec'
  ) THEN
    EXECUTE 'ALTER TABLE embeddings ADD COLUMN embedding_vec vector(1536)';
    EXECUTE 'UPDATE embeddings SET embedding_vec = embedding::vector(1536) WHERE dimensions = 1536';
    EXECUTE 'CREATE INDEX idx_embeddings_hnsw ON embeddings '
         || 'USING hnsw (embedding_vec vector_cosine_ops)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Exact cosine similarity in pure SQL. Used when pgvector is absent, and as a
-- correctness reference for the ANN path. Marked IMMUTABLE/PARALLEL SAFE so
-- the planner can push it down.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cosine_similarity(a float8[], b float8[])
RETURNS float8 AS $$
DECLARE
  dot  float8 := 0;
  na   float8 := 0;
  nb   float8 := 0;
  i    integer;
BEGIN
  IF a IS NULL OR b IS NULL OR array_length(a, 1) IS DISTINCT FROM array_length(b, 1) THEN
    RETURN NULL;
  END IF;

  FOR i IN 1 .. array_length(a, 1) LOOP
    dot := dot + a[i] * b[i];
    na  := na  + a[i] * a[i];
    nb  := nb  + b[i] * b[i];
  END LOOP;

  IF na = 0 OR nb = 0 THEN
    RETURN 0;
  END IF;

  RETURN dot / (sqrt(na) * sqrt(nb));
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;
