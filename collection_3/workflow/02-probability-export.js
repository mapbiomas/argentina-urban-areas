// ============================================================
// URBANO Col2 | Workflow 02 — Probability Export (per ecoregion, per year)
// ============================================================
//
// CLASIFICACIÓN URBANO POR ECORREGIÓN Y PERIODO (UNIFICADO CON COMPLEMENTARIAS)
// MapBiomas Argentina - Collection 3
//
// DESCRIPTION:
//   For one or more ecoregions, trains a classifier on the base
//   urban/non-urban samples (optionally merged with hand-drawn
//   complementary correction points reviewed in workflow/01) and exports
//   a probability-of-urban image per (ecoregion, year).
//
// ⚠️ Importante! Si se tomaron muestras complementarias hay que
// copiarlas y pegarlas antes de correr este codigo para esa ecorregion!
//
// METHODOLOGY:
//   1. Auto-detect optional `ComplUrbano`/`ComplNoUrbano` Code Editor
//      imports (via `eval`) — if present, convert them to weighted
//      points; if absent, the script runs unaffected with empty sets.
//   2. For the selected ecoregion(s): size the training set either by
//      class-balancing or a fixed proportional target, same as
//      workflow/01.
//   3. For each year in `LISTA_ANOS`: build the year's predictor mosaic,
//      classify it (probability output), and export.
//
// INPUT:
//   - Optional hand-drawn correction polygons (`ComplUrbano`/
//     `ComplNoUrbano` imports) for the ecoregion(s) being processed.
//   - Ecoregions FeatureCollection and their search-area envelopes.
//   - Base urban/non-urban sample sets, and the period-specific urban
//     sample asset selected by `PERIODO_ELEGIDO`.
//   - Annual predictor mosaic (`basic/mosaic_production.js`).
//
// OUTPUT:
//   - Per (ecoregion, year) probability-of-urban image (0-100, byte).
//     Exported as `CLASSIF_<ecoSlug>_<year>`.
//
// USAGE NOTE: uncomment ONE ecoregion in `listEcoregions` and ONE
// `LISTA_ANOS` period block (SECTION 1/3) per run.
//
// PREVIOUS STEP: 01-probability_map_with_complementary.js (interactive
//                review of the complementary points used here)
// NEXT STEP:     03-harmonized_probabilities.js (harmonizes/merges the
//                per-year probability exports produced here)
//
// AUTHORS: Luna Schteingart — MapBiomas Argentina, Urbano team
// ============================================================


// ============================================================
// SECTION 1 — CONFIGURATION PARAMETERS
// ============================================================
var PERIODO_ELEGIDO = 1985; // Opciones: 1985, 2005 o 2020

// Elegir lista correspondiente //
//periodo 1986 normal
var LISTA_ANOS      = [1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004]; // Años a clasificar

//periodo 1986 para patagonia
//var LISTA_ANOS      = [1985, 1986, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004]; // Años a clasificar

//peridoo 2005
//var LISTA_ANOS      = [2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019]; // Años a clasificar

//Periodo 2020
//var LISTA_ANOS      = [2020, 2021, 2022, 2023, 2024, 2025]; // Años a clasificar

// ⚠️ ELIGE EL TIPO DE MUESTRA A EXPORTAR AQUÍ
var TIPO_MUESTRA    = 'Original'; // Opciones: 'Balanceado' o 'Original'

// ==============================
// ECORREGIONES Y PARÁMETROS
// ==============================
var listEcoregions = [
  //'Altos Andes',
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
  'Puna',
  //'Selva Paranense',
  //'Yungas'
];


// ============================================================
// SECTION 2 — POLÍGONOS COMPLEMENTARIOS (DIBUJADOS A MANO) — DETECCIÓN AUTOMÁTICA
// ============================================================
// ✅ Si dibujaste polígonos como Imports llamados 'ComplUrbano' y/o 'ComplNoUrbano',
//    el código los detecta y los usa automáticamente.
// ✅ Si NO dibujaste polígonos para esta ecorregión, no hace falta tocar nada:
//    el código sigue funcionando con muestras vacías.

// Constantes para el modo probabilidad y el factor de peso
var VALOR_CLASE_URBANO    = 1;    // 100% Urbano
var VALOR_CLASE_NO_URBANO = 0;    // 0% Urbano
var FACTOR_MULTIPLICADOR  = 10;

// Helper: detectar si un Import existe; si no, devolver una FC vacía
function obtenerComplOpcional(nombreImport) {
  try {
    var fc = eval(nombreImport);
    // Si la variable existe pero no es una FeatureCollection válida, devolvemos vacío
    if (fc && fc instanceof ee.FeatureCollection) {
      return fc;
    }
    return ee.FeatureCollection([]);
  } catch (e) {
    return ee.FeatureCollection([]);
  }
}

var fcComplUrbano   = obtenerComplOpcional('ComplUrbano');
var fcComplNoUrbano = obtenerComplOpcional('ComplNoUrbano');

function poligonosAPuntos(poligonos, valorClase) {
  // Si la colección está vacía, devolvemos vacío sin gastar recursos
  var imgBase = ee.Image.constant(valorClase).rename('value').toInt();

  var puntosUnicos = imgBase.sampleRegions({
    collection: poligonos,
    scale: 30,
    geometries: true,
    tileScale: 2
  }).map(function(f) {
    return ee.Feature(f.geometry(), {'value': f.get('value')});
  });

  var listaRepetida = ee.List.repeat(puntosUnicos, FACTOR_MULTIPLICADOR);
  return ee.FeatureCollection(listaRepetida).flatten();
}

// Server-side: si la FC está vacía, sampleRegions devuelve vacío y el merge no aporta nada
var puntosComplementarios = ee.FeatureCollection(
  ee.Algorithms.If(
    fcComplUrbano.size().gt(0),
    poligonosAPuntos(fcComplUrbano, VALOR_CLASE_URBANO),
    ee.FeatureCollection([])
  )
).merge(
  ee.FeatureCollection(
    ee.Algorithms.If(
      fcComplNoUrbano.size().gt(0),
      poligonosAPuntos(fcComplNoUrbano, VALOR_CLASE_NO_URBANO),
      ee.FeatureCollection([])
    )
  )
);

// Aviso en consola para que sepas qué está pasando
print('━━━ Muestras complementarias ━━━');
print('ComplUrbano detectado:',   fcComplUrbano.size());
print('ComplNoUrbano detectado:', fcComplNoUrbano.size());
print('Puntos complementarios totales (post-multiplicación):', puntosComplementarios.size());

// ============================================================
// SECTION 3 — ECORREGIONES Y PARÁMETROS (rutas y tablas)
// ============================================================
// 🔁 REPLACE: Ecoregions vector (16 Argentina ecoregions).
var PATH_ECORREGIONES = 'projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/ARG/ARG-Political_Level_2-16Ecorregiones_3857';
var PROP_NOMBRE_ECO   = 'LEVEL_2';
// 🔁 REPLACE: Update to your own GEE asset folder for the sample inputs.
var BASE_PATH_SAMPLES = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES/';

var targetUrbano = ee.Dictionary({
  'Altos Andes':                    12,
  'Bosques Patagónicos':            56,
  'Campos y Malezales':             79,
  'Chaco Húmedo':                  199,
  'Chaco Seco':                    854,
  'Delta e Islas del Paraná':      250,
  'Espinal':                       724,
  'Estepa Patagónica':             159,
  'Esteros del Iberá':              47,
  'Monte de Llanuras y Mesetas':   611,
  'Monte de Sierras y Bolsones':   112,
  'Pampa':                        2286,
  'Pampa1':                        409,
  'Pampa2':                       1636,
  'Pampa3':                        644,
  'Puna':                           14,
  'Selva Paranense':               145,
  'Yungas':                        207,
  'Islas del Atlántico Sur':         2
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
  var envolvEco    = envolventes.filterBounds(ecoGeom);
  var boundsSimple = envolvEco.geometry().bounds(100);
  var boundsClip   = envolvEco.geometry().dissolve(100).simplify({maxError: 60});
  var ecoSlug      = ecoName.replace(/[^a-zA-Z0-9]/g, '_');

  // --- A. CALCULAR TAMAÑO DE MUESTRAS SEGÚN LO ELEGIDO ---
  var noUrb = samplesNoUrbano.filter(ee.Filter.eq('ecorregion', ecoName));
  var ecoUrb = samplesUrbanoGlobal.filter(ee.Filter.eq('ecorregion', ecoName));

  var sizeNoUrb = noUrb.size();
  var sizeUrbMax = ecoUrb.size();

  var nTarget;
  if (TIPO_MUESTRA === 'Balanceado') {
    nTarget = sizeNoUrb.min(sizeUrbMax);
  } else {
    nTarget = ee.Number(targetUrbano.get(ecoName)).min(sizeUrbMax);
  }

  var nTotal = ee.Number(nTarget).int();
  var nMitad = nTotal.divide(2).ceil().int();

  var grupoA = ecoUrb.filter(ee.Filter.rangeContains('grid_code', 2, 6)).sort('_rand');
  var grupoB = ecoUrb.filter(ee.Filter.rangeContains('grid_code', 7, 10)).sort('_rand');

  var tomadosB = grupoB.limit(nMitad);
  var nA       = nMitad.add(nMitad.subtract(tomadosB.size()).max(0));
  var urbBase  = grupoA.limit(nA).merge(tomadosB);

  // --- B. CREAR COLECCIÓN FINAL (Base + Complementarias si las hay) ---
  var muestrasBase = urbBase.merge(noUrb);
  // Si puntosComplementarios está vacío, el merge no afecta en absoluto a las muestrasBase
  var muestrasFinales = muestrasBase.merge(puntosComplementarios);

  // Imprimimos el estado para tu tranquilidad
  print('=== PROCESANDO: ' + ecoName + ' ===');
  print('Estrategia Base:', TIPO_MUESTRA);
  print('Puntos extraídos de polígonos manuales (ya multiplicados):', puntosComplementarios.size());

  // --- C. CLASIFICACIÓN Y EXPORTACIÓN ---
  LISTA_ANOS.forEach(function(year) {
    var mosaic = batchMosaic.mosaicGen(year, boundsSimple);

    // Generar la imagen clasificada única
    var img = batchClass.classifying(
      Bands, batchClass.getFeatureSpace(mosaic, muestrasFinales), 100, mosaic.clip(boundsClip))
      .set('opcion', TIPO_MUESTRA)
      .set('year', year)
      .set('ecorregion', ecoName);

    // Exportación a la pestaña Tasks
    Export.image.toAsset({
      image:       img,
      description: 'classif_' + ecoSlug + '_' + year,
      // 🔁 REPLACE: Update to your own GEE asset folder for the
      // probability-map exports.
      assetId:     'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/TRIAL_CLASSIFICATION/CLASSIF_' + ecoSlug + '_' + year,
      region:      boundsSimple,
      scale:       30,
      maxPixels:   1e13
    });

  });
}

// ============================================================
// SECTION 6 — EJECUCIÓN
// ============================================================
listEcoregions.forEach(function(ecoName) {
  processEcoregion(ecoName);
});
