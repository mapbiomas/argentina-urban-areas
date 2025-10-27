/*
================================================================================
MAPBIOMAS ARGENTINA - CLASIFICACIÓN DE ÁREA URBANA
03 - GENERACIÓN DE PROBABILIDADES CON RANDOM FOREST
================================================================================

Descripción:
Este script genera la probabilidad de urbanización utilizando Random Forest
con diferentes conjuntos de muestras de entrenamiento por año. Genera mapas de
probabilidad que posteriormente serán utilizados en los filtros temporales y
espaciales.

Metodología:
1. Carga mosaicos espectrales por año y carta
2. Utiliza muestras urbanas y no urbanas específicas por año
3. Entrena clasificador Random Forest
4. Genera y exporta mapas de probabilidad
5. Procesa múltiples cartas y años en batch

Autor: Luna Schteingart, Gonzalo Dieguez

================================================================================
*/

// ============================================================================
// PARÁMETROS DE CONFIGURACIÓN
// ============================================================================

// Configuración de visualización
var imageVisParam = {
  min: 0,
  max: 100,
  palette: ["68ff0a", "fbff08", "ff3406"],  // Verde-Amarillo-Rojo
  opacity: 0.95
};

// Metadatos de versión
var version = 1;
var col = 1;
var mosaic_version = 1;
var samples_version = 1;
var desc = 'Clasificacion_urbana_probabilidades';

// ============================================================================
// BANDAS ESPECTRALES UTILIZADAS
// ============================================================================

var Bands = [
  'BAI',        // Burn Area Index
  'BLUE_p75',   // Azul percentil 75
  'BLUE',       // Azul
  'BSI',        // Bare Soil Index
  'CLOUD',      // Nubosidad
  'EVI_p75',    // Enhanced Vegetation Index percentil 75
  'EVI',        // Enhanced Vegetation Index
  'EVI2_p75',   // Enhanced Vegetation Index 2 percentil 75
  'EVI2',       // Enhanced Vegetation Index 2
  'GREEN_p75',  // Verde percentil 75
  'GREEN',      // Verde
  'GV',         // Green Vegetation
  'GVS',        // Green Vegetation Shade
  'MNDWI_p75',  // Modified Normalized Difference Water Index percentil 75
  'MNDWI',      // Modified Normalized Difference Water Index
  'NBR',        // Normalized Burn Ratio
  'NDBI',       // Normalized Difference Built-up Index
  'NDFI',       // Normalized Difference Fraction Index
  'NDUI',       // Normalized Difference Urban Index
  'NDVI_p75',   // NDVI percentil 75
  'NDVI',       // Normalized Difference Vegetation Index
  'NDWIm_p75',  // Normalized Difference Water Index modificado percentil 75
  'NDWIm',      // Normalized Difference Water Index modificado
  'NIR_p75',    // Infrarrojo cercano percentil 75
  'NIR',        // Infrarrojo cercano
  'NPV',        // Non-Photosynthetic Vegetation
  'RED_p75',    // Rojo percentil 75
  'RED',        // Rojo
  'SAVI_p75',   // Soil Adjusted Vegetation Index percentil 75
  'SAVI',       // Soil Adjusted Vegetation Index
  'SHADE',      // Sombra
  'SOIL',       // Suelo
  'SWIR1_p75',  // Infrarrojo de onda corta 1 percentil 75
  'SWIR1',      // Infrarrojo de onda corta 1
  'SWIR2_p75',  // Infrarrojo de onda corta 2 percentil 75
  'SWIR2',      // Infrarrojo de onda corta 2
  'UI'          // Urban Index
];

// ============================================================================
// LIBRERÍAS Y MÓDULOS
// ============================================================================

// Librerías de clasificación y generación de mosaicos
var batchClass = require('users/edimilsonrodriguessantos/mb_argentina:basic/class_lib.js');
var batchMosaic = require('users/edimilsonrodriguessantos/mb_argentina:basic/mosaic_production.js');

// ============================================================================
// DATOS AUXILIARES
// ============================================================================

// Capas vectoriales auxiliares
var cartas = ee.FeatureCollection(
  'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/carta250000_ajustadas_v2'
);

var envolventes2020 = ee.FeatureCollection(
  'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/areasdebusqueda'
);

// ============================================================================
// CONFIGURACIÓN DE PROCESAMIENTO
// ============================================================================

// IDs de cartas a procesar (MODIFICAR SEGÚN NECESIDAD)
var listGids = ee.List([121, 128]); 

// Años a procesar
var listYears = ee.List.sequence(2005, 2019, 1);

// ============================================================================
// CONFIGURACIÓN DE MUESTRAS POR AÑO
// ============================================================================

/**
 * Obtiene las muestras de entrenamiento según el año especificado
 * @param {number} year - Año para el cual obtener las muestras
 * @returns {ee.FeatureCollection} - Colección combinada de muestras urbanas y no urbanas
 */
function getSamplesByYear(year) {
  var urbanSamples, sampleDescription;
  
  // Seleccionar conjunto de muestras según el año
  if (year >= 1985 && year <= 1999) {
    // Muestras década de los 80-90
    urbanSamples = ee.FeatureCollection(
      'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/SAMPLES/Mues1985_env_pais_Alta'
    );
    sampleDescription = 'muestras_1985';
    
  } else if (year >= 2000 && year <= 2009) {
    // Muestras década de los 2000
    urbanSamples = ee.FeatureCollection(
      'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/SAMPLES/Mues2005_env_pais_Alta'
    );
    sampleDescription = 'muestras_2005';
    
  } else if (year >= 2010 && year <= 2023) {
    // Muestras década de los 2010-2020
    urbanSamples = ee.FeatureCollection(
      'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/SAMPLES/Mues2020_env_pais_Alta'
    );
    sampleDescription = 'muestras_2020';
    
  } else {
    // Por defecto usar muestras más recientes
    urbanSamples = ee.FeatureCollection(
      'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/SAMPLES/Mues2020_env_pais_Alta'
    );
    sampleDescription = 'muestras_default_2020';
  }
  
  // Asignar clase urbana (1) a las muestras urbanas
  urbanSamples = urbanSamples.map(function(f) { 
    return f.set('class', 1); 
  });
  
  // Muestras no urbanas (clases estables del paso anterior)
  var notUrbanSamples = ee.FeatureCollection(
    'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/SAMPLES/estables_pais'
  ).map(function(f) { 
    return f.set('class', 0); 
  });
  
  // Combinar muestras urbanas y no urbanas
  var combinedSamples = urbanSamples.merge(notUrbanSamples);
  
  // Agregar metadatos
  combinedSamples = combinedSamples.map(function(f) {
    return f.set({
      'sample_year_group': sampleDescription,
      'classification_year': year
    });
  });
  
  return combinedSamples;
}

// ============================================================================
// FUNCIONES DE CLASIFICACIÓN
// ============================================================================

/**
 * Configura el área de clasificación y obtiene muestras filtradas por carta
 * @param {number} gid - ID de la carta a procesar
 * @param {number} year - Año de clasificación
 * @returns {Array} - [geometría del área, muestras filtradas]
 */
function setClassificationFeatures(gid, year) {
  // Obtener geometría de la carta
  var carta = cartas.filter(ee.Filter.eq('gid', gid)).geometry();
  
  // Crear grilla de cobertura para el área de clasificación
  var coveringGrid = envolventes2020.filterBounds(carta)
                                   .geometry()
                                   .coveringGrid('EPSG:4326', 6000);
  var classificationArea = coveringGrid.union(100).geometry();
  
  // Obtener muestras para el año específico
  var yearSamples = getSamplesByYear(year);
  
  // Filtrar muestras por área de la carta
  var samplesFiltered = yearSamples.filterBounds(carta);
  
  return [
    ee.Feature(classificationArea).set('gid', gid),
    samplesFiltered
  ];
}

/**
 * Realiza la clasificación para una carta específica en un año determinado
 * @param {number} year - Año de clasificación
 * @param {number} gid - ID de la carta
 */
function classificationByFeature(year, gid) {
  print('Procesando carta ' + gid + ' para el año ' + year);
  
  // Configurar área y muestras
  var features = setClassificationFeatures(gid, year);
  var bounds = features[0].geometry();
  var samplesFiltered = features[1];
  
  // Verificar que hay suficientes muestras
  var sampleCount = samplesFiltered.size();
  print('Número de muestras para carta ' + gid + ', año ' + year + ':', sampleCount);
  
  // Generar mosaico espectral para el año
  var mosaic = batchMosaic.mosaicGen(year, bounds);
  
  // Extraer espacio de características de las muestras
  var samplesTrained = batchClass.getFeatureSpace(mosaic, samplesFiltered);
  
  // Realizar clasificación Random Forest
  var imgClassified = batchClass.classifying(
    Bands,                                    // Bandas a utilizar
    samplesTrained,                          // Muestras entrenadas
    100,                                     // Número de árboles
    mosaic.clip(envolventes2020)             // Mosaico recortado
  );
  
  // Agregar metadatos
  imgClassified = imgClassified.set({
    'territory': 'ARGENTINA',
    'theme': 'Urban Area',
    'version': version,
    'source': 'GT URBANO',
    'collection_id': col,
    'year': year,
    'gid': gid,
    'Mosaic_version': mosaic_version,
    'Samples_version': samples_version,
    'description': desc,
    'processing_date': ee.Date(Date.now()).format('YYYY-MM-dd'),
    'bands_used': Bands.length,
    'sample_count': sampleCount
  });
  
  // Recortar resultado al área de la carta
  var imgClassifiedBounds = imgClassified.clip(bounds);
  
  // ============================================================================
  // VISUALIZACIÓN (OPCIONAL)
  // ============================================================================
  
  // Agregar capa al mapa para verificación visual
  Map.addLayer(
    imgClassifiedBounds.toByte(), 
    imageVisParam, 
    'Carta ' + gid + ' - Año ' + year, 
    false  // Inicialmente oculta
  );
  
  // ============================================================================
  // EXPORTACIÓN
  // ============================================================================
  
  // Exportar clasificación como asset
  Export.image.toAsset({
    image: imgClassifiedBounds,
    description: 'classification_proba_' + gid + '_' + year,
    assetId: 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/CLASSIFICATION_PROBAS_20_5/Argentina/CLASSIFICATION_PROBAS_' + gid + '_' + year,
    region: bounds,
    scale: 30,
    maxPixels: 1e13,
    pyramidingPolicy: {
      '.default': 'mean'
    }
  });
  
  print('Exportación programada para carta ' + gid + ', año ' + year);
}

// ============================================================================
// EJECUCIÓN PRINCIPAL
// ============================================================================

/**
 * Función principal que ejecuta la clasificación para todas las cartas y años
 */
function runClassification() {
  print('=== INICIANDO CLASIFICACIÓN DE ÁREAS URBANAS ===');
  print('Cartas a procesar:', listGids);
  print('Años a procesar:', listYears);
  print('Bandas espectrales utilizadas:', Bands.length);
  
  // Ejecutar clasificación para cada combinación de año y carta
  listYears.evaluate(function(years) {
    listGids.evaluate(function(gids) {
      var totalTasks = years.length * gids.length;
      print('Total de tareas de clasificación:', totalTasks);
      
      gids.forEach(function(gid) {
        years.forEach(function(year) {
          try {
            classificationByFeature(year, gid);
          } catch (error) {
            print('Error procesando carta ' + gid + ', año ' + year + ':', error);
          }
        });
      });
      
      print('Todas las tareas de clasificación han sido programadas');
    });
  });
}

// ============================================================================
// FUNCIONES DE UTILIDAD
// ============================================================================

/**
 * Función para verificar las muestras disponibles por año
 */
function checkSamplesAvailability() {
  print('=== VERIFICACIÓN DE MUESTRAS DISPONIBLES ===');
  
  var testYears = [1985, 1995, 2005, 2015, 2020];
  
  testYears.forEach(function(year) {
    var samples = getSamplesByYear(year);
    var urbanCount = samples.filter(ee.Filter.eq('class', 1)).size();
    var nonUrbanCount = samples.filter(ee.Filter.eq('class', 0)).size();
    
    print('Año ' + year + ':');
    print('  - Muestras urbanas:', urbanCount);
    print('  - Muestras no urbanas:', nonUrbanCount);
    print('  - Total:', samples.size());
  });
}

/**
 * Función para agregar capas de visualización de las cartas
 */
function visualizeProcessingAreas() {
  // Visualizar cartas a procesar
  var cartasToProcess = cartas.filter(ee.Filter.inList('gid', listGids));
  Map.addLayer(cartasToProcess, {color: 'red'}, 'Cartas a procesar', true);
  
  // Visualizar áreas de búsqueda
  Map.addLayer(envolventes2020, {color: 'blue'}, 'Áreas de búsqueda', false);
  
  // Centrar mapa en Argentina
  Map.setCenter(-64, -35, 4);
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

// Visualizar áreas de procesamiento
visualizeProcessingAreas();

// Verificar disponibilidad de muestras (opcional)
// checkSamplesAvailability();

// Ejecutar clasificación principal
runClassification();

/*
================================================================================
NOTAS IMPORTANTES:

1. CONFIGURACIÓN DE CARTAS:
   - Modificar 'listGids' para procesar cartas específicas
   - Cada carta se procesa independientemente

2. SELECCIÓN DE MUESTRAS:
   - Las muestras se seleccionan automáticamente según el año
   - 1985-1999: Usa muestras de 1985
   - 2000-2009: Usa muestras de 2005  
   - 2010-2023: Usa muestras de 2020

3. PARÁMETROS DE RANDOM FOREST:
   - 100 árboles por defecto
   - Todas las bandas espectrales disponibles
   - Escala de 30m

4. EXPORTACIÓN:
   - Resultados se guardan como assets de Earth Engine
   - Formato: CLASSIFICATION_PROBAS_{gid}_{year}

5. MONITOREO:
   - Verificar progreso en la pestaña 'Tasks'
   - Revisar logs para errores o advertencias

================================================================================
*/