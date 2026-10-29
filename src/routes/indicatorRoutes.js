const express = require('express');
const router = express.Router();
const indicatorController = require('../controllers/indicatorController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * @openapi
 * /api/departments:
 *   get:
 *     tags: [Departamentos]
 *     summary: Lista los departamentos desde base de datos
 *     responses:
 *       200:
 *         description: Departamentos disponibles.
 *   post:
 *     tags: [Departamentos]
 *     summary: Crea un departamento
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Departamento creado.
 */
router.get('/departments', authenticateToken, indicatorController.listDepartments);
router.post('/departments', authenticateToken, indicatorController.createDepartment);

/**
 * @openapi
 * /api/departments/{departmentKey}:
 *   put:
 *     tags: [Departamentos]
 *     summary: Actualiza un departamento por su key
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Departamento actualizado.
 *   delete:
 *     tags: [Departamentos]
 *     summary: Elimina un departamento por su key
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Departamento eliminado.
 */
router.put('/departments/:departmentKey', authenticateToken, indicatorController.updateDepartment);
router.delete('/departments/:departmentKey', authenticateToken, indicatorController.deleteDepartment);

/**
 * @openapi
 * /api/departments/{departmentKey}/filters:
 *   get:
 *     tags: [Departamentos]
 *     summary: Valores disponibles de filtros del dashboard (DISTINCT desde PostgreSQL)
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: fromYear
 *         schema: { type: integer }
 *       - in: query
 *         name: toYear
 *         schema: { type: integer }
 *       - in: query
 *         name: area
 *         schema: { type: string }
 *       - in: query
 *         name: tipo
 *         schema: { type: string }
 *       - in: query
 *         name: modalidad
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Listas de valores para poblar los selects del frontend.
 */
router.get('/departments/:departmentKey/filters', authenticateToken, indicatorController.getDepartmentFilters);

/**
 * @openapi
 * /api/departments/{departmentKey}/kpis:
 *   get:
 *     tags: [Departamentos]
 *     summary: Lista las definiciones de KPI de un departamento (desde base de datos)
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: KPIs del departamento.
 *   post:
 *     tags: [Departamentos]
 *     summary: Crea una definición de KPI para un departamento
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: KPI creado.
 */
router.get('/departments/:departmentKey/kpis', authenticateToken, indicatorController.listDepartmentKpis);
router.post('/departments/:departmentKey/kpis', authenticateToken, indicatorController.createKpi);

/**
 * @openapi
 * /api/departments/{departmentKey}/kpis/{indicatorKey}:
 *   put:
 *     tags: [Departamentos]
 *     summary: Actualiza una definición de KPI
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         description: Clave del indicador. VCM incluye total_convenios, convenios_activos y actividades_realizadas.
 *         schema: { type: string, example: total_convenios }
 *     responses:
 *       200:
 *         description: KPI actualizado.
 *   delete:
 *     tags: [Departamentos]
 *     summary: Elimina una definición de KPI
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: departmentKey
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: KPI eliminado.
 */
router.put('/departments/:departmentKey/kpis/:indicatorKey', authenticateToken, indicatorController.updateKpi);
router.delete('/departments/:departmentKey/kpis/:indicatorKey', authenticateToken, indicatorController.deleteKpi);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/values:
 *   get:
 *     tags: [Indicadores]
 *     summary: Valor calculado bajo demanda de un indicador, con filtros globales
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         description: Innovación admite proyectos_activos, total_proyectos, proyectos_finalizados, financiamiento_obtenido, proyectos_con_financiamiento_externo, secciones_curso y docentes_involucrados.
 *         schema:
 *           type: string
 *           example: proyectos_activos
 *       - in: query
 *         name: department
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: fromYear
 *         schema: { type: integer }
 *       - in: query
 *         name: toYear
 *         schema: { type: integer }
 *       - in: query
 *         name: semester
 *         schema: { type: string }
 *       - in: query
 *         name: semesters
 *         schema: { type: string }
 *       - in: query
 *         name: periodo
 *         description: En Admisión acepta 1, 2 y aliases de primer/segundo semestre.
 *         schema: { type: string }
 *       - in: query
 *         name: startMonth
 *         schema: { type: integer }
 *       - in: query
 *         name: area
 *         description: En Innovación filtra Proyecto.areaTematica.
 *         schema: { type: string }
 *       - in: query
 *         name: tipo
 *         description: En Innovación se aplica a tipoProyecto; en VCM depende del indicador.
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         description: Estado del proyecto de Innovación.
 *         schema: { type: string }
 *       - in: query
 *         name: sector
 *         description: Sector del convenio o actividad VCM.
 *         schema: { type: string }
 *       - in: query
 *         name: modalidad
 *         schema: { type: string }
 *       - in: query
 *         name: sexo
 *         schema: { type: string }
 *       - in: query
 *         name: ageRange
 *         schema: { type: string }
 *       - in: query
 *         name: minAge
 *         schema: { type: integer }
 *       - in: query
 *         name: maxAge
 *         schema: { type: integer }
 *       - in: query
 *         name: nuevoAntiguo
 *         description: En Admisión filtra estudiantes nuevos o antiguos según su primera matrícula histórica.
 *         schema: { type: string, enum: [nuevo, antiguo] }
 *       - in: query
 *         name: asignatura
 *         description: Nombre de asignatura de Admisión.
 *         schema: { type: string }
 *       - in: query
 *         name: seccion
 *         description: Número de sección de Admisión.
 *         schema: { type: integer }
 *       - in: query
 *         name: estadoAcademico
 *         description: Estado académico de la matrícula de Admisión.
 *         schema: { type: string }
 *       - in: query
 *         name: tipoColegio
 *         schema: { type: string }
 *       - in: query
 *         name: viaAcceso
 *         schema: { type: string }
 *       - in: query
 *         name: nivelSocioeconomico
 *         schema: { type: string }
 *       - in: query
 *         name: situacionFamiliar
 *         schema: { type: string }
 *       - in: query
 *         name: beneficios
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Valor del indicador (hasData false si faltan datos).
 */
router.get('/indicators/:indicatorKey/values', authenticateToken, indicatorController.getIndicatorValue);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/series:
 *   get:
 *     tags: [Indicadores]
 *     summary: Serie por año o segmentada por groupBy, con filtros globales
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         description: Clave del indicador. Innovación admite series de proyectos, secciones_curso, docentes_involucrados, financiamiento_obtenido y proyectos_con_financiamiento_externo.
 *         schema: { type: string, example: docentes_involucrados }
 *       - in: query
 *         name: department
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: fromYear
 *         schema: { type: integer }
 *       - in: query
 *         name: toYear
 *         schema: { type: integer }
 *       - in: query
 *         name: semester
 *         schema: { type: string }
 *       - in: query
 *         name: startMonth
 *         schema: { type: integer }
 *       - in: query
 *         name: area
 *         description: En Innovación filtra Proyecto.areaTematica y es alias público de groupBy=areaTematica.
 *         schema: { type: string }
 *       - in: query
 *         name: tipo
 *         description: En Innovación se aplica a tipoProyecto; en VCM depende del indicador.
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         description: Estado del proyecto de Innovación.
 *         schema: { type: string }
 *       - in: query
 *         name: sector
 *         schema: { type: string }
 *       - in: query
 *         name: modalidad
 *         schema: { type: string }
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           description: anio es alias externo de year. En Innovación, area es alias contextual de areaTematica; financiamiento anual usa Proyecto.anioInicio. En Admisión, periodo representa el semestre 1/2 y nuevoAntiguo deriva de la primera matrícula histórica.
 *           enum: [year, anio, area, areaTematica, semestre, periodo, tipo, modalidad, programa, sexo, rangoEdad, asignatura, seccion, estadoAcademico, nuevoAntiguo, edad, tipoColegio, viaAcceso, nivelSocioeconomico, situacionFamiliar, region, comuna, beneficios, sector, fuente]
 *     responses:
 *       200:
 *         description: Serie simple (points) o segmentada (series) según groupBy. Si existe una única meta aplicable, incluye targetLine.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     targetLine:
 *                       type: object
 *                       description: Campo opcional; se omite cuando no existe una meta aplicable.
 *                       properties:
 *                         value: { type: number, example: 100 }
 *                         label: { type: string, example: Meta }
 */
router.get('/indicators/:indicatorKey/series', authenticateToken, indicatorController.getIndicatorSeries);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/breakdown:
 *   get:
 *     tags: [Indicadores]
 *     summary: Distribución del indicador por una dimensión (groupBy)
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         description: Clave del indicador. Innovación admite proyectos, financiamiento_obtenido, proyectos_con_financiamiento_externo, secciones_curso y docentes_involucrados.
 *         schema: { type: string, example: secciones_curso }
 *       - in: query
 *         name: department
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: groupBy
 *         required: true
 *         schema:
 *           type: string
 *           description: anio es alias de year; area es alias contextual de areaTematica para proyectos de Innovación; secciones_curso admite semestre; financiamiento_obtenido admite fuente y year usando Proyecto.anioInicio. En Admisión, periodo representa el semestre 1/2 y nuevoAntiguo deriva de la primera matrícula histórica.
 *           enum: [year, anio, area, areaTematica, semestre, periodo, tipo, modalidad, programa, sexo, rangoEdad, asignatura, seccion, estadoAcademico, nuevoAntiguo, edad, tipoColegio, viaAcceso, nivelSocioeconomico, situacionFamiliar, region, comuna, beneficios, nivelDeEstudio, tipoParticipante, sectorEconomico, sector, fuente]
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: tipo
 *         description: En Innovación se aplica a tipoProyecto; en VCM depende del indicador.
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         description: Estado del proyecto de Innovación.
 *         schema: { type: string }
 *       - in: query
 *         name: sector
 *         schema: { type: string }
 *       - in: query
 *         name: fromYear
 *         schema: { type: integer }
 *       - in: query
 *         name: toYear
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Items de distribución { label, value }. La información de meta es opcional.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     metaTarget:
 *                       type: number
 *                       description: Objetivo de la MetaMetric aplicable; se omite si no existe.
 *                       example: 100
 *                     metaStatus:
 *                       type: string
 *                       description: Estado calculado por el motor de progreso; se omite si no existe meta aplicable.
 *                       enum: [cumplida, en_progreso, en_riesgo, no_cumplida]
 */
router.get('/indicators/:indicatorKey/breakdown', authenticateToken, indicatorController.getIndicatorBreakdown);

/**
 * @openapi
 * /api/indicators/{indicatorKey}/detail:
 *   get:
 *     tags: [Indicadores]
 *     summary: Obtiene metadata, serie por año, tabla y comparación de un indicador
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: indicatorKey
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: year
 *         description: Año de referencia para la card y la comparación. Alias anio, año.
 *         schema: { type: integer }
 *       - in: query
 *         name: anio
 *         description: Alias ASCII de year.
 *         schema: { type: integer }
 *       - in: query
 *         name: año
 *         description: Alias de year con eñe.
 *         schema: { type: integer }
 *       - in: query
 *         name: fromYear
 *         description: Primer año del rango de la serie.
 *         schema: { type: integer }
 *       - in: query
 *         name: toYear
 *         description: Último año del rango de la serie.
 *         schema: { type: integer }
 *       - in: query
 *         name: semestre
 *         description: Filtra por semestre. Alias semester.
 *         schema: { type: string }
 *       - in: query
 *         name: groupBy
 *         description: Dimensión explícita prevalece sobre defaultGroupBy del catálogo (matricula_por_asignatura usa asignatura). Un valor vacío desactiva el default; year devuelve la vista temporal agregada. Debe estar en allowedGroupBy del indicador.
 *         schema: { type: string }
  *       - in: query
  *         name: splitBy
  *         description: Segunda dimensión opcional de matriz. Requiere groupBy explícito o defaultGroupBy; groupBy vacío no es válido. Sin splitBy el contrato anterior no cambia. year filtra la matriz al año de referencia; fromYear/toYear la limitan al rango cuando no hay year.
  *         schema: { type: string }
  *       - in: query
  *         name: splitBy2
  *         description: Tercera dimensión opcional de cubo. Requiere groupBy y splitBy distintos; las tres dimensiones deben estar en allowedGroupBy. Ejemplo beneficios_becas con groupBy=beneficios, splitBy=periodo, splitBy2=sexo y year=2025. Sin splitBy2 se conserva exactamente la matriz 2D. El cubo por sexo de participaciones VcM no está disponible porque su fuente contiene contadores agregados.
  *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Detalle del indicador con serie por año, tabla y comparación.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [title, description]
 *               properties:
 *                 indicatorKey: { type: string }
 *                 department: { type: string }
 *                 title: { type: string }
 *                 description: { type: string }
 *                 unit: { type: string }
 *                 format: { type: string }
 *                 total: { type: number }
 *                 formattedTotal: { type: string, nullable: true }
 *                 hasData: { type: boolean }
 *                 disaggregated: { type: boolean }
 *                 groupBy: { type: string, nullable: true }
 *                 allowedGroupBy:
 *                   type: array
 *                   items: { type: string }
 *                 dimensionLabels:
 *                   type: object
 *                   additionalProperties: { type: string }
 *                 period:
 *                   type: object
 *                   properties:
 *                     from: { type: integer, nullable: true }
 *                     to: { type: integer, nullable: true }
 *                 comparison:
 *                   nullable: true
 *                   type: object
 *                   properties:
 *                     previousYear: { type: integer }
 *                     previousValue: { type: number }
 *                     diff: { type: number }
 *                 table:
 *                   type: array
 *                   items: { type: object }
 *                 series:
 *                   type: array
 *                   items: { type: object }
  *                 isBidimensional: { type: boolean, description: Solo presente con splitBy. }
  *                 rowDimension: { type: string }
  *                 colDimension: { type: string }
  *                 columns:
  *                   type: array
  *                   description: IDs tipados y ordenados de columnas; no son las etiquetas visibles.
  *                   items: { type: string }
  *                 columnLabels:
  *                   type: object
  *                   description: Mapa de ID a etiqueta visible. periodos se ordenan numéricamente.
  *                   additionalProperties: { type: string }
  *                 matrix:
  *                   type: array
  *                   description: Cada fila contiene row, rowKey, values (ID de columna a valor o null) y total recalculado.
  *                   items: { type: object }
  *                 totals:
  *                   type: object
  *                   description: Totales por columna y general recalculados desde registros; general puede diferir de total, que conserva el KPI del año de referencia.
  *                   properties:
  *                     columns: { type: object }
  *                     general: { type: number, nullable: true }
  *                 matrixFilters: { type: object, description: Alcance temporal y filtros aplicados a la matriz. }
  *                 isTridimensional: { type: boolean, description: Solo presente con splitBy2; no reemplaza el contrato de matrix. }
  *                 depthDimension: { type: string, description: Tercera dimensión del cubo. }
  *                 depths:
  *                   type: array
  *                   description: IDs tipados y ordenados de subcategorías.
  *                   items: { type: string }
  *                 depthLabels:
  *                   type: object
  *                   description: Etiquetas visibles por ID de subcategoría; los valores nulos conservan su ID propio.
  *                   additionalProperties: { type: string }
  *                 cube:
  *                   type: array
  *                   description: Solo con splitBy2. Cada fila tiene row, rowKey, total y values; cada values[columnId] contiene total y depthValues[depthId]. Los totales se recalculan desde filas fuente. Una intersección sin registros es null; cero calculado sigue siendo 0. Máximos por defecto 50 filas, 20 columnas, 10 subcategorías y 10000 intersecciones posibles.
  *                   items: { type: object }
  *       400: { description: Filtros o dimensiones inválidos (INVALID_SPLIT_BY, INVALID_SPLIT_BY2, INVALID_GROUP_BY, MISSING_ROW_DIMENSION, MISSING_COLUMN_DIMENSION, DUPLICATE_GROUP_DIMENSIONS, UNSUPPORTED_GROUP_DIMENSION, MATRIX_LIMIT_EXCEEDED). }
 *       401: { description: Token ausente o inválido. }
 *       404: { description: Indicador inexistente. }
 */
router.get('/indicators/:indicatorKey/detail', authenticateToken, indicatorController.getIndicatorDetail);

module.exports = router;
