/*
================================================================================
MAPBIOMAS ARGENTINA - CLASIFICACIÓN DE ÁREA URBANA
02 - EXPORTACIÓN DE PUNTOS ESTABLES PARA MUESTRAS
================================================================================

Descripción:
Este script utiliza el mapa de clases estables generado en el paso anterior y 
coloca puntos de muestra aleatorios para cada clase y región. Los puntos generados
se utilizarán posteriormente para el entrenamiento de los clasificadores.
Los años utilizados dependen del periodo exportado en el paso anterior. 

Autores: Sofia Sarrailhé, Juliano Schirmbeck

Metodología:
1. Carga el mapa de clases estables del paso anterior
2. Define número de muestras por clase y región
3. Genera puntos aleatorios estratificados por clase (para Clases no urbanas)
4. Exporta los puntos como asset para uso posterior

Leyenda de clases:
Clase | Significado | Color
  1   | Leñoso      | Verde (#1ead21)
  2   | Herbáceo    | Beige (#d6d551) 
  3   | No vegetado | Rojo  (#d63000)
  4   | Agua        | Azul  (#42bcd6)

================================================================================
*/

// ============================================================================
// PARÁMETROS DE CONFIGURACIÓN
// ============================================================================

// Configuración de muestreo
var version = 'v1';
var nSamples = 10000;  // Número de puntos por clase por región
var coleccion = 1;
var sufix = '_85_22';  // Sufijo temporal del período analizado

// Directorio de salida
var dirout = 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/SAMPLES';

// ============================================================================
// DATOS DE ENTRADA
// ============================================================================

// Colección de regiones con numeración
var regioesCollection = ee.FeatureCollection(
    "projects/mapbiomas-argentina/assets/ANCILLARY_DATA/VECTOR/ARG/regiones_arg_col1_simplificada_num"
);
print('Regiones cargadas:', regioesCollection);

// Mapa de clases estables del paso anterior
// IMPORTANTE: Cambiar el directorio según la región procesada
var dirsamples = ee.Image(
    'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/SAMPLES/Urbano_mapas_estables_cuyo_C1_85_22_v1'
);
print('Mapa de clases estables cargado:', dirsamples);

// Paleta de colores
var palettes = require('users/mapbiomas/modules:Palettes.js');

// ============================================================================
// CONFIGURACIÓN DE VISUALIZACIÓN
// ============================================================================

// Paleta de visualización para las clases estables
var vis = {
    'bands': ['reference'],
    'min': 1,
    'max': 4,
    'palette': ['#1ead21',    // Verde - Leñoso
                '#d6d551',    // Beige - Herbáceo  
                '#d63000',    // Rojo - No vegetado/Urbano
                '#42bcd6']    // Azul - Agua
};

// Agregar capas al mapa
Map.addLayer(dirsamples, vis, 'Clases estables' + sufix, true);
Map.addLayer(regioesCollection, {}, 'Zonas', false);

// ============================================================================
// PREPARACIÓN DE MÁSCARAS REGIONALES
// ============================================================================

// Convertir la colección de regiones a imagen para usar como máscara
var i_clippedGrid = regioesCollection.reduceToImage(["Zona"], ee.Reducer.first());

// ============================================================================
// FUNCIÓN DE GENERACIÓN DE MUESTRAS POR REGIÓN
// ============================================================================

/**
 * Genera muestras estratificadas para una región específica
 * @param {ee.Feature} feature - Feature de la región
 * @returns {ee.FeatureCollection} - Colección de puntos de muestra
 */
var getTrainingSamples = function(feature) {
    // Obtener metadatos de la región
    var zona = feature.get('Zona');
    var region = feature.get('Region');
    
    // Definir número de puntos por clase
    var num_train_01 = nSamples;  // Leñoso
    var num_train_02 = nSamples;  // Herbáceo
    var num_train_03 = nSamples;  // No vegetado (urbano)
    var num_train_04 = nSamples;  // Agua
    
    // Aplicar máscara regional al mapa de referencia
    var referenceMap = dirsamples.updateMask(i_clippedGrid.eq(ee.Number(zona)));
    
    // Generar muestras estratificadas
    var training = referenceMap.stratifiedSample({
        scale: 30,                    // Resolución espacial
        classBand: 'reference',       // Banda con las clases
        numPoints: 0,                 // 0 = usar classPoints
        seed: 1,                      // Semilla para reproducibilidad
        geometries: true,             // Incluir geometrías
        classValues: [1, 2, 3, 4],    // Valores de clase a muestrear
        classPoints: [num_train_01,   // Puntos por clase
                      num_train_02,
                      num_train_03,
                      num_train_04]
    });
    
    // Agregar metadatos de región y zona a cada punto
    training = training.map(function(feat) {
        return feat.set({
            'Region': region, 
            'Zona': zona
        });
    });
    
    return training;
};

// ============================================================================
// GENERACIÓN Y PROCESAMIENTO DE MUESTRAS
// ============================================================================

// Aplicar la función a todas las regiones y aplanar el resultado
var mySamples = regioesCollection.map(getTrainingSamples).flatten();

// ============================================================================
// VISUALIZACIÓN OPCIONAL DE PUNTOS
// ============================================================================

/* 
// Código para visualizar puntos con colores por clase (opcional)
var mySamples_styled = mySamples.sort('reference').map(function(f) {
    return f.set({
        style: ee.Dictionary({
            1: {'color': '#1ead21'},  // Verde - Leñoso
            2: {'color': '#d6d551'},  // Beige - Herbáceo
            3: {'color': '#d63000'},  // Rojo - No vegetado
            4: {'color': '#42bcd6'}   // Azul - Agua
        }).get(f.get('reference'))
    });
});

Map.addLayer(mySamples_styled.style({styleProperty: 'style'}), {}, 'Puntos estables', false);
*/

// ============================================================================
// ESTADÍSTICAS Y VERIFICACIÓN
// ============================================================================

// Ejemplo de verificación: contar puntos de clase 3 (urbano) en región Pampas
print('Puntos clase 3 (urbano) en Pampas:', 
      mySamples.filterMetadata('reference', 'equals', 3)
               .filterMetadata('Region', 'equals', 'Pampas')
               .size());

// Estadísticas generales de las muestras
print('Total de puntos generados:', mySamples.size());
print('Muestra de puntos (primeros 5):', mySamples.limit(5));

// Contar puntos por clase
var classes = [1, 2, 3, 4];
var classNames = ['Leñoso', 'Herbáceo', 'No vegetado', 'Agua'];

classes.forEach(function(classValue, index) {
    var count = mySamples.filterMetadata('reference', 'equals', classValue).size();
    print('Puntos clase ' + classValue + ' (' + classNames[index] + '):', count);
});

// ============================================================================
// EXPORTACIÓN
// ============================================================================

// Exportar como asset de Earth Engine
Export.table.toAsset(mySamples,
    'samples_C' + coleccion + sufix + '_' + version,
    dirout + '/samples_C' + coleccion + sufix + '_' + version
);

// ============================================================================
// EXPORTACIÓN ALTERNATIVA A GOOGLE DRIVE (OPCIONAL)
// ============================================================================

/*
// Configuración para exportar a Google Drive como Shapefile
var carpetaDrive = 'Shapes_puntos_c' + coleccion;

Export.table.toDrive({
    collection: mySamples,
    description: 'DRIVE_samples_C' + coleccion + '_' + sufix + '_' + version,
    folder: carpetaDrive,
    fileNamePrefix: 'samples_C' + coleccion + '_' + sufix + '_' + version,
    fileFormat: 'SHP'
});
*/

// ============================================================================
// INFORMACIÓN DE SALIDA
// ============================================================================

print('=== RESUMEN DE EXPORTACIÓN ===');
print('Archivo de salida: samples_C' + coleccion + sufix + '_' + version);
print('Directorio: ' + dirout);
print('Número de muestras por clase por región: ' + nSamples);
print('Período de análisis: ' + sufix);
print('Versión: ' + version);
print('Procesamiento completado exitosamente');

/*
================================================================================
NOTAS IMPORTANTES:

1. CONFIGURACIÓN POR REGIÓN:
   - Asegúrese de cambiar 'dirsamples' para que apunte al mapa de clases 
     estables correcto de la región que está procesando

2. NÚMERO DE MUESTRAS:
   - Ajustar 'nSamples' según las necesidades del proyecto
   - Valores típicos: 2000-10000 puntos por clase

3. VERIFICACIÓN DE RESULTADOS:
   - Revisar las estadísticas de puntos por clase antes de exportar
   - Verificar que todas las regiones tienen suficientes puntos

4. ARCHIVOS DE SALIDA:
   - Los puntos se exportan como asset para uso en los siguientes pasos
   - Opcional: exportar también como Shapefile a Google Drive

================================================================================
*/