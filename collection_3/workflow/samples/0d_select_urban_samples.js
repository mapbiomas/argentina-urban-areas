// ============================================================
// MUESTREO ESTRATIFICADO POR ECORREGIÓN Y PERÍODO
// MapBiomas Argentina - Collection 3
// Requiere la carga del set total de las muestras de urbano extraídas de GHS (en 1 asset por periodo)
// Exporta las muestras urbanas con el numero fijo para usar en 3 assets separados (uno por período)
// Autor: Luna Schteingart
// ============================================================

// Ecorregiones y Variables Globales
// 🔁 REPLACE: Ecoregions vector (16 Argentina ecoregions).
var PATH_ECORREGIONES = 'projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/ARG/ARG-Political_Level_2-16Ecorregiones_3857';
var PROP_NOMBRE_ECO   = 'LEVEL_2'; // <-- nombre de la propiedad con el nombre de ecorregión
var SEED = 42; // Seed fijo → muestras siempre reproducibles

// ==============================
// CARGA DE SET DE MUESTRAS TOTALES
// ==============================
// 🔁 REPLACE: Raw urban samples extracted from GHS (Global Human
// Settlement), one asset per reference period.
var urbano85 = ee.FeatureCollection(
  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES/Muestras_urbanas1985'
).map(function(f) { return f.set({'class': 1, 'periodo': 1985}); });

var urbano05 = ee.FeatureCollection(
  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES/Muestras_urbanas2005'
).map(function(f) { return f.set({'class': 1, 'periodo': 2005}); });

var urbano20 = ee.FeatureCollection(
  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES/Muestras_urbanas2020'
).map(function(f) { return f.set({'class': 1, 'periodo': 2020}); });

// 🔁 REPLACE: Study-area envelope used to filter the raw samples.
var envolvente = ee.FeatureCollection(
  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/envolvente'
);

// ==============================
// LAS SEPARA POR ECORREGION
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

// ==============================
// TABLA OBJETIVO DE MUESTRAS POR ECORREGION
// --> Decidimos llevar el numero a los valores objetivo de No Urbano

var targetUrbano = ee.Dictionary({
  'Altos Andes':                    36,
  'Bosques Patagónicos':            226,
  'Campos y Malezales':             159,
  'Chaco Húmedo':                  369,
  'Chaco Seco':                    2130,
  'Delta e Islas del Paraná':      539,
  'Espinal':                       1220,
  'Estepa Patagónica':             333,
  'Esteros del Iberá':              92,
  'Monte de Llanuras y Mesetas':   1004,
  'Monte de Sierras y Bolsones':   394,
  'Pampa':                        3528,
  'Puna':                           47,
  'Selva Paranense':               359,
  'Yungas':                        443,
  'Islas del Atlántico Sur':         24 //El cálculo daba 6 pero lo aumentamos a 24
});

var ecoList = targetUrbano.keys();

// ==============================
// FUNCIÓN PRINCIPAL DE PROCESAMIENTO Y MUESTREO
// ==============================
function procesarYmuestrearUrbano(fcCruda) {
  // 1. Filtrar por envolvente y agregar columna random
  var fcFiltrada = fcCruda
    .filterBounds(envolvente.geometry())
    .randomColumn('_rand', SEED);

  // 2. Agregar Ecorregión
  var fcConEco = addEcoregion(fcFiltrada);

  // 3. Muestreo 50/50 por grid_code
  //--> para cada ecorregion, le asignamos el valor target establecido de muestras
  // buscamos tener un 50% de grupo A (urbanizacion 1-6) y un 50% de grupo B (urb 7-10)
  // en caso de no llegar a un 50% con el grupo B (incluso usando todas las que hay) se completa con el grupo A
  // notamos que en general siempre se terminan utilizando todas las del grupo B y aun así no llegan a completar el 50% del target
  var sampled = ee.FeatureCollection(
    ecoList.map(function(eco) {
      eco = ee.String(eco);

      var nTotal = ee.Number(targetUrbano.get(eco)).int();
      var nMitad = nTotal.divide(2).ceil().int();

      var ecoUrb = fcConEco.filter(ee.Filter.eq('ecorregion', eco));

      var grupoA = ecoUrb.filter(ee.Filter.rangeContains('grid_code', 2, 6)).sort('_rand');
      var grupoB = ecoUrb.filter(ee.Filter.rangeContains('grid_code', 7, 10)).sort('_rand');

      var tomadosB = grupoB.limit(nMitad);
      var nA = nMitad.add(nMitad.subtract(tomadosB.size()).max(0));
      var tomadosA = grupoA.limit(nA);

      return tomadosA.merge(tomadosB);
    })
  ).flatten();

  return sampled;
}

// ==============================
// APLICAR FUNCIÓN A CADA PERÍODO
// ==============================
var sampledUrbano85 = procesarYmuestrearUrbano(urbano85);
var sampledUrbano05 = procesarYmuestrearUrbano(urbano05);
var sampledUrbano20 = procesarYmuestrearUrbano(urbano20);

// ==============================
// EXPORTAR 3 ASSETS SEPARADOS
// ==============================
// 🔁 REPLACE: Update to your own GEE asset folder for the sample outputs.
var basePath = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES/';

Export.table.toAsset({
  collection:  sampledUrbano85,
  description: 'muestras_urbano_1985',
  assetId:     basePath + 'muestras_urbano_para_usar_1985'
});

Export.table.toAsset({
  collection:  sampledUrbano05,
  description: 'muestras_urbano_2005',
  assetId:     basePath + 'muestras_urbano_para_usar_2005'
});

Export.table.toAsset({
  collection:  sampledUrbano20,
  description: 'muestras_urbano_2020',
  assetId:     basePath + 'muestras_urbano_para_usar_2020'
});
