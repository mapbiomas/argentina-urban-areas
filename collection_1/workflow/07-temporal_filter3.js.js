/*
================================================================================
MAPBIOMAS ARGENTINA - CLASIFICACIÓN DE ÁREA URBANA
08 - FILTRO TEMPORAL 3 (RELLENO DE HUECOS TEMPORALES)
================================================================================

Descripción:
Este script aplica un tercer filtro temporal que rellena huecos en las series
temporales urbanas. A diferencia de los filtros anteriores que remueven píxeles,
este filtro AGREGA píxeles urbanos identificando y rellenando interrupciones
temporales breves en secuencias urbanas continuas.

Metodología:
1. Carga resultados del filtro temporal 2 (paso 07)
2. Identifica huecos temporales: anterior=urbano, actual=no-urbano, siguiente=urbano
3. Rellena estos huecos asumiendo continuidad urbana
4. Aplica reglas específicas por posición temporal
5. Genera series temporales más coherentes y continuas

Filosofía: "Si hay urbano antes y después, probablemente también había urbano en el medio"

Autor: Luna Schteingart, Gonzalo Dieguez

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
  description: 'Filtro temporal 3 - Relleno huecos ' + PERIOD_START + '-' + PERIOD_END + 
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
  input: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/FILTERS/urban_temporal_filter2_' + 
         processingConfig.years[0] + '_' + processingConfig.years[processingConfig.years.length-1] + '_v1' + processingConfig.inputSuffix,
  output_asset: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/FILTERS/',
  output_drive: 'MapBiomas_Argentina_TemporalFilter3' + processingConfig.outputSuffix
};

// ============================================================================
// CONFIGURACIÓN TEMPORAL
// ============================================================================

var allYears = processingConfig.years;

// Clasificación de años por posición temporal para reglas de relleno
var years = {
  first: [allYears[0]],                                    // Primer año
  middle: allYears.slice(1, allYears.length - 1),        // Años intermedios
  last: [allYears[allYears.length - 1]]                   // Último año
};

// ============================================================================
// PALETAS DE VISUALIZACIÓN
// ============================================================================

var palettes = {
  filter2: ['000000', '00FF00'],       // Verde: después filtro 2
  filter3: ['000000', 'FF0000'],       // Rojo: después filtro 3  
  added: ['000000', '00FFFF'],         // Cian: píxeles AGREGADOS por filtro 3
  comparison: ['000000', 'FF0000', '00FF00', 'FFFF00'], // Comparación 4 estados
  difference: ['FF0000', '000000', '00FF00']  // Cambios: pérdida-sin cambio-ganancia
};

// ============================================================================
// CARGA DE DATOS
// ============================================================================

// Cargar imagen multibanda del filtro temporal 2
var temporalFilter2Image = ee.Image(paths.input);
print('Imagen del Filtro Temporal 2 cargada:', paths.input);
print('Bandas disponibles:', temporalFilter2Image.bandNames().size());

/**
 * Extrae banda binaria urbana por año del filtro temporal 2
 * @param {number} year - Año a extraer
 * @returns {ee.Image} - Imagen binaria urbano/no-urbano
 */
function getBandByYear(year) {
  var bandName = 'classification_' + year;
  
  var bands = temporalFilter2Image.bandNames();
  var hasBand = bands.contains(bandName);
  
  return ee.Algorithms.If(
    hasBand,
    temporalFilter2Image.select(bandName).eq(params.urban_value).rename('urban'),
    ee.Image(0).rename('urban')
  );
}

// ============================================================================
// LÓGICA DE FILTRO TEMPORAL 3 (RELLENO DE HUECOS)
// ============================================================================

/**
 * Procesa primer año con lógica de persistencia
 * @returns {Array} - Lista de imágenes procesadas
 */
function processFirstYear() {
  print('=== PROCESANDO PRIMER AÑO ===');
  print('Años:', years.first);
  print('Regla: Si actual Y siguiente son urbanos → mantener');
  
  var results = years.first.map(function(year) {
    var year0 = ee.Image(getBandByYear(year));      // Año actual
    var year1 = ee.Image(getBandByYear(year + 1));  // Año siguiente
    
    // Regla: mantener si actual Y siguiente son urbanos (persistencia)
    var persistentUrban = year0.and(year1);
    
    // Combinar: mantener lo original O lo que persiste
    var result = ee.ImageCollection([year0, persistentUrban])
      .sum()
      .gte(1);
    
    return result
      .multiply(params.urban_value)
      .rename('classification_' + year)
      .toInt8()
      .set({
        'year': year,
        'filter_type': 'first',
        'rule': 'current_AND_next_urban_persistence',
        'effect': 'preserve_persistent_urban'
      });
  });
  
  return results;
}

/**
 * Procesa años intermedios con lógica de relleno de huecos
 * @returns {Array} - Lista de imágenes procesadas
 */
function processMiddleYears() {
  print('=== PROCESANDO AÑOS INTERMEDIOS ===');
  print('Años:', years.middle.length, 'años intermedios');
  print('Regla: Si anterior=urbano Y actual=no-urbano Y siguiente=urbano → RELLENAR');
  
  var results = years.middle.map(function(year) {
    // Log cada 5 años para monitoreo
    if (year % 5 === 0) {
      print('Procesando año intermedio:', year);
    }
    
    var yearPrev = ee.Image(getBandByYear(year - 1));  // Año anterior
    var year0 = ee.Image(getBandByYear(year));         // Año actual
    var yearNext = ee.Image(getBandByYear(year + 1));  // Año siguiente
    
    // LÓGICA CLAVE DEL FILTRO 3: IDENTIFICACIÓN Y RELLENO DE HUECOS
    // Si: anterior=urbano Y actual=no-urbano Y siguiente=urbano → RELLENAR
    var gapToFill = yearPrev.and(year0.not()).and(yearNext);
    
    // Combinar: mantener lo original O rellenar huecos identificados
    var result = ee.ImageCollection([year0, gapToFill])
      .sum()
      .gte(1);
    
    return result
      .multiply(params.urban_value)
      .rename('classification_' + year)
      .toInt8()
      .set({
        'year': year,
        'filter_type': 'middle',
        'rule': 'gap_fill_prev_AND_next_urban',
        'effect': 'add_pixels_fill_temporal_gaps'
      });
  });
  
  return results;
}

/**
 * Procesa último año con lógica de continuidad
 * @returns {Array} - Lista de imágenes procesadas
 */
function processLastYear() {
  print('=== PROCESANDO ÚLTIMO AÑO ===');
  print('Años:', years.last);
  print('Regla: Si anterior urbano → hacer urbano (continuidad - MUY PERMISIVO)');
  
  var results = years.last.map(function(year) {
    var yearPrev = ee.Image(getBandByYear(year - 1));  // Año anterior
    var year0 = ee.Image(getBandByYear(year));         // Año actual
    
    // Regla: si año anterior es urbano → asumir continuidad urbana
    var continuity = yearPrev;
    
    // Combinar: mantener lo original O aplicar continuidad del anterior
    var result = ee.ImageCollection([year0, continuity])
      .sum()
      .gte(1);
    
    return result
      .multiply(params.urban_value)
      .rename('classification_' + year)
      .toInt8()
      .set({
        'year': year,
        'filter_type': 'last',
        'rule': 'prev_urban_continuity_permissive',
        'effect': 'assume_urban_continuity'
      });
  });
  
  return results;
}

// ============================================================================
// PROCESAMIENTO PRINCIPAL
// ============================================================================

/**
 * Ejecuta el procesamiento completo del filtro temporal 3
 * @returns {ee.Image} - Imagen multibanda con huecos rellenados
 */
function processTemporalFilter3() {
  print('=== INICIANDO FILTRO TEMPORAL 3 (RELLENO DE HUECOS) ===');
  print('Período:', allYears[0], '-', allYears[allYears.length - 1]);
  print('Total de años:', allYears.length);
  print('Configuración:', processingConfig.description);
  print('EFECTO ESPERADO: AUMENTO de área urbana por relleno de huecos');
  
  // Procesar todos los tipos de años
  var firstResults = processFirstYear();
  var middleResults = processMiddleYears();
  var lastResults = processLastYear();
  
  // Combinar resultados en orden cronológico
  var allBands = [];
  
  allYears.forEach(function(year) {
    if (years.first.indexOf(year) !== -1) {
      var index = years.first.indexOf(year);
      allBands.push(firstResults[index]);
    } else if (years.middle.indexOf(year) !== -1) {
      var index = years.middle.indexOf(year);
      allBands.push(middleResults[index]);
    } else if (years.last.indexOf(year) !== -1) {
      var index = years.last.indexOf(year);
      allBands.push(lastResults[index]);
    }
  });
  
  print('Número de bandas a combinar:', allBands.length);
  
  // Crear imagen multibanda final
  var temporalFilter3Image = ee.Image.cat(allBands);
  
  // Agregar metadatos completos
  temporalFilter3Image = temporalFilter3Image.set({
    'collection_id': params.collection_id,
    'version': params.output_version,
    'territory': params.territory,
    'theme': 'Urban Area',
    'source': 'MapBiomas Argentina',
    'filter_type': 'temporal_filter_3_gap_fill',
    'filter_stage': 'temporal_gap_filling',
    'input_filter': 'temporal_filter_2',
    'years_processed': allYears,
    'first_year': allYears[0],
    'last_year': allYears[allYears.length - 1],
    'total_years': allYears.length,
    'first_years': years.first.length,
    'middle_years': years.middle.length,
    'last_years': years.last.length,
    'description': processingConfig.description,
    'processing_date': ee.Date(Date.now()).format('YYYY-MM-dd'),
    'rules': {
      'first': 'current_AND_next_urban_persistence',
      'middle': 'gap_fill_prev_AND_next_urban',
      'last': 'prev_urban_continuity_permissive'
    },
    'effect': 'INCREASES_urban_area_by_filling_temporal_gaps',
    'philosophy': 'If urban before and after, probably urban in between',
    'system:time_start': ee.Date.fromYMD(allYears[0], 1, 1).millis(),
    'system:time_end': ee.Date.fromYMD(allYears[allYears.length - 1], 12, 31).millis()
  });
  
  print('Filtro Temporal 3 completado');
  print('Bandas generadas:', temporalFilter3Image.bandNames().size());
  print('RESULTADO: Aumento de área urbana por huecos rellenados');
  
  return temporalFilter3Image;
}

// ============================================================================
// VISUALIZACIÓN COMPARATIVA
// ============================================================================

/**
 * Crea visualizaciones comparativas mostrando el efecto de relleno
 * @param {ee.Image} filter3Image - Imagen con filtro temporal 3 aplicado
 */
function createComparativeVisualizations(filter3Image) {
  print('=== CREANDO VISUALIZACIONES COMPARATIVAS ===');
  
  // Seleccionar años clave según el período
  var keyYears;
  if (PERIOD_START < 1998) {
    keyYears = [PERIOD_START, PERIOD_START + 5, PERIOD_START + 10, PERIOD_END];
  } else {
    keyYears = [2000, 2010, 2020, 2024];
  }
  
  keyYears = keyYears.filter(function(year) {
    return allYears.indexOf(year) !== -1;
  });
  
  keyYears.forEach(function(year) {
    // 1. Resultado del filtro temporal 2 (input)
    var filter2Image = temporalFilter2Image.select('classification_' + year);
    
    Map.addLayer(filter2Image, {
      min: 0,
      max: params.urban_value,
      palette: palettes.filter2
    }, 'Filter2_' + year, false);
    
    // 2. Resultado del filtro temporal 3 (output)
    var filter3YearImage = filter3Image.select('classification_' + year);
    
    Map.addLayer(filter3YearImage, {
      min: 0,
      max: params.urban_value,
      palette: palettes.filter3
    }, 'Filter3_' + year, false);
    
    // 3. Píxeles AGREGADOS por filtro 3 (efecto de relleno)
    var added = filter3YearImage.subtract(filter2Image);
    
    Map.addLayer(added, {
      min: 0,
      max: params.urban_value,
      palette: palettes.added
    }, 'Filter3_Added_' + year, false);
    
    // 4. Comparación lado a lado
    var filter2Binary = filter2Image.eq(params.urban_value);
    var filter3Binary = filter3YearImage.eq(params.urban_value);
    var comparison = filter2Binary.multiply(1).add(filter3Binary.multiply(2));
    
    Map.addLayer(comparison, {
      min: 0,
      max: 3,
      palette: palettes.comparison
    }, 'Comparison_F2_vs_F3_' + year, false);
  });
  
  // 5. Análisis temporal del efecto total
  var firstYear = allYears[0];
  var lastYear = allYears[allYears.length - 1];
  
  var totalAdded = filter3Image.select('classification_' + lastYear)
    .subtract(temporalFilter2Image.select('classification_' + lastYear));
  
  Map.addLayer(totalAdded, {
    min: 0,
    max: params.urban_value,
    palette: palettes.added
  }, 'Total_Added_by_Filter3_' + lastYear, false);
  
  // 6. Cambios temporales comparativos
  var changeFilter2 = temporalFilter2Image.select('classification_' + lastYear)
    .subtract(temporalFilter2Image.select('classification_' + firstYear));
  
  var changeFilter3 = filter3Image.select('classification_' + lastYear)
    .subtract(filter3Image.select('classification_' + firstYear));
  
  Map.addLayer(changeFilter2, {
    min: -params.urban_value,
    max: params.urban_value,
    palette: palettes.difference
  }, 'Change_Filter2_' + firstYear + '_' + lastYear, false);
  
  Map.addLayer(changeFilter3, {
    min: -params.urban_value,
    max: params.urban_value,
    palette: palettes.difference
  }, 'Change_Filter3_' + firstYear + '_' + lastYear, false);
  
  print('Visualizaciones comparativas creadas para años:', keyYears);
}

/**
 * Calcula estadísticas del impacto del relleno de huecos
 * @param {ee.Image} filter3Image - Imagen filtrada con filtro 3
 */
function calculateComparativeStats(filter3Image) {
  print('=== ESTADÍSTICAS DE RELLENO DE HUECOS ===');
  
  // Región de análisis
  var region = processingConfig.territory.indexOf('Sin Patagonia') !== -1 ? 
    ee.Geometry.Rectangle([-70, -40, -55, -25]) :  // Sin Patagonia
    ee.Geometry.Rectangle([-68, -40, -62, -30]);   // Con Patagonia
  
  var testYears = [
    allYears[0], 
    allYears[Math.floor(allYears.length/2)], 
    allYears[allYears.length-1]
  ];
  
  testYears.forEach(function(year) {
    // Área después del filtro 2
    var area2 = temporalFilter2Image.select('classification_' + year)
      .eq(params.urban_value)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: region,
        scale: 1000,
        maxPixels: 1e8
      });
    
    // Área después del filtro 3
    var area3 = filter3Image.select('classification_' + year)
      .eq(params.urban_value)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: region,
        scale: 1000,
        maxPixels: 1e8
      });
    
    // Área agregada por relleno
    var areaAdded = filter3Image.select('classification_' + year)
      .subtract(temporalFilter2Image.select('classification_' + year))
      .gt(0)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: region,
        scale: 1000,
        maxPixels: 1e8
      });
    
    print('Año', year + ':');
    print('  Pre-relleno (km²):', ee.Number(area2.get('classification_' + year)).divide(1e6));
    print('  Post-relleno (km²):', ee.Number(area3.get('classification_' + year)).divide(1e6));
    print('  Área agregada (km²):', ee.Number(areaAdded.get('classification_' + year)).divide(1e6));
    
    // Calcular incremento porcentual
    var increment = ee.Number(areaAdded.get('classification_' + year))
      .divide(ee.Number(area2.get('classification_' + year)))
      .multiply(100);
    print('  Incremento (%):', increment);
  });
}

// ============================================================================
// EXPORTACIÓN
// ============================================================================

/**
 * Exporta resultados del filtro temporal 3
 * @param {ee.Image} filter3Image - Imagen a exportar
 */
function exportResults(filter3Image) {
  print('=== EXPORTANDO RESULTADOS ===');
  
  var baseName = 'urban_temporal_filter3_' + allYears[0] + '_' + allYears[allYears.length-1] + '_v' + params.output_version + processingConfig.outputSuffix;
  
  // Exportar a Google Drive
  Export.image.toDrive({
    image: filter3Image,
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
    image: filter3Image,
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
 * Prueba la lógica de relleno de huecos para un año específico
 * @param {number} testYear - Año a probar (debe ser intermedio)
 */
function testGapFilling(testYear) {
  print('=== TEST RELLENO DE HUECOS PARA AÑO', testYear, '===');
  
  if (years.middle.indexOf(testYear) === -1) {
    print('Warning: Año debe ser intermedio para test óptimo de relleno');
    print('Años intermedios disponibles:', years.middle.slice(0, 5), '...');
  }
  
  if (allYears.indexOf(testYear) === -1) {
    print('Error: Año', testYear, 'no está en el rango');
    return;
  }
  
  // Cargar ventana temporal
  var yearPrev = ee.Image(getBandByYear(testYear - 1));
  var year0 = ee.Image(getBandByYear(testYear));
  var yearNext = ee.Image(getBandByYear(testYear + 1));
  
  // Identificar huecos a rellenar (lógica clave)
  var gaps = yearPrev.and(year0.not()).and(yearNext);
  
  // Aplicar relleno
  var filter3Result = ee.ImageCollection([year0, gaps]).sum().gte(1);
  
  // Visualizar resultados
  Map.addLayer(year0.multiply(params.urban_value), {
    min: 0, max: params.urban_value, palette: palettes.filter2
  }, 'TEST_Before_F3_' + testYear, true);
  
  Map.addLayer(filter3Result.multiply(params.urban_value), {
    min: 0, max: params.urban_value, palette: palettes.filter3
  }, 'TEST_After_F3_' + testYear, true);
  
  Map.addLayer(gaps.multiply(params.urban_value), {
    min: 0, max: params.urban_value, palette: palettes.added
  }, 'TEST_Gaps_Filled_' + testYear, true);
  
  Map.setCenter(-64, -38, 6);
  
  print('Huecos identificados y rellenados para año:', testYear);
  print('Ventana temporal: anterior(' + (testYear-1) + '), actual(' + testYear + '), siguiente(' + (testYear+1) + ')');
}

/**
 * Verifica continuidad con filtro temporal 2
 */
function checkContinuity() {
  print('=== VERIFICANDO CONTINUIDAD CON FILTRO TEMPORAL 2 ===');
  
  try {
    var testImage = ee.Image(paths.input);
    print('Imagen del filtro temporal 2 encontrada');
    print('Bandas disponibles:', testImage.bandNames());
    print('Ruta verificada:', paths.input);
  } catch (error) {
    print('Error: No se encontró imagen del filtro temporal 2');
    print('Verificar que el filtro temporal 2 se ejecutó correctamente');
    print('Ruta esperada:', paths.input);
  }
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

/**
 * Ejecuta el flujo completo del filtro temporal 3
 * @returns {ee.Image} - Imagen con huecos temporales rellenados
 */
function main() {
  print('=== EJECUTANDO FILTRO TEMPORAL 3 ===');
  print('Período:', allYears[0], '-', allYears[allYears.length-1]);
  print('Incluye Patagonia:', processingConfig.includePatagonia);
  print('Descripción:', processingConfig.description);
  print('OBJETIVO: Rellenar huecos temporales urbanos');
  
  // Centrar mapa
  Map.setCenter(-64, -38, 5);
  
  // 1. Procesamiento principal
  var filter3Image = processTemporalFilter3();
  
  // 2. Crear visualizaciones comparativas
  createComparativeVisualizations(filter3Image);
  
  // 3. Calcular estadísticas
  calculateComparativeStats(filter3Image);
  
  // 4. Exportar resultados
  exportResults(filter3Image);
  
  print('=== FILTRO TEMPORAL 3 COMPLETADO ===');
  print('Relleno de huecos temporales aplicado a', allYears.length, 'años');
  print('Visualizaciones comparativas creadas');
  print('Exportación iniciada');
  print('RESULTADO: Aumento de área urbana por huecos rellenados');
  
  return filter3Image;
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

print('=== FILTRO TEMPORAL 3 - MAPBIOMAS ARGENTINA ===');
print('Configuración:', processingConfig.description);
print('');
print('OPCIONES DE EJECUCIÓN:');
print('• checkContinuity() - Verificar continuidad con filtro temporal 2');
print('• testGapFilling(año) - Test de relleno de huecos');
print('• main() - Procesamiento completo');
print('');

// Verificación inicial
checkContinuity();

// Test automático
var testYear = allYears[Math.floor(allYears.length / 2)];
if (years.middle.indexOf(testYear) !== -1) {
  testGapFilling(testYear);
} else {
  // Usar un año intermedio válido
  testGapFilling(years.middle[Math.floor(years.middle.length / 2)]);
}

// Ejecutar procesamiento completo
var result = main();

/*
=== CONFIGURACIÓN  ===

- PERIOD_START: Año de inicio (ej: 1985)
- PERIOD_END: Año de fin (ej: 2024) 
- INCLUDE_PATAGONIA: true/false para incluir/excluir Patagonia
- OUTPUT_SUFFIX: Sufijo para archivos de salida (ej: '_1985_2024')

QUÉ HACE CADA PASO DEL FILTRO 3:

OBJETIVO: RELLENO DE HUECOS TEMPORALES
Filosofía: "Si hay urbano antes y después, probablemente también había urbano en el medio"

REGLAS POR TIPO DE AÑO:

1. PRIMER AÑO:
   - Regla: Si actual Y siguiente son urbanos → mantener
   - Efecto: Preserva desarrollo urbano persistente

2. AÑOS INTERMEDIOS (CLAVE):
   - Regla: Si anterior=urbano Y actual=no-urbano Y siguiente=urbano → RELLENAR
   - Efecto: ✨ AGREGA píxeles urbanos (opuesto a filtros anteriores!)

3. ÚLTIMO AÑO:
   - Regla: Si anterior=urbano → hacer urbano
   - Efecto: Muy permisivo, asume continuidad

CAPAS DE VISUALIZACIÓN:

- Filter2_YYYY: Resultado del segundo filtro (verde)
- Filter3_YYYY: Resultado del tercer filtro (rojo)  
- Filter3_Added_YYYY: Píxeles AGREGADOS por filtro 3 (cian)
- Comparison_F2_vs_F3_YYYY: Comparación lado a lado
- Total_Added_by_Filter3: Total de huecos rellenados

EFECTO ESPERADO:
- AUMENTO del área urbana (2-5%)
- Eliminación de "parpadeos" en series temporales
- Series más suaves y coherentes
- Relleno de errores por nubes/sombras

================================================================================
*/