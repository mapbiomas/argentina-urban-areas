/*
================================================================================
MAPBIOMAS ARGENTINA - CLASIFICACIÓN DE ÁREA URBANA
09 - FILTRO TEMPORAL 4 (CONSOLIDACIÓN TEMPORAL ACUMULATIVA)
================================================================================

Descripción:
Este script aplica un cuarto filtro temporal basado en consolidación acumulativa.
Implementa la filosofía "una vez urbano, siempre urbano" para crear series
temporales estrictamente crecientes o estables, eliminando reversiones urbanas
inconsistentes y consolidando el desarrollo urbano histórico.

Metodología:
1. Carga resultados del filtro temporal 3 (paso 08)
2. Aplica máximo acumulativo: para cada año, toma el máximo de todos los años previos
3. Valida especialmente el primer año para eliminar falsos positivos
4. Genera series temporales consolidadas sin reversiones urbanas
5. Maneja diferentes períodos temporales según configuración

Filosofía: "Una vez urbano, siempre urbano" (máximo acumulativo temporal)
ADVERTENCIA: Este filtro es muy agresivo y puede sobre-estimar el crecimiento urbano

Versión: 1.0
Colección: 1-2

================================================================================
*/

// ============================================================================
// CONFIGURACIÓN PRINCIPAL
// ============================================================================

// CONFIGURAR PERÍODO Y REGIÓN AQUÍ:
var PERIOD_START = 1985;           // Año de inicio
var PERIOD_END = 2024;             // Año de fin
var INCLUDE_PATAGONIA = false;      // true = incluir Patagonia, false = excluir
var OUTPUT_SUFFIX = '_1985_2024';  // Sufijo para archivos de salida

// Configuración automática basada en parámetros
var processingConfig = {
  years: ee.List.sequence(PERIOD_START, PERIOD_END).getInfo(),
  includePatagonia: INCLUDE_PATAGONIA,
  description: 'Filtro temporal 4 - Consolidación ' + PERIOD_START + '-' + PERIOD_END + 
               (INCLUDE_PATAGONIA ? ' (con Patagonia)' : ' (sin Patagonia)'),
  outputSuffix: OUTPUT_SUFFIX,
  inputSuffix: OUTPUT_SUFFIX,
  territory: 'ARGENTINA' + (INCLUDE_PATAGONIA ? '' : ' (Sin Patagonia)'),
  collection_id: PERIOD_START < 1998 ? '1' : '2'
};

// Parámetros generales
var params = {
  collection_id: processingConfig.collection_id,
  output_version: '1',
  territory: processingConfig.territory,
  urban_value: 24,
  geometry: ee.Geometry.Rectangle([-77, -56, -52, -20])
};

// ============================================================================
// RUTAS DE ASSETS
// ============================================================================

var paths = {
  input: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/FILTERS/urban_temporal_filter3_' + 
         processingConfig.years[0] + '_' + processingConfig.years[processingConfig.years.length-1] + '_v1' + processingConfig.inputSuffix,
  output_asset: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/FILTERS/',
  output_drive: 'MapBiomas_Argentina_TemporalFilter4' + processingConfig.outputSuffix
};

// ============================================================================
// CONFIGURACIÓN TEMPORAL
// ============================================================================

var allYears = processingConfig.years;

// Clasificación de años para lógica de consolidación
var years = {
  first: [allYears[0]],                                    // Primer año (validación especial)
  middle: allYears.slice(1, allYears.length - 1),        // Años intermedios
  last: [allYears[allYears.length - 1]]                   // Último año
};

// ============================================================================
// PALETAS DE VISUALIZACIÓN
// ============================================================================

var palettes = {
  filter3: ['000000', 'FF0000'],       // Rojo: después filtro 3 (input)
  filter4: ['000000', '0000FF'],       // Azul: después filtro 4 (output)
  added: ['000000', 'FFFF00'],         // Amarillo: píxeles AGREGADOS por filtro 4
  comparison: ['000000', 'FF0000', '0000FF', 'FF00FF'], // Comparación 4 estados
  consolidation: ['000000', '00FF00'], // Verde: consolidación acumulativa
  temporal_rgb: ['FF0000', '00FF00', '0000FF'] // RGB temporal
};

// ============================================================================
// CARGA DE DATOS
// ============================================================================

// Cargar imagen multibanda del filtro temporal 3
var temporalFilter3Image = ee.Image(paths.input);
print('Imagen del Filtro Temporal 3 cargada:', paths.input);
print('Bandas disponibles:', temporalFilter3Image.bandNames().size());

/**
 * Extrae banda binaria urbana por año del filtro temporal 3
 * @param {number} year - Año a extraer
 * @returns {ee.Image} - Imagen binaria urbano/no-urbano
 */
function getBandByYear(year) {
  var bandName = 'classification_' + year;
  
  var bands = temporalFilter3Image.bandNames();
  var hasBand = bands.contains(bandName);
  
  return ee.Algorithms.If(
    hasBand,
    temporalFilter3Image.select(bandName).eq(params.urban_value).rename('urban'),
    ee.Image(0).rename('urban')
  );
}

// ============================================================================
// LÓGICA DE CONSOLIDACIÓN ACUMULATIVA
// ============================================================================

/**
 * Aplica consolidación acumulativa: máximo de todos los años hasta el año actual
 * @returns {ee.ImageCollection} - Colección con años consolidados
 */
function applyConsolidationProcess() {
  print('=== APLICANDO CONSOLIDACIÓN ACUMULATIVA ===');
  print('Regla: Para cada año, tomar máximo de todos los años desde el inicio');
  print('Efecto: Una vez urbano, siempre urbano');
  
  // Crear colección de imágenes binarias del filtro 3
  var sourceCollection = ee.ImageCollection(
    allYears.map(function(year) {
      var img = ee.Image(getBandByYear(year));
      return img.set('year', year);
    })
  );
  
  print('Colección fuente creada con', sourceCollection.size(), 'imágenes');
  
  // Aplicar consolidación acumulativa año por año
  var consolidatedCollection = ee.ImageCollection(
    allYears.map(function(year) {
      // Log progreso cada 5 años
      if (year % 5 === 0) {
        print('Consolidando año:', year, '(máximo desde', allYears[0], 'hasta', year + ')');
      }
      
      // Obtener todas las imágenes desde el inicio hasta el año actual
      var yearsUntilCurrent = sourceCollection
        .filter(ee.Filter.lte('year', year));
      
      // Calcular máximo acumulativo
      var maxAccumulative = yearsUntilCurrent.max();
      
      return maxAccumulative
        .multiply(params.urban_value)
        .rename('classification_' + year)
        .toInt8()
        .set({
          'year': year,
          'consolidation_rule': 'max_accumulative_until_year_' + year,
          'years_considered': ee.List.sequence(allYears[0], year),
          'effect': 'once_urban_always_urban'
        });
    })
  );
  
  print('Consolidación acumulativa completada');
  return consolidatedCollection;
}

/**
 * Aplica validación especial para el primer año
 * @param {ee.ImageCollection} consolidatedCollection - Colección consolidada
 * @returns {ee.Image} - Primer año validado
 */
function validateFirstYear(consolidatedCollection) {
  print('=== VALIDACIÓN ESPECIAL PRIMER AÑO ===');
  print('Año objetivo:', allYears[0]);
  print('Regla: Si primer año=urbano Y segundo año=no-urbano → cambiar primer año a no-urbano');
  
  var firstYear = allYears[0];
  var secondYear = allYears[1];
  
  // Obtener imágenes originales (del filtro 3)
  var firstYearOriginal = ee.Image(getBandByYear(firstYear));
  var secondYearOriginal = ee.Image(getBandByYear(secondYear));
  
  // Aplicar validación: eliminar urbano en primer año si no continúa en segundo
  var validatedFirstYear = firstYearOriginal.where(
    firstYearOriginal.eq(1).and(secondYearOriginal.eq(0)), 
    0  // Cambiar a no-urbano si no hay continuidad
  );
  
  var result = validatedFirstYear
    .multiply(params.urban_value)
    .rename('classification_' + firstYear)
    .toInt8()
    .set({
      'year': firstYear,
      'validation_rule': 'remove_if_urban_' + firstYear + '_and_nonurban_' + secondYear,
      'effect': 'eliminate_false_urban_positives_first_year'
    });
  
  print('Validación del primer año completada');
  return result;
}

// ============================================================================
// PROCESAMIENTO PRINCIPAL
// ============================================================================

/**
 * Ejecuta el procesamiento completo del filtro temporal 4
 * @returns {ee.Image} - Imagen multibanda consolidada temporalmente
 */
function processTemporalFilter4() {
  print('=== INICIANDO FILTRO TEMPORAL 4 (CONSOLIDACIÓN ACUMULATIVA) ===');
  print('Período:', allYears[0], '-', allYears[allYears.length - 1]);
  print('Total de años:', allYears.length);
  print('Configuración:', processingConfig.description);
  print('ADVERTENCIA: Este filtro es muy agresivo y puede sobre-estimar crecimiento urbano');
  
  // 1. Aplicar consolidación acumulativa para años intermedios y finales
  var consolidatedCollection = applyConsolidationProcess();
  
  // 2. Aplicar validación especial para el primer año
  var validatedFirstYear = validateFirstYear(consolidatedCollection);
  
  // 3. Combinar primer año validado con años consolidados
  var subsequentYears = consolidatedCollection
    .filter(ee.Filter.gt('year', allYears[0]));
  
  // Crear colección completa
  var completeCollection = ee.ImageCollection([validatedFirstYear])
    .merge(subsequentYears);
  
  // 4. Ordenar por año y crear imagen multibanda
  var sortedResults = completeCollection.sort('year');
  
  var imageList = allYears.map(function(year) {
    return sortedResults
      .filter(ee.Filter.eq('year', year))
      .first();
  });
  
  var temporalFilter4Image = ee.Image.cat(imageList);
  
  // 5. Agregar metadatos completos
  temporalFilter4Image = temporalFilter4Image.set({
    'collection_id': params.collection_id,
    'version': params.output_version,
    'territory': params.territory,
    'theme': 'Urban Area',
    'source': 'MapBiomas Argentina',
    'filter_type': 'temporal_filter_4_consolidation',
    'filter_stage': 'temporal_accumulative_consolidation',
    'input_filter': 'temporal_filter_3',
    'years_processed': allYears,
    'first_year': allYears[0],
    'last_year': allYears[allYears.length - 1],
    'total_years': allYears.length,
    'description': processingConfig.description,
    'processing_date': ee.Date(Date.now()).format('YYYY-MM-dd'),
    'rules': {
      'consolidation': 'max_accumulative_once_urban_always_urban',
      'first_year_validation': 'remove_first_year_if_urban_and_next_nonurban'
    },
    'effect': 'INCREASES_urban_area_by_temporal_consolidation',
    'philosophy': 'once_urban_always_urban_max_accumulative',
    'warning': 'very_aggressive_filter_may_overestimate_urban_growth',
    'system:time_start': ee.Date.fromYMD(allYears[0], 1, 1).millis(),
    'system:time_end': ee.Date.fromYMD(allYears[allYears.length - 1], 12, 31).millis()
  });
  
  print('Filtro Temporal 4 completado');
  print('Bandas generadas:', temporalFilter4Image.bandNames().size());
  print('RESULTADO: Aumento significativo de área urbana por consolidación temporal');
  
  return temporalFilter4Image;
}

// ============================================================================
// VISUALIZACIÓN COMPARATIVA
// ============================================================================

/**
 * Crea visualizaciones comparativas mostrando el efecto de consolidación
 * @param {ee.Image} filter4Image - Imagen con filtro temporal 4 aplicado
 */
function createComparativeVisualizations(filter4Image) {
  print('=== CREANDO VISUALIZACIONES COMPARATIVAS ===');
  
  // Seleccionar años clave según el período
  var keyYears;
  if (PERIOD_START < 1998) {
    keyYears = [PERIOD_START, PERIOD_START + 5, PERIOD_START + 10, PERIOD_END];
  } else {
    keyYears = [2000, 2005, 2010, 2015, 2020, 2024];
  }
  
  keyYears = keyYears.filter(function(year) {
    return allYears.indexOf(year) !== -1;
  });
  
  keyYears.forEach(function(year) {
    // 1. Resultado del filtro temporal 3 (input)
    var filter3Image = temporalFilter3Image.select('classification_' + year);
    
    Map.addLayer(filter3Image, {
      min: 0,
      max: params.urban_value,
      palette: palettes.filter3
    }, 'Filter3_' + year, false);
    
    // 2. Resultado del filtro temporal 4 (output)
    var filter4YearImage = filter4Image.select('classification_' + year);
    
    Map.addLayer(filter4YearImage, {
      min: 0,
      max: params.urban_value,
      palette: palettes.filter4
    }, 'Filter4_' + year, false);
    
    // 3. Píxeles AGREGADOS por consolidación
    var added = filter4YearImage.subtract(filter3Image);
    
    Map.addLayer(added, {
      min: 0,
      max: params.urban_value,
      palette: palettes.added
    }, 'Filter4_Added_' + year, false);
    
    // 4. Comparación lado a lado
    var filter3Binary = filter3Image.eq(params.urban_value);
    var filter4Binary = filter4YearImage.eq(params.urban_value);
    var comparison = filter3Binary.multiply(1).add(filter4Binary.multiply(2));
    
    Map.addLayer(comparison, {
      min: 0,
      max: 3,
      palette: palettes.comparison
    }, 'Comparison_F3_vs_F4_' + year, false);
  });
  
  // 5. Consolidación temporal total
  var firstYear = allYears[0];
  var lastYear = allYears[allYears.length - 1];
  
  var totalConsolidated = filter4Image.select('classification_' + lastYear)
    .subtract(temporalFilter3Image.select('classification_' + lastYear));
  
  Map.addLayer(totalConsolidated, {
    min: 0,
    max: params.urban_value,
    palette: palettes.consolidation
  }, 'Total_Consolidated_by_Filter4', false);
  
  // 6. Evolución temporal comparativa
  var changeFilter3 = temporalFilter3Image.select('classification_' + lastYear)
    .subtract(temporalFilter3Image.select('classification_' + firstYear));
  
  var changeFilter4 = filter4Image.select('classification_' + lastYear)
    .subtract(filter4Image.select('classification_' + firstYear));
  
  Map.addLayer(changeFilter3, {
    min: -params.urban_value,
    max: params.urban_value,
    palette: ['FF0000', '000000', '00FF00']
  }, 'Change_Filter3_' + firstYear + '_' + lastYear, false);
  
  Map.addLayer(changeFilter4, {
    min: -params.urban_value,
    max: params.urban_value,
    palette: ['FF0000', '000000', '00FF00']
  }, 'Change_Filter4_' + firstYear + '_' + lastYear, false);
  
  print('Visualizaciones comparativas creadas para años:', keyYears);
}

/**
 * Calcula estadísticas del impacto de la consolidación
 * @param {ee.Image} filter4Image - Imagen filtrada con filtro 4
 */
function calculateComparativeStats(filter4Image) {
  print('=== ESTADÍSTICAS DE CONSOLIDACIÓN ===');
  
  // Región de análisis
  var region = processingConfig.territory.indexOf('Sin Patagonia') !== -1 ? 
    ee.Geometry.Rectangle([-70, -40, -55, -25]) :  // Sin Patagonia
    ee.Geometry.Rectangle([-68, -40, -62, -30]);   // Con Patagonia
  
  var testYears = [
    allYears[0], 
    allYears[Math.floor(allYears.length/3)],
    allYears[Math.floor(2*allYears.length/3)],
    allYears[allYears.length-1]
  ];
  
  testYears.forEach(function(year) {
    // Área después del filtro 3
    var area3 = temporalFilter3Image.select('classification_' + year)
      .eq(params.urban_value)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: region,
        scale: 1000,
        maxPixels: 1e8
      });
    
    // Área después del filtro 4
    var area4 = filter4Image.select('classification_' + year)
      .eq(params.urban_value)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: region,
        scale: 1000,
        maxPixels: 1e8
      });
    
    // Área consolidada
    var areaConsolidated = filter4Image.select('classification_' + year)
      .subtract(temporalFilter3Image.select('classification_' + year))
      .gt(0)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: region,
        scale: 1000,
        maxPixels: 1e8
      });
    
    print('Año', year + ':');
    print('  Pre-consolidación (km²):', ee.Number(area3.get('classification_' + year)).divide(1e6));
    print('  Post-consolidación (km²):', ee.Number(area4.get('classification_' + year)).divide(1e6));
    print('  Área consolidada (km²):', ee.Number(areaConsolidated.get('classification_' + year)).divide(1e6));
    
    // Calcular incremento porcentual
    var increment = ee.Number(areaConsolidated.get('classification_' + year))
      .divide(ee.Number(area3.get('classification_' + year)))
      .multiply(100);
    print('  Incremento por consolidación (%):', increment);
  });
}

// ============================================================================
// EXPORTACIÓN
// ============================================================================

/**
 * Exporta resultados del filtro temporal 4
 * @param {ee.Image} filter4Image - Imagen a exportar
 */
function exportResults(filter4Image) {
  print('=== EXPORTANDO RESULTADOS ===');
  
  var baseName = 'urban_temporal_filter4_' + allYears[0] + '_' + allYears[allYears.length-1] + '_v' + params.output_version + processingConfig.outputSuffix;
  
  // Exportar a Google Drive
  Export.image.toDrive({
    image: filter4Image,
    description: baseName + '_DRIVE',
    folder: paths.output_drive,
    fileNamePrefix: baseName,
    scale: 30,
    region: params.geometry,
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF',
    formatOptions: {
      cloudOptimized: true
    }
  });
  
  // Exportar a Assets
  Export.image.toAsset({
    image: filter4Image,
    assetId: paths.output_asset + baseName,
    description: baseName + '_ASSET',
    region: params.geometry,
    scale: 30,
    maxPixels: 1e13,
    pyramidingPolicy: {'.default': 'mode'}
  });
  
  print('Exportaciones programadas:');
  print('Drive:', paths.output_drive + '/' + baseName + '.tif');
  print('Asset:', paths.output_asset + baseName);
}

// ============================================================================
// FUNCIONES DE TESTING
// ============================================================================

/**
 * Prueba la lógica de consolidación para un año específico
 * @param {number} testYear - Año a probar
 */
function testConsolidation(testYear) {
  print('=== TEST CONSOLIDACIÓN PARA AÑO', testYear, '===');
  
  if (allYears.indexOf(testYear) === -1) {
    print('Error: Año', testYear, 'no está en el rango');
    return;
  }
  
  if (testYear === allYears[0]) {
    print('Warning: Primer año tiene validación especial, no consolidación pura');
  }
  
  // Crear lista de años hasta el año test
  var yearsUntilTest = [];
  for (var i = 0; i < allYears.length; i++) {
    if (allYears[i] <= testYear) {
      yearsUntilTest.push(allYears[i]);
    }
  }
  
  print('Años considerados para consolidación:', yearsUntilTest);
  
  // Cargar imágenes individuales
  var individualImages = yearsUntilTest.map(function(year) {
    return ee.Image(getBandByYear(year));
  });
  
  // Calcular máximo acumulativo
  var accumulated = ee.ImageCollection(individualImages).max();
  
  // Imagen original del año test
  var original = ee.Image(getBandByYear(testYear));
  
  // Diferencia (píxeles consolidados)
  var consolidated = accumulated.subtract(original);
  
  // Visualizar resultados
  Map.addLayer(original.multiply(params.urban_value), {
    min: 0, max: params.urban_value, palette: palettes.filter3
  }, 'TEST_Original_' + testYear, true);
  
  Map.addLayer(accumulated.multiply(params.urban_value), {
    min: 0, max: params.urban_value, palette: palettes.filter4
  }, 'TEST_Consolidated_' + testYear, true);
  
  Map.addLayer(consolidated.multiply(params.urban_value), {
    min: 0, max: params.urban_value, palette: palettes.consolidation
  }, 'TEST_Added_by_Consolidation_' + testYear, true);
  
  Map.setCenter(-64, -38, 6);
  
  print('Test de consolidación completado para año:', testYear);
  print('Años base para máximo acumulativo:', yearsUntilTest);
}

/**
 * Verifica continuidad con filtro temporal 3
 */
function checkContinuity() {
  print('=== VERIFICANDO CONTINUIDAD CON FILTRO TEMPORAL 3 ===');
  
  try {
    var testImage = ee.Image(paths.input);
    print('Imagen del filtro temporal 3 encontrada');
    print('Bandas disponibles:', testImage.bandNames());
    print('Ruta verificada:', paths.input);
  } catch (error) {
    print('Error: No se encontró imagen del filtro temporal 3');
    print('Verificar que el filtro temporal 3 se ejecutó correctamente');
    print('Ruta esperada:', paths.input);
  }
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

/**
 * Ejecuta el flujo completo del filtro temporal 4
 * @returns {ee.Image} - Imagen consolidada temporalmente
 */
function main() {
  print('=== EJECUTANDO FILTRO TEMPORAL 4 ===');
  print('Período:', allYears[0], '-', allYears[allYears.length-1]);
  print('Incluye Patagonia:', processingConfig.includePatagonia);
  print('Descripción:', processingConfig.description);
  print('OBJETIVO: Consolidación temporal acumulativa');
  print('ADVERTENCIA: Filtro muy agresivo - puede sobre-estimar crecimiento');
  
  // Centrar mapa
  Map.setCenter(-64, -38, 5);
  
  // 1. Procesamiento principal
  var filter4Image = processTemporalFilter4();
  
  // 2. Crear visualizaciones comparativas
  createComparativeVisualizations(filter4Image);
  
  // 3. Calcular estadísticas
  calculateComparativeStats(filter4Image);
  
  // 4. Exportar resultados
  exportResults(filter4Image);
  
  print('=== FILTRO TEMPORAL 4 COMPLETADO ===');
  print('Consolidación temporal acumulativa aplicada a', allYears.length, 'años');
  print('Visualizaciones comparativas creadas');
  print('Exportación iniciada');
  print('RESULTADO: Aumento significativo de área urbana por consolidación');
  
  return filter4Image;
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

print('=== FILTRO TEMPORAL 4 - MAPBIOMAS ARGENTINA ===');
print('Configuración:', processingConfig.description);
print('');
print('OPCIONES DE EJECUCIÓN:');
print('• checkContinuity() - Verificar continuidad con filtro temporal 3');
print('• testConsolidation(año) - Test de consolidación acumulativa');
print('• main() - Procesamiento completo');
print('');

// Verificación inicial
checkContinuity();

// Test automático
var testYear = allYears[Math.floor(allYears.length / 2)];
testConsolidation(testYear);

// Ejecutar procesamiento completo
var result = main();

/*
=== CONFIGURACIÓN ===

- PERIOD_START: Año de inicio (ej: 1985)
- PERIOD_END: Año de fin (ej: 2024) 
- INCLUDE_PATAGONIA: true/false para incluir/excluir Patagonia
- OUTPUT_SUFFIX: Sufijo para archivos de salida (ej: '_1985_2024')

QUÉ HACE EL TEMPORAL FILTER IV:

OBJETIVO: CONSOLIDACIÓN TEMPORAL ACUMULATIVA
Filosofía: "Una vez urbano, siempre urbano" (máximo acumulativo)

REGLAS:

1. CONSOLIDACIÓN ACUMULATIVA (Años posteriores al primero):
   - Para cada año Y: tomar MAX de todos los años desde el inicio hasta Y
   - Efecto: AGREGA píxeles urbanos (consolidación temporal agresiva)
   - Ejemplo: Si pixel fue urbano en 2005, seguirá urbano en 2010, 2015, etc.

2. VALIDACIÓN PRIMER AÑO:
   - Regla: Si primer año=urbano Y segundo año=no-urbano → cambiar primer año a no-urbano
   - Efecto: Elimina "falsos urbanos" del año base

CAPAS DE VISUALIZACIÓN:

- Filter3_YYYY: Resultado del tercer filtro (rojo)
- Filter4_YYYY: Resultado del cuarto filtro (azul)
- Filter4_Added_YYYY: Píxeles AGREGADOS por filtro 4 (amarillo)
- Comparison_F3_vs_F4_YYYY: Comparación lado a lado
- Total_Consolidated_by_Filter4: Total consolidado

EFECTO ESPERADO:
- AUMENTO significativo del área urbana (5-15%)
- Eliminación completa de "pérdidas urbanas" inconsistentes
- Series temporales estrictamente crecientes o estables
- Consolidación de desarrollo urbano histórico

IMPORTANTE:
- Este filtro es MUY AGRESIVO y puede sobre-estimar el crecimiento urbano
- Úsalo solo cuando la filosofía "una vez urbano, siempre urbano" sea apropiada
- Monitorear estadísticas de incremento para validar resultados
- Considerar impacto en análisis de dinámicas urbanas

================================================================================
*/