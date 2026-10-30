const sequelize = require('../config/database');

const migrateReporteSoftDelete = async (database = sequelize) => database.transaction(async (transaction) => {
  await database.query(`
    ALTER TABLE reportes
      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "deletedBy" INTEGER;
  `, { transaction });

  await database.query(`
    CREATE INDEX IF NOT EXISTS idx_reportes_deleted_at
      ON reportes ("deletedAt")
      WHERE "deletedAt" IS NOT NULL;
  `, { transaction });

  await database.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'reportes'::regclass
          AND conname = 'fk_reportes_deleted_by'
      ) THEN
        ALTER TABLE reportes
          ADD CONSTRAINT fk_reportes_deleted_by
          FOREIGN KEY ("deletedBy") REFERENCES users(id)
          ON UPDATE CASCADE ON DELETE SET NULL;
      END IF;
    END $$;
  `, { transaction });

  await database.query(`
    DO $$
    DECLARE constraint_name TEXT;
    BEGIN
      FOR constraint_name IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'reporte_ejecuciones'::regclass
          AND confrelid = 'reportes'::regclass
          AND contype = 'f'
      LOOP
        EXECUTE format('ALTER TABLE reporte_ejecuciones DROP CONSTRAINT %I', constraint_name);
      END LOOP;

      ALTER TABLE reporte_ejecuciones
        ADD CONSTRAINT reporte_ejecuciones_reporteId_fkey
        FOREIGN KEY ("reporteId") REFERENCES reportes(id)
        ON UPDATE CASCADE ON DELETE RESTRICT;
    END $$;
  `, { transaction });
});

module.exports = { migrateReporteSoftDelete };
