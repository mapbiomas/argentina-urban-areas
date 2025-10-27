/*
================================================================================
MAPBIOMAS ARGENTINA - CLASIFICACIÓN DE ÁREA URBANA
05 - FILTRO ESPACIAL
================================================================================

Descripción:
Este script aplica filtros espaciales morfológicos a las clasificaciones de
probabilidad armonizadas. Utiliza umbrales específicos por GID y año para
convertir probabilidades en clasificaciones binarias urbano/no-urbano, seguido
de operaciones morfológicas para suavizar y limpiar los resultados.

Metodología:
1. Carga probabilidades armonizadas por GID
2. Aplica umbrales específicos por carta y período temporal
3. Ejecuta filtros morfológicos (cierre, apertura, remoción de ruido)
4. Genera mosaicos nacionales por año
5. Maneja diferentes períodos temporales y exclusiones regionales

Autor: Luna Schteingart, Gonzalo Dieguez

================================================================================
*/

// ============================================================================
// CONFIGURACIÓN PRINCIPAL
// ============================================================================

var params = {
  collection_id: '1',
  output_version: '1',
  description: 'Urbano filtro espacial - Argentina Collection 1',
  territory: 'ARGENTINA',
  source: 'MAPBIOMAS ARGENTINA',
  theme: 'Urban Area',
  scale: 30,
  maxPixels: 1e13
};

// ============================================================================
// CONFIGURACIÓN TEMPORAL Y REGIONAL
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
  description: 'Filtro espacial ' + PERIOD_START + '-' + PERIOD_END + 
               (INCLUDE_PATAGONIA ? ' (con Patagonia)' : ' (sin Patagonia)'),
  outputSuffix: OUTPUT_SUFFIX
};

// ============================================================================
// RUTAS DE ASSETS
// ============================================================================

var input_path = 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/CLASSIFICATION_HARMONIZED/';
var output_path = 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/FILTERS/';

// ============================================================================
// UMBRALES DE PROBABILIDAD POR GID Y PERÍODO
// ============================================================================

var thresholdsByGID = {
  // PATAGONIA (solo se incluyen en período completo)
  13: {'1985-2004': 58, '2005-2019': 50, '2020-2024': 48},
  39: {'1985-2004': 46, '2005-2019': 49, '2020-2024': 52},
  43: {'1985-2004': 57, '2005-2019': 57, '2020-2024': 58},
  50: {'1985-2004': 65, '2005-2019': 55, '2020-2024': 55},
  54: {'1985-2004': 49, '2005-2019': 49, '2020-2024': 55},
  107: {'1985-2004': 60, '2005-2019': 60, '2020-2024': 54},
  110: {'1985-2004': 55, '2005-2019': 49, '2020-2024': 55},
  143: {'1985-2004': 58, '2005-2019': 58, '2020-2024': 60},
  147: {'1985-2004': 55, '2005-2019': 45, '2020-2024': 57},
  195: {'1985-2004': 15, '2005-2019': 80, '2020-2024': 80},
  229: {'1985-2004': 40, '2005-2019': 61, '2020-2024': 67},
  
  // RESTO DE ARGENTINA (incluidas en ambos períodos)
  // CUYO
  72: {'1985-2004': 50, '2005-2019': 50, '2020-2024': 51},
  77: {'1985-2004': 60, '2005-2019': 60, '2020-2024': 66},
  83: {'1985-2004': 60, '2005-2019': 60, '2020-2024': 48},
  88: {'1985-2004': 60, '2005-2019': 60, '2020-2024': 66},
  
  // CHACO
  121: {'1985-2004': 53, '2005-2019': 53, '2020-2024': 53},
  128: {'1985-2004': 45, '2005-2019': 46, '2020-2024': 54},
  149: {'1985-2004': 53, '2005-2019': 47, '2020-2024': 48},
  180: {'1985-2004': 54, '2005-2019': 43, '2020-2024': 51},
  182: {'1985-2004': 51, '2005-2019': 50, '2020-2024': 60},
  
  // PAMPA
  133: {'1985-2004': 50, '2005-2019': 57, '2020-2024': 54},
  140: {'1985-2004': 47, '2005-2019': 49, '2020-2024': 56},
  171: {'1985-2004': 54, '2005-2019': 60, '2020-2024': 58},
  187: {'1985-2004': 47, '2005-2019': 53, '2020-2024': 55},
  196: {'1985-2004': 46, '2005-2019': 56, '2020-2024': 52},
  232: {'1985-2004': 49, '2005-2019': 50, '2020-2024': 52},
  247: {'1985-2004': 42, '2005-2019': 50, '2020-2024': 67},
  248: {'1985-2004': 46, '2005-2019': 47, '2020-2024': 52}
};

// ============================================================================
// FUNCIONES DE CONFIGURACIÓN
// ============================================================================

/**
 * Obtiene la lista de GIDs a procesar según la configuración
 * @returns {Array} - Lista de GIDs disponibles
 */
function getAvailableGIDs() {
  var allGIDs = Object.keys(thresholdsByGID).map(function(gid) {
    return parseInt(gid);
  });
  
  if (!processingConfig.includePatagonia) {
    // Excluir GIDs de Patagonia para período temprano
    var patagoniaGIDs = [13, 39, 43, 50, 54, 107, 110, 143, 147, 195, 229];
    allGIDs = allGIDs.filter(function(gid) {
      return patagoniaGIDs.indexOf(gid) === -1;
    });
  }
  
  return allGIDs;
}

/**
 * Obtiene el umbral de probabilidad para un GID y año específicos
 * @param {number} gid - ID de la carta
 * @param {number} year - Año de procesamiento
 * @returns {number} - Umbral de probabilidad (0-100)
 */
function getThresholdForGIDYear(gid, year) {
  var gidThresholds = thresholdsByGID[gid];
  
  if (!gidThresholds) {
    print('Warning: No thresholds found for GID', gid);
    return 50;
  }
  
  // Determinar período temporal según el año
  var threshold = 50; // valor por defecto
  
  if (year >= 1985 && year <= 2004 && gidThresholds['1985-2004']) {
    threshold = gidThresholds['1985-2004'];
  } else if (year >= 2005 && year <= 2019 && gidThresholds['2005-2019']) {
    threshold = gidThresholds['2005-2019'];
  } else if (year >= 2020 && year <= 2024 && gidThresholds['2020-2024']) {
    threshold = gidThresholds['2020-2024'];
  }
  
  // Validación de umbral extremo
  if (threshold >= 95) {
    print('Warning: Umbral muy alto para GID', gid, 'año', year, '- usando 50');
    threshold = 50;
  }
  
  return threshold;
}

/**
 * Mapea GID a región geográfica
 * @param {number} gid - ID de la carta
 * @returns {string} - Nombre de la región
 */
function getRegionForGID(gid) {
  var regionMap = {
    // PATAGONIA
    13: 'Patagonia', 39: 'Patagonia', 43: 'Patagonia', 50: 'Patagonia', 
    54: 'Patagonia', 107: 'Patagonia', 110: 'Patagonia', 143: 'Patagonia', 
    147: 'Patagonia', 195: 'Patagonia', 229: 'Patagonia',
    
    // CUYO
    72: 'Cuyo', 77: 'Cuyo', 83: 'Cuyo', 88: 'Cuyo',
    
    // CHACO  
    121: 'Chaco', 128: 'Chaco', 149: 'Chaco', 180: 'Chaco', 182: 'Chaco',
    
    // PAMPA
    133: 'Pampa', 171: 'Pampa', 187: 'Pampa', 247: 'Pampa', 248: 'Pampa',
    
    // MIXTAS
    140: 'Pampa/Chaco', 232: 'Cuyo/Chaco', 196: 'Bosque Atlántico'
  };
  
  return regionMap[gid] || 'Unknown';
}

// ============================================================================
// FUNCIONES DE FILTRADO ESPACIAL
// ============================================================================

/**
 * Aplica filtros morfológicos espaciales a imagen binaria
 * @param {ee.Image} image - Imagen binaria urbano/no-urbano
 * @returns {ee.Image} - Imagen filtrada espacialmente
 */
function applySpatialFilter(image) {
  // Kernel circular para operaciones morfológicas
  var kernel = ee.Kernel.circle({radius: 1});
  
  // 1. OPERACIÓN DE CIERRE MORFOLÓGICO
  // Conecta píxeles urbanos cercanos, cerrando pequeños gaps
  image = image.unmask(0)
    .focal_max({iterations: 1, kernel: kernel})  // Dilatación
    .focal_min({iterations: 1, kernel: kernel}); // Erosión
  
  // 2. REMOCIÓN DE HUECOS INTERNOS
  // Elimina áreas no-urbanas pequeñas rodeadas por área urbana
  var nPix = 60; // Área mínima basada en píxeles urbanos mínimos
  var image_pixelcount_inverted = image.remap([0,1], [1,0])
    .selfMask()
    .connectedPixelCount(nPix, true);
  
  image = image.where(image_pixelcount_inverted.lt(nPix), 1)
    .reproject({crs: 'EPSG:4326', scale: 30});
  
  // 3. OPERACIÓN DE APERTURA MORFOLÓGICA
  // Suaviza bordes y elimina extensiones finas
  image = image.focal_min({iterations: 1, kernel: kernel})  // Erosión
    .focal_max({iterations: 1, kernel: kernel}); // Dilatación
  
  // 4. REMOCIÓN DE RUIDO (COMPONENTES PEQUEÑOS AISLADOS)
  // Elimina componentes urbanos muy pequeños que probablemente sean ruido
  var image_pixel_count = image.selfMask().connectedPixelCount();
  image = image.where(image_pixel_count.lte(5), 0)
    .reproject({crs: 'EPSG:4326', scale: 30});
  
  return image;
}

/**
 * Reclasifica imagen aplicando filtros y manteniendo valores no-data
 * @param {ee.Image} image_original - Imagen original con umbrales aplicados
 * @param {ee.Image} image_filtered - Imagen filtrada espacialmente
 * @returns {ee.Image} - Imagen reclasificada final
 */
function reclassImage(image_original, image_filtered) {
  // Usar 27 como valor de no-data (estándar MapBiomas)
  image_original = image_original.unmask(27);
  
  // Remapear valores binarios a clases MapBiomas (0: no-urbano, 24: urbano)
  image_filtered = image_filtered.remap([0,1], [0,24]);
  
  // Mantener áreas sin datos como 0 donde originalmente era no-data
  var image = image_filtered.where(
    image_original.eq(27).and(image_filtered.eq(0)), 
    0
  );
  
  return image.selfMask();
}

// ============================================================================
// PROCESAMIENTO PRINCIPAL
// ============================================================================

/**
 * Procesa filtrado espacial para un año específico
 * @param {number} year - Año a procesar
 * @returns {ee.Image} - Mosaico nacional filtrado para el año
 */
function processUrbanYear(year) {
  print('=== PROCESANDO AÑO:', year, '===');
  
  var availableGIDs = getAvailableGIDs();
  var yearImages = [];
  var processedCount = 0;
  var errorCount = 0;
  
  print('GIDs a procesar:', availableGIDs.length);
  
  // Procesar cada GID
  availableGIDs.forEach(function(gid) {
    try {
      // 1. Cargar imagen de probabilidad armonizada
      var asset_name = input_path + 'HARMONIZED_PROBA_GID_' + gid;
      var probImage = ee.Image(asset_name);
      
      // Verificar disponibilidad de banda para el año
      var hasYear = probImage.bandNames().contains('classification_' + year);
      
      var processedGID = ee.Algorithms.If(
        hasYear,
        ee.Algorithms.If(
          probImage.bandNames().size().gt(0),
          function() {
            // 2. Obtener umbral específico para este GID y año
            var threshold = getThresholdForGIDYear(gid, year);
            
            // 3. Seleccionar banda del año específico
            var yearBand = probImage.select('classification_' + year);
            
            // 4. Aplicar umbral de probabilidad
            var thresholdedImage = yearBand.gte(threshold);
            
            // 5. Aplicar filtros espaciales morfológicos
            var filteredImage = applySpatialFilter(thresholdedImage);
            
            // 6. Reclasificar a valores finales
            var finalImage = reclassImage(thresholdedImage, filteredImage);
            
            // 7. Agregar metadatos completos
            return finalImage.set({
              'gid': gid,
              'year': year,
              'threshold_used': threshold,
              'region': getRegionForGID(gid),
              'processing_mode': PROCESSING_MODE,
              'system:time_start': ee.Date.fromYMD(year, 1, 1).millis()
            });
          }(),
          ee.Image().set('processing_error', 'no_bands')
        ),
        ee.Image().set('processing_error', 'no_year_data')
      );
      
      yearImages.push(processedGID);
      processedCount++;
      
    } catch (error) {
      print('Error procesando GID', gid, 'para año', year, ':', error);
      errorCount++;
    }
  });
  
  print('GIDs procesados exitosamente:', processedCount);
  if (errorCount > 0) {
    print('GIDs con errores:', errorCount);
  }
  
  // Crear mosaico nacional unificando todos los GIDs
  var nationalMosaic = ee.ImageCollection(yearImages)
    .filter(ee.Filter.neq('system:index', null))
    .filter(ee.Filter.neq('processing_error', 'no_bands'))
    .filter(ee.Filter.neq('processing_error', 'no_year_data'))
    .mosaic()
    .rename('classification');
  
  // Agregar metadatos completos al mosaico final
  nationalMosaic = nationalMosaic.set({
    'year': year,
    'version': params.output_version,
    'collection_id': params.collection_id,
    'description': params.description + ' - ' + processingConfig.description,
    'territory': params.territory + (processingConfig.includePatagonia ? '' : ' (excluding Patagonia)'),
    'source': params.source,
    'theme': params.theme,
    'processing_mode': PROCESSING_MODE,
    'include_patagonia': processingConfig.includePatagonia,
    'gids_processed': availableGIDs.length,
    'gids_with_errors': errorCount,
    'processing_date': ee.Date(Date.now()).format('YYYY-MM-dd'),
    'system:time_start': ee.Date.fromYMD(year, 1, 1).millis()
  }).toByte();
  
  return nationalMosaic;
}

// ============================================================================
// EXPORTACIÓN Y VISUALIZACIÓN
// ============================================================================

/**
 * Exporta y visualiza resultado para un año
 * @param {number} year - Año a exportar
 */
function exportYearResult(year) {
  var nationalMosaic = processUrbanYear(year);
  
  // Nombre de archivo de salida
  var outputName = 'urban_spatial_filtered_' + year + '_v' + params.output_version + processingConfig.outputSuffix;
  
  // Exportar como asset
  Export.image.toAsset({
    image: nationalMosaic,
    description: outputName,
    assetId: output_path + outputName,
    scale: params.scale,
    maxPixels: params.maxPixels,
    region: ee.Geometry.Rectangle([-77, -56, -52, -20]), // Bounds de Argentina
    pyramidingPolicy: {'.default': 'mode'}
  });
  
  // Visualización opcional
  Map.addLayer(nationalMosaic, {
    min: 0,
    max: 24,
    palette: ['000000', 'FF0000']
  }, 'Urban_Filtered_' + year + processingConfig.outputSuffix, false);
  
  print('Exportación programada para año:', year);
}

// ============================================================================
// EJECUCIÓN PRINCIPAL
// ============================================================================

function runSpatialFiltering() {
  print('=== FILTRADO ESPACIAL URBANO ARGENTINA ===');
  print('Modo de procesamiento:', PROCESSING_MODE);
  print('Período:', processingConfig.years[0], '-', processingConfig.years[processingConfig.years.length - 1]);
  print('Incluye Patagonia:', processingConfig.includePatagonia);
  print('Total de años a procesar:', processingConfig.years.length);
  print('Versión de salida:', params.output_version);
  
  var availableGIDs = getAvailableGIDs();
  print('GIDs disponibles:', availableGIDs.length);
  print('Regiones incluidas:', availableGIDs.map(getRegionForGID).filter(function(region, index, arr) {
    return arr.indexOf(region) === index; // unique values
  }));
  
  // Procesar todos los años
  processingConfig.years.forEach(function(year) {
    exportYearResult(year);
  });
  
  print('=== PROCESAMIENTO INICIADO ===');
  print('Verifique la pestaña Tasks para monitorear las exportaciones');
}

// ============================================================================
// FUNCIONES DE TESTING Y DEBUGGING
// ============================================================================

/**
 * Función para probar un GID y año específicos
 * @param {number} gid - ID de la carta a probar
 * @param {number} year - Año a probar
 */
function testSingleGIDYear(gid, year) {
  print('=== TEST INDIVIDUAL ===');
  print('GID:', gid, 'Año:', year);
  print('Región:', getRegionForGID(gid));
  
  if (!thresholdsByGID[gid]) {
    print('ERROR: GID', gid, 'no disponible en configuración actual');
    return;
  }
  
  if (!processingConfig.includePatagonia && [13, 39, 43, 50, 54, 107, 110, 143, 147, 195, 229].indexOf(gid) !== -1) {
    print('WARNING: GID', gid, 'es de Patagonia y está excluido en modo actual');
    return;
  }
  
  var threshold = getThresholdForGIDYear(gid, year);
  print('Umbral calculado:', threshold);
  
  try {
    var asset_name = input_path + 'HARMONIZED_PROBA_GID_' + gid;
    var probImage = ee.Image(asset_name);
    print('Asset cargado:', asset_name);
    print('Bandas disponibles:', probImage.bandNames().getInfo());
    
    if (probImage.bandNames().contains('classification_' + year).getInfo()) {
      // Visualizar imagen original de probabilidad
      Map.addLayer(probImage.select('classification_' + year), {
        min: 0,
        max: 100,
        palette: ['000000', 'FFFF00', 'FF0000']
      }, 'Probabilidad_Original_GID_' + gid + '_' + year, false);
      
      // Procesar y visualizar resultado filtrado
      var yearBand = probImage.select('classification_' + year);
      var thresholdedImage = yearBand.gte(threshold);
      var filteredImage = applySpatialFilter(thresholdedImage);
      var finalImage = reclassImage(thresholdedImage, filteredImage);
      
      Map.addLayer(finalImage, {
        min: 0,
        max: 24,
        palette: ['000000', 'FF0000']
      }, 'Filtrado_Final_GID_' + gid + '_' + year, true);
      
      print('Visualización agregada exitosamente');
    } else {
      print('ERROR: No hay datos para el año', year, 'en este GID');
    }
    
  } catch (error) {
    print('Error en test:', error);
  }
}

/**
 * Función para mostrar estadísticas de configuración
 */
function showConfigurationStats() {
  print('=== ESTADÍSTICAS DE CONFIGURACIÓN ===');
  var availableGIDs = getAvailableGIDs();
  print('Total GIDs configurados:', Object.keys(thresholdsByGID).length);
  print('GIDs a procesar:', availableGIDs.length);
  print('GIDs excluidos:', Object.keys(thresholdsByGID).length - availableGIDs.length);
  print('Años por GID:', processingConfig.years.length);
  print('Total de tareas de procesamiento:', availableGIDs.length * processingConfig.years.length);
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

// Mostrar configuración
showConfigurationStats();

// Ejecutar filtrado espacial
runSpatialFiltering();

// Funciones de testing disponibles:
// testSingleGIDYear(72, 1990);  // Ejemplo: probar GID 72 para año 1990

/*
================================================================================
INSTRUCCIONES PARA ADAPTAR EL SCRIPT:

1. UMBRALES POR GID:
   - Variable 'thresholdsByGID' con los datos del Excel
   - Estructura esperada: {GID: {'periodo': umbral, ...}}

2. LISTA DE GIDS:
   - Modificar getAvailableGIDs() para retornar los GIDs realmente disponibles
   - Puede obtenerse dinámicamente listando los assets disponibles

3. ESTRUCTURA DE BANDAS:
   - Ejemplo: 'classification_1985', 'classification_1986', etc.

4. BOUNDS GEOGRÁFICOS:
   - Argentina (Ajustar si es necesario) [-77, -56, -52, -20]

5. TESTING:
   - Usar testSingleGIDYear(gid, year) para probar GIDs individuales
   - Ejemplo: testSingleGIDYear(72, 1990)

PARA EJECUTAR:
1. Ajustar thresholdsByGID con datos del Excel
2. Verificar rutas de assets de entrada y salida
3. Ejecutar el script completo o testear individualmente

CONFIGURACIÓN DEL MODO DE PROCESAMIENTO:
- Cambiar PROCESSING_MODE entre 'EARLY_PERIOD' y 'FULL_PERIOD'
- EARLY_PERIOD: 1985-1998 sin Patagonia
- FULL_PERIOD: 1985-2024 con todas las regiones

FILTROS MORFOLÓGICOS APLICADOS:
- Cierre: Conecta píxeles urbanos cercanos
- Remoción de huecos: Elimina áreas no-urbanas internas pequeñas
- Apertura: Suaviza bordes y elimina extensiones finas
- Remoción de ruido: Elimina componentes urbanos muy pequeños

================================================================================
*/