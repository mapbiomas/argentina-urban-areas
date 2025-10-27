/*
================================================================================
MAPBIOMAS ARGENTINA - CLASIFICACIÓN DE ÁREA URBANA
06 - FILTRO TEMPORAL 1 (CONSISTENCIA TEMPORAL)
================================================================================

Descripción:
Este script aplica filtros de consistencia temporal a las clasificaciones urbanas
filtradas espacialmente. Utiliza ventanas temporales móviles para mantener solo
aquellos píxeles urbanos que muestran consistencia temporal, reduciendo el ruido
y falsas detecciones.

Metodología:
1. Carga resultados del filtro espacial (paso 05)
2. Aplica reglas de consistencia temporal por ventanas móviles:
   - Años iniciales: ≥2 de 3 años (actual + 2 siguientes)
   - Años intermedios: ≥3 de 5 años (2 previos + actual + 2 siguientes)
   - Años finales: ≥2 de 3 años (2 previos + actual)
3. Genera imagen multibanda con serie temporal filtrada
4. Maneja diferentes períodos temporales según configuración

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
  description: 'Filtro temporal 1 - ' + PERIOD_START + '-' + PERIOD_END + 
               (INCLUDE_PATAGONIA ? ' (con Patagonia)' : ' (sin Patagonia)'),
  outputSuffix: OUTPUT_SUFFIX,
  inputSuffix: OUTPUT_SUFFIX,
  territory: 'ARGENTINA' + (INCLUDE_PATAGONIA ? '' : ' (Sin Patagonia)'),
  collection_id: PERIOD_START < 1998 ? '1' : '2',
  excludePatagonia: !INCLUDE_PATAGONIA
};

// Parámetros generales
var params = {
  collection_id: processingConfig.collection_id,
  output_version: '1',
  territory: processingConfig.territory,
  urban_value: 24,
  geometry: ee.Geometry.Rectangle([-77, -56, -52, -20]),
  export_option: 'asset'  // 'drive', 'asset', o 'both'
};

// ============================================================================
// RUTAS DE ASSETS
// ============================================================================

var paths = {
  input: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/FILTERS/',
  output_asset: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/FILTERS/',
  output_drive_folder: 'MapBiomas_Argentina_TemporalFilter1' + processingConfig.outputSuffix
};

// ============================================================================
// CONFIGURACIÓN TEMPORAL
// ============================================================================

var allYears = processingConfig.years;

// Clasificación de años por posición temporal
var years = {
  first: [allYears[0], allYears[1]],  // Primeros 2 años
  middle: allYears.slice(2, allYears.length - 2), // Años intermedios
  last: [allYears[allYears.length - 2], allYears[allYears.length - 1]]  // Últimos 2 años
};

// ============================================================================
// PALETAS DE VISUALIZACIÓN
// ============================================================================

var palettes = {
  urban_binary: ['000000', 'FF0000'],           // Negro → Rojo (urbano filtrado)
  original: ['000000', '00FF00'],               // Negro → Verde (original)
  difference: ['000000', 'FF0000'],             // Negro → Rojo (diferencia)
  comparison: ['000000', 'FF0000', '00FF00', 'FFFF00'], // Comparación 4 estados
  change: ['FF0000', '000000', '00FF00']        // Rojo → Negro → Verde (cambios)
};

// ============================================================================
// FUNCIONES DE CARGA DE DATOS
// ============================================================================

/**
 * Carga imagen filtrada espacialmente para un año específico
 * @param {number} year - Año a cargar
 * @returns {ee.Image} - Imagen binaria urbano/no-urbano
 */
function loadImageByYear(year) {
  var imageName = 'urban_spatial_filtered_' + year + '_v' + params.output_version + processingConfig.inputSuffix;
  
  try {
    var image = ee.Image(paths.input + imageName);
    // Crear máscara urbana binaria (1=urbano, 0=no urbano)
    return image.select('classification').eq(params.urban_value).rename('classification');
  } catch (error) {
    print('Warning: No se pudo cargar imagen para año', year, '- usando imagen vacía');
    return ee.Image(0).rename('classification');
  }
}

/**
 * Carga imagen original (pre-filtro temporal) para visualización
 * @param {number} year - Año a cargar
 * @returns {ee.Image} - Imagen original con valores 0-24
 */
function loadOriginalImageByYear(year) {
  var imageName = 'urban_spatial_filtered_' + year + '_v' + params.output_version + processingConfig.inputSuffix;
  
  try {
    var image = ee.Image(paths.input + imageName);
    return image.select('classification');
  } catch (error) {
    print('Warning: No se pudo cargar imagen original para año', year);
    return ee.Image(0).rename('classification');
  }
}

// ============================================================================
// LÓGICA DE FILTRO TEMPORAL
// ============================================================================

/**
 * Aplica filtro de consistencia temporal para un año específico
 * @param {number} year - Año a procesar
 * @returns {ee.Image} - Imagen filtrada temporalmente
 */
function applyTemporalFilter(year) {
  var currentYear = ee.Image(loadImageByYear(year));
  var filteredImage;
  var windowDescription;
  
  if (years.first.indexOf(year) !== -1) {
    // AÑOS INICIALES: actual + 2 siguientes, ≥2 de 3
    var year1 = ee.Image(loadImageByYear(year + 1));
    var year2 = ee.Image(loadImageByYear(year + 2));
    
    var temporalSum = ee.ImageCollection([currentYear, year1, year2])
      .sum()
      .gte(2);
    
    filteredImage = temporalSum.multiply(currentYear);
    windowDescription = 'inicial: ' + year + '-' + (year + 2) + ', ≥2 de 3';
    
  } else if (years.last.indexOf(year) !== -1) {
    // AÑOS FINALES: 2 anteriores + actual, ≥2 de 3
    var yearPrev2 = ee.Image(loadImageByYear(year - 2));
    var yearPrev1 = ee.Image(loadImageByYear(year - 1));
    
    var temporalSum = ee.ImageCollection([yearPrev2, yearPrev1, currentYear])
      .sum()
      .gte(2);
    
    filteredImage = temporalSum.multiply(currentYear);
    windowDescription = 'final: ' + (year - 2) + '-' + year + ', ≥2 de 3';
    
  } else {
    // AÑOS INTERMEDIOS: 2 anteriores + actual + 2 siguientes, ≥3 de 5
    var yearPrev2 = ee.Image(loadImageByYear(year - 2));
    var yearPrev1 = ee.Image(loadImageByYear(year - 1));
    var yearNext1 = ee.Image(loadImageByYear(year + 1));
    var yearNext2 = ee.Image(loadImageByYear(year + 2));
    
    var temporalSum = ee.ImageCollection([yearPrev2, yearPrev1, currentYear, yearNext1, yearNext2])
      .sum()
      .gte(3);
    
    filteredImage = temporalSum.multiply(currentYear);
    windowDescription = 'intermedio: ' + (year - 2) + '-' + (year + 2) + ', ≥3 de 5';
  }
  
  // Logging cada 5 años para monitoreo
  if (year % 5 === 0 || years.first.indexOf(year) !== -1 || years.last.indexOf(year) !== -1) {
    print('Año', year, '(' + windowDescription + ')');
  }
  
  // Convertir de vuelta a valores 0/24 y agregar metadatos
  return filteredImage
    .multiply(params.urban_value)
    .rename('classification_' + year)
    .set({
      'year': year,
      'temporal_window': windowDescription,
      'filter_stage': 'temporal_1'
    })
    .toInt8();
}

// ============================================================================
// PROCESAMIENTO PRINCIPAL
// ============================================================================

/**
 * Ejecuta el procesamiento completo del filtro temporal
 * @returns {ee.Image} - Imagen multibanda con serie temporal filtrada
 */
function processTemporalFilter() {
  print('=== INICIANDO FILTRO TEMPORAL 1 ===');
  print('Período:', allYears[0], '-', allYears[allYears.length - 1]);
  print('Total de años:', allYears.length);
  print('Configuración:', processingConfig.description);
  
  // Procesar cada año individualmente
  var yearlyBands = allYears.map(function(year) {
    return applyTemporalFilter(year);
  });
  
  // Combinar todas las bandas en una imagen multibanda
  var temporalFilteredImage = ee.Image.cat(yearlyBands);
  
  // Agregar metadatos completos
  temporalFilteredImage = temporalFilteredImage.set({
    'collection_id': params.collection_id,
    'version': params.output_version,
    'territory': params.territory,
    'theme': 'Urban Area',
    'source': 'MapBiomas Argentina',
    'filter_type': 'temporal_filter_1',
    'filter_stage': 'temporal_consistency',
    'years_processed': allYears,
    'first_year': allYears[0],
    'last_year': allYears[allYears.length - 1],
    'total_years': allYears.length,
    'temporal_rules': {
      'first_years': 'gte_2_of_3_future_window',
      'middle_years': 'gte_3_of_5_centered_window',
      'last_years': 'gte_2_of_3_past_window'
    },
    'spatial_filter_applied': true,
    'patagonia_excluded': processingConfig.excludePatagonia,
    'urban_value': params.urban_value,
    'description': processingConfig.description,
    'processing_date': ee.Date(Date.now()).format('YYYY-MM-dd'),
    'system:time_start': ee.Date.fromYMD(allYears[0], 1, 1).millis(),
    'system:time_end': ee.Date.fromYMD(allYears[allYears.length - 1], 12, 31).millis()
  });
  
  print('Procesamiento temporal completado');
  print('Bandas generadas:', temporalFilteredImage.bandNames().size());
  
  return temporalFilteredImage;
}

// ============================================================================
// VISUALIZACIÓN Y ANÁLISIS
// ============================================================================

/**
 * Crea visualizaciones comparativas del filtro temporal
 * @param {ee.Image} temporalImage - Imagen con filtro temporal aplicado
 */
function createVisualizations(temporalImage) {
  print('=== CREANDO VISUALIZACIONES ===');
  
  // Seleccionar años clave para visualización
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
    // 1. Imagen original (post-filtro espacial, pre-filtro temporal)
    var originalImage = ee.Image(loadOriginalImageByYear(year));
    
    Map.addLayer(originalImage, {
      min: 0,
      max: params.urban_value,
      palette: palettes.original
    }, 'Original_' + year, false);
    
    // 2. Imagen con filtro temporal aplicado
    var filteredImage = temporalImage.select('classification_' + year);
    
    Map.addLayer(filteredImage, {
      min: 0,
      max: params.urban_value,
      palette: palettes.urban_binary
    }, 'Temporal_Filtered_' + year, false);
    
    // 3. Efecto del filtro (píxeles removidos)
    var difference = originalImage.subtract(filteredImage);
    
    Map.addLayer(difference, {
      min: 0,
      max: params.urban_value,
      palette: palettes.difference
    }, 'Temporal_Effect_' + year, false);
    
    // 4. Comparación binaria de estados
    var originalBinary = originalImage.eq(params.urban_value);
    var filteredBinary = filteredImage.eq(params.urban_value);
    var comparison = originalBinary.multiply(1).add(filteredBinary.multiply(2));
    
    Map.addLayer(comparison, {
      min: 0,
      max: 3,
      palette: palettes.comparison
    }, 'Comparison_' + year, false);
  });
  
  // 5. Composición RGB temporal
  if (keyYears.length >= 3) {
    var rgbImage = ee.Image.cat([
      temporalImage.select('classification_' + keyYears[0]).eq(params.urban_value),
      temporalImage.select('classification_' + keyYears[Math.floor(keyYears.length/2)]).eq(params.urban_value),
      temporalImage.select('classification_' + keyYears[keyYears.length-1]).eq(params.urban_value)
    ]).rename(['red', 'green', 'blue']);
    
    Map.addLayer(rgbImage, {
      min: 0,
      max: 1
    }, 'RGB_Temporal_' + keyYears[0] + '_' + keyYears[Math.floor(keyYears.length/2)] + '_' + keyYears[keyYears.length-1], false);
  }
  
  // 6. Cambios entre primer y último año
  var firstYear = allYears[0];
  var lastYear = allYears[allYears.length - 1];
  var change = temporalImage.select('classification_' + lastYear)
    .subtract(temporalImage.select('classification_' + firstYear));
  
  Map.addLayer(change, {
    min: -params.urban_value,
    max: params.urban_value,
    palette: palettes.change
  }, 'Change_' + firstYear + '_' + lastYear, false);
  
  print('Visualizaciones creadas para años:', keyYears);
}

/**
 * Calcula estadísticas del impacto del filtro temporal
 * @param {ee.Image} temporalImage - Imagen filtrada temporalmente
 */
function calculateStatistics(temporalImage) {
  print('=== CALCULANDO ESTADÍSTICAS ===');
  
  // Región de análisis (evitar Patagonia si está excluida)
  var analysisRegion = processingConfig.excludePatagonia ? 
    ee.Geometry.Rectangle([-70, -40, -55, -25]) :  // Sin Patagonia
    ee.Geometry.Rectangle([-70, -45, -55, -25]);   // Con Patagonia
  
  var testYears = [
    allYears[0], 
    allYears[Math.floor(allYears.length/2)], 
    allYears[allYears.length-1]
  ];
  
  testYears.forEach(function(year) {
    // Área original (post-filtro espacial)
    var originalArea = ee.Image(loadOriginalImageByYear(year))
      .eq(params.urban_value)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: analysisRegion,
        scale: 1000,
        maxPixels: 1e8
      });
    
    // Área filtrada (post-filtro temporal)
    var filteredArea = temporalImage.select('classification_' + year)
      .eq(params.urban_value)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: analysisRegion,
        scale: 1000,
        maxPixels: 1e8
      });
    
    print('Año', year + ':');
    print('  Original (km²):', ee.Number(originalArea.get('classification')).divide(1e6));
    print('  Filtrada (km²):', ee.Number(filteredArea.get('classification_' + year)).divide(1e6));
    
    // Calcular reducción porcentual
    var reduction = ee.Number(originalArea.get('classification'))
      .subtract(ee.Number(filteredArea.get('classification_' + year)))
      .divide(ee.Number(originalArea.get('classification')))
      .multiply(100);
    print('  Reducción (%):', reduction);
  });
}

// ============================================================================
// EXPORTACIÓN
// ============================================================================

/**
 * Exporta resultados del filtro temporal
 * @param {ee.Image} temporalImage - Imagen filtrada a exportar
 */
function exportResults(temporalImage) {
  print('=== EXPORTANDO RESULTADOS ===');
  
  var baseName = 'urban_temporal_filter1_' + allYears[0] + '_' + allYears[allYears.length-1] + '_v' + params.output_version + processingConfig.outputSuffix;
  
  if (params.export_option === 'drive' || params.export_option === 'both') {
    // Exportar a Google Drive
    Export.image.toDrive({
      image: temporalImage,
      description: baseName + '_DRIVE',
      folder: paths.output_drive_folder,
      fileNamePrefix: baseName,
      scale: 30,
      region: params.geometry,
      maxPixels: 1e13,
      fileFormat: 'GeoTIFF',
      formatOptions: {
        cloudOptimized: true
      }
    });
    
    print('Exportación a Drive programada');
    print('Carpeta:', paths.output_drive_folder);
  }
  
  if (params.export_option === 'asset' || params.export_option === 'both') {
    // Exportar a Assets
    Export.image.toAsset({
      image: temporalImage,
      assetId: paths.output_asset + baseName,
      description: baseName + '_ASSET',
      region: params.geometry,
      scale: 30,
      maxPixels: 1e13,
      pyramidingPolicy: {'.default': 'mode'}
    });
    
    print('Exportación a Asset programada');
    print('Asset:', paths.output_asset + baseName);
  }
  
  print('Revisar pestaña Tasks para monitorear exportaciones');
}

// ============================================================================
// FUNCIONES DE TESTING
// ============================================================================

/**
 * Prueba el filtro temporal para un año específico
 * @param {number} testYear - Año a probar
 */
function testSingleYear(testYear) {
  print('=== TEST INDIVIDUAL PARA AÑO', testYear, '===');
  
  if (allYears.indexOf(testYear) === -1) {
    print('Error: Año', testYear, 'no está en el rango', allYears[0], '-', allYears[allYears.length-1]);
    return;
  }
  
  // Cargar y procesar imágenes
  var original = ee.Image(loadOriginalImageByYear(testYear));
  var filtered = applyTemporalFilter(testYear);
  var difference = original.subtract(filtered);
  
  // Verificar estadísticas
  var stats = difference.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: ee.Geometry.Rectangle([-65, -35, -60, -30]),
    scale: 1000,
    maxPixels: 1e8
  });
  
  print('Estadísticas de diferencia:', stats);
  print('Si min >= 0, no hay problemas de visualización');
  
  // Visualizar resultados
  Map.addLayer(original, {
    min: 0, max: params.urban_value, palette: palettes.original
  }, 'TEST_Original_' + testYear, true);
  
  Map.addLayer(filtered, {
    min: 0, max: params.urban_value, palette: palettes.urban_binary
  }, 'TEST_Filtered_' + testYear, true);
  
  Map.addLayer(difference, {
    min: 0, max: params.urban_value, palette: palettes.difference
  }, 'TEST_Difference_' + testYear, true);
  
  Map.setCenter(-64, -38, 6);
  
  return {original: original, filtered: filtered, difference: difference};
}

/**
 * Verifica la continuidad con el filtro espacial anterior
 */
function checkContinuity() {
  print('=== VERIFICANDO CONTINUIDAD CON FILTRO ESPACIAL ===');
  
  var testYear = allYears[Math.floor(allYears.length / 2)];
  var expectedImageName = 'urban_spatial_filtered_' + testYear + '_v' + params.output_version + processingConfig.inputSuffix;
  
  try {
    var testImage = ee.Image(paths.input + expectedImageName);
    print('Imagen del filtro espacial encontrada para', testYear);
    print('Bandas disponibles:', testImage.bandNames());
    print('Ruta verificada:', paths.input + expectedImageName);
  } catch (error) {
    print('Error: No se encontró imagen del filtro espacial para', testYear);
    print('Verificar que el filtro espacial se ejecutó correctamente');
    print('Ruta esperada:', paths.input + expectedImageName);
  }
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

/**
 * Ejecuta el flujo completo del filtro temporal
 * @returns {ee.Image} - Imagen filtrada temporalmente
 */
function main() {
  print('=== EJECUTANDO FILTRO TEMPORAL 1 ===');
  print('Período:', allYears[0], '-', allYears[allYears.length-1]);
  print('Incluye Patagonia:', processingConfig.includePatagonia);
  print('Descripción:', processingConfig.description);
  
  // Centrar mapa según configuración
  if (processingConfig.excludePatagonia) {
    Map.setCenter(-64, -35, 5);  // Evitar Patagonia
  } else {
    Map.setCenter(-64, -38, 5);  // Argentina completa
  }
  
  // 1. Procesamiento principal
  var temporalImage = processTemporalFilter();
  
  // 2. Crear visualizaciones
  createVisualizations(temporalImage);
  
  // 3. Calcular estadísticas
  calculateStatistics(temporalImage);
  
  // 4. Exportar resultados
  exportResults(temporalImage);
  
  print('=== PROCESAMIENTO COMPLETADO ===');
  print('Filtro temporal 1 aplicado a', allYears.length, 'años');
  print('Visualizaciones creadas (activar capas manualmente)');
  print('Exportación iniciada');
  
  return temporalImage;
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

print('=== FILTRO TEMPORAL 1 - MAPBIOMAS ARGENTINA ===');
print('Configuración:', processingConfig.description);
print('');
print('OPCIONES DE EJECUCIÓN:');
print('• checkContinuity() - Verificar continuidad con filtro espacial');
print('• testSingleYear(año) - Test individual');
print('• main() - Procesamiento completo');
print('');

// Verificación inicial
checkContinuity();

// Test automático
var testYear = allYears[Math.floor(allYears.length / 2)];
testSingleYear(testYear);

// Ejecutar procesamiento completo
var result = main();

/*
=== GUÍA DE USO ===

CONFIGURACIÓN:
- PERIOD_START: Año de inicio (ej: 1998)
- PERIOD_END: Año de fin (ej: 2024) 
- INCLUDE_PATAGONIA: true/false para incluir/excluir Patagonia
- OUTPUT_SUFFIX: Sufijo para archivos de salida (ej: '_1998_2024')

CAPAS GENERADAS:
- Original_YYYY: Imagen con filtro espacial (verde)
- Temporal_Filtered_YYYY: Con filtro temporal (rojo)  
- Temporal_Effect_YYYY: Efecto del filtro (negro→rojo, píxeles removidos)
- Comparison_YYYY: Comparación 4 estados
- RGB_Temporal: Composición temporal
- Change_primer_ultimo: Cambios totales entre primer y último año

INTERPRETACIÓN COLORES:
- Negro: No urbano / Sin cambios
- Rojo: Urbano / Píxeles eliminados por filtro temporal
- Verde: Original antes del filtro temporal
- Amarillo: Consenso en comparaciones

ESTADÍSTICAS:
- Áreas urbanas antes/después del filtro temporal
- Reducción esperada: 5-15%
- Min ≥ 0 confirma que no hay problemas de visualización

OPCIONES DE EJECUCIÓN:
- checkContinuity() - Verificar continuidad con filtro espacial
- testSingleYear(año) - Test individual para debugging
- main() - Procesamiento completo

LÓGICA TEMPORAL:
- Años iniciales: ≥2 de 3 años (ventana hacia adelante)
- Años intermedios: ≥3 de 5 años (ventana centrada) 
- Años finales: ≥2 de 3 años (ventana hacia atrás)

================================================================================
*/