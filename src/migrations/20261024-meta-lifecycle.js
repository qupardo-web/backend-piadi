const sequelize = require('../config/database');

const migrateMetaLifecycle = async (database = sequelize) => database.transaction(async (transaction) => {
  await database.query(`
    ALTER TABLE metas
      ADD COLUMN IF NOT EXISTS "lifecycleStatus" VARCHAR(16),
      ADD COLUMN IF NOT EXISTS "draftMetrics" JSONB;
  `, { transaction });

  await database.query(`
    UPDATE metas SET "lifecycleStatus" = 'ACTIVA' WHERE "lifecycleStatus" IS NULL;
    ALTER TABLE metas ALTER COLUMN "lifecycleStatus" SET DEFAULT 'ACTIVA';
    ALTER TABLE metas ALTER COLUMN "lifecycleStatus" SET NOT NULL;
    ALTER TABLE metas ALTER COLUMN "indicatorKey" DROP NOT NULL;
    ALTER TABLE metas ALTER COLUMN "valorMeta" DROP NOT NULL;
  `, { transaction });

  await database.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'metas'::regclass AND conname = 'chk_metas_lifecycle'
      ) THEN
        ALTER TABLE metas ADD CONSTRAINT chk_metas_lifecycle CHECK (
          ("lifecycleStatus" = 'ACTIVA'
            AND "indicatorKey" IS NOT NULL AND "valorMeta" IS NOT NULL
            AND "draftMetrics" IS NULL)
          OR
          ("lifecycleStatus" = 'BORRADOR'
            AND "indicatorKey" IS NULL AND "valorMeta" IS NULL
            AND ("draftMetrics" IS NULL OR jsonb_typeof("draftMetrics") = 'array'))
        );
      END IF;
    END $$;
  `, { transaction });
});

module.exports = { migrateMetaLifecycle };
