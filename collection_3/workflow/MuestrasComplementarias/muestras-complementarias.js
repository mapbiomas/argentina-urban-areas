// ============================================================
// URBANO Col2 | MuestrasComplementarias — Interactive Complementary-Points QA
// ============================================================
//
// CLASIFICACIÓN URBANO POR ECORREGIÓN - VERSIÓN SIMPLIFICADA E INTERACTIVA
// MapBiomas Argentina - Collection 3
//
// NOTE: this script is functionally identical to
// workflow/01-probability_map_with_complementary.js. In the original
// repository, that script is the blank template, and this
// MuestrasComplementarias/ folder holds 15 saved copies of it (one per
// ecoregion) with that ecoregion's hand-drawn correction polygons and
// `listEcoregions` selection already filled in. See workflow/01 for the
// numbered-pipeline framing of this same tool.
//
// DESCRIPTION:
//   Interactive Code Editor tool (no asset export) used to visually
//   compare, per ecoregion, a classification trained on the base
//   urban/non-urban samples alone vs. the same samples plus manually
//   digitized "complementary" correction points. The analyst draws
//   correction polygons for one ecoregion, runs this script, and toggles
//   the "Base" / "Base + Complementos" layers on the map to judge whether
//   the complementary points improve the result before folding them into
//   the base sample set used by workflow/01-probability_map_with_complementary.js.
//
// METHODOLOGY:
//   1. Convert the hand-drawn urban/non-urban correction polygons into
//      points (one per pixel), each repeated `FACTOR_MULTIPLICADOR`
//      times so the Random Forest weighs them more heavily.
//   2. For the selected ecoregion(s): load that ecoregion's base
//      urban/non-urban samples, size the training set either by
//      class-balancing (`'Balanceado'`) or a fixed proportional target
//      (`'Original'`, from the `targetUrbano`/`targetNoUrbano` tables).
//   3. Build the year's predictor mosaic and classify it twice — once
//      with the base samples only, once with the complementary points
//      merged in.
//   4. Add both classifications (and the underlying mosaic/sample pools)
//      as map layers for visual comparison.
//
// INPUT:
//   - Hand-drawn correction polygons for the ecoregion being reviewed
//     (SECTION 2 imports).
//   - Ecoregions FeatureCollection and their search-area envelopes.
//   - Base urban/non-urban sample sets (shared across ecoregions,
//     filtered by the `ecorregion` property).
//   - Annual predictor mosaic (`basic/mosaic_production.js`).
//
// OUTPUT:
//   None exported — this is a visual QA tool. Once complementary points
//   for an ecoregion are validated here, they are added to the base
//   sample assets consumed by the numbered workflow/ scripts.
//
// USAGE NOTE: uncomment ONE (or more) ecoregion name(s) in
// `listEcoregions` (SECTION 3) to process it/them, and replace the
// SECTION 2 polygons with that ecoregion's own hand-drawn corrections.
// This repository contains 15 near-identical per-ecoregion copies of this
// script (Altos Andes, Bosques Patagónicos, Chaco Húmedo, Chaco Seco,
// Delta e Islas, Espinal, Estepa Patagónica, Esteros del Iberá, Monte de
// Llanuras y Mesetas, Monte de Sierras y Bolsones, Pampa1/2/3, Puna,
// Selva Paranaense, Yungas) — this file documents one generic template;
// the `targetUrbano`/`targetNoUrbano` tables already cover every
// ecoregion, so only the polygons and `listEcoregions` selection change
// between runs.
//
// AUTHORS: Luna Schteingart — MapBiomas Argentina, Urbano team
// ============================================================


// ============================================================
// SECTION 1 — CONFIGURATION PARAMETERS
// ============================================================
var PERIODO_ELEGIDO = 2020;
var ANIO_A_VISUALIZAR = 2024; // ⚠️ Solo procesaremos un año para visualizar rápido
var TIPO_MUESTRA = 'Balanceado'; // ⚠️ Opciones: 'Balanceado' o 'Original'

// CORRECCIÓN PARA MODO PROBABILIDAD (0 y 1)
var VALOR_CLASE_URBANO = 1;    // 100% Urbano
var VALOR_CLASE_NO_URBANO = 0; // 0% Urbano

// FACTOR PARA DARLE PESO AL RANDOM FOREST (Multiplicador)
var FACTOR_MULTIPLICADOR = 10;


// ============================================================
// SECTION 2 — POLÍGONOS COMPLEMENTARIOS (DIBUJADOS A MANO)
// ============================================================
// 🔁 REPLACE: Digitize your own urban / non-urban correction polygons for
// the ecoregion you're reviewing (GEE Code Editor geometry imports).
var ComplUrbano = ee.FeatureCollection([]);
var ComplNoUrbano = ee.FeatureCollection([]);

function poligonosAPuntos(poligonos, valorClase) {
  var imgBase = ee.Image.constant(valorClase).rename('value').toInt();

  // Extraemos 1 punto por píxel
  var puntosUnicos = imgBase.sampleRegions({
    collection: poligonos,
    scale: 30, // Centroides de los píxeles
    geometries: true,
    tileScale: 2
  }).map(function(f) {
    return ee.Feature(f.geometry(), {'value': f.get('value')});
  });

  // Multiplicamos la colección para forzar al modelo a prestarles atención
  var listaRepetida = ee.List.repeat(puntosUnicos, FACTOR_MULTIPLICADOR);
  return ee.FeatureCollection(listaRepetida).flatten();
}

var puntosComplementarios = poligonosAPuntos(ComplUrbano, VALOR_CLASE_URBANO)
  .merge(poligonosAPuntos(ComplNoUrbano, VALOR_CLASE_NO_URBANO));


// ============================================================
// SECTION 3 — ECORREGIONES Y PARÁMETROS
// ============================================================
var listEcoregions = [
  'Altos Andes',
  //'Bosques Patagónicos',
  //'Campos y Malezales',
  //'Chaco Húmedo',
  //'Chaco Seco',
  //'Delta e Islas del Paraná',
  //'Espinal',
  //'Estepa Patagónica',
  //'Esteros del Iberá',
  //'Islas del Atlántico Sur',
  //'Monte de Llanuras y Mesetas',
  //'Monte de Sierras y Bolsones',
  //'Pampa',
  //'Pampa1',
  //'Pampa2',
  //'Pampa3',
  //'Puna',
  //'Selva Paranense',
  //'Yungas'
];

// 🔁 REPLACE: Ecoregions vector (16 Argentina ecoregions).
var PATH_ECORREGIONES = 'projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/ARG/ARG-Political_Level_2-16Ecorregiones_3857';
var PROP_NOMBRE_ECO   = 'LEVEL_2';
// 🔁 REPLACE: Update to your own GEE asset folder for the sample inputs.
var BASE_PATH_SAMPLES = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES/';

// ==============================
// TABLAS OBJETIVO ACTUALIZADAS (Distribución Proporcional)
// ==============================
var targetUrbano = ee.Dictionary({
  'Altos Andes':                    12,
  'Bosques Patagónicos':             56,
  'Campos y Malezales':              79,
  'Chaco Húmedo':                   199,
  'Chaco Seco':                     854,
  'Delta e Islas del Paraná':       250,
  'Espinal':                        724,
  'Estepa Patagónica':              159,
  'Esteros del Iberá':               47,
  'Monte de Llanuras y Mesetas':    611,
  'Monte de Sierras y Bolsones':    112,
  'Pampa':                         2286, // (Suma de P1 + P2 + P3 si fuera necesario)
  'Pampa1':                         409,  // (38.82% de 1053)
  'Pampa2':                        1636, // Se mantiene igual
  'Pampa3':                         644,  // (61.18% de 1053)
  'Puna':                            14,
  'Selva Paranense':                145,
  'Yungas':                         207,
  'Islas del Atlántico Sur':          2
});

var targetNoUrbano = ee.Dictionary({
  'Altos Andes':                    36,
  'Bosques Patagónicos':           226,
  'Campos y Malezales':            159,
  'Chaco Húmedo':                  369,
  'Chaco Seco':                   2130,
  'Delta e Islas del Paraná':      539,
  'Espinal':                      1220,
  'Estepa Patagónica':             333,
  'Esteros del Iberá':              92,
  'Monte de Llanuras y Mesetas':  1004,
  'Monte de Sierras y Bolsones':   394,
  'Pampa':                        3528,
  'Pampa1':                         809,  // (37.88% de 2137)
  'Pampa2':                        1555, // Se mantiene igual
  'Pampa3':                        1328, // (62.12% de 2137)
  'Puna':                            47,
  'Selva Paranense':                359,
  'Yungas':                         443,
  'Islas del Atlántico Sur':          6
});


var imageVisParam = { min: 0, max: 100, palette: ["68ff0a", "fbff08", "ff3406"], opacity: 0.95 };

var Bands = [
  'BLUE', 'GREEN', 'RED', 'NIR', 'SWIR1', 'SWIR2', 'NDVI', 'EVI', 'EVI2', 'SAVI',
  'MNDWI', 'NDWIm', 'AWEIsh', 'NDBI', 'NBR', 'NDRI', 'BAI', 'UI', 'NDUI', 'BSI', 'BU',
  'GV', 'NPV', 'SOIL', 'CLOUD', 'GVS', 'SHADE', 'NDFI', 'SUBS', 'VEG', 'DARK',
  'EVI_p10', 'EVI_p90', 'EVI2_p10', 'EVI2_p90', 'EVI_dif9010', 'EVI2_dif9010',
  'EBBI', 'EBBI_p25', 'EBBI_p75', 'EBBI_dif7525', 'EBBI_p90'
];


// ============================================================
// SECTION 4 — DEPENDENCIAS Y MUESTRAS GLOBALES
// ============================================================
// 🔁 REPLACE: Update to the GEE script URLs where you saved these files.
var batchClass  = require('users/YOUR-GEE-USERNAME/YOUR-REPO:basic/class_lib.js');
var batchMosaic = require('users/YOUR-GEE-USERNAME/YOUR-REPO:basic/mosaic_production.js');

var ecorregiones = ee.FeatureCollection(PATH_ECORREGIONES);
// 🔁 REPLACE: Per-ecoregion search-area envelopes.
var envolventes  = ee.FeatureCollection('projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/area_de_busqueda');

var samplesNoUrbano = ee.FeatureCollection(BASE_PATH_SAMPLES + 'muestras_no_urbano_para_usar_v1')
  .map(function(f) { return f.set('value', f.get('class')); });

var samplesUrbanoGlobal = ee.FeatureCollection(BASE_PATH_SAMPLES + 'muestras_urbano_para_usar_' + PERIODO_ELEGIDO + '_x3')
  .map(function(f) { return f.set('value', f.get('class')); });


// ============================================================
// SECTION 5 — FUNCIÓN PRINCIPAL DE PROCESAMIENTO
// ============================================================
function processEcoregion(ecoName) {

  var ecoGeom = ecorregiones.filter(ee.Filter.eq(PROP_NOMBRE_ECO, ecoName)).geometry();
  var boundsSimple = envolventes.filterBounds(ecoGeom).geometry().bounds(100);
  var boundsClip   = envolventes.filterBounds(ecoGeom).geometry().dissolve(100).simplify({maxError: 60});

  // --- A. CALCULAR TAMAÑO DE MUESTRAS SEGÚN LO ELEGIDO ---
  var noUrb = samplesNoUrbano.filter(ee.Filter.eq('ecorregion', ecoName));
  var ecoUrb = samplesUrbanoGlobal.filter(ee.Filter.eq('ecorregion', ecoName));

  var sizeNoUrb = noUrb.size();
  var sizeUrbMax = ecoUrb.size();

  // Decide la cantidad base dependiendo de lo configurado arriba
  var nTotal = ee.Algorithms.If(
    TIPO_MUESTRA === 'Balanceado',
    sizeNoUrb.min(sizeUrbMax),
    ee.Number(targetUrbano.get(ecoName)).min(sizeUrbMax)
  );
  nTotal = ee.Number(nTotal).int();

  // Separar en grupos A y B
  var nMitad = nTotal.divide(2).ceil().int();
  var grupoA = ecoUrb.filter(ee.Filter.rangeContains('grid_code', 2, 6)).sort('_rand');
  var grupoB = ecoUrb.filter(ee.Filter.rangeContains('grid_code', 7, 10)).sort('_rand');

  var tomadosB = grupoB.limit(nMitad);
  var nA       = nMitad.add(nMitad.subtract(tomadosB.size()).max(0));
  var urbBase  = grupoA.limit(nA).merge(tomadosB);

  // --- B. CREAR LAS DOS COLECCIONES DE ENTRENAMIENTO ---
  var muestrasBase = urbBase.merge(noUrb);
  var muestrasConComplementos = muestrasBase.merge(puntosComplementarios);

  // --- C. CLASIFICACIÓN ---
  var mosaic = batchMosaic.mosaicGen(ANIO_A_VISUALIZAR, boundsSimple);

  // 1. Imagen solo con muestras base
  var imgBase = batchClass.classifying(
    Bands, batchClass.getFeatureSpace(mosaic, muestrasBase), 100, mosaic.clip(boundsClip)
  );

  // 2. Imagen con muestras base + polígonos complementarios
  var imgComp = batchClass.classifying(
    Bands, batchClass.getFeatureSpace(mosaic, muestrasConComplementos), 100, mosaic.clip(boundsClip)
  );

  // --- D. VISUALIZACIÓN ---
  // Mosaicos de fondo
  Map.addLayer(mosaic.select(['RED', 'GREEN', 'BLUE']), {min: 1012.96, max: 1203.04, gamma: 1.4}, 'Mosaico RGB', false);

  // Mostrar puntos base para referencia (apagados por defecto)
  Map.addLayer(ecoUrb, {color: 'red'}, 'Pool Urbano - ' + ecoName, false);
  Map.addLayer(noUrb, {color: 'blue'}, 'No Urbano Target - ' + ecoName, false);

  // Capas de clasificación
  Map.addLayer(imgBase.toByte(), imageVisParam, '1. Base (' + TIPO_MUESTRA + ')', false);
  Map.addLayer(imgComp.toByte(), imageVisParam, '2. Base + Complementos (' + TIPO_MUESTRA + ')', true);

  print('Procesando: ' + ecoName + ' | Año: ' + ANIO_A_VISUALIZAR + ' | Método: ' + TIPO_MUESTRA);
}


// ============================================================
// SECTION 6 — EJECUCIÓN
// ============================================================
listEcoregions.forEach(function(ecoName) {
  processEcoregion(ecoName);
});
