const sequelize = require('../config/database');

const migrateMetaClosure = async (database = sequelize) => database.transaction(async (transaction) => {
  await database.query(`
    ALTER TABLE metas
      ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "finalSnapshot" JSONB;
    CREATE INDEX IF NOT EXISTS idx_metas_closure_due
      ON metas ("fechaLimite", id)
      WHERE "lifecycleStatus" = 'ACTIVA' AND "fechaLimite" IS NOT NULL;
  `, { transaction });

  await database.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'metas'::regclass AND conname = 'chk_metas_lifecycle'
          AND pg_get_constraintdef(oid) NOT LIKE '%CERRADA%'
      ) THEN
        ALTER TABLE metas DROP CONSTRAINT chk_metas_lifecycle;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'metas'::regclass AND conname = 'chk_metas_lifecycle'
      ) THEN
        ALTER TABLE metas ADD CONSTRAINT chk_metas_lifecycle CHECK (
          ("lifecycleStatus" = 'BORRADOR'
            AND "indicatorKey" IS NULL AND "valorMeta" IS NULL
            AND ("draftMetrics" IS NULL OR jsonb_typeof("draftMetrics") = 'array')
            AND "closedAt" IS NULL AND "finalSnapshot" IS NULL)
          OR
          ("lifecycleStatus" = 'ACTIVA'
            AND "indicatorKey" IS NOT NULL AND "valorMeta" IS NOT NULL
            AND "draftMetrics" IS NULL AND "closedAt" IS NULL AND "finalSnapshot" IS NULL)
          OR
          ("lifecycleStatus" = 'CERRADA'
            AND "indicatorKey" IS NOT NULL AND "valorMeta" IS NOT NULL
            AND "draftMetrics" IS NULL AND "closedAt" IS NOT NULL
            AND "finalSnapshot" IS NOT NULL
            AND jsonb_typeof("finalSnapshot") = 'object'
            AND "finalSnapshot" ?& ARRAY['version', 'totalProgress', 'elapsedProgress', 'status', 'metrics']
            AND "finalSnapshot"->>'version' = '1'
            AND jsonb_typeof("finalSnapshot"->'totalProgress') = 'number'
            AND jsonb_typeof("finalSnapshot"->'elapsedProgress') = 'number'
            AND "finalSnapshot"->>'status' IN ('cumplida', 'en_progreso', 'en_riesgo', 'no_cumplida')
            AND CASE WHEN jsonb_typeof("finalSnapshot"->'metrics') = 'array'
              THEN jsonb_array_length("finalSnapshot"->'metrics') > 0 ELSE false END)
        );
      END IF;
    END $$;
  `, { transaction });

  await database.query(`
    CREATE OR REPLACE FUNCTION guard_closed_meta() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW."lifecycleStatus" = 'CERRADA' THEN
          RAISE EXCEPTION 'Una meta no puede crearse cerrada' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END IF;
      IF OLD."lifecycleStatus" = 'CERRADA' THEN
        RAISE EXCEPTION 'Una meta cerrada no puede modificarse ni eliminarse' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'metas'::regclass AND tgname = 'trg_guard_closed_meta') THEN
        CREATE TRIGGER trg_guard_closed_meta BEFORE INSERT OR UPDATE OR DELETE ON metas
          FOR EACH ROW EXECUTE FUNCTION guard_closed_meta();
      END IF;
    END $$;
  `, { transaction });

  await database.query(`
    CREATE OR REPLACE FUNCTION guard_closed_meta_metric() RETURNS trigger AS $$
    DECLARE related_status varchar;
    BEGIN
      IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT "lifecycleStatus" INTO related_status FROM metas WHERE id = OLD."metaId" FOR UPDATE;
        IF related_status = 'CERRADA' THEN
          RAISE EXCEPTION 'Las métricas de una meta cerrada no pueden modificarse' USING ERRCODE = '23514';
        END IF;
      END IF;
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT "lifecycleStatus" INTO related_status FROM metas WHERE id = NEW."metaId" FOR UPDATE;
        IF related_status = 'CERRADA' THEN
          RAISE EXCEPTION 'Las métricas de una meta cerrada no pueden modificarse' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END IF;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'meta_metrics'::regclass AND tgname = 'trg_guard_closed_meta_metric') THEN
        CREATE TRIGGER trg_guard_closed_meta_metric BEFORE INSERT OR UPDATE OR DELETE ON meta_metrics
          FOR EACH ROW EXECUTE FUNCTION guard_closed_meta_metric();
      END IF;
    END $$;
  `, { transaction });
});

module.exports = { migrateMetaClosure };
