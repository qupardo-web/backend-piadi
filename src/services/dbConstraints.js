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
      ALTER TABLE convenios DROP CONSTRAINT IF EXISTS chk_convenio_fechas;
    `);
    await sequelize.query(`
      ALTER TABLE convenios ADD CONSTRAINT chk_convenio_fechas CHECK ("fechaDeTermino" > "fechaDeFirma");
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

    // 3. Documentar restricciones en comentarios SQL
    await sequelize.query(`
      COMMENT ON TABLE convenios IS 'Tabla que almacena los convenios institucionales de VCM.';
      COMMENT ON COLUMN convenios."fechaDeTermino" IS 'Restricción: Debe ser posterior a la fecha de firma (fechaDeFirma).';
      COMMENT ON TABLE actividades IS 'Tabla de actividades asociadas a convenios o independientes.';
      COMMENT ON COLUMN actividades."totalParticipantes" IS 'Restricción: Debe ser igual a la suma de participantesExternos y participantesInternos, y mayor que cero (validado por trigger).';
      COMMENT ON TABLE participaciones IS 'Detalle de la participación y género de los asistentes a las actividades.';
      COMMENT ON COLUMN participaciones."totalPersonas" IS 'Restricción: Debe ser igual a la suma de mujeres, hombres y noInforma (validado por trigger).';
      COMMENT ON TABLE articulaciones_tp IS 'Registro de articulaciones técnico-profesionales con colegios o liceos.';
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
        SELECT DISTINCT anio FROM metas WHERE anio IS NOT NULL
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
        SELECT DISTINCT anio FROM metas WHERE anio IS NOT NULL
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
      GROUP BY "anioInicio", CASE WHEN LOWER("semestreInicio") IN ('1', 'primer semestre', '1er semestre', 'semestre 1') THEN 'Semestre 1' ELSE 'Semestre 2' END;
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

     await sequelize.query(`
      COMMENT ON MATERIALIZED VIEW v_meta_indicator_values IS 'Vista materializada que pre-agrupa valores de indicadores para optimización del sistema de metas.';
      COMMENT ON FUNCTION get_indicator_value_for_period IS 'Obtiene el valor pre-calculado del indicador para un periodo específico.';
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

    await sequelize.query(`
      COMMENT ON VIEW v_dashboard_metas IS 'Vista consolidada que une metas con sus indicadores y avances pre-calculados.';
      COMMENT ON FUNCTION refresh_dashboard_metas IS 'Refresca la vista materializada de indicadores subyacente para actualizar el dashboard.';
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

    await sequelize.query(`
      COMMENT ON VIEW v_landing_metas IS 'Vista consolidada optimizada para la Landing Page, limitada a las 10 metas más recientes por departamento.';
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
      ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS chk_proyectos_fechas;
      ALTER TABLE proyectos ADD CONSTRAINT chk_proyectos_fechas CHECK ("fechaCierreEstimada" >= "fechaInicio");

      ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS chk_proyectos_anios;
      ALTER TABLE proyectos ADD CONSTRAINT chk_proyectos_anios CHECK ("anioTermino" >= "anioInicio" AND "anioInicio" >= 1900 AND "anioTermino" >= 1900);

      ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS chk_proyectos_participantes;
      ALTER TABLE proyectos ADD CONSTRAINT chk_proyectos_participantes CHECK ("nEstudiantes" >= 0 AND "nDocentes" >= 0 AND "nFuncionarios" >= 0);

      ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS chk_proyectos_tipo;
      ALTER TABLE proyectos ADD CONSTRAINT chk_proyectos_tipo CHECK ("tipoProyecto" IN ('Estudiantil', 'Institucional'));
    `);

    // 3. CHECK Constraints en Financiamientos y Secciones
    await sequelize.query(`
      ALTER TABLE financiamientos DROP CONSTRAINT IF EXISTS chk_financiamientos_montos;
      ALTER TABLE financiamientos ADD CONSTRAINT chk_financiamientos_montos CHECK ("montoAdjudicado" >= 0 AND "montoEjecutadoEstimado" >= 0);

      ALTER TABLE secciones DROP CONSTRAINT IF EXISTS chk_secciones_valores;
      ALTER TABLE secciones ADD CONSTRAINT chk_secciones_valores CHECK ("anio" >= 1900 AND "nProyectos" >= 0 AND "nEstudiantes" >= 0);
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

    // 5. Documentación SQL: Comentarios en tablas y columnas
    await sequelize.query(`
      COMMENT ON TABLE proyectos IS 'Tabla de proyectos de innovación institucional y estudiantil.';
      COMMENT ON COLUMN proyectos."idProyecto" IS 'Identificador único del proyecto de innovación.';
      COMMENT ON COLUMN proyectos."nombreProyecto" IS 'Nombre del proyecto de innovación.';
      COMMENT ON COLUMN proyectos."areaTematica" IS 'Área temática del proyecto.';
      COMMENT ON COLUMN proyectos."cursoLinea" IS 'Curso o línea formativa asociada.';
      COMMENT ON COLUMN proyectos.estado IS 'Estado del proyecto (ej. En Curso, Finalizado).';
      COMMENT ON COLUMN proyectos."unidadResponsable" IS 'Unidad académica o administrativa responsable.';
      COMMENT ON COLUMN proyectos."responsableDocente" IS 'Docente o responsable a cargo del proyecto.';
      COMMENT ON COLUMN proyectos."socioContraparte" IS 'Socio o contraparte externa vinculada.';
      COMMENT ON COLUMN proyectos."anioInicio" IS 'Año de inicio del proyecto.';
      COMMENT ON COLUMN proyectos."anioTermino" IS 'Año de término del proyecto.';
      COMMENT ON COLUMN proyectos."semestreInicio" IS 'Semestre de inicio (1 o 2).';
      COMMENT ON COLUMN proyectos."fechaInicio" IS 'Fecha exacta de inicio.';
      COMMENT ON COLUMN proyectos."fechaCierreEstimada" IS 'Fecha estimada de cierre.';
      COMMENT ON COLUMN proyectos."tipoProyecto" IS 'Tipo de proyecto (Institucional o Estudiantil).';
      COMMENT ON COLUMN proyectos."resultadoPrincipal" IS 'Resultado o producto principal obtenido.';
      COMMENT ON COLUMN proyectos."nEstudiantes" IS 'Cantidad de estudiantes participantes.';
      COMMENT ON COLUMN proyectos."nFuncionarios" IS 'Cantidad de funcionarios participantes.';
      COMMENT ON COLUMN proyectos."nDocentes" IS 'Cantidad de docentes participantes.';
      COMMENT ON COLUMN proyectos."evidenciaPrincipal" IS 'Evidencia o entregable principal.';
      COMMENT ON COLUMN proyectos.observacion IS 'Observaciones adicionales del proyecto.';

      COMMENT ON TABLE financiamientos IS 'Tabla de financiamiento y presupuestos de proyectos de innovación.';
      COMMENT ON COLUMN financiamientos."idProyecto" IS 'Identificador foráneo del proyecto de innovación asociado.';
      COMMENT ON COLUMN financiamientos."nombreProyecto" IS 'Nombre del proyecto financiado.';
      COMMENT ON COLUMN financiamientos."montoAdjudicado" IS 'Monto adjudicado en pesos chilenos (CLP).';
      COMMENT ON COLUMN financiamientos."montoEjecutadoEstimado" IS 'Monto ejecutado estimado en pesos chilenos (CLP).';
      COMMENT ON COLUMN financiamientos."estadoFinanciero" IS 'Estado del financiamiento.';
      COMMENT ON COLUMN financiamientos."financiamientoExterno" IS 'Indica si cuenta con financiamiento externo.';
      COMMENT ON COLUMN financiamientos."fuenteFinanciamiento" IS 'Fuente o fondo otorgante del financiamiento.';
      COMMENT ON COLUMN financiamientos.observacion IS 'Observaciones del financiamiento.';
    `);

    console.log('Database-level constraints, triggers, and SQL documentation applied successfully.');
  } catch (error) {
    console.error('Error applying database constraints:', error);
    throw error;
  }
}

module.exports = { initDbConstraints };
