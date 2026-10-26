const sequelize = require('../config/database');
const { HELP_MODULES } = require('../config/helpModules');

const allowedModulesSql = HELP_MODULES.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');

const migrateHelpAdmin = async (database = sequelize) => database.transaction(async (transaction) => {
  await database.query(`
    CREATE TABLE IF NOT EXISTS entradas_ayuda (
      "id" SERIAL PRIMARY KEY,
      "modulo" VARCHAR(64) NOT NULL,
      "pregunta" TEXT NOT NULL,
      "respuesta" TEXT NOT NULL,
      "orden" INTEGER NOT NULL,
      "activo" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `, { transaction });

  // Si la tabla ya existía, no convertir datos ni tipos de manera silenciosa.
  await database.query(`
    DO $$
    DECLARE incompatible_columns TEXT;
    BEGIN
      SELECT string_agg(expected.column_name, ', ') INTO incompatible_columns
      FROM (VALUES
        ('id', 'integer', NULL::integer),
        ('modulo', 'character varying', 64),
        ('pregunta', 'text', NULL::integer),
        ('respuesta', 'text', NULL::integer),
        ('orden', 'integer', NULL::integer),
        ('activo', 'boolean', NULL::integer),
        ('createdAt', 'timestamp with time zone', NULL::integer),
        ('updatedAt', 'timestamp with time zone', NULL::integer)
      ) AS expected(column_name, data_type, max_length)
      LEFT JOIN information_schema.columns AS actual
        ON actual.table_schema = current_schema()
        AND actual.table_name = 'entradas_ayuda'
        AND actual.column_name = expected.column_name
      WHERE actual.column_name IS NULL
        OR actual.data_type <> expected.data_type
        OR (expected.max_length IS NOT NULL
          AND actual.character_maximum_length IS DISTINCT FROM expected.max_length);

      IF incompatible_columns IS NOT NULL THEN
        RAISE EXCEPTION 'Esquema incompatible de entradas_ayuda: %', incompatible_columns;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'entradas_ayuda'::regclass AND contype = 'p'
      ) THEN
        RAISE EXCEPTION 'entradas_ayuda requiere una clave primaria';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'entradas_ayuda'
          AND column_name = 'id' AND is_identity = 'NO'
          AND (column_default IS NULL OR column_default NOT LIKE 'nextval(%')
      ) THEN
        RAISE EXCEPTION 'entradas_ayuda.id requiere autoincremento';
      END IF;
    END $$;
  `, { transaction });

  await database.query(`
    ALTER TABLE entradas_ayuda
      ALTER COLUMN "modulo" SET NOT NULL,
      ALTER COLUMN "pregunta" SET NOT NULL,
      ALTER COLUMN "respuesta" SET NOT NULL,
      ALTER COLUMN "orden" SET NOT NULL,
      ALTER COLUMN "activo" SET DEFAULT TRUE,
      ALTER COLUMN "activo" SET NOT NULL,
      ALTER COLUMN "createdAt" SET NOT NULL,
      ALTER COLUMN "updatedAt" SET NOT NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'entradas_ayuda'::regclass AND conname = 'chk_entradas_ayuda_contenido'
      ) THEN
        ALTER TABLE entradas_ayuda ADD CONSTRAINT chk_entradas_ayuda_contenido CHECK (
          btrim("pregunta") <> '' AND btrim("respuesta") <> ''
          AND position('<' in "pregunta") = 0 AND position('>' in "pregunta") = 0
          AND position('<' in "respuesta") = 0 AND position('>' in "respuesta") = 0
        );
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'entradas_ayuda'::regclass AND conname = 'chk_entradas_ayuda_orden'
      ) THEN
        ALTER TABLE entradas_ayuda ADD CONSTRAINT chk_entradas_ayuda_orden CHECK ("orden" >= 0);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'entradas_ayuda'::regclass AND conname = 'chk_entradas_ayuda_modulo'
      ) THEN
        ALTER TABLE entradas_ayuda ADD CONSTRAINT chk_entradas_ayuda_modulo
          CHECK ("modulo" IN (${allowedModulesSql}));
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_entradas_ayuda_admin
      ON entradas_ayuda ("modulo", "orden", "id");
    CREATE INDEX IF NOT EXISTS idx_entradas_ayuda_activas
      ON entradas_ayuda ("modulo", "orden", "id") WHERE "activo" IS TRUE;
  `, { transaction });
});

module.exports = { migrateHelpAdmin };
