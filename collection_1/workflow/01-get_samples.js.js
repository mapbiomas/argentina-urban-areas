/*
================================================================================
MAPBIOMAS ARGENTINA - CLASIFICACIÓN DE ÁREA URBANA
01 - MAPA DE CLASES ESTABLES PARA MUESTRAS
================================================================================

Descripción:
Este script genera un mapa de clases estables para la identificación de áreas urbanas
utilizando la clasificación de MapBiomas Argentina/MapBiomas Regionales. Identifica píxeles que han mantenido
la misma clase durante un número mínimo de años especificado.

Autor: Modificaciones Sofía Sarrailhé 2024

Metodología:
1. Carga la imagen de clasificación MapBiomas con años como bandas
2. Recorta usando polígonos de localidades con buffer poblacional
3. Reclasifica las clases originales en 4 categorías simplificadas
4. Identifica píxeles estables durante el período especificado

Leyenda de salida:
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

// Frecuencia mínima de años con la misma clase para considerar un píxel como estable
// Ejemplo: 20 significa que durante 20 años ese píxel tuvo la misma clasificación
var frecuencia = 20;

// Período de análisis
var periodo = 1; // 1: Período completo 85-23, 2: Período Patagonia 98-22

// Metadatos de versión
var version = '1';
var colecion = '1';

// Directorio de salida
var dirout = 'projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/SAMPLES';

// ============================================================================
// DATOS DE ENTRADA
// ============================================================================

// Geometrías regionales
var Argentina = ee.Geometry.Polygon(
    [[[-73.45803992313502, -48.53127057394893],
      [-73.96657973696439, -51.795354355378485],
      [-69.90989173206215, -52.83151008781052],
      [-68.51905690631993, -55.668168239230326],
      [-62.1414801724772, -55.18803749073882],
      [-56.23548228805975, -53.52908176436722],
      [-57.61879568819856, -50.07370802983673],
      [-67.74837559456856, -51.28383518486615],
      [-66.39331690535734, -49.05182341316554],
      [-64.83576898183517, -47.45605810982976],
      [-66.37274975435982, -46.35275899881],
      [-65.32949805911343, -45.15620149275094],
      [-63.00340333402945, -42.91025030673213],
      [-63.3702656060112, -41.68160637867835],
      [-62.07552205145933, -40.89632569009688],
      [-61.513251793921114, -39.571054465954575],
      [-60.235704382306764, -39.45687260031048],
      [-57.14564034228211, -38.36445532205518],
      [-55.42697801209473, -36.241963191328765],
      [-57.52283114578891, -33.931740952460586],
      [-56.87311732317646, -30.613921578401886],
      [-54.06350343730242, -28.073638212669625],
      [-53.05133355612926, -26.42592835830416],
      [-54.27288548849432, -24.90106753937452],
      [-57.433445719759234, -26.599548028762666],
      [-56.88470730214165, -24.734930169744732],
      [-59.76210268907934, -23.213341451810983],
      [-61.98107384177231, -21.31880049398102],
      [-66.14457983126528, -21.001715477398793],
      [-69.70996644578747, -25.220126506903824],
      [-71.3819173314058, -32.09289498145591],
      [-72.2046588057844, -39.25852594571852],
      [-72.5889165217956, -43.24100300954071],
      [-72.56635841296955, -46.89673060950845]]]
);

// Colecciones de features regionales
var table = ee.FeatureCollection("projects/mapbiomas-argentina/assets/LAND-COVER/COLLECTION-2/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/Diferencia_bufferyenvol");
var ba = ee.FeatureCollection("projects/mapbiomas-argentina/assets/ANCILLARY_DATA/VECTOR/BA/regional-assets_bosque-atlantico-argcol2");
var chaco = ee.FeatureCollection("projects/mapbiomas-argentina/assets/ANCILLARY_DATA/VECTOR/CHACO/regional-assets_chaco_buffer-argcol2");
var cuyo = ee.FeatureCollection("projects/mapbiomas-argentina/assets/ANCILLARY_DATA/VECTOR/CUYO/regional-assets_cuyo-argcol2_buffer2km");
var pampa = ee.FeatureCollection("projects/mapbiomas-argentina/assets/ANCILLARY_DATA/VECTOR/PAMPA/regional-assets_pampa-argcol2_buffer2km");
var patagonia = ee.FeatureCollection("projects/mapbiomas-argentina/assets/ANCILLARY_DATA/VECTOR/PAT/regional-assets_patagonia-argcol2_buffer2km");

// Colección de regiones y paleta de colores
var regioesCollection = ee.FeatureCollection("projects/mapbiomas-argentina/assets/ANCILLARY_DATA/VECTOR/ARG/regiones_arg_col1_simplificada");
var palettes = require('users/mapbiomas/modules:Palettes.js');

print('Regiones cargadas:', regioesCollection);

// ============================================================================
// COLECCIONES MAPBIOMAS POR REGIÓN
// ============================================================================

/* Colecciones disponibles por región:
var coleccion_Argentina = ee.Image('projects/mapbiomas-public/assets/argentina/collection1/mapbiomas_argentina_collection1_integration_v1');
var coleccion_Pampa = ee.Image('projects/mapbiomas-public/assets/pampa/collection4/mapbiomas_pampa_collection4_integration_v1');
var coleccion_Chaco = ee.Image('projects/mapbiomas-public/assets/chaco/lulc/collection5/mapbiomas_chaco_collection5_integration_v2');
var coleccion_Cuyo = ee.Image('projects/mapbiomas-argentina/assets/COLLECTION1/CLASSIFICATION/FINAL_CLASSIFICATION/CUYO/CUYO-FINAL-3-1Sp-Tf3y4y5y-1y2y3Ext-dom-2Sp');
var coleccion_Patagonia = ee.Image('projects/mapbiomas-argentina/assets/COLLECTION1/CLASSIFICATION/FINAL_CLASSIFICATION/PAT-INTEGRACION-3');
*/

// Colección actualmente en uso: Mata Atlántica
var coleccion_MataAtl = ee.Image('projects/mapbiomas_af_trinacional/COLLECTION4/MATAATLANTICA-1');

// ============================================================================
// PREPARACIÓN DE MÁSCARAS Y ÁREA DE ESTUDIO
// ============================================================================

// Crear máscara del área envolvente con buffer
var envolventeBuffer = table;
var i_msk_envolventeBuffer = envolventeBuffer.reduceToImage(["OBJECTID"], ee.Reducer.first());
print('Máscara buffer creada:', i_msk_envolventeBuffer);
Map.addLayer(i_msk_envolventeBuffer, {}, 'Diferencia buffer y envolvente');

// Aplicar máscara a la colección seleccionada
// IMPORTANTE: Cambiar la colección según la región de análisis
var colecao = coleccion_MataAtl.updateMask(i_msk_envolventeBuffer);
print('Colección con máscara aplicada:', colecao);

// ============================================================================
// CONFIGURACIÓN TEMPORAL
// ============================================================================

// Configurar años y bandas según el período seleccionado
var freq_lim, anos, bandas_anos, sufix;

if (periodo == 1) {
    // Período completo 1985-2023
    freq_lim = 37;
    anos = ['1985','1986','1987','1988','1989','1990','1991','1992','1993','1994', 
            '1995','1996','1997','1998','1999','2000','2001','2002','2003','2004', 
            '2005','2006','2007','2008','2009','2010','2011','2012','2013','2014', 
            '2015','2016','2017','2018','2019','2020','2021','2022', '2023'];
    
    bandas_anos = ['classification_1985','classification_1986','classification_1987','classification_1988',
                   'classification_1989','classification_1990','classification_1991','classification_1992',
                   'classification_1993','classification_1994','classification_1995','classification_1996',
                   'classification_1997','classification_1998','classification_1999','classification_2000',
                   'classification_2001','classification_2002','classification_2003','classification_2004',
                   'classification_2005','classification_2006','classification_2007','classification_2008',
                   'classification_2009','classification_2010','classification_2011','classification_2012',
                   'classification_2013','classification_2014','classification_2015','classification_2016',
                   'classification_2017','classification_2018','classification_2019','classification_2020',
                   'classification_2021', 'classification_2022', 'classification_2023'];
    sufix = '_85_23';
}

if (periodo == 2) {
    // Período Patagonia 1998-2022
    freq_lim = frecuencia;
    anos = ['1998','1999','2000','2001','2002','2003','2004', 
            '2005','2006','2007','2008','2009','2010','2011','2012','2013','2014', 
            '2015','2016','2017','2018','2019','2020','2021','2022'];
    
    bandas_anos = ['classification_1998','classification_1999','classification_2000',
                   'classification_2001','classification_2002','classification_2003','classification_2004',
                   'classification_2005','classification_2006','classification_2007','classification_2008',
                   'classification_2009','classification_2010','classification_2011','classification_2012',
                   'classification_2013','classification_2014','classification_2015','classification_2016',
                   'classification_2017','classification_2018','classification_2019','classification_2020',
                   'classification_2021', 'classification_2022'];
    sufix = '_98_22';
}

// ============================================================================
// VISUALIZACIÓN DE LA COLECCIÓN ORIGINAL
// ============================================================================

var vis = {
    'bands': 'classification_2022',
    'min': 0,
    'max': 62,
    'palette': palettes.get('classification7')
};
Map.addLayer(colecao, vis, 'Clases MapBiomas originales');

// ============================================================================
// RECLASIFICACIÓN Y PROCESAMIENTO POR AÑOS
// ============================================================================

var colList = ee.List([]);

// Procesar cada año individualmente
for (var i_ano = 0; i_ano < anos.length; i_ano++) {
    var ano = anos[i_ano];
    
    // RECLASIFICACIÓN POR REGIÓN
    // Esquemas de reclasificación disponibles:
    
    /* PAMPA:
    var colflor = colecao.select('classification_' + ano).remap(
              [3, 4, 11, 12, 19, 15, 9, 36, 22, 33],
              [1, 1, 2, 2, 2, 2, 1, 2, 3, 4]);
    */
    
    /* CHACO:
    var colflor = colecao.select('classification_' + ano).remap(
              [3, 4, 45, 6, 42, 43, 44, 11, 15, 19, 57, 58, 36, 9, 22, 26, 27],
              [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 3, 4, 0]);
    */
    
    /* CUYO:
    var colflor = colecao.select('classification_' + ano).remap(
              [3, 4, 45, 12, 11, 9, 21, 25, 33, 34, 27],
              [1, 1, 1, 2, 2, 1, 2, 3, 4, 4, 0]);
    */
    
    /* PATAGONIA:
    var colflor = colecao.select('classification_' + ano).remap(
              [3, 67, 12, 11, 63, 21, 9, 22, 33, 34, 27],
              [1, 1, 2, 2, 2, 2, 2, 1, 3, 4, 4, 0]);
    */
    
    // BOSQUE ATLÁNTICO (configuración actual):
    var colflor = colecao.select('classification_' + ano).remap(
              [3, 4, 5, 49, 11, 12, 32, 29, 50, 13, 15, 19, 36, 65, 46, 48, 9, 21, 22, 33, 31, 27],
              [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 3, 4, 4, 0]);
    
    colList = colList.add(colflor.int8());
}

// Crear colección de imágenes reclasificadas
var collection = ee.ImageCollection(colList);

// ============================================================================
// FUNCIONES DE ANÁLISIS DE FRECUENCIA
// ============================================================================

// Función para obtener valores únicos de un array
var unique = function(arr) {
    var u = {}, a = [];
    for (var i = 0, l = arr.length; i < l; ++i) {
        if (!u.hasOwnProperty(arr[i])) {
            a.push(arr[i]);
            u[arr[i]] = 1;
        }
    }
    return a;
};

// Función para crear máscara de frecuencia por clase
var getFrenquencyMask = function(collection, classId) {
    var classIdInt = parseInt(classId, 10);
    
    // Crear máscara para cada imagen donde píxel = classId
    var maskCollection = collection.map(function(image) {
        return image.eq(classIdInt);
    });
    
    // Sumar frecuencias
    var frequency = maskCollection.reduce(ee.Reducer.sum());
    
    // Crear máscara final donde frecuencia >= umbral
    var frequencyMask = frequency.gte(classFrequency[classId])
        .multiply(classIdInt)
        .toByte();
    
    frequencyMask = frequencyMask.mask(frequencyMask.eq(classIdInt));
    
    return frequencyMask.rename('frequency').set('class_id', classId);
};

// ============================================================================
// GENERACIÓN DEL MAPA DE REFERENCIA
// ============================================================================

// Definir frecuencias mínimas por clase
var classFrequency = {
    "1": freq_lim,  // Leñoso
    "2": freq_lim,  // Herbáceo  
    "3": freq_lim,  // No vegetado (urbano)
    "4": freq_lim   // Agua
};

// Generar máscaras de frecuencia para cada clase
var frequencyMasks = Object.keys(classFrequency).map(function(classId) {
    return getFrenquencyMask(collection, classId);
});

// Combinar máscaras en una sola imagen
frequencyMasks = ee.ImageCollection.fromImages(frequencyMasks);
var referenceMap = frequencyMasks.reduce(ee.Reducer.firstNonNull()).clip(Argentina);

// Renombrar banda final
referenceMap = referenceMap.rename("reference");

// ============================================================================
// VISUALIZACIÓN Y EXPORTACIÓN
// ============================================================================

// Configuración de visualización
var vis2 = {
    'bands': ['reference'],
    'min': 1,
    'max': 4,
    'palette': ['#1ead21',    // Verde - Leñoso
                '#d6d551',    // Beige - Herbáceo  
                '#d63000',    // Rojo - No vegetado/Urbano
                '#42bcd6']    // Azul - Agua
};

Map.addLayer(referenceMap, vis2, 'Mapa de clases estables Urbano ' + sufix, true);

// Exportar como asset
Export.image.toAsset({
    "image": referenceMap.toInt8(),
    "description": 'Urbano_mapas_estables_ba_C' + colecion + sufix +'_v' + version,
    "assetId": dirout + '/Urbano_mapas_estables_ba_C' + colecion + sufix +'_v' + version,
    "scale": 30,
    "pyramidingPolicy": {
        '.default': 'mode'
    },
    "maxPixels": 1e13,
    "region": ba
});

// Agregar contorno de regiones
var blank = ee.Image(0).mask(0);
var outline = blank.paint(regioesCollection, 'AA0000', 2); 
var visPar = {'palette':'000000','opacity': 0.6};
Map.addLayer(outline, visPar, 'Regiones Urbano', true);

// ============================================================================
// INFORMACIÓN DE SALIDA
// ============================================================================

print('Procesamiento completado');
print('Período analizado:', sufix);
print('Frecuencia mínima requerida:', freq_lim, 'años');
print('Total de años procesados:', anos.length);
print('Región de exportación: Bosque Atlántico');