// ============================================================
// PASO 2 - EXPORTAR PUNTOS ESTABLES - NACIONAL
// MapBiomas Argentina - Colección 2 - Área Urbana
// ============================================================
// AUTHOR: Sofia Sarrailhé (orig.), actualizado 2025
// VERSIÓN: v1
// DESCRIPCIÓN:
//   Toma el mapa de clases estables generado en el Paso 1 y
//   extrae 10.000 puntos por clase mediante muestreo estratificado
//   a nivel nacional. A cada punto se le asigna un atributo
//   'Region_id' mediante spatial join con los assets de regiones:
//     1 = Chaco
//     2 = Pampa
//     3 = Bosque Atlántico
//     4 = Monte, Puna y Altos Andes
//     5 = Patagonia
//
// PREVIOUS STEP: 0a_generate_map_stable_nonurban.js — note this script
//   reads a different asset name than 0a exports (see 0a's header NOTE);
//   update `dirsamples` below to match whatever 0a actually produced.
// ============================================================

// --- PARÁMETROS CONFIGURABLES ---
var version   = 'v1';
var coleccion = '2';
var nSamples  = 10000;
var sufix     = '_85_24';

// 🔁 REPLACE: Update to your own GEE asset folder for the sample outputs.
var dirout = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES';

// --- ASSET MAPA ESTABLES (output del Paso 1) ---
// 🔁 REPLACE: Stable-classes map (script 0a output).
var dirsamples = ee.Image("projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES/urban_stable_map_30_national_c2_85_24_v1")

// --- ASSETS DE REGIONES (sin buffer) ---
// Cada región se convierte a imagen con su ID numérico para el spatial join
// 🔁 REPLACE: Regional boundary FeatureCollections (5 MapBiomas Argentina
// regions).
var chaco      = ee.FeatureCollection('projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/CHACO/regional-assets_chaco-argcol2');
var pampa      = ee.FeatureCollection('projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/PAMPA/regional-assets_pampa_argcol3');
var ba         = ee.FeatureCollection('projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/BA/regional-assets_bosque-atlantico-argcol2');
var patagonia  = ee.FeatureCollection('projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/PAT/regional-assets_patagonia-argcol2');
var cuyo       = ee.FeatureCollection('projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/CUYO/regional-assets_cuyo-argcol2');

// Mapa de IDs de región:
// 1=Chaco, 2=Pampa, 3=Bosque Atlántico, 4=Monte/Puna/Altos Andes, 5=Patagonia
// Nota: Cuyo corresponde a Monte/Puna/Altos Andes (id=4)
var regionMap = ee.Image(0)
  .paint(chaco,     1)
  .paint(pampa,     2)
  .paint(ba,        3)
  .paint(cuyo,      4)
  .paint(patagonia, 5)
  .rename('Region_id')
  .toByte();

// Nombres de región para atributo textual
var regionNames = ee.Dictionary({
  '1': 'Chaco',
  '2': 'Pampa',
  '3': 'Bosque_Atlantico',
  '4': 'Monte_Puna_AltosAndes',
  '5': 'Patagonia'
});

// --- MUESTREO ESTRATIFICADO NACIONAL ---
var training = dirsamples.stratifiedSample({
  scale: 30,
  classBand: 'reference',
  numPoints: 0,
  seed: 1,
  geometries: true,
  classValues: [1, 2, 3, 4, 5],
  classPoints: [nSamples, nSamples, nSamples, nSamples, nSamples]
});

// --- SPATIAL JOIN: asignar Region_id y Region_name a cada punto ---
var trainingWithRegion = training.map(function(feat) {
  var region_id = regionMap.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: feat.geometry(),
    scale: 30
  }).get('Region_id');

  // Si el punto cae fuera de todas las regiones, region_id puede ser null o 0
  region_id = ee.Algorithms.If(
    ee.Algorithms.IsEqual(region_id, null),
    0,
    region_id
  );

  var region_name = ee.Algorithms.If(
    ee.Number(region_id).eq(0),
    'Sin_region',
    regionNames.get(ee.Number(region_id).int().format('%d'))
  );

  return feat.set({
    'Region_id':   region_id,
    'Region_name': region_name
  });
});

// Filtrar puntos sin región asignada
trainingWithRegion = trainingWithRegion.filter(ee.Filter.neq('Region_id', 0));

// --- EXPORTACIÓN A ASSET ---
Export.table.toAsset(
  trainingWithRegion,
  'urban_stable_samples_national_c' + coleccion + sufix + '_' + version,
  // 🔁 REPLACE: Update to your own GEE asset folder (see `dirout` above).
  dirout + '/urban_stable_samples_national_c' + coleccion + sufix + '_' + version
);

// --- EXPORTACIÓN A DRIVE (opcional, descomentar si se necesita SHP) ---
// Export.table.toDrive({
//   collection: trainingWithRegion,
//   description: 'DRIVE_samples_C' + coleccion + sufix + '_' + version,
//   folder: 'Shapes_puntos_C' + coleccion,
//   fileNamePrefix: 'samples_C' + coleccion + sufix + '_' + version,
//   fileFormat: 'SHP'
// });
