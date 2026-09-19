// ============================================================
// MUESTREO ESTRATIFICADO POR ECORREGIÓN (OPTIMIZADO Y CORREGIDO)
// MapBiomas Argentina - Collection 3
// Requiere la carga del set total de las muestras de clases generadas
//   a partir de la areas estables de la clasificación de MapBiomas 2024
// Exporta las muestras como un único asset listo para usar en clasificación
// Autor: Luna Schteingart
//
// PREVIOUS STEP: 0b_export_stable_nonurban_samples.js — note this script
//   reads yet another asset name variant
//   (`urban_stable_samples_30_national_c2_85_24_v1`) than what 0b
//   exports; this naming drift across steps is present in the original
//   workflow, kept as-is.
// ============================================================

// Ecorregiones
// 🔁 REPLACE: Ecoregions vector (16 Argentina ecoregions).
var PATH_ECORREGIONES = 'projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/ARG/ARG-Political_Level_2-16Ecorregiones_3857';
var PROP_NOMBRE_ECO   = 'LEVEL_2'; // <-- nombre de la propiedad con el nombre de ecorregión
var SEED = 42; // Seed fijo → muestras siempre reproducibles


// ==============================
// CARGA DE MUESTRAS SIN FILTRAR
// ==============================

// 🔁 REPLACE: National stable non-urban samples (script 0a/0b output).
var noUrbano = ee.FeatureCollection(
  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES/urban_stable_samples_30_national_c2_85_24_v1'
).map(function(f) { return f.set({'class': 0, 'periodo': 'stable'}); })
 .randomColumn('_rand', SEED);

// ==============================
// SPATIAL JOIN CON ECORREGIONES
// ==============================

var ecorregiones = ee.FeatureCollection(PATH_ECORREGIONES);

var spatialFilter = ee.Filter.intersects({
  leftField: '.geo', rightField: '.geo', maxError: 10
});

var joinSaveFirst = ee.Join.saveFirst({matchKey: 'eco_match'});

function addEcoregion(fc) {
  var joined = joinSaveFirst.apply(fc, ecorregiones, spatialFilter);
  return joined.map(function(f) {
    var ecoName = ee.Feature(f.get('eco_match')).get(PROP_NOMBRE_ECO);
    return f.set('ecorregion', ecoName).set('eco_match', null);
  });

}

var noUrbanoEco = addEcoregion(noUrbano);

// ==============================
// TABLA OBJETIVO DE MUESTRAS NO URBANO POR ECORREGION
// ==============================


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
  'Puna':                           47,
  'Selva Paranense':               359,
  'Yungas':                        443,
  'Islas del Atlántico Sur':         24

});

var ecoList = targetNoUrbano.keys();

// ==============================
// MUESTREO NO URBANO (según target establecido)
// ==============================
//Se establece numero target de muestras no urbano asignado previamente para cada ecorregion
//Se muestrea el numero de muestras no urbanas segun target establecido.
//Se cuota igual por clase (reference 1-5)
// ==============================

var CLASSES = ee.List([1, 2, 3, 4, 5]);
var N_CLASSES = 5;

var sampledNoUrbano = ee.FeatureCollection(
  ecoList.map(function(eco) {
    eco = ee.String(eco);
    var total = ee.Number(targetNoUrbano.get(eco)).int();
    var base  = total.divide(N_CLASSES).floor();   // cuota por clase
    var resto = total.mod(N_CLASSES);              // sobrante a repartir

    var ecoFC = noUrbanoEco.filter(ee.Filter.eq('ecorregion', eco));

    var porClase = CLASSES.map(function(c) {
      c = ee.Number(c);
      // las primeras 'resto' clases reciben 1 muestra extra
      var idx  = CLASSES.indexOf(c);
      var extra = ee.Number(ee.Algorithms.If(idx.lt(resto), 1, 0));
      var n     = base.add(extra).int();

      return ecoFC
        .filter(ee.Filter.eq('reference', c))
        .sort('_rand')
        .limit(n);
    });

    return ee.FeatureCollection(porClase).flatten();
  })
).flatten();
// ==============================
// EXPORTAR
// ==============================

Export.table.toAsset({
  collection:  sampledNoUrbano,
  description: 'muestras_no_urbano_v1',
  // 🔁 REPLACE: Update to your own GEE asset folder.
  assetId:     'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES/muestras_no_urbano_para_usar_v1'

});
