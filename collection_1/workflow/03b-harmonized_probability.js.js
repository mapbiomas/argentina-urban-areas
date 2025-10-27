/*
================================================================================
MAPBIOMAS ARGENTINA - CLASIFICACIÓN DE ÁREA URBANA
04 - ARMONIZACIÓN TEMPORAL DE PROBABILIDADES
================================================================================

Descripción:
Este script aplica armonización temporal a las clasificaciones de probabilidad
generadas en el paso anterior. Utiliza una ventana temporal de suavizado para
reducir el ruido temporal y generar una serie temporal más consistente de
probabilidades urbanas.

Metodología:
1. Carga las probabilidades de clasificación por año y carta
2. Aplica suavizado temporal con ventana móvil
3. Genera imagen multibanda armonizada
4. Exporta resultado para uso en filtros posteriores

Autor: Luna Schteingart, Gonzalo Dieguez

================================================================================
*/

// ============================================================================
// CONFIGURACIÓN PRINCIPAL
// ============================================================================

// IDs de cartas a procesar (modificar según necesidad)
var listGids = [248];  // Ejemplo: carta 248

// Rango temporal de procesamiento
var startYear = 1985;
var endYear = 2024;
var yearsList = ee.List.sequence(startYear, endYear).getInfo();

// Parámetros de armonización
var temporalWindow = 2;  // Ventana temporal: ±2 años para suavizado

// ============================================================================
// RUTAS DE ASSETS
// ============================================================================

// Directorio base de probabilidades de entrada (del paso 03)
var assetBase = 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/CLASSIFICATION_PROBAS_20_5/Argentina/';

// Directorio de salida para probabilidades armonizadas
var assetOutput = 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/CLASSIFICATION_HARMONIZED/';

// ============================================================================
// DATOS AUXILIARES
// ============================================================================

// Capa de cartas para visualización y delimitación de áreas
var cartas = ee.FeatureCollection(
  'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/carta250000_ajustadas_v2'
);

// ============================================================================
// FUNCIONES DE PROCESAMIENTO
// ============================================================================

/**
 * Carga todas las imágenes de probabilidad para un GID específico
 * @param {number} gid - ID de la carta
 * @returns {ee.ImageCollection} - Colección de imágenes de probabilidad por año
 */
function loadProbabilityImages(gid) {
  var images = yearsList.map(function(year) {
    var path = assetBase + 'CLASSIFICATION_PROBAS_' + gid + '_' + year;
    
    // Manejar posibles errores de carga
    var image = ee.Image(path).set('year', year).set('gid', gid);
    
    // Verificar que la imagen existe y tiene datos válidos
    return image.selfMask();
  });
  
  return ee.ImageCollection.fromImages(images);
}

/**
 * Aplica armonización temporal mediante suavizado con ventana móvil
 * @param {ee.ImageCollection} probCol - Colección de probabilidades originales
 * @returns {ee.ImageCollection} - Colección de probabilidades armonizadas
 */
function temporalHarmonization(probCol) {
  print('Aplicando armonización temporal con ventana de ±' + temporalWindow + ' años');
  
  // Configurar join temporal para encontrar imágenes vecinas
  var join = ee.Join.saveAll({matchesKey: 'images'});
  
  // Filtro para ventana temporal
  var filter = ee.Filter.maxDifference({
    difference: temporalWindow,
    leftField: 'year',
    rightField: 'year'
  });
  
  // Aplicar join para obtener imágenes dentro de la ventana temporal
  var joinedCol = join.apply(probCol, probCol, filter);
  
  // Calcular media temporal para cada año
  var harmonized = ee.ImageCollection(joinedCol.map(function(image) {
    var year = image.get('year');
    var imagesList = ee.ImageCollection.fromImages(ee.List(image.get('images')));
    
    // Calcular promedio de probabilidades en la ventana temporal
    var meanProb = imagesList.reduce(ee.Reducer.mean());
    
    // Mantener metadatos originales
    return meanProb.set({
      'year': year,
      'processing': 'temporally_harmonized',
      'temporal_window': temporalWindow,
      'images_used': imagesList.size()
    });
  }));
  
  return harmonized;
}

/**
 * Convierte colección de imágenes armonizadas a imagen multibanda
 * @param {ee.ImageCollection} harmonizedCol - Colección armonizada
 * @returns {ee.Image} - Imagen multibanda con una banda por año
 */
function collectionToMultiband(harmonizedCol) {
  // Crear imagen multibanda ordenada por año
  var imgMultibanda = ee.ImageCollection(yearsList.map(function(year) {
    var img = harmonizedCol.filter(ee.Filter.eq('year', year)).first();
    return img.rename('classification_' + year);
  })).toBands();
  
  // Generar nombres de bandas
  var bandNames = yearsList.map(function(year) {
    return 'classification_' + year;
  });
  
  // Renombrar bandas eliminando prefijos automáticos
  imgMultibanda = imgMultibanda.rename(bandNames);
  
  return imgMultibanda;
}

/**
 * Aplica controles de calidad a las probabilidades armonizadas
 * @param {ee.ImageCollection} harmonizedCol - Colección armonizada
 * @param {number} gid - ID de la carta
 */
function qualityControl(harmonizedCol, gid) {
  print('=== CONTROL DE CALIDAD - GID ' + gid + ' ===');
  
  // Verificar número de imágenes procesadas
  var imageCount = harmonizedCol.size();
  print('Imágenes procesadas:', imageCount);
  print('Años esperados:', yearsList.length);
  
  // Verificar rango de valores de probabilidad
  var firstImage = harmonizedCol.first();
  var stats = firstImage.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: cartas.filter(ee.Filter.eq('gid', gid)).geometry(),
    scale: 1000,
    maxPixels: 1e6
  });
  
  print('Rango de probabilidades (primera imagen):', stats);
  
  // Verificar presencia de datos válidos
  var validPixels = firstImage.selfMask().reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: cartas.filter(ee.Filter.eq('gid', gid)).geometry(),
    scale: 1000,
    maxPixels: 1e6
  });
  
  print('Píxeles válidos (primera imagen):', validPixels);
}

// ============================================================================
// CONFIGURACIÓN DE VISUALIZACIÓN
// ============================================================================

var visualizationParams = {
  min: 0,
  max: 100,
  palette: ['black', 'blue', 'cyan', 'yellow', 'orange', 'red'],
  opacity: 0.8
};

// ============================================================================
// PROCESAMIENTO PRINCIPAL
// ============================================================================

/**
 * Procesa armonización temporal para un GID específico
 * @param {number} gid - ID de la carta a procesar
 */
function processGid(gid) {
  print('=== PROCESANDO GID ' + gid + ' ===');
  
  try {
    // Definir geometría de la carta
    var geometry = cartas.filter(ee.Filter.eq('gid', gid)).geometry();
    
    // Cargar probabilidades originales
    print('Cargando probabilidades originales...');
    var probCol = loadProbabilityImages(gid);
    
    // Verificar que se cargaron correctamente
    var originalCount = probCol.size();
    print('Probabilidades originales cargadas:', originalCount);
    
    // Aplicar armonización temporal
    print('Aplicando armonización temporal...');
    var harmonizedCol = temporalHarmonization(probCol);
    
    // Control de calidad
    qualityControl(harmonizedCol, gid);
    
    // Convertir a imagen multibanda
    print('Generando imagen multibanda...');
    var imgMultibanda = collectionToMultiband(harmonizedCol);
    
    // Agregar metadatos finales
    imgMultibanda = imgMultibanda.set({
      'territory': 'ARGENTINA',
      'theme': 'Urban Area',
      'processing': 'temporal_harmonization',
      'gid': gid,
      'start_year': startYear,
      'end_year': endYear,
      'temporal_window': temporalWindow,
      'total_bands': yearsList.length,
      'processing_date': ee.Date(Date.now()).format('YYYY-MM-dd'),
      'version': '1.0'
    });
    
    // ============================================================================
    // VISUALIZACIÓN
    // ============================================================================
    
    // Visualizar ejemplo (año 1998)
    var yearExample = 1998;
    if (yearsList.indexOf(yearExample) !== -1) {
      var imgExample = harmonizedCol.filter(ee.Filter.eq('year', yearExample)).first();
      Map.addLayer(
        imgExample.clip(geometry), 
        visualizationParams,
        'Probabilidad armonizada ' + yearExample + ' - GID ' + gid,
        true
      );
    }
    
    // Centrar mapa en la carta
    Map.centerObject(geometry, 10);
    
    // Agregar contorno de la carta
    Map.addLayer(
      ee.Image().toByte().paint(cartas.filter(ee.Filter.eq('gid', gid)), 1, 2),
      {palette: 'red'},
      'Límite GID ' + gid,
      true
    );
    
    // ============================================================================
    // EXPORTACIÓN
    // ============================================================================
    
    print('Programando exportación...');
    Export.image.toAsset({
      image: imgMultibanda.toByte(),
      description: 'HARMONIZED_PROBA_GID_' + gid,
      assetId: assetOutput + 'HARMONIZED_PROBA_GID_' + gid,
      region: geometry,
      scale: 30,
      maxPixels: 1e13,
      pyramidingPolicy: {
        '.default': 'mean'
      }
    });
    
    print('Exportación programada exitosamente para GID ' + gid);
    
  } catch (error) {
    print('Error procesando GID ' + gid + ':', error);
  }
}

// ============================================================================
// EJECUCIÓN PRINCIPAL
// ============================================================================

function runHarmonization() {
  print('=== INICIANDO ARMONIZACIÓN TEMPORAL ===');
  print('GIDs a procesar:', listGids);
  print('Período de análisis:', startYear + '-' + endYear);
  print('Ventana temporal:', '±' + temporalWindow + ' años');
  print('Total de años:', yearsList.length);
  
  // Procesar cada GID
  listGids.forEach(function(gid) {
    processGid(gid);
  });
  
  print('=== PROCESAMIENTO COMPLETADO ===');
  print('Verifique la pestaña Tasks para monitorear las exportaciones');
}

// ============================================================================
// FUNCIONES DE UTILIDAD
// ============================================================================

/**
 * Función para verificar disponibilidad de assets de entrada
 */
function checkInputAssets() {
  print('=== VERIFICANDO ASSETS DE ENTRADA ===');
  
  var sampleGid = listGids[0];
  var sampleYear = yearsList[Math.floor(yearsList.length / 2)];
  var testPath = assetBase + 'CLASSIFICATION_PROBAS_' + sampleGid + '_' + sampleYear;
  
  try {
    var testImage = ee.Image(testPath);
    var info = testImage.getInfo();
    print('Asset de prueba existe:', testPath);
    print('Bandas disponibles:', Object.keys(info.bands));
  } catch (error) {
    print('Error accediendo asset de prueba:', testPath);
    print('Verifique que las clasificaciones del paso 03 estén disponibles');
  }
}

/**
 * Función para mostrar estadísticas de procesamiento
 */
function showProcessingStats() {
  print('=== ESTADÍSTICAS DE PROCESAMIENTO ===');
  print('Número de GIDs:', listGids.length);
  print('Años por GID:', yearsList.length);
  print('Total de clasificaciones a procesar:', listGids.length * yearsList.length);
  print('Ventana de suavizado:', '±' + temporalWindow + ' años');
  print('Directorio de entrada:', assetBase);
  print('Directorio de salida:', assetOutput);
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

// Mostrar estadísticas
showProcessingStats();

// Verificar assets de entrada (opcional)
// checkInputAssets();

// Ejecutar armonización
runHarmonization();

/*
================================================================================
NOTAS IMPORTANTES:

1. DEPENDENCIAS:
   - Requiere que el paso 03 (clasificación) haya sido completado
   - Los assets de probabilidad deben existir en la ruta especificada

2. PARÁMETROS DE ARMONIZACIÓN:
   - temporalWindow: Define el rango de años para el suavizado
   - Valores típicos: 1-3 años dependiendo de la variabilidad temporal

3. FORMATO DE SALIDA:
   - Imagen multibanda con una banda por año
   - Nombrado: 'classification_YYYY'
   - Valores: 0-100 (probabilidades en porcentaje)

4. CONTROL DE CALIDAD:
   - Verificar logs para estadísticas de procesamiento
   - Revisar visualización para validar resultados
   - Confirmar que todas las exportaciones completaron exitosamente

5. SIGUIENTES PASOS:
   - Los resultados se usan en los filtros espaciales y temporales
   - Verificar que los assets se generaron correctamente antes de continuar

================================================================================
*/