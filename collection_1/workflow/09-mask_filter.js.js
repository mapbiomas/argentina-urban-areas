/*
================================================================================
MAPBIOMAS ARGENTINA - CLASIFICACIÓN DE ÁREA URBANA
10 - FILTRO DE MÁSCARA ESPACIAL (PASO FINAL)
================================================================================

Descripción:
Este script final aplica una máscara espacial a toda la serie temporal urbana
procesada. Elimina áreas fuera de la máscara de validez espacial (ej: áreas
sin cobertura Sentinel, zonas de exclusión, etc.) y genera el producto final
listo para integración en MapBiomas Argentina.

Metodología:
1. Carga la serie temporal completa del filtro temporal 4 (paso 09)
2. Carga la máscara espacial de validez
3. Aplica la máscara a todas las bandas temporales
4. Calcula estadísticas comparativas pre/post máscara
5. Genera visualizaciones de control de calidad
6. Exporta el producto final con metadatos completos

Producto final: Serie temporal urbana con máscara espacial aplicada

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
  description: 'Filtro máscara final ' + PERIOD_START + '-' + PERIOD_END + 
               (INCLUDE_PATAGONIA ? ' (con Patagonia)' : ' (sin Patagonia)'),
  outputSuffix: OUTPUT_SUFFIX,
  inputSuffix: OUTPUT_SUFFIX,
  territory: 'ARGENTINA' + (INCLUDE_PATAGONIA ? '' : ' (Sin Patagonia)'),
  collection_id: PERIOD_START < 1998 ? '1' : '2',
  excludePatagonia: !INCLUDE_PATAGONIA
};

// Parámetros principales
var params = {
  collection_id: processingConfig.collection_id,
  mask_value: 1,           // Valor en el raster que define área válida
  urban_value: 24,         // Valor urbano en clasificación MapBiomas
  output_version: '1',
  scale: 30,
  maxPixels: 1e13,
  territory: processingConfig.territory,
  
  // Configuración de visualización
  visualization: {
    years_to_show: PERIOD_START < 1998 ? 
      [PERIOD_START, PERIOD_START + 5, PERIOD_START + 10, PERIOD_END] : 
      [2000, 2010, 2020, 2024],
    show_all_years: false
  }
};

// ============================================================================
// RUTAS DE ASSETS
// ============================================================================

var paths = {
  input: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/FILTERS/urban_temporal_filter4_' + 
         processingConfig.years[0] + '_' + processingConfig.years[processingConfig.years.length-1] + '_v1' + processingConfig.inputSuffix,
  mask: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/AUXILIARY_DATA/RASTER/mask_2024_sentinel',
  output_asset: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/CLASSIFICATION/FILTERS/',
  output_drive: 'MapBiomas_Argentina_Final_Masked' + processingConfig.outputSuffix
};

// Geometría de procesamiento
var region = ee.Geometry.Rectangle([-77, -56, -52, -20]);

// ============================================================================
// CARGA DE DATOS
// ============================================================================

print('=== CARGANDO DATOS ===');

// 1. Serie temporal urbana del filtro 4
var urbanTimeSeries = ee.Image(paths.input);
print('Serie temporal cargada:', paths.input);
print('Bandas disponibles:', urbanTimeSeries.bandNames().size());

// 2. Raster de máscara espacial
var maskRaster = ee.Image(paths.mask);
print('Máscara espacial cargada:', paths.mask);

// 3. Verificar años procesados
var allYears = processingConfig.years;
print('Años a procesar:', allYears.length);
print('Rango temporal:', allYears[0], '-', allYears[allYears.length-1]);

// ============================================================================
// CREACIÓN Y ANÁLISIS DE MÁSCARA
// ============================================================================

print('=== CREANDO MÁSCARA ESPACIAL ===');

// Crear máscara binaria: 1 = área válida, 0 = área filtrada
var spatialMask = maskRaster.eq(params.mask_value).rename('spatial_mask');
print('Máscara binaria creada (1 = válido, 0 = filtrado)');

// Diagnóstico de la máscara
var maskHistogram = maskRaster.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: region,
  scale: 1000,
  maxPixels: 1e8
});

print('Histograma del raster máscara:', maskHistogram);

// Calcular cobertura de área válida
var maskCoverage = spatialMask.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: region,
  scale: 1000,
  maxPixels: 1e8
});

var coveragePercent = ee.Number(maskCoverage.get('spatial_mask')).multiply(100);
print('Cobertura de área válida (%):', coveragePercent);

// Visualizar máscara
Map.addLayer(spatialMask, {
  min: 0,
  max: 1,
  palette: ['FF0000', '00FF00']  // Rojo = filtrado, Verde = válido
}, 'Mascara_Espacial', true);

// ============================================================================
// APLICACIÓN DE MÁSCARA
// ============================================================================

/**
 * Aplica máscara espacial a una banda específica
 * @param {string} bandName - Nombre de la banda a procesar
 * @returns {ee.Image} - Banda con máscara aplicada
 */
function applyMaskToBand(bandName) {
  var yearBand = urbanTimeSeries.select(bandName);
  
  // Aplicar máscara: píxeles fuera de máscara = 0, píxeles dentro mantienen valor
  var maskedBand = yearBand.multiply(spatialMask);
  
  return maskedBand.rename(bandName);
}

print('=== APLICANDO MÁSCARA A TODAS LAS BANDAS ===');

// Procesar todas las bandas temporales
var processedBands = allYears.map(function(year) {
  var bandName = 'classification_' + year;
  
  // Verificar existencia de banda
  var bandExists = urbanTimeSeries.bandNames().contains(bandName);
  
  return ee.Algorithms.If(
    bandExists,
    applyMaskToBand(bandName),
    ee.Image(0).rename(bandName).toInt8()
  );
});

// Combinar todas las bandas procesadas
var urbanTimeSeriesMasked = ee.Image.cat(processedBands);

// Agregar metadatos completos
urbanTimeSeriesMasked = urbanTimeSeriesMasked.set({
  'collection_id': params.collection_id,
  'version': params.output_version,
  'territory': params.territory,
  'theme': 'Urban Area',
  'source': 'MapBiomas Argentina',
  'filter_stage': 'final_spatial_mask',
  'original_asset': 'urban_temporal_filter4_' + allYears[0] + '_' + allYears[allYears.length-1] + '_v1' + processingConfig.inputSuffix,
  'mask_asset': 'mask_2024_sentinel',
  'mask_applied': true,
  'mask_value': params.mask_value,
  'urban_value': params.urban_value,
  'processing_date': ee.Date(Date.now()).format('YYYY-MM-dd'),
  'years_processed': allYears,
  'first_year': allYears[0],
  'last_year': allYears[allYears.length - 1],
  'total_years': allYears.length,
  'description': processingConfig.description,
  'filter_effect': 'pixels_outside_spatial_mask_set_to_zero',
  'processing_scale': params.scale,
  'final_product': true,
  'ready_for_integration': true,
  'include_patagonia': processingConfig.includePatagonia,
  'system:time_start': ee.Date.fromYMD(allYears[0], 1, 1).millis(),
  'system:time_end': ee.Date.fromYMD(allYears[allYears.length - 1], 12, 31).millis()
});

print('Máscara aplicada a', allYears.length, 'bandas');
print('Imagen final - Bandas:', urbanTimeSeriesMasked.bandNames().size());

// ============================================================================
// ESTADÍSTICAS COMPARATIVAS
// ============================================================================

/**
 * Calcula estadísticas para un año específico
 * @param {number} year - Año a analizar
 * @returns {Object} - Estadísticas del año
 */
function calculateYearStats(year) {
  var bandName = 'classification_' + year;
  
  // Contar píxeles urbanos originales
  var originalUrbanPixels = urbanTimeSeries.select(bandName)
    .eq(params.urban_value)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: region,
      scale: 1000,
      maxPixels: 1e8
    });
  
  // Contar píxeles urbanos después de máscara
  var maskedUrbanPixels = urbanTimeSeriesMasked.select(bandName)
    .eq(params.urban_value)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: region,
      scale: 1000,
      maxPixels: 1e8
    });
  
  // Convertir a área (km²)
  var originalArea = ee.Number(originalUrbanPixels.get(bandName)).multiply(1);
  var maskedArea = ee.Number(maskedUrbanPixels.get(bandName)).multiply(1);
  
  // Calcular reducción porcentual
  var reduction = originalArea.subtract(maskedArea)
    .divide(originalArea)
    .multiply(100);
  
  // Verificación lógica
  var isValid = maskedArea.lte(originalArea);
  
  return {
    year: year,
    original_km2: originalArea,
    masked_km2: maskedArea,
    reduction_percent: reduction,
    is_valid: isValid
  };
}

print('=== CALCULANDO ESTADÍSTICAS COMPARATIVAS ===');

// Procesar estadísticas para años clave
var keyYears = PERIOD_START < 1998 ? 
  [PERIOD_START, PERIOD_START + 5, PERIOD_START + 10, PERIOD_END] : 
  [1998, 2000, 2005, 2010, 2015, 2020, 2024];

// Filtrar años que están realmente en el rango
keyYears = keyYears.filter(function(year) {
  return allYears.indexOf(year) !== -1;
});

print('ESTADÍSTICAS POR AÑO:');

keyYears.forEach(function(year) {
  var stats = calculateYearStats(year);
  print('Año ' + year + ':');
  print('  Original (km²):', stats.original_km2);
  print('  Con máscara (km²):', stats.masked_km2);
  print('  Reducción (%):', stats.reduction_percent);
  print('  Válido:', stats.is_valid);
  print('  ---');
});

// ============================================================================
// VISUALIZACIONES DE CONTROL DE CALIDAD
// ============================================================================

print('=== CREANDO VISUALIZACIONES ===');

var visualizationYears = params.visualization.show_all_years ? allYears : params.visualization.years_to_show;

// Filtrar años de visualización que están disponibles
visualizationYears = visualizationYears.filter(function(year) {
  return allYears.indexOf(year) !== -1;
});

visualizationYears.forEach(function(year) {
  var bandName = 'classification_' + year;
  
  // 1. Clasificación original (pre-máscara)
  var originalBand = urbanTimeSeries.select(bandName);
  Map.addLayer(originalBand.updateMask(originalBand.gt(0)), {
    min: 0,
    max: params.urban_value,
    palette: ['000000', 'FF0000']  // Negro → Rojo
  }, 'Original_' + year, false);
  
  // 2. Clasificación con máscara (final)
  var maskedBand = urbanTimeSeriesMasked.select(bandName);
  Map.addLayer(maskedBand.updateMask(maskedBand.gt(0)), {
    min: 0,
    max: params.urban_value,
    palette: ['000000', '0000FF']  // Negro → Azul
  }, 'Final_Masked_' + year, false);
  
  // 3. Píxeles eliminados por máscara
  var eliminatedPixels = originalBand
    .updateMask(spatialMask.eq(0))
    .updateMask(originalBand.gt(0));
  
  Map.addLayer(eliminatedPixels, {
    min: 0,
    max: params.urban_value,
    palette: ['000000', 'FFFF00']  // Negro → Amarillo
  }, 'Eliminated_' + year, false);
  
  // 4. Comparación RGB para años clave
  if (keyYears.indexOf(year) !== -1) {
    var comparison = ee.Image.cat([
      originalBand.eq(params.urban_value).rename('red'),
      maskedBand.eq(params.urban_value).rename('green'),
      spatialMask.rename('blue')
    ]);
    
    Map.addLayer(comparison, {
      min: 0,
      max: 1
    }, 'RGB_Comparison_' + year, false);
  }
});

// ============================================================================
// ANÁLISIS TEMPORAL FINAL
// ============================================================================

print('=== ANÁLISIS TEMPORAL FINAL ===');

// Cambio total entre primer y último año
var firstYear = allYears[0];
var lastYear = allYears[allYears.length - 1];

var totalChange = urbanTimeSeriesMasked.select('classification_' + lastYear)
  .subtract(urbanTimeSeriesMasked.select('classification_' + firstYear));

Map.addLayer(totalChange, {
  min: -params.urban_value,
  max: params.urban_value,
  palette: ['FF0000', '000000', '00FF00']  // Rojo=pérdida, Verde=ganancia
}, 'Change_' + firstYear + '_to_' + lastYear, false);

// Cálculo de área urbana total final
var finalUrbanArea = urbanTimeSeriesMasked.select('classification_' + lastYear)
  .eq(params.urban_value)
  .multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: region,
    scale: 1000,
    maxPixels: 1e8
  });

print('Área urbana final (' + lastYear + ') [km²]:', ee.Number(finalUrbanArea.get('classification_' + lastYear)).divide(1e6));

// ============================================================================
// EXPORTACIÓN FINAL
// ============================================================================

print('=== EJECUTANDO EXPORTACIONES FINALES ===');

var outputName = 'urban_final_masked_' + allYears[0] + '_' + allYears[allYears.length-1] + '_v' + params.output_version + processingConfig.outputSuffix;

// Exportar a Asset
Export.image.toAsset({
  image: urbanTimeSeriesMasked,
  assetId: paths.output_asset + outputName,
  description: outputName + '_ASSET',
  region: region,
  scale: params.scale,
  maxPixels: params.maxPixels,
  pyramidingPolicy: {'.default': 'mode'}
});

print('Exportación a Asset programada');
print('Asset:', paths.output_asset + outputName);

// Exportar a Drive
Export.image.toDrive({
  image: urbanTimeSeriesMasked,
  description: outputName + '_DRIVE',
  folder: paths.output_drive,
  fileNamePrefix: outputName,
  scale: params.scale,
  region: region,
  maxPixels: params.maxPixels,
  fileFormat: 'GeoTIFF',
  formatOptions: {
    cloudOptimized: true
  }
});

print('Exportación a Drive programada');
print('Carpeta Drive:', paths.output_drive);
print('Archivo:', outputName + '.tif');

// ============================================================================
// FUNCIONES DE ANÁLISIS ADICIONAL
// ============================================================================

/**
 * Análisis detallado para un año específico
 * @param {number} year - Año a analizar
 */
function analyzeYear(year) {
  print('=== ANÁLISIS DETALLADO - AÑO ' + year + ' ===');
  
  if (allYears.indexOf(year) === -1) {
    print('Error: Año', year, 'no está disponible');
    return;
  }
  
  var bandName = 'classification_' + year;
  var original = urbanTimeSeries.select(bandName);
  var masked = urbanTimeSeriesMasked.select(bandName);
  
  // Estadísticas detalladas
  var originalStats = original.reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: region,
    scale: 1000,
    maxPixels: 1e8
  });
  
  var maskedStats = masked.reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: region,
    scale: 1000,
    maxPixels: 1e8
  });
  
  print('Histograma original:', originalStats);
  print('Histograma con máscara:', maskedStats);
  
  // Activar visualizaciones de análisis
  Map.addLayer(original.updateMask(original.gt(0)), {
    min: 0, max: params.urban_value, palette: ['000000', 'FF0000']
  }, 'ANALYSIS_Original_' + year, true);
  
  Map.addLayer(masked.updateMask(masked.gt(0)), {
    min: 0, max: params.urban_value, palette: ['000000', '0000FF']
  }, 'ANALYSIS_Final_' + year, true);
  
  Map.setCenter(-64, -38, 6);
  print('Visualizaciones de análisis activadas para año', year);
}

/**
 * Verifica continuidad con filtro temporal 4
 */
function checkContinuity() {
  print('=== VERIFICANDO CONTINUIDAD CON FILTRO TEMPORAL 4 ===');
  
  try {
    var testImage = ee.Image(paths.input);
    print('Imagen del filtro temporal 4 encontrada');
    print('Bandas disponibles:', testImage.bandNames());
    print('Ruta verificada:', paths.input);
  } catch (error) {
    print('Error: No se encontró imagen del filtro temporal 4');
    print('Verificar que el filtro temporal 4 se ejecutó correctamente');
    print('Ruta esperada:', paths.input);
  }
}

/**
 * Muestra estadísticas de configuración
 */
function showConfigStats() {
  print('=== ESTADÍSTICAS DE CONFIGURACIÓN ===');
  print('Período configurado:', PERIOD_START, '-', PERIOD_END);
  print('Incluye Patagonia:', processingConfig.includePatagonia);
  print('Sufijo de salida:', processingConfig.outputSuffix);
  print('Territorio:', processingConfig.territory);
  print('Total de años a procesar:', allYears.length);
  print('Años de visualización:', visualizationYears);
  print('Collection ID:', processingConfig.collection_id);
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

/**
 * Ejecuta el flujo completo del filtro de máscara final
 * @returns {ee.Image} - Imagen final con máscara aplicada
 */
function main() {
  print('=== FILTRO DE MÁSCARA FINAL COMPLETADO ===');
  print('Período:', allYears[0], '-', allYears[allYears.length-1]);
  print('Incluye Patagonia:', processingConfig.includePatagonia);
  print('Descripción:', processingConfig.description);
  print('');
  print('PRODUCTO FINAL GENERADO:');
  print('- Serie temporal urbana completa con máscara espacial');
  print('- ' + allYears.length + ' bandas temporales procesadas');
  print('- Listo para integración en MapBiomas Argentina');
  print('- Metadatos completos incluidos');
  print('');
  print('EXPORTACIONES PROGRAMADAS:');
  print('- Asset: ' + outputName);
  print('- Drive: ' + outputName + '.tif');
  print('');
  print('Revisar pestaña Tasks para monitorear exportaciones');
  
  return urbanTimeSeriesMasked;
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

print('=== FILTRO DE MÁSCARA ESPACIAL FINAL - MAPBIOMAS ARGENTINA ===');
print('Configuración:', processingConfig.description);
print('');
print('OPCIONES DE EJECUCIÓN:');
print('• showConfigStats() - Ver estadísticas de configuración');
print('• checkContinuity() - Verificar continuidad con filtro temporal 4');
print('• analyzeYear(año) - Análisis detallado de un año específico');
print('• main() - Ver resumen final');
print('');

// Mostrar estadísticas de configuración
showConfigStats();

// Verificación inicial
checkContinuity();

// Ejecución automática y resumen final
var finalProduct = main();

/*
=== CONFIGURACIÓN ===

- PERIOD_START: Año de inicio (ej: 1985)
- PERIOD_END: Año de fin (ej: 2024) 
- INCLUDE_PATAGONIA: true/false para incluir/excluir Patagonia
- OUTPUT_SUFFIX: Sufijo para archivos de salida (ej: '_1985_2024')

FILTRO DE MÁSCARA ESPACIAL FINAL:

OBJETIVO: APLICAR MÁSCARA ESPACIAL FINAL
Aplicar máscara de validez espacial a toda la serie temporal procesada

FUNCIÓN:
- Elimina píxeles fuera de áreas válidas (sin cobertura Sentinel, exclusiones, etc.)
- Mantiene píxeles dentro de áreas válidas con sus valores originales
- Genera producto final listo para integración en MapBiomas

CAPAS DE VISUALIZACIÓN:

- Mascara_Espacial: Máscara binaria (rojo=filtrado, verde=válido)
- Original_YYYY: Clasificación pre-máscara (rojo)
- Final_Masked_YYYY: Clasificación final con máscara (azul)
- Eliminated_YYYY: Píxeles eliminados por máscara (amarillo)
- RGB_Comparison_YYYY: Comparación RGB para años clave
- Change_primer_ultimo: Cambios temporales totales

EFECTO:
- Reducción de área urbana según cobertura de máscara
- Eliminación de clasificaciones en áreas no válidas
- Producto final espacialmente consistente

PRODUCTO FINAL:
- Serie temporal urbana con máscara aplicada
- Todas las bandas temporales procesadas
- Metadatos completos para integración
- Listo para MapBiomas Argentina

ANÁLISIS DISPONIBLES:
- analyzeYear(año) para análisis detallado
- Estadísticas automáticas de reducción por máscara
- Visualizaciones comparativas pre/post máscara

================================================================================
*/