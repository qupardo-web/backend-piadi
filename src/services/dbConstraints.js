const sequelize = require('../config/database');

async function initDbConstraints() {
  try {
    console.log('Applying database-level constraints, triggers, and SQL documentation for VCM...');

    // Identidad departamental nullable: no se infieren asignaciones para usuarios históricos.
    await sequelize.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "departmentId" VARCHAR(255);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_users_department ON users ("departmentId");
    `);
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_department'
        ) THEN
          ALTER TABLE users
            ADD CONSTRAINT fk_users_department FOREIGN KEY ("departmentId")
            REFERENCES departments(key) ON UPDATE CASCADE ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Compatibilidad PIADI-198: sequelize.sync() no agrega columnas a tablas existentes.
    await sequelize.query(`
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS "creatorId" INTEGER;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS "nombre" VARCHAR(255);
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS "fechaInicio" TIMESTAMP WITH TIME ZONE;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS "fechaLimite" TIMESTAMP WITH TIME ZONE;
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS "prioridad" VARCHAR(50);
      ALTER TABLE metas ADD COLUMN IF NOT EXISTS "comportamiento" VARCHAR(255);
      ALTER TABLE meta_metrics ADD COLUMN IF NOT EXISTS "lowerLimit" DECIMAL(12, 2);
      ALTER TABLE meta_metrics ADD COLUMN IF NOT EXISTS "upperLimit" DECIMAL(12, 2);
      ALTER TABLE indicator_definitions ADD COLUMN IF NOT EXISTS "name" VARCHAR(255);
      ALTER TABLE indicator_definitions ADD COLUMN IF NOT EXISTS "description" TEXT;
      ALTER TABLE plantillas ADD COLUMN IF NOT EXISTS "variante" VARCHAR(50);
      ALTER TABLE alumnos ADD COLUMN IF NOT EXISTS "fonoAct" VARCHAR(20);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_metas_creator ON metas ("creatorId");
    `);
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_metas_creator'
        ) THEN
          ALTER TABLE metas
            ADD CONSTRAINT fk_metas_creator FOREIGN KEY ("creatorId")
            REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;
        END IF;
      END $$;
    `);

    // 1. CHECK Constraints
    // Restricción: fechaDeTermino debe ser posterior a fechaDeFirma
    await sequelize.query(`
      DO $$
      BEGIN
        ALTER TABLE convenios DROP CONSTRAINT IF EXISTS chk_convenio_fechas;
        ALTER TABLE convenios ADD CONSTRAINT chk_convenio_fechas CHECK ("fechaDeTermino" > "fechaDeFirma");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. Triggers de validación antes de insertar/actualizar
    // Triggers en Actividades: Validar que totalParticipantes = participantesExternos + participantesInternos y que sea > 0
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_actividad_participants()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW."totalParticipantes" IS NULL OR NEW."participantesExternos" IS NULL OR NEW."participantesInternos" IS NULL THEN
              RAISE EXCEPTION 'Los campos de participantes no pueden ser nulos.';
          END IF;
          IF NEW."totalParticipantes" <> (NEW."participantesExternos" + NEW."participantesInternos") THEN
              RAISE EXCEPTION 'El total de participantes (%) debe ser la suma de externos (%) e internos (%).', 
                  NEW."totalParticipantes", NEW."participantesExternos", NEW."participantesInternos";
          END IF;
          IF NEW."totalParticipantes" <= 0 THEN
              RAISE EXCEPTION 'La actividad debe registrar al menos un participante.';
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sequelize.query(`
      DROP TRIGGER IF EXISTS trg_check_actividad_participants ON actividades;
    `);
    await sequelize.query(`
      CREATE TRIGGER trg_check_actividad_participants
      BEFORE INSERT OR UPDATE ON actividades
      FOR EACH ROW EXECUTE FUNCTION check_actividad_participants();
    `);

    // Triggers en Participaciones: Validar que totalPersonas = mujeres + hombres + noInforma
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_participacion_total()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW."totalPersonas" IS NULL OR NEW.mujeres IS NULL OR NEW.hombres IS NULL OR COALESCE(NEW."noInforma", 0) IS NULL THEN
              RAISE EXCEPTION 'Los campos de participantes no pueden ser nulos.';
          END IF;
          IF NEW."totalPersonas" <> (NEW.mujeres + NEW.hombres + COALESCE(NEW."noInforma", 0)) THEN
              RAISE EXCEPTION 'El total de personas (%) debe ser la suma de mujeres (%), hombres (%) y no informa (%).', 
                  NEW."totalPersonas", NEW.mujeres, NEW.hombres, COALESCE(NEW."noInforma", 0);
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sequelize.query(`
      DROP TRIGGER IF EXISTS trg_check_participacion_total ON participaciones;
    `);
    await sequelize.query(`
      CREATE TRIGGER trg_check_participacion_total
      BEFORE INSERT OR UPDATE ON participaciones
      FOR EACH ROW EXECUTE FUNCTION check_participacion_total();
    `);



    // --- PIADI-203: OPTIMIZACIÓN Y VISTA MATERIALIZADA ---
    console.log('Creating database indexes for metas and indicators optimization...');
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_indicator_definitions_dept_key ON indicator_definitions ("departmentId", "key");
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_metas_dept_ind_key ON metas ("departmentId", "indicatorKey");
    `);

    console.log('Creating materialized view v_meta_indicator_values...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS rendimiento_asignatura (
        id SERIAL PRIMARY KEY,
        rut INTEGER NOT NULL,
        "codCli" VARCHAR(50),
        "ramoEquiv" VARCHAR(50) NOT NULL,
        seccion INTEGER,
        anio INTEGER NOT NULL,
        periodo INTEGER NOT NULL,
        "notaFinal" DECIMAL(3, 1),
        "estadoAsignatura" VARCHAR(20) NOT NULL DEFAULT 'APROBADO',
        asistencia DECIMAL(5, 2),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS practicas (
        id SERIAL PRIMARY KEY,
        rut INTEGER NOT NULL,
        "codCli" VARCHAR(50),
        anio INTEGER NOT NULL,
        periodo INTEGER NOT NULL,
        "tipoPractica" VARCHAR(100) NOT NULL,
        estado VARCHAR(50) NOT NULL,
        "fechaInicio" DATE,
        "fechaTermino" DATE,
        horas INTEGER,
        empresa VARCHAR(150),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS titulacion (
        id SERIAL PRIMARY KEY,
        rut INTEGER NOT NULL,
        "codCli" VARCHAR(50),
        "anioTitulacion" INTEGER NOT NULL,
        periodo INTEGER NOT NULL,
        cohorte INTEGER NOT NULL,
        "tiempoNormativo" DECIMAL(4, 1),
        "semestresCursados" DECIMAL(4, 1),
        "fechaTitulacion" DATE,
        distincion VARCHAR(50),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      DROP MATERIALIZED VIEW IF EXISTS v_meta_indicator_values CASCADE;
    `);
    await sequelize.query(`
      CREATE MATERIALIZED VIEW v_meta_indicator_values AS
      -- 1. Educación Continua - oferta_programada
      SELECT 
        'oferta_programada'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        anio AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM programas
      GROUP BY anio

      UNION ALL

      SELECT 
        'oferta_programada'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        anio AS anio,
        CASE WHEN LOWER(semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM programas
      GROUP BY anio, semestre

      UNION ALL

      -- 2. Educación Continua - cursos_dictados
      SELECT 
        'cursos_dictados'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        COUNT(CASE WHEN LOWER(r.ejecutado) IN ('si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado') THEN 1 END)::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'cursos_dictados'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(CASE WHEN LOWER(r.ejecutado) IN ('si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado') THEN 1 END)::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 3. Educación Continua - tasa_ejecucion
      SELECT 
        'tasa_ejecucion'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        CASE WHEN COUNT(p.*) = 0 THEN 0 ELSE ROUND((COUNT(CASE WHEN LOWER(r.ejecutado) IN ('si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado') THEN 1 END)::NUMERIC / COUNT(p.*)::NUMERIC) * 100, 2) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'tasa_ejecucion'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        CASE WHEN COUNT(p.*) = 0 THEN 0 ELSE ROUND((COUNT(CASE WHEN LOWER(r.ejecutado) IN ('si', 'sí', 'true', '1', 'x', 'ejecutado', 'dictado', 'realizado', 'finalizado') THEN 1 END)::NUMERIC / COUNT(p.*)::NUMERIC) * 100, 2) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 4. Educación Continua - matricula_por_programa
      SELECT 
        'matricula_por_programa'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(SUM(r.matricula), 0)::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'matricula_por_programa'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COALESCE(SUM(r.matricula), 0)::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 5. Educación Continua - tasa_aprobacion
      SELECT 
        'tasa_aprobacion'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        CASE WHEN COALESCE(SUM(r.matricula), 0) = 0 THEN 0 ELSE ROUND((COALESCE(SUM(r.aprobados), 0)::NUMERIC / COALESCE(SUM(r.matricula), 0)::NUMERIC) * 100, 2) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'tasa_aprobacion'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        CASE WHEN COALESCE(SUM(r.matricula), 0) = 0 THEN 0 ELSE ROUND((COALESCE(SUM(r.aprobados), 0)::NUMERIC / COALESCE(SUM(r.matricula), 0)::NUMERIC) * 100, 2) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 6. Educación Continua - ingresos_generados
      SELECT 
        'ingresos_generados'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(SUM(f."ingresosNetosCLP"), 0)::numeric AS value
      FROM programas p
      LEFT JOIN estados_financieros_programa f ON p."idPrograma" = f."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'ingresos_generados'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COALESCE(SUM(f."ingresosNetosCLP"), 0)::numeric AS value
      FROM programas p
      LEFT JOIN estados_financieros_programa f ON p."idPrograma" = f."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 7. Educación Continua - ticket_promedio
      SELECT 
        'ticket_promedio'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        'Anual'::varchar AS periodo,
        CASE WHEN COALESCE(SUM(r.matricula), 0) = 0 THEN 0 ELSE ROUND(COALESCE(SUM(f."ingresosNetosCLP"), 0)::NUMERIC / COALESCE(SUM(r.matricula), 0)::NUMERIC) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      LEFT JOIN estados_financieros_programa f ON p."idPrograma" = f."idPrograma"
      GROUP BY p.anio

      UNION ALL

      SELECT 
        'ticket_promedio'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        p.anio AS anio,
        CASE WHEN LOWER(p.semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        CASE WHEN COALESCE(SUM(r.matricula), 0) = 0 THEN 0 ELSE ROUND(COALESCE(SUM(f."ingresosNetosCLP"), 0)::NUMERIC / COALESCE(SUM(r.matricula), 0)::NUMERIC) END::numeric AS value
      FROM programas p
      LEFT JOIN resultados_programa r ON p."idPrograma" = r."idPrograma"
      LEFT JOIN estados_financieros_programa f ON p."idPrograma" = f."idPrograma"
      GROUP BY p.anio, p.semestre

      UNION ALL

      -- 8. Educación Continua - participantes_unicos
      SELECT 
        'participantes_unicos'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        CAST(anio AS INTEGER) AS anio,
        'Anual'::varchar AS periodo,
        COUNT(DISTINCT "idParticipante")::numeric AS value
      FROM matriculas_programa
      GROUP BY anio

      UNION ALL

      SELECT 
        'participantes_unicos'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        CAST(anio AS INTEGER) AS anio,
        CASE WHEN LOWER(semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(DISTINCT "idParticipante")::numeric AS value
      FROM matriculas_programa
      GROUP BY anio, semestre

      UNION ALL

      -- 9. Educación Continua - recurrencia_formativa
      SELECT 
        'recurrencia_formativa'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        CAST(anio AS INTEGER) AS anio,
        'Anual'::varchar AS periodo,
        COUNT(DISTINCT "idParticipante")::numeric AS value
      FROM matriculas_programa
      WHERE "nCursos" > 1 OR LOWER("tieneMasCursos") IN ('si', 'sí', 'true', '1', 'x', 'verdadero')
      GROUP BY anio

      UNION ALL

      SELECT 
        'recurrencia_formativa'::varchar AS "indicatorKey",
        'educacion_continua'::varchar AS "departmentId",
        CAST(anio AS INTEGER) AS anio,
        CASE WHEN LOWER(semestre) IN ('1', 'primer semestre', '1er semestre') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(DISTINCT "idParticipante")::numeric AS value
      FROM matriculas_programa
      WHERE "nCursos" > 1 OR LOWER("tieneMasCursos") IN ('si', 'sí', 'true', '1', 'x', 'verdadero')
      GROUP BY anio, semestre

      -- --- 2. VCM INDICATORS ---
      UNION ALL

      SELECT
        'total_convenios'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        "anioFirma" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM convenios
      GROUP BY "anioFirma"

      UNION ALL

      SELECT
        'convenios_por_sector'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        "anioFirma" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM convenios
      GROUP BY "anioFirma"

      UNION ALL

      SELECT
        'convenios_activos'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        "anioFirma" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(CASE WHEN LOWER(estado) IN ('activo', 'vigente') THEN 1 END)::numeric AS value
      FROM convenios
      GROUP BY "anioFirma"

      UNION ALL

      SELECT
        'actividades_realizadas'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        anio AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM actividades
      GROUP BY anio

      UNION ALL

      SELECT
        'participaciones'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        anio AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(SUM("totalPersonas"), 0)::numeric AS value
      FROM participaciones
      GROUP BY anio

      UNION ALL

      SELECT
        'articulaciones_tp'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        anio AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM articulaciones_tp
      GROUP BY anio

      UNION ALL

      SELECT
        'proyectos_vcm'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        "anioInicio" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM proyectos
      GROUP BY "anioInicio"

      UNION ALL

      SELECT
        'financiamiento_vcm'::varchar AS "indicatorKey",
        'vinculacion_medio'::varchar AS "departmentId",
        p."anioInicio" AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(SUM(f."montoAdjudicado"), 0)::numeric AS value
      FROM proyectos p
      LEFT JOIN financiamientos f ON p."idProyecto" = f."idProyecto"
      GROUP BY p."anioInicio"

      -- --- 3. INNOVACION INDICATORS ---
      UNION ALL

      -- 18. Innovación - secciones_curso
      SELECT 
        'secciones_curso'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        anio AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM secciones
      WHERE LOWER(curso) = 'emprendimiento e innovacion' OR LOWER(curso) = 'emprendimiento e innovación'
      GROUP BY anio

      UNION ALL

      SELECT 
        'secciones_curso'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        anio AS anio,
        CASE WHEN LOWER(semestre) IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM secciones
      WHERE LOWER(curso) = 'emprendimiento e innovacion' OR LOWER(curso) = 'emprendimiento e innovación'
      GROUP BY anio, CASE WHEN LOWER(semestre) IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 19. Innovación - proyectos_activos
      SELECT 
        'proyectos_activos'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        y.anio AS anio,
        'Anual'::varchar AS periodo,
        COUNT(p."idProyecto")::numeric AS value
      FROM (
        SELECT DISTINCT "anioInicio" AS anio FROM proyectos WHERE "anioInicio" IS NOT NULL
        UNION
        SELECT DISTINCT "anioTermino" AS anio FROM proyectos WHERE "anioTermino" IS NOT NULL
        UNION
        SELECT DISTINCT anio FROM metas WHERE anio IS NOT NULL AND "lifecycleStatus" = 'ACTIVA'
        UNION
        SELECT generate_series(2020, 2030) AS anio
      ) y
      LEFT JOIN proyectos p ON LOWER(p."tipoProyecto") IN ('estudiantil', 'institucional')
        AND p."anioInicio" <= y.anio AND p."anioTermino" >= y.anio
      GROUP BY y.anio

      UNION ALL

      SELECT 
        'proyectos_activos'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        y.anio AS anio,
        sem.periodo::varchar AS periodo,
        COUNT(p."idProyecto")::numeric AS value
      FROM (
        SELECT DISTINCT "anioInicio" AS anio FROM proyectos WHERE "anioInicio" IS NOT NULL
        UNION
        SELECT DISTINCT "anioTermino" AS anio FROM proyectos WHERE "anioTermino" IS NOT NULL
        UNION
        SELECT DISTINCT anio FROM metas WHERE anio IS NOT NULL AND "lifecycleStatus" = 'ACTIVA'
        UNION
        SELECT generate_series(2020, 2030) AS anio
      ) y
      CROSS JOIN (VALUES ('Semestre 1'), ('Semestre 2')) AS sem(periodo)
      LEFT JOIN proyectos p ON LOWER(p."tipoProyecto") IN ('estudiantil', 'institucional')
        AND p."anioInicio" <= y.anio AND p."anioTermino" >= y.anio
      GROUP BY y.anio, sem.periodo

      UNION ALL

      -- 20. Innovación - total_proyectos
      SELECT 
        'total_proyectos'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        "anioInicio" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM proyectos
      WHERE LOWER("tipoProyecto") IN ('estudiantil', 'institucional')
      GROUP BY "anioInicio"

      UNION ALL

      SELECT 
        'total_proyectos'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        "anioInicio" AS anio,
        CASE WHEN LOWER("semestreInicio") IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM proyectos
      WHERE LOWER("tipoProyecto") IN ('estudiantil', 'institucional')
      GROUP BY "anioInicio", CASE WHEN LOWER("semestreInicio") IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 21. Innovación - financiamiento_obtenido
      SELECT 
        'financiamiento_obtenido'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        p."anioInicio" AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(SUM(f."montoAdjudicado"), 0)::numeric AS value
      FROM proyectos p
      JOIN financiamientos f ON p."idProyecto" = f."idProyecto"
      WHERE LOWER(p."tipoProyecto") IN ('estudiantil', 'institucional')
        AND LOWER(f."financiamientoExterno") IN ('si', 'sí', 'true', '1', 'x', 'verdadero', 'fondo concursable externo')
      GROUP BY p."anioInicio"

      UNION ALL

      SELECT 
        'financiamiento_obtenido'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        p."anioInicio" AS anio,
        CASE WHEN LOWER(p."semestreInicio") IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COALESCE(SUM(f."montoAdjudicado"), 0)::numeric AS value
      FROM proyectos p
      JOIN financiamientos f ON p."idProyecto" = f."idProyecto"
      WHERE LOWER(p."tipoProyecto") IN ('estudiantil', 'institucional')
        AND LOWER(f."financiamientoExterno") IN ('si', 'sí', 'true', '1', 'x', 'verdadero', 'fondo concursable externo')
      GROUP BY p."anioInicio", CASE WHEN LOWER(p."semestreInicio") IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 22. Innovación - proyectos_con_financiamiento_externo
      SELECT 
        'proyectos_con_financiamiento_externo'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        p."anioInicio" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(DISTINCT p."idProyecto")::numeric AS value
      FROM proyectos p
      JOIN financiamientos f ON p."idProyecto" = f."idProyecto"
      WHERE LOWER(p."tipoProyecto") IN ('estudiantil', 'institucional')
        AND LOWER(f."financiamientoExterno") IN ('si', 'sí', 'true', '1', 'x', 'verdadero', 'fondo concursable externo')
      GROUP BY p."anioInicio"

      UNION ALL

      SELECT 
        'proyectos_con_financiamiento_externo'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        p."anioInicio" AS anio,
        CASE WHEN LOWER(p."semestreInicio") IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(DISTINCT p."idProyecto")::numeric AS value
      FROM proyectos p
      JOIN financiamientos f ON p."idProyecto" = f."idProyecto"
      WHERE LOWER(p."tipoProyecto") IN ('estudiantil', 'institucional')
        AND LOWER(f."financiamientoExterno") IN ('si', 'sí', 'true', '1', 'x', 'verdadero', 'fondo concursable externo')
      GROUP BY p."anioInicio", CASE WHEN LOWER(p."semestreInicio") IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 23. Innovación - proyectos_finalizados
      SELECT 
        'proyectos_finalizados'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        "anioTermino" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM proyectos
      WHERE LOWER("tipoProyecto") IN ('estudiantil', 'institucional')
        AND LOWER(estado) = 'finalizado'
      GROUP BY "anioTermino"

      UNION ALL

      SELECT 
        'proyectos_finalizados'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        "anioTermino" AS anio,
        'Semestre 1'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM proyectos
      WHERE LOWER("tipoProyecto") IN ('estudiantil', 'institucional')
        AND LOWER(estado) = 'finalizado'
      GROUP BY "anioTermino"

      UNION ALL

      SELECT 
        'proyectos_finalizados'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        "anioTermino" AS anio,
        'Semestre 2'::varchar AS periodo,
        0::numeric AS value
      FROM proyectos
      WHERE LOWER("tipoProyecto") IN ('estudiantil', 'institucional')
        AND LOWER(estado) = 'finalizado'
      GROUP BY "anioTermino"

      UNION ALL

      -- 24. Innovación - docentes_involucrados
      SELECT 
        'docentes_involucrados'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        "anioInicio" AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(SUM("nDocentes"), 0)::numeric AS value
      FROM proyectos
      WHERE LOWER("tipoProyecto") IN ('estudiantil', 'institucional')
      GROUP BY "anioInicio"

      UNION ALL

      SELECT 
        'docentes_involucrados'::varchar AS "indicatorKey",
        'innovacion'::varchar AS "departmentId",
        "anioInicio" AS anio,
        CASE WHEN LOWER("semestreInicio") IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COALESCE(SUM("nDocentes"), 0)::numeric AS value
      FROM proyectos
      WHERE LOWER("tipoProyecto") IN ('estudiantil', 'institucional')
      GROUP BY "anioInicio", CASE WHEN LOWER("semestreInicio") IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 25. Desarrollo Curricular - tasa_aprobacion_asignatura
      SELECT
        'tasa_aprobacion_asignatura'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        anio,
        'Anual'::varchar AS periodo,
        CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE UPPER("estadoAsignatura") = 'APROBADO')::numeric / COUNT(*)::numeric) * 100.0, 2) ELSE 0::numeric END AS value
      FROM rendimiento_asignatura
      GROUP BY anio

      UNION ALL

      SELECT
        'tasa_aprobacion_asignatura'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        anio,
        CASE WHEN periodo = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE UPPER("estadoAsignatura") = 'APROBADO')::numeric / COUNT(*)::numeric) * 100.0, 2) ELSE 0::numeric END AS value
      FROM rendimiento_asignatura
      GROUP BY anio, CASE WHEN periodo = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 26. Desarrollo Curricular - tasa_reprobacion_asignatura
      SELECT
        'tasa_reprobacion_asignatura'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        anio,
        'Anual'::varchar AS periodo,
        CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE UPPER("estadoAsignatura") = 'REPROBADO')::numeric / COUNT(*)::numeric) * 100.0, 2) ELSE 0::numeric END AS value
      FROM rendimiento_asignatura
      GROUP BY anio

      UNION ALL

      SELECT
        'tasa_reprobacion_asignatura'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        anio,
        CASE WHEN periodo = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE UPPER("estadoAsignatura") = 'REPROBADO')::numeric / COUNT(*)::numeric) * 100.0, 2) ELSE 0::numeric END AS value
      FROM rendimiento_asignatura
      GROUP BY anio, CASE WHEN periodo = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 27. Desarrollo Curricular - asignaturas_criticas (> 30% reprobación)
      SELECT
        'asignaturas_criticas'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        anio,
        'Anual'::varchar AS periodo,
        COUNT(*) FILTER (WHERE tasa_rep > 30.0)::numeric AS value
      FROM (
        SELECT
          anio,
          "ramoEquiv",
          CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE UPPER("estadoAsignatura") = 'REPROBADO')::numeric / COUNT(*)::numeric) * 100.0 ELSE 0::numeric END AS tasa_rep
        FROM rendimiento_asignatura
        GROUP BY anio, "ramoEquiv"
      ) sub_crit_anual
      GROUP BY anio

      UNION ALL

      SELECT
        'asignaturas_criticas'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        anio,
        CASE WHEN periodo = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(*) FILTER (WHERE tasa_rep > 30.0)::numeric AS value
      FROM (
        SELECT
          anio,
          periodo,
          "ramoEquiv",
          CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE UPPER("estadoAsignatura") = 'REPROBADO')::numeric / COUNT(*)::numeric) * 100.0 ELSE 0::numeric END AS tasa_rep
        FROM rendimiento_asignatura
        GROUP BY anio, periodo, "ramoEquiv"
      ) sub_crit_sem
      GROUP BY anio, CASE WHEN periodo = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 28. Desarrollo Curricular - practicas_inscritas
      SELECT
        'practicas_inscritas'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        anio,
        'Anual'::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM practicas
      GROUP BY anio

      UNION ALL

      SELECT
        'practicas_inscritas'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        anio,
        CASE WHEN periodo = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(*)::numeric AS value
      FROM practicas
      GROUP BY anio, CASE WHEN periodo = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 29. Desarrollo Curricular - practicas_aprobadas
      SELECT
        'practicas_aprobadas'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        anio,
        'Anual'::varchar AS periodo,
        COUNT(*) FILTER (WHERE UPPER(estado) = 'APROBADA')::numeric AS value
      FROM practicas
      GROUP BY anio

      UNION ALL

      SELECT
        'practicas_aprobadas'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        anio,
        CASE WHEN periodo = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(*) FILTER (WHERE UPPER(estado) = 'APROBADA')::numeric AS value
      FROM practicas
      GROUP BY anio, CASE WHEN periodo = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 30. Desarrollo Curricular - tasa_titulacion_cohorte
      SELECT
        'tasa_titulacion_cohorte'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        "anioTitulacion" AS anio,
        'Anual'::varchar AS periodo,
        CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(DISTINCT rut) FILTER (WHERE "semestresCursados" IS NULL OR "tiempoNormativo" IS NULL OR "semestresCursados" <= "tiempoNormativo")::numeric / COUNT(DISTINCT rut)::numeric) * 100.0, 2) ELSE 0::numeric END AS value
      FROM titulacion
      GROUP BY "anioTitulacion"

      UNION ALL

      SELECT
        'tasa_titulacion_cohorte'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        "anioTitulacion" AS anio,
        CASE WHEN COALESCE(periodo, 1) = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(DISTINCT rut) FILTER (WHERE "semestresCursados" IS NULL OR "tiempoNormativo" IS NULL OR "semestresCursados" <= "tiempoNormativo")::numeric / COUNT(DISTINCT rut)::numeric) * 100.0, 2) ELSE 0::numeric END AS value
      FROM titulacion
      GROUP BY "anioTitulacion", CASE WHEN COALESCE(periodo, 1) = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 31. Desarrollo Curricular - titulados_por_anio
      SELECT
        'titulados_por_anio'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        "anioTitulacion" AS anio,
        'Anual'::varchar AS periodo,
        COUNT(DISTINCT rut)::numeric AS value
      FROM titulacion
      GROUP BY "anioTitulacion"

      UNION ALL

      SELECT
        'titulados_por_anio'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        "anioTitulacion" AS anio,
        CASE WHEN COALESCE(periodo, 1) = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COUNT(DISTINCT rut)::numeric AS value
      FROM titulacion
      GROUP BY "anioTitulacion", CASE WHEN COALESCE(periodo, 1) = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END

      UNION ALL

      -- 32. Desarrollo Curricular - tiempo_promedio_titulacion
      SELECT
        'tiempo_promedio_titulacion'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        "anioTitulacion" AS anio,
        'Anual'::varchar AS periodo,
        COALESCE(ROUND(AVG("semestresCursados"), 2), 0)::numeric AS value
      FROM titulacion
      GROUP BY "anioTitulacion"

      UNION ALL

      SELECT
        'tiempo_promedio_titulacion'::varchar AS "indicatorKey",
        'desarrollo_curricular'::varchar AS "departmentId",
        "anioTitulacion" AS anio,
        CASE WHEN COALESCE(periodo, 1) = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END::varchar AS periodo,
        COALESCE(ROUND(AVG("semestresCursados"), 2), 0)::numeric AS value
      FROM titulacion
      GROUP BY "anioTitulacion", CASE WHEN COALESCE(periodo, 1) = 1 THEN 'Semestre 1' ELSE 'Semestre 2' END;
    `);

    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_meta_indicator_values ON v_meta_indicator_values ("indicatorKey", anio, periodo);
    `);

    console.log('Creating PL/pgSQL function get_indicator_value_for_period...');
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION get_indicator_value_for_period(
        p_indicator_key VARCHAR,
        p_start_date DATE,
        p_end_date DATE
      ) RETURNS NUMERIC AS $$
      DECLARE
        v_value NUMERIC := NULL;
        v_year INT := EXTRACT(YEAR FROM p_start_date);
        v_period VARCHAR := 'Anual';
      BEGIN
        IF EXTRACT(MONTH FROM p_start_date) = 1 AND EXTRACT(MONTH FROM p_end_date) = 6 THEN
          v_period := 'Semestre 1';
        ELSIF EXTRACT(MONTH FROM p_start_date) = 7 AND EXTRACT(MONTH FROM p_end_date) = 12 THEN
          v_period := 'Semestre 2';
        END IF;

        SELECT value INTO v_value 
        FROM v_meta_indicator_values 
        WHERE "indicatorKey" = p_indicator_key 
          AND anio = v_year 
          AND periodo = v_period;
          
        RETURN v_value;
      END;
      $$ LANGUAGE plpgsql;
    `);



    console.log('Creating consolidated view v_dashboard_metas...');
    await sequelize.query(`
      CREATE OR REPLACE VIEW v_dashboard_metas AS
      WITH dates_calc AS (
        SELECT
          m.id AS "metaId",
          m."indicatorKey" AS "indicatorKey",
          m."valorMeta"::numeric AS "targetValue",
          m."departmentId" AS "departmentId",
          m.anio AS anio,
          m.periodo AS periodo,
          m.nombre AS nombre,
          -- Calcular fechas de inicio y término dinámicamente o usar las asignadas
          COALESCE(m."fechaInicio", CASE 
            WHEN m.periodo = 'Semestre 2' THEN (m.anio || '-07-01')::DATE 
            ELSE (m.anio || '-01-01')::DATE 
          END::DATE)::DATE AS start_date,
          COALESCE(m."fechaLimite", CASE 
            WHEN m.periodo = 'Semestre 1' THEN (m.anio || '-06-30')::DATE 
            ELSE (m.anio || '-12-31')::DATE 
          END::DATE)::DATE AS end_date,
          i.name::varchar AS "indicatorName"
        FROM metas m
        LEFT JOIN indicator_definitions i ON m."indicatorKey" = i.key
        WHERE m."lifecycleStatus" = 'ACTIVA'
      ),
      base_calculo AS (
        SELECT
          d."metaId",
          COALESCE(d.nombre, ('Meta ' || d.anio || ' - ' || d."indicatorName"))::varchar AS "metaName",
          d."indicatorKey",
          d."indicatorName",
          d."targetValue",
          COALESCE(v.value, 0)::numeric AS "currentValue",
          d."departmentId",
          -- Calcular elapsedProgress
          CASE
            WHEN CURRENT_DATE < d.start_date THEN 0::numeric
            WHEN CURRENT_DATE > d.end_date THEN 100::numeric
            ELSE ROUND(((CURRENT_DATE - d.start_date)::NUMERIC / (d.end_date - d.start_date + 1)::NUMERIC) * 100, 2)::numeric
          END AS "elapsedProgress",
          -- Calcular días restantes
          GREATEST(0, d.end_date - CURRENT_DATE) AS "daysRemaining"
        FROM dates_calc d
        LEFT JOIN v_meta_indicator_values v ON d."indicatorKey" = v."indicatorKey" 
          AND d.anio = v.anio 
          AND d.periodo = v.periodo
      )
      SELECT
        "metaId",
        "metaName",
        "indicatorKey",
        "indicatorName",
        "targetValue",
        "currentValue",
        -- progressPercent
        CASE 
          WHEN "targetValue" = 0 THEN 0::numeric
          ELSE ROUND(("currentValue" / "targetValue") * 100, 2)::numeric
        END AS "progressPercent",
        -- status
        CASE
          WHEN "currentValue" >= "targetValue" THEN 'cumplida'::varchar
          WHEN "elapsedProgress" >= 100 THEN 'no_cumplida'::varchar
          WHEN CASE WHEN "targetValue" = 0 THEN 0::numeric ELSE ROUND(("currentValue" / "targetValue") * 100, 2)::numeric END < "elapsedProgress" THEN 'en_riesgo'::varchar
          ELSE 'en_progreso'::varchar
        END AS status,
        "daysRemaining",
        "departmentId"
      FROM base_calculo;
    `);

    console.log('Creating database function refresh_dashboard_metas...');
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION refresh_dashboard_metas()
      RETURNS VOID AS $$
      BEGIN
        REFRESH MATERIALIZED VIEW v_meta_indicator_values;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('Creating consolidated view v_landing_metas...');
    await sequelize.query(`
      CREATE OR REPLACE VIEW v_landing_metas AS
      WITH ranked_metas AS (
        SELECT
          d."metaId",
          d."metaName",
          d."indicatorName",
          d."targetValue",
          d."currentValue",
          d."progressPercent",
          d.status,
          1::integer AS priority,
          d."daysRemaining",
          COALESCE(dept.name, 'Institucional')::varchar AS "departmentName",
          d."departmentId",
          ROW_NUMBER() OVER (PARTITION BY d."departmentId" ORDER BY d."metaId" DESC) as rn
        FROM v_dashboard_metas d
        LEFT JOIN departments dept ON d."departmentId" = dept.key
      )
      SELECT
        "metaId",
        "metaName",
        "indicatorName",
        "targetValue",
        "currentValue",
        "progressPercent",
        "status",
        priority,
        "daysRemaining",
        "departmentName",
        "departmentId"
      FROM ranked_metas
      WHERE rn <= 10;
    `);

    // ══════════════════════════════════════════════════════════════
    // PIADI-273: Restricciones de Integridad y Triggers para Innovación
    // ══════════════════════════════════════════════════════════════
    console.log('Applying database-level constraints, triggers, and SQL documentation for Innovación (PIADI-273)...');

    // 1. Foreign Key: financiamientos.idProyecto -> proyectos.idProyecto
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_financiamientos_proyecto'
        ) THEN
          ALTER TABLE financiamientos
            ADD CONSTRAINT fk_financiamientos_proyecto
            FOREIGN KEY ("idProyecto")
            REFERENCES proyectos("idProyecto")
            ON UPDATE CASCADE
            ON DELETE RESTRICT;
        END IF;
      END $$;
    `);

    // 2. CHECK Constraints en Proyectos
    await sequelize.query(`
      DO $$
      BEGIN
        ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS chk_proyectos_fechas;
        ALTER TABLE proyectos ADD CONSTRAINT chk_proyectos_fechas CHECK ("fechaCierreEstimada" >= "fechaInicio");
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS chk_proyectos_anios;
        ALTER TABLE proyectos ADD CONSTRAINT chk_proyectos_anios CHECK ("anioTermino" >= "anioInicio" AND "anioInicio" >= 1900 AND "anioTermino" >= 1900);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS chk_proyectos_participantes;
        ALTER TABLE proyectos ADD CONSTRAINT chk_proyectos_participantes CHECK ("nEstudiantes" >= 0 AND "nDocentes" >= 0 AND "nFuncionarios" >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS chk_proyectos_tipo;
        ALTER TABLE proyectos ADD CONSTRAINT chk_proyectos_tipo CHECK ("tipoProyecto" IN ('Estudiantil', 'Institucional'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // 3. CHECK Constraints en Financiamientos y Secciones
    await sequelize.query(`
      DO $$
      BEGIN
        ALTER TABLE financiamientos DROP CONSTRAINT IF EXISTS chk_financiamientos_montos;
        ALTER TABLE financiamientos ADD CONSTRAINT chk_financiamientos_montos CHECK ("montoAdjudicado" >= 0 AND "montoEjecutadoEstimado" >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE secciones DROP CONSTRAINT IF EXISTS chk_secciones_valores;
        ALTER TABLE secciones ADD CONSTRAINT chk_secciones_valores CHECK ("anio" >= 1900 AND "nProyectos" >= 0 AND "nEstudiantes" >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // 4. Triggers de validación de integridad referencial y coherencia
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_proyecto_integrity()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW."fechaCierreEstimada" < NEW."fechaInicio" THEN
          RAISE EXCEPTION 'La fecha de cierre estimada (%) no puede ser anterior a la fecha de inicio (%).',
            NEW."fechaCierreEstimada", NEW."fechaInicio";
        END IF;
        IF NEW."anioTermino" < NEW."anioInicio" THEN
          RAISE EXCEPTION 'El año de término (%) no puede ser menor al año de inicio (%).',
            NEW."anioTermino", NEW."anioInicio";
        END IF;
        IF NEW."nEstudiantes" < 0 OR NEW."nDocentes" < 0 OR NEW."nFuncionarios" < 0 THEN
          RAISE EXCEPTION 'Las cantidades de participantes no pueden ser negativas.';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_check_proyecto_integrity ON proyectos;
      CREATE TRIGGER trg_check_proyecto_integrity
      BEFORE INSERT OR UPDATE ON proyectos
      FOR EACH ROW EXECUTE FUNCTION check_proyecto_integrity();
    `);

    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_financiamiento_integrity()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM proyectos WHERE "idProyecto" = NEW."idProyecto") THEN
          RAISE EXCEPTION 'El proyecto asociado con ID "%" no existe en la tabla proyectos.', NEW."idProyecto";
        END IF;
        IF NEW."montoAdjudicado" < 0 THEN
          RAISE EXCEPTION 'El monto adjudicado (%) no puede ser negativo.', NEW."montoAdjudicado";
        END IF;
        IF NEW."montoEjecutadoEstimado" < 0 THEN
          RAISE EXCEPTION 'El monto ejecutado estimado (%) no puede ser negativo.', NEW."montoEjecutadoEstimado";
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_check_financiamiento_integrity ON financiamientos;
      CREATE TRIGGER trg_check_financiamiento_integrity
      BEFORE INSERT OR UPDATE ON financiamientos
      FOR EACH ROW EXECUTE FUNCTION check_financiamiento_integrity();
    `);



    // =========================================================================
    // PIADI-335: RESTRICCIONES, TRIGGERS Y DOCUMENTACIÓN SQL PARA ADMISIÓN
    // =========================================================================
    console.log('Applying database-level constraints, triggers, and SQL documentation for Admisión...');

    // 1. Foreign Key Constraints para tablas de Admisión
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_alumnos_rut ON alumnos (rut);
      CREATE INDEX IF NOT EXISTS idx_matricula_codcli ON matriculas_por_asignatura ("codCli");
      CREATE INDEX IF NOT EXISTS idx_matricula_ramo ON matriculas_por_asignatura ("ramoEquiv");
      CREATE INDEX IF NOT EXISTS idx_matricula_anio_periodo ON matriculas_por_asignatura (anio, periodo);
      CREATE INDEX IF NOT EXISTS idx_caracterizacion_rut ON caracterizacion_estudiante (rut);

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_matricula_alumnos'
        ) THEN
          ALTER TABLE matriculas_por_asignatura
            ADD CONSTRAINT fk_matricula_alumnos
            FOREIGN KEY ("codCli")
            REFERENCES alumnos("codCli")
            ON UPDATE CASCADE
            ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_matricula_asignaturas'
        ) THEN
          ALTER TABLE matriculas_por_asignatura
            ADD CONSTRAINT fk_matricula_asignaturas
            FOREIGN KEY ("ramoEquiv")
            REFERENCES asignaturas("ramoEquiv")
            ON UPDATE CASCADE
            ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_caracterizacion_alumnos'
        ) THEN
          ALTER TABLE caracterizacion_estudiante
            ADD CONSTRAINT fk_caracterizacion_alumnos
            FOREIGN KEY (rut)
            REFERENCES alumnos(rut)
            ON UPDATE CASCADE
            ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // 2. CHECK Constraints en Alumnos, Asignaturas, Matriculas y Caracterización
    // Relax NOT NULL constraints on alumnos table to match Sequelize model (PIADI-335)
    await sequelize.query(`
      ALTER TABLE alumnos ALTER COLUMN mail DROP NOT NULL;
      ALTER TABLE alumnos ALTER COLUMN "fonoAct" DROP NOT NULL;
      ALTER TABLE alumnos ALTER COLUMN "celularAct" DROP NOT NULL;
      ALTER TABLE alumnos ALTER COLUMN "fonoEmergencia" DROP NOT NULL;
      ALTER TABLE alumnos ALTER COLUMN "fonoProc" DROP NOT NULL;
      ALTER TABLE alumnos ALTER COLUMN "alFono" DROP NOT NULL;
      ALTER TABLE alumnos ALTER COLUMN celular DROP NOT NULL;
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        ALTER TABLE matriculas_por_asignatura DROP CONSTRAINT IF EXISTS "matriculas_por_asignatura_codCli_ramoEquiv_key";
        ALTER TABLE matriculas_por_asignatura DROP CONSTRAINT IF EXISTS "matriculas_por_asignatura_ramoEquiv_codCli_unique";
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE alumnos DROP CONSTRAINT IF EXISTS chk_alumnos_rut;
        ALTER TABLE alumnos ADD CONSTRAINT chk_alumnos_rut CHECK (rut > 0 AND rut <= 99999999);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE alumnos DROP CONSTRAINT IF EXISTS chk_alumnos_dig;
        ALTER TABLE alumnos ADD CONSTRAINT chk_alumnos_dig CHECK ("digitoVerificador" ~* '^[0-9Kk]$');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE alumnos DROP CONSTRAINT IF EXISTS chk_alumnos_codcli;
        ALTER TABLE alumnos ADD CONSTRAINT chk_alumnos_codcli CHECK (TRIM("codCli") <> '');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE alumnos DROP CONSTRAINT IF EXISTS chk_alumnos_nombres;
        ALTER TABLE alumnos ADD CONSTRAINT chk_alumnos_nombres CHECK (TRIM(nombre) <> '' AND TRIM("apellidoPat") <> '' AND TRIM("apellidoMat") <> '');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE asignaturas DROP CONSTRAINT IF EXISTS chk_asignaturas_ramo;
        ALTER TABLE asignaturas ADD CONSTRAINT chk_asignaturas_ramo CHECK (TRIM("ramoEquiv") <> '');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE asignaturas DROP CONSTRAINT IF EXISTS chk_asignaturas_nombre;
        ALTER TABLE asignaturas ADD CONSTRAINT chk_asignaturas_nombre CHECK (TRIM(nombre) <> '');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE matriculas_por_asignatura DROP CONSTRAINT IF EXISTS chk_matricula_anio;
        ALTER TABLE matriculas_por_asignatura ADD CONSTRAINT chk_matricula_anio CHECK (anio >= 1990 AND anio <= 2100);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE matriculas_por_asignatura DROP CONSTRAINT IF EXISTS chk_matricula_periodo;
        ALTER TABLE matriculas_por_asignatura ADD CONSTRAINT chk_matricula_periodo CHECK (periodo >= 1 AND periodo <= 2);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE matriculas_por_asignatura DROP CONSTRAINT IF EXISTS chk_matricula_seccion;
        ALTER TABLE matriculas_por_asignatura ADD CONSTRAINT chk_matricula_seccion CHECK (seccion >= 1);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE matriculas_por_asignatura DROP CONSTRAINT IF EXISTS chk_matricula_estadocad;
        ALTER TABLE matriculas_por_asignatura ADD CONSTRAINT chk_matricula_estadocad CHECK (TRIM("estadoCad") <> '');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE caracterizacion_estudiante DROP CONSTRAINT IF EXISTS chk_caracterizacion_rut;
        ALTER TABLE caracterizacion_estudiante ADD CONSTRAINT chk_caracterizacion_rut CHECK (rut > 0 AND rut <= 99999999);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE caracterizacion_estudiante DROP CONSTRAINT IF EXISTS chk_caracterizacion_dig;
        ALTER TABLE caracterizacion_estudiante ADD CONSTRAINT chk_caracterizacion_dig CHECK (dig IS NULL OR dig ~* '^[0-9Kk]$');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE caracterizacion_estudiante DROP CONSTRAINT IF EXISTS chk_caracterizacion_fecha_nac;
        ALTER TABLE caracterizacion_estudiante ADD CONSTRAINT chk_caracterizacion_fecha_nac CHECK ("fechaNacimiento" IS NULL OR ("fechaNacimiento" >= '1920-01-01' AND "fechaNacimiento" <= CURRENT_DATE));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // 3. Triggers de validación de integridad referencial y coherencia
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_alumno_integrity()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.rut <= 0 THEN
          RAISE EXCEPTION 'El RUT del alumno (%) debe ser un número positivo.', NEW.rut;
        END IF;
        IF TRIM(NEW."codCli") = '' THEN
          RAISE EXCEPTION 'El código de cliente (codCli) no puede estar vacío.';
        END IF;
        IF TRIM(NEW.nombre) = '' OR TRIM(NEW."apellidoPat") = '' OR TRIM(NEW."apellidoMat") = '' THEN
          RAISE EXCEPTION 'El nombre y apellidos del alumno no pueden estar vacíos.';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_check_alumno_integrity ON alumnos;
      CREATE TRIGGER trg_check_alumno_integrity
      BEFORE INSERT OR UPDATE ON alumnos
      FOR EACH ROW EXECUTE FUNCTION check_alumno_integrity();
    `);

    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_matricula_integrity()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM alumnos WHERE "codCli" = NEW."codCli") THEN
          RAISE EXCEPTION 'El estudiante con código "%" no existe en la tabla alumnos.', NEW."codCli";
        END IF;
        IF NOT EXISTS (SELECT 1 FROM asignaturas WHERE "ramoEquiv" = NEW."ramoEquiv") THEN
          RAISE EXCEPTION 'La asignatura con código "%" no existe en la tabla asignaturas.', NEW."ramoEquiv";
        END IF;
        IF NEW.seccion < 1 THEN
          RAISE EXCEPTION 'El número de sección (%) debe ser mayor o igual a 1.', NEW.seccion;
        END IF;
        IF NEW.anio < 1990 OR NEW.anio > 2100 THEN
          RAISE EXCEPTION 'El año de matrícula (%) debe estar entre 1990 y 2100.', NEW.anio;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_check_matricula_integrity ON matriculas_por_asignatura;
      CREATE TRIGGER trg_check_matricula_integrity
      BEFORE INSERT OR UPDATE ON matriculas_por_asignatura
      FOR EACH ROW EXECUTE FUNCTION check_matricula_integrity();
    `);

    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_caracterizacion_integrity()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM alumnos WHERE rut = NEW.rut) THEN
          RAISE EXCEPTION 'El estudiante con RUT "%" no existe en la tabla alumnos.', NEW.rut;
        END IF;
        IF NEW."fechaNacimiento" IS NOT NULL AND NEW."fechaNacimiento" > CURRENT_DATE THEN
          RAISE EXCEPTION 'La fecha de nacimiento (%) no puede ser futura.', NEW."fechaNacimiento";
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_check_caracterizacion_integrity ON caracterizacion_estudiante;
      CREATE TRIGGER trg_check_caracterizacion_integrity
      BEFORE INSERT OR UPDATE ON caracterizacion_estudiante
      FOR EACH ROW EXECUTE FUNCTION check_caracterizacion_integrity();
    `);

    // ═══════════════════════════════════════════════════════
    // DESARROLLO CURRICULAR (PIADI-301)
    // ═══════════════════════════════════════════════════════
    console.log('Applying database-level constraints, triggers, and SQL documentation for Desarrollo Curricular...');

    // 1. Asegurar existencia de tablas para Desarrollo Curricular
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS rendimiento_asignatura (
        id SERIAL PRIMARY KEY,
        rut INTEGER NOT NULL,
        "codCli" VARCHAR(50),
        "ramoEquiv" VARCHAR(50) NOT NULL,
        seccion INTEGER,
        anio INTEGER NOT NULL,
        periodo INTEGER NOT NULL,
        "notaFinal" DECIMAL(3, 1),
        "estadoAsignatura" VARCHAR(20) NOT NULL DEFAULT 'APROBADO',
        asistencia DECIMAL(5, 2),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS practicas (
        id SERIAL PRIMARY KEY,
        rut INTEGER NOT NULL,
        "codCli" VARCHAR(50),
        anio INTEGER NOT NULL,
        periodo INTEGER NOT NULL,
        "tipoPractica" VARCHAR(100) NOT NULL,
        estado VARCHAR(50) NOT NULL,
        "fechaInicio" DATE,
        "fechaTermino" DATE,
        horas INTEGER,
        empresa VARCHAR(150),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS titulacion (
        id SERIAL PRIMARY KEY,
        rut INTEGER NOT NULL,
        "codCli" VARCHAR(50),
        "anioTitulacion" INTEGER NOT NULL,
        periodo INTEGER NOT NULL,
        cohorte INTEGER NOT NULL,
        "tiempoNormativo" DECIMAL(4, 1),
        "semestresCursados" DECIMAL(4, 1),
        "fechaTitulacion" DATE,
        distincion VARCHAR(50),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_rendimiento_alumno_asignatura_periodo 
        ON rendimiento_asignatura (rut, "ramoEquiv", anio, periodo);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_practicas_alumno_periodo_tipo 
        ON practicas (rut, anio, periodo, "tipoPractica");
      CREATE UNIQUE INDEX IF NOT EXISTS idx_titulacion_alumno_anio_periodo 
        ON titulacion (rut, "anioTitulacion", periodo);

      CREATE INDEX IF NOT EXISTS idx_rendimiento_anio_periodo ON rendimiento_asignatura (anio, periodo);
      CREATE INDEX IF NOT EXISTS idx_rendimiento_rut ON rendimiento_asignatura (rut);
      CREATE INDEX IF NOT EXISTS idx_practicas_anio_periodo ON practicas (anio, periodo);
      CREATE INDEX IF NOT EXISTS idx_practicas_rut ON practicas (rut);
      CREATE INDEX IF NOT EXISTS idx_titulacion_anio ON titulacion ("anioTitulacion");
      CREATE INDEX IF NOT EXISTS idx_titulacion_rut ON titulacion (rut);
    `);

    // 2. Claves Foráneas (FK hacia alumnos y asignaturas)
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rendimiento_alumno') THEN
          ALTER TABLE rendimiento_asignatura
            ADD CONSTRAINT fk_rendimiento_alumno FOREIGN KEY (rut)
            REFERENCES alumnos(rut) ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rendimiento_asignatura') THEN
          ALTER TABLE rendimiento_asignatura
            ADD CONSTRAINT fk_rendimiento_asignatura FOREIGN KEY ("ramoEquiv")
            REFERENCES asignaturas("ramoEquiv") ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_practicas_alumno') THEN
          ALTER TABLE practicas
            ADD CONSTRAINT fk_practicas_alumno FOREIGN KEY (rut)
            REFERENCES alumnos(rut) ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_titulacion_alumno') THEN
          ALTER TABLE titulacion
            ADD CONSTRAINT fk_titulacion_alumno FOREIGN KEY (rut)
            REFERENCES alumnos(rut) ON UPDATE CASCADE ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // 3. CHECK Constraints de Dominio
    await sequelize.query(`
      DO $$
      BEGIN
        ALTER TABLE rendimiento_asignatura DROP CONSTRAINT IF EXISTS chk_rendimiento_rut;
        ALTER TABLE rendimiento_asignatura ADD CONSTRAINT chk_rendimiento_rut CHECK (rut > 0 AND rut <= 99999999);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE rendimiento_asignatura DROP CONSTRAINT IF EXISTS chk_rendimiento_ramo;
        ALTER TABLE rendimiento_asignatura ADD CONSTRAINT chk_rendimiento_ramo CHECK (TRIM("ramoEquiv") <> '');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE rendimiento_asignatura DROP CONSTRAINT IF EXISTS chk_rendimiento_anio;
        ALTER TABLE rendimiento_asignatura ADD CONSTRAINT chk_rendimiento_anio CHECK (anio >= 1990 AND anio <= 2100);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE rendimiento_asignatura DROP CONSTRAINT IF EXISTS chk_rendimiento_periodo;
        ALTER TABLE rendimiento_asignatura ADD CONSTRAINT chk_rendimiento_periodo CHECK (periodo >= 1 AND periodo <= 2);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE rendimiento_asignatura DROP CONSTRAINT IF EXISTS chk_rendimiento_seccion;
        ALTER TABLE rendimiento_asignatura ADD CONSTRAINT chk_rendimiento_seccion CHECK (seccion IS NULL OR seccion >= 1);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE rendimiento_asignatura DROP CONSTRAINT IF EXISTS chk_rendimiento_nota;
        ALTER TABLE rendimiento_asignatura ADD CONSTRAINT chk_rendimiento_nota CHECK ("notaFinal" IS NULL OR ("notaFinal" >= 1.0 AND "notaFinal" <= 7.0));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE rendimiento_asignatura DROP CONSTRAINT IF EXISTS chk_rendimiento_asistencia;
        ALTER TABLE rendimiento_asignatura ADD CONSTRAINT chk_rendimiento_asistencia CHECK (asistencia IS NULL OR (asistencia >= 0.0 AND asistencia <= 100.0));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE rendimiento_asignatura DROP CONSTRAINT IF EXISTS chk_rendimiento_estado;
        ALTER TABLE rendimiento_asignatura ADD CONSTRAINT chk_rendimiento_estado CHECK (UPPER(TRIM("estadoAsignatura")) IN ('APROBADO', 'REPROBADO'));
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE practicas DROP CONSTRAINT IF EXISTS chk_practicas_rut;
        ALTER TABLE practicas ADD CONSTRAINT chk_practicas_rut CHECK (rut > 0 AND rut <= 99999999);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE practicas DROP CONSTRAINT IF EXISTS chk_practicas_anio;
        ALTER TABLE practicas ADD CONSTRAINT chk_practicas_anio CHECK (anio >= 1990 AND anio <= 2100);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE practicas DROP CONSTRAINT IF EXISTS chk_practicas_periodo;
        ALTER TABLE practicas ADD CONSTRAINT chk_practicas_periodo CHECK (periodo >= 1 AND periodo <= 2);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE practicas DROP CONSTRAINT IF EXISTS chk_practicas_tipo;
        ALTER TABLE practicas ADD CONSTRAINT chk_practicas_tipo CHECK (TRIM("tipoPractica") <> '');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE practicas DROP CONSTRAINT IF EXISTS chk_practicas_estado;
        ALTER TABLE practicas ADD CONSTRAINT chk_practicas_estado CHECK (TRIM(estado) <> '');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE practicas DROP CONSTRAINT IF EXISTS chk_practicas_horas;
        ALTER TABLE practicas ADD CONSTRAINT chk_practicas_horas CHECK (horas IS NULL OR horas >= 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE practicas DROP CONSTRAINT IF EXISTS chk_practicas_fechas;
        ALTER TABLE practicas ADD CONSTRAINT chk_practicas_fechas CHECK ("fechaInicio" IS NULL OR "fechaTermino" IS NULL OR "fechaTermino" >= "fechaInicio");
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE titulacion DROP CONSTRAINT IF EXISTS chk_titulacion_rut;
        ALTER TABLE titulacion ADD CONSTRAINT chk_titulacion_rut CHECK (rut > 0 AND rut <= 99999999);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE titulacion DROP CONSTRAINT IF EXISTS chk_titulacion_anio;
        ALTER TABLE titulacion ADD CONSTRAINT chk_titulacion_anio CHECK ("anioTitulacion" >= 1990 AND "anioTitulacion" <= 2100);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE titulacion DROP CONSTRAINT IF EXISTS chk_titulacion_periodo;
        ALTER TABLE titulacion ADD CONSTRAINT chk_titulacion_periodo CHECK (periodo >= 1 AND periodo <= 2);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE titulacion DROP CONSTRAINT IF EXISTS chk_titulacion_cohorte;
        ALTER TABLE titulacion ADD CONSTRAINT chk_titulacion_cohorte CHECK (cohorte >= 1990 AND cohorte <= 2100);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE titulacion DROP CONSTRAINT IF EXISTS chk_titulacion_anio_cohorte;
        ALTER TABLE titulacion ADD CONSTRAINT chk_titulacion_anio_cohorte CHECK ("anioTitulacion" >= cohorte);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE titulacion DROP CONSTRAINT IF EXISTS chk_titulacion_tiempo_normativo;
        ALTER TABLE titulacion ADD CONSTRAINT chk_titulacion_tiempo_normativo CHECK ("tiempoNormativo" IS NULL OR "tiempoNormativo" > 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      DO $$
      BEGIN
        ALTER TABLE titulacion DROP CONSTRAINT IF EXISTS chk_titulacion_semestres;
        ALTER TABLE titulacion ADD CONSTRAINT chk_titulacion_semestres CHECK ("semestresCursados" IS NULL OR "semestresCursados" > 0);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // 4. Triggers de integridad y validación
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_rendimiento_integrity()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM alumnos WHERE rut = NEW.rut) THEN
          RAISE EXCEPTION 'El estudiante con RUT % no existe en la tabla alumnos.', NEW.rut;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM asignaturas WHERE "ramoEquiv" = NEW."ramoEquiv") THEN
          RAISE EXCEPTION 'La asignatura con código "%" no existe en la tabla asignaturas.', NEW."ramoEquiv";
        END IF;
        IF NEW."notaFinal" IS NOT NULL AND (NEW."notaFinal" < 1.0 OR NEW."notaFinal" > 7.0) THEN
          RAISE EXCEPTION 'La nota final (%) debe estar entre 1.0 y 7.0.', NEW."notaFinal";
        END IF;
        IF NEW.asistencia IS NOT NULL AND (NEW.asistencia < 0.0 OR NEW.asistencia > 100.0) THEN
          RAISE EXCEPTION 'El porcentaje de asistencia (%) debe estar entre 0.0 y 100.0.', NEW.asistencia;
        END IF;
        IF UPPER(TRIM(NEW."estadoAsignatura")) NOT IN ('APROBADO', 'REPROBADO') THEN
          RAISE EXCEPTION 'El estado de la asignatura "%" es inválido. Debe ser APROBADO o REPROBADO.', NEW."estadoAsignatura";
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_check_rendimiento_integrity ON rendimiento_asignatura;
      CREATE TRIGGER trg_check_rendimiento_integrity
      BEFORE INSERT OR UPDATE ON rendimiento_asignatura
      FOR EACH ROW EXECUTE FUNCTION check_rendimiento_integrity();
    `);

    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_practica_integrity()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM alumnos WHERE rut = NEW.rut) THEN
          RAISE EXCEPTION 'El estudiante con RUT % no existe en la tabla alumnos.', NEW.rut;
        END IF;
        IF NEW."fechaInicio" IS NOT NULL AND NEW."fechaTermino" IS NOT NULL AND NEW."fechaTermino" < NEW."fechaInicio" THEN
          RAISE EXCEPTION 'La fecha de término (%) no puede ser anterior a la fecha de inicio (%).', NEW."fechaTermino", NEW."fechaInicio";
        END IF;
        IF NEW.horas IS NOT NULL AND NEW.horas < 0 THEN
          RAISE EXCEPTION 'La cantidad de horas de práctica (%) no puede ser negativa.', NEW.horas;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_check_practica_integrity ON practicas;
      CREATE TRIGGER trg_check_practica_integrity
      BEFORE INSERT OR UPDATE ON practicas
      FOR EACH ROW EXECUTE FUNCTION check_practica_integrity();
    `);

    await sequelize.query(`
      CREATE OR REPLACE FUNCTION check_titulacion_integrity()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM alumnos WHERE rut = NEW.rut) THEN
          RAISE EXCEPTION 'El estudiante con RUT % no existe en la tabla alumnos.', NEW.rut;
        END IF;
        IF NEW."anioTitulacion" < NEW.cohorte THEN
          RAISE EXCEPTION 'El año de titulación (%) no puede ser anterior a la cohorte de ingreso (%).', NEW."anioTitulacion", NEW.cohorte;
        END IF;
        IF NEW."semestresCursados" IS NOT NULL AND NEW."semestresCursados" <= 0 THEN
          RAISE EXCEPTION 'Los semestres cursados (%) deben ser un número positivo.', NEW."semestresCursados";
        END IF;
        IF NEW."tiempoNormativo" IS NOT NULL AND NEW."tiempoNormativo" <= 0 THEN
          RAISE EXCEPTION 'El tiempo normativo (%) debe ser un número positivo.', NEW."tiempoNormativo";
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_check_titulacion_integrity ON titulacion;
      CREATE TRIGGER trg_check_titulacion_integrity
      BEFORE INSERT OR UPDATE ON titulacion
      FOR EACH ROW EXECUTE FUNCTION check_titulacion_integrity();
    `);

    console.log('Database-level constraints, triggers, and SQL documentation applied successfully.');
  } catch (error) {
    console.error('Error applying database constraints:', error);
    throw error;
  }
}

module.exports = { initDbConstraints };
