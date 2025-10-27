/*
================================================================================
MAPBIOMAS ARGENTINA - CLASIFICACIÓN DE ÁREA URBANA
07 - FILTRO TEMPORAL 2 (SUAVIZADO TEMPORAL)
================================================================================

Descripción:
Este script aplica un segundo filtro temporal de suavizado a los resultados del
filtro temporal 1. Su objetivo es eliminar fluctuaciones menores y crear series
temporales más suaves, preservando las tendencias de largo plazo mientras reduce
el ruido temporal residual.

Metodología:
1. Carga resultados del filtro temporal 1 (paso 06)
2. Aplica reglas de suavizado temporal específicas por posición temporal:
   - Años intermedios: ≥2 de 4 años (actual + 3 siguientes)
   - Años penúltimos: ≥2 de 4 años (2 previos + actual + 1 siguiente)
   - Año final: ≥1 de 3 años (2 previos + actual) - muy permisivo
3. Genera imagen multibanda suavizada
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
  description: 'Filtro temporal 2 - ' + PERIOD_START + '-' + PERIOD_END + 
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
  input: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/FILTERS/urban_temporal_filter1_' + 
         processingConfig.years[0] + '_' + processingConfig.years[processingConfig.years.length-1] + '_v1' + processingConfig.inputSuffix,
  output_asset: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/FILTERS/',
  output_drive: 'MapBiomas_Argentina_TemporalFilter2' + processingConfig.outputSuffix
};

// ============================================================================
// CONFIGURACIÓN TEMPORAL
// ============================================================================

var allYears = processingConfig.years;

// Clasificación de años por posición temporal para reglas de suavizado
var years = {
  intermediate: allYears.slice(0, allYears.length - 3),  // Años con 3 años futuros disponibles
  penultimate: allYears.slice(allYears.length - 3, allYears.length - 1),  // Años penúltimos
  last: [allYears[allYears.length - 1]]  // Último año
};

// ============================================================================
// PALETAS DE VISUALIZACIÓN
// ============================================================================

var palettes = {
  original: ['000000', '00FF00'],      // Verde: después filtro 1
  filtered2: ['000000', 'FF0000'],     // Rojo: después filtro 2
  difference: ['000000', 'FFFF00'],    // Amarillo: efecto filtro 2
  comparison: ['000000', 'FF0000', '00FF00', 'FFFF00'], // Comparación 4 estados
  change: ['FF0000', '000000', '00FF00']  // Cambios temporales
};

// ============================================================================
// CARGA DE DATOS
// ============================================================================

// Cargar imagen multibanda del filtro temporal 1
var temporalFilter1Image = ee.Image(paths.input);
print('Imagen del Filtro Temporal 1 cargada:', paths.input);
print('Bandas disponibles:', temporalFilter1Image.bandNames().size());

/**
 * Extrae banda binaria urbana por año del filtro temporal 1
 * @param {number} year - Año a extraer
 * @returns {ee.Image} - Imagen binaria urbano/no-urbano
 */
function getBandByYear(year) {
  var bandName = 'classification_' + year;
  
  // Verificar si la banda existe
  var bands = temporalFilter1Image.bandNames();
  var hasBand = bands.contains(bandName);
  
  return ee.Algorithms.If(
    hasBand,
    temporalFilter1Image.select(bandName).eq(params.urban_value).rename('urban'),
    ee.Image(0).rename('urban')
  );
}

// ============================================================================
// LÓGICA DE FILTRO TEMPORAL 2
// ============================================================================

/**
 * Procesa años intermedios con ventana hacia adelante
 * @returns {Array} - Lista de imágenes procesadas
 */
function processIntermediateYears() {
  print('=== PROCESANDO AÑOS INTERMEDIOS ===');
  print('Años:', years.intermediate);
  print('Regla: Año actual + 3 siguientes, ≥2 de 4');
  
  var results = years.intermediate.map(function(year) {
    // Cargar ventana temporal: actual + 3 siguientes
    var year0 = ee.Image(getBandByYear(year));
    var year1 = ee.Image(getBandByYear(year + 1));
    var year2 = ee.Image(getBandByYear(year + 2));
    var year3 = ee.Image(getBandByYear(year + 3));
    
    // Sumar ventana temporal y aplicar umbral
    var temporalSum = ee.ImageCollection([year0, year1, year2, year3])
      .sum()
      .gte(2);  // ≥2 de 4 años
    
    // Aplicar filtro: solo mantener si pasa condición temporal
    var filtered = temporalSum.multiply(year0);
    
    return filtered
      .multiply(params.urban_value)
      .rename('classification_' + year)
      .toInt8()
      .set({
        'year': year,
        'filter_type': 'intermediate',
        'rule': 'gte_2_of_4_future',
        'window': [year, year + 1, year + 2, year + 3]
      });
  });
  
  return results;
}

/**
 * Procesa años penúltimos con ventana mixta
 * @returns {Array} - Lista de imágenes procesadas
 */
function processPenultimateYears() {
  print('=== PROCESANDO AÑOS PENÚLTIMOS ===');
  print('Años:', years.penultimate);
  print('Regla: 2 anteriores + actual + 1 siguiente, ≥2 de 4');
  
  var results = years.penultimate.map(function(year) {
    // Cargar ventana temporal: 2 pasados + actual + 1 futuro
    var yearMinus2 = ee.Image(getBandByYear(year - 2));
    var yearMinus1 = ee.Image(getBandByYear(year - 1));
    var year0 = ee.Image(getBandByYear(year));
    var year1 = ee.Image(getBandByYear(year + 1));
    
    // Sumar ventana temporal y aplicar umbral
    var temporalSum = ee.ImageCollection([yearMinus2, yearMinus1, year0, year1])
      .sum()
      .gte(2);  // ≥2 de 4 años
    
    // Aplicar filtro
    var filtered = temporalSum.multiply(year0);
    
    return filtered
      .multiply(params.urban_value)
      .rename('classification_' + year)
      .toInt8()
      .set({
        'year': year,
        'filter_type': 'penultimate',
        'rule': 'gte_2_of_4_mixed',
        'window': [year - 2, year - 1, year, year + 1]
      });
  });
  
  return results;
}

/**
 * Procesa último año con ventana hacia atrás (muy permisivo)
 * @returns {Array} - Lista de imágenes procesadas
 */
function processLastYear() {
  print('=== PROCESANDO ÚLTIMO AÑO ===');
  print('Años:', years.last);
  print('Regla: 2 anteriores + actual, ≥1 de 3 (MUY PERMISIVO)');
  
  var results = years.last.map(function(year) {
    // Cargar ventana temporal: 2 pasados + actual
    var yearMinus2 = ee.Image(getBandByYear(year - 2));
    var yearMinus1 = ee.Image(getBandByYear(year - 1));
    var year0 = ee.Image(getBandByYear(year));
    
    // Sumar ventana temporal y aplicar umbral muy permisivo
    var temporalSum = ee.ImageCollection([yearMinus2, yearMinus1, year0])
      .sum()
      .gte(1);  // ≥1 de 3 años (preserva desarrollo urbano reciente)
    
    // Aplicar filtro
    var filtered = temporalSum.multiply(year0);
    
    return filtered
      .multiply(params.urban_value)
      .rename('classification_' + year)
      .toInt8()
      .set({
        'year': year,
        'filter_type': 'last',
        'rule': 'gte_1_of_3_past',
        'window': [year - 2, year - 1, year]
      });
  });
  
  return results;
}

// ============================================================================
// PROCESAMIENTO PRINCIPAL
// ============================================================================

/**
 * Ejecuta el procesamiento completo del filtro temporal 2
 * @returns {ee.Image} - Imagen multibanda suavizada
 */
function processTemporalFilter2() {
  print('=== INICIANDO FILTRO TEMPORAL 2 ===');
  print('Período:', allYears[0], '-', allYears[allYears.length - 1]);
  print('Total de años:', allYears.length);
  print('Configuración:', processingConfig.description);
  
  // Procesar todos los tipos de años
  var intermediateResults = processIntermediateYears();
  var penultimateResults = processPenultimateYears();
  var lastResults = processLastYear();
  
  // Combinar resultados en orden cronológico
  var allBands = [];
  
  allYears.forEach(function(year) {
    if (years.intermediate.indexOf(year) !== -1) {
      var index = years.intermediate.indexOf(year);
      allBands.push(intermediateResults[index]);
    } else if (years.penultimate.indexOf(year) !== -1) {
      var index = years.penultimate.indexOf(year);
      allBands.push(penultimateResults[index]);
    } else if (years.last.indexOf(year) !== -1) {
      var index = years.last.indexOf(year);
      allBands.push(lastResults[index]);
    }
  });
  
  print('Número de bandas a combinar:', allBands.length);
  
  // Crear imagen multibanda final
  var temporalFilter2Image = ee.Image.cat(allBands);
  
  // Agregar metadatos completos
  temporalFilter2Image = temporalFilter2Image.set({
    'collection_id': params.collection_id,
    'version': params.output_version,
    'territory': params.territory,
    'theme': 'Urban Area',
    'source': 'MapBiomas Argentina',
    'filter_type': 'temporal_filter_2',
    'filter_stage': 'temporal_smoothing',
    'input_filter': 'temporal_filter_1',
    'years_processed': allYears,
    'first_year': allYears[0],
    'last_year': allYears[allYears.length - 1],
    'total_years': allYears.length,
    'intermediate_years': years.intermediate.length,
    'penultimate_years': years.penultimate.length,
    'last_years': years.last.length,
    'description': processingConfig.description,
    'processing_date': ee.Date(Date.now()).format('YYYY-MM-dd'),
    'rules': {
      'intermediate': 'gte_2_of_4_future_window',
      'penultimate': 'gte_2_of_4_mixed_window', 
      'last': 'gte_1_of_3_past_window_permissive'
    },
    'system:time_start': ee.Date.fromYMD(allYears[0], 1, 1).millis(),
    'system:time_end': ee.Date.fromYMD(allYears[allYears.length - 1], 12, 31).millis()
  });
  
  print('Filtro Temporal 2 completado');
  print('Bandas generadas:', temporalFilter2Image.bandNames().size());
  
  return temporalFilter2Image;
}

// ============================================================================
// VISUALIZACIÓN COMPARATIVA
// ============================================================================

/**
 * Crea visualizaciones comparativas entre filtros temporales 1 y 2
 * @param {ee.Image} filter2Image - Imagen con filtro temporal 2 aplicado
 */
function createComparativeVisualizations(filter2Image) {
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
    // 1. Resultado del filtro temporal 1 (input)
    var filter1Image = temporalFilter1Image.select('classification_' + year);
    
    Map.addLayer(filter1Image, {
      min: 0,
      max: params.urban_value,
      palette: palettes.original
    }, 'Filter1_' + year, false);
    
    // 2. Resultado del filtro temporal 2 (output)
    var filter2YearImage = filter2Image.select('classification_' + year);
    
    Map.addLayer(filter2YearImage, {
      min: 0,
      max: params.urban_value,
      palette: palettes.filtered2
    }, 'Filter2_' + year, false);
    
    // 3. Efecto del filtro 2 (píxeles removidos)
    var effect = filter1Image.subtract(filter2YearImage);
    
    Map.addLayer(effect, {
      min: 0,
      max: params.urban_value,
      palette: palettes.difference
    }, 'Filter2_Effect_' + year, false);
    
    // 4. Comparación lado a lado
    var filter1Binary = filter1Image.eq(params.urban_value);
    var filter2Binary = filter2YearImage.eq(params.urban_value);
    var comparison = filter1Binary.multiply(1).add(filter2Binary.multiply(2));
    
    Map.addLayer(comparison, {
      min: 0,
      max: 3,
      palette: palettes.comparison
    }, 'Comparison_F1_vs_F2_' + year, false);
  });
  
  // 5. Análisis de cambios temporales
  var firstYear = allYears[0];
  var lastYear = allYears[allYears.length - 1];
  
  var changeFilter1 = temporalFilter1Image.select('classification_' + lastYear)
    .subtract(temporalFilter1Image.select('classification_' + firstYear));
  
  var changeFilter2 = filter2Image.select('classification_' + lastYear)
    .subtract(filter2Image.select('classification_' + firstYear));
  
  Map.addLayer(changeFilter1, {
    min: -params.urban_value,
    max: params.urban_value,
    palette: palettes.change
  }, 'Change_Filter1_' + firstYear + '_' + lastYear, false);
  
  Map.addLayer(changeFilter2, {
    min: -params.urban_value,
    max: params.urban_value,
    palette: palettes.change
  }, 'Change_Filter2_' + firstYear + '_' + lastYear, false);
  
  print('Visualizaciones comparativas creadas para años:', keyYears);
}

/**
 * Calcula estadísticas comparativas entre filtros
 * @param {ee.Image} filter2Image - Imagen filtrada con filtro 2
 */
function calculateComparativeStats(filter2Image) {
  print('=== ESTADÍSTICAS COMPARATIVAS ===');
  
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
    // Área después del filtro 1
    var area1 = temporalFilter1Image.select('classification_' + year)
      .eq(params.urban_value)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: region,
        scale: 1000,
        maxPixels: 1e8
      });
    
    // Área después del filtro 2
    var area2 = filter2Image.select('classification_' + year)
      .eq(params.urban_value)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: region,
        scale: 1000,
        maxPixels: 1e8
      });
    
    print('Año', year + ':');
    print('  Filtro 1 (km²):', ee.Number(area1.get('classification_' + year)).divide(1e6));
    print('  Filtro 2 (km²):', ee.Number(area2.get('classification_' + year)).divide(1e6));
    
    // Calcular reducción del filtro 2
    var reduction = ee.Number(area1.get('classification_' + year))
      .subtract(ee.Number(area2.get('classification_' + year)))
      .divide(ee.Number(area1.get('classification_' + year)))
      .multiply(100);
    print('  Reducción Filtro 2 (%):', reduction);
  });
}

// ============================================================================
// EXPORTACIÓN
// ============================================================================

/**
 * Exporta resultados del filtro temporal 2
 * @param {ee.Image} filter2Image - Imagen a exportar
 */
function exportResults(filter2Image) {
  print('=== EXPORTANDO RESULTADOS ===');
  
  var baseName = 'urban_temporal_filter2_' + allYears[0] + '_' + allYears[allYears.length-1] + '_v' + params.output_version + processingConfig.outputSuffix;
  
  // Exportar a Google Drive
  Export.image.toDrive({
    image: filter2Image,
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
    image: filter2Image,
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
 * Prueba la lógica del filtro 2 para un año específico
 * @param {number} testYear - Año a probar
 */
function testFilter2Logic(testYear) {
  print('=== TEST FILTRO 2 PARA AÑO', testYear, '===');
  
  if (allYears.indexOf(testYear) === -1) {
    print('Error: Año', testYear, 'no está en el rango');
    return;
  }
  
  // Verificar banda en input
  var bandName = 'classification_' + testYear;
  var inputBands = temporalFilter1Image.bandNames();
  var hasBand = inputBands.contains(bandName);
  
  print('Banda buscada:', bandName);
  print('Existe en input:', hasBand);
  
  // Determinar tipo de año
  var yearType;
  if (years.intermediate.indexOf(testYear) !== -1) {
    yearType = 'intermedio';
  } else if (years.penultimate.indexOf(testYear) !== -1) {
    yearType = 'penúltimo';
  } else if (years.last.indexOf(testYear) !== -1) {
    yearType = 'último';
  }
  
  print('Tipo de año:', yearType);
  
  // Cargar y visualizar
  var beforeFilter2 = temporalFilter1Image.select(bandName);
  var binaryImage = ee.Image(getBandByYear(testYear));
  
  Map.addLayer(beforeFilter2, {
    min: 0, max: params.urban_value, palette: palettes.original
  }, 'TEST_Input_' + testYear, true);
  
  Map.addLayer(binaryImage.multiply(params.urban_value), {
    min: 0, max: params.urban_value, palette: palettes.filtered2
  }, 'TEST_Binary_' + testYear, true);
  
  Map.setCenter(-64, -38, 6);
  
  print('Test completado exitosamente');
}

/**
 * Verifica continuidad con filtro temporal 1
 */
function checkContinuity() {
  print('=== VERIFICANDO CONTINUIDAD CON FILTRO TEMPORAL 1 ===');
  
  try {
    var testImage = ee.Image(paths.input);
    print('Imagen del filtro temporal 1 encontrada');
    print('Bandas disponibles:', testImage.bandNames());
    print('Ruta verificada:', paths.input);
  } catch (error) {
    print('Error: No se encontró imagen del filtro temporal 1');
    print('Verificar que el filtro temporal 1 se ejecutó correctamente');
    print('Ruta esperada:', paths.input);
  }
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

/**
 * Ejecuta el flujo completo del filtro temporal 2
 * @returns {ee.Image} - Imagen suavizada temporalmente
 */
function main() {
  print('=== EJECUTANDO FILTRO TEMPORAL 2 ===');
  print('Período:', allYears[0], '-', allYears[allYears.length-1]);
  print('Incluye Patagonia:', processingConfig.includePatagonia);
  print('Descripción:', processingConfig.description);
  
  // Centrar mapa
  Map.setCenter(-64, -38, 5);
  
  // 1. Procesamiento principal
  var filter2Image = processTemporalFilter2();
  
  // 2. Crear visualizaciones comparativas
  createComparativeVisualizations(filter2Image);
  
  // 3. Calcular estadísticas
  calculateComparativeStats(filter2Image);
  
  // 4. Exportar resultados
  exportResults(filter2Image);
  
  print('=== FILTRO TEMPORAL 2 COMPLETADO ===');
  print('Suavizado temporal aplicado a', allYears.length, 'años');
  print('Visualizaciones comparativas creadas');
  print('Exportación iniciada');
  
  return filter2Image;
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

print('=== FILTRO TEMPORAL 2 - MAPBIOMAS ARGENTINA ===');
print('Configuración:', processingConfig.description);
print('');
print('OPCIONES DE EJECUCIÓN:');
print('• checkContinuity() - Verificar continuidad con filtro temporal 1');
print('• testFilter2Logic(año) - Test individual');
print('• main() - Procesamiento completo');
print('');

// Verificación inicial
checkContinuity();

// Test automático
var testYear = allYears[Math.floor(allYears.length / 2)];
testFilter2Logic(testYear);

// Ejecutar procesamiento completo
var result = main();

/*
=== CONFIGURACIÓN ===

- PERIOD_START: Año de inicio (ej: 1985)
- PERIOD_END: Año de fin (ej: 2024) 
- INCLUDE_PATAGONIA: true/false para incluir/excluir Patagonia
- OUTPUT_SUFFIX: Sufijo para archivos de salida (ej: '_1985_2024')

QUÉ HACE CADA PASO DEL FILTRO 2:

OBJETIVO GENERAL:
Suavizar las series temporales eliminando fluctuaciones menores
que quedaron después del Filtro 1

REGLAS POR TIPO DE AÑO:

1. AÑOS INTERMEDIOS:
   - Ventana: [actual, +1, +2, +3]
   - Regla: ≥2 de 4 años urbanos
   - Efecto: Elimina apariciones/desapariciones esporádicas

2. AÑOS PENÚLTIMOS:
   - Ventana: [-2, -1, actual, +1]
   - Regla: ≥2 de 4 años urbanos
   - Efecto: Ventana mixta por falta de años futuros

3. ÚLTIMO AÑO:
   - Ventana: [-2, -1, actual]
   - Regla: ≥1 de 3 años urbanos (MUY permisivo)
   - Efecto: Preserva desarrollo urbano reciente

CAPAS DE VISUALIZACIÓN:

- Filter1_YYYY: Resultado del primer filtro (verde)
- Filter2_YYYY: Resultado del segundo filtro (rojo)  
- Filter2_Effect_YYYY: Efecto del segundo filtro (amarillo)
- Comparison_F1_vs_F2_YYYY: Comparación lado a lado
- Change_FilterX_primer_ultimo: Cambios temporales por filtro

EFECTO ESPERADO:
- Reducción adicional menor (2-8%) del área urbana
- Series temporales más suaves
- Eliminación de fluctuaciones año a año
- Preservación de tendencias de largo plazo

================================================================================
*/