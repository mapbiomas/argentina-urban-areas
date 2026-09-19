// ============================================================
// PASO 1 - MAPA DE CLASES ESTABLES - NACIONAL
// MapBiomas Argentina - Colección 2 - Área Urbana
// ============================================================
// AUTHOR: Sofia Sarrailhé, actualizado 2026: Gonzalo Dieguez Gaviola
// VERSIÓN: v1
// PERÍODO: 1985–2024 (40 años)
// ESCALA: 30m
// DESCRIPCIÓN:
//   Genera un mapa de clases estables a nivel nacional a partir
//   del asset de integración de MapBiomas Argentina Col 2.
//   Las clases MapBiomas se remapean a:
//     1 = Leñoso
//     2 = Herbáceo
//     3 = No vegetado
//     4 = Agua
//     5 = Agricultura
//     0 = Máscara (no observado / sin clase)
//
//   Se considera un píxel "estable" si mantuvo la misma clase
//   durante al menos `frecuencia` años dentro del período.
//   El recorte espacial se aplica a la diferencia entre buffer
//   y envolvente de localidades (envolventeBuffer).
//
// NEXT STEP: 0b_export_stable_nonurban_samples.js reads this script's
//   exported asset — note it expects a different filename
//   (`urban_stable_map_30_national_c2_85_24_v1`) than the one exported
//   here (`urban_stable_samples_national_c2_85_24_v1`); this naming
//   mismatch is present in the original workflow, kept as-is.
// ============================================================

// --- PARÁMETROS CONFIGURABLES ---
var version    = 'v1';
var coleccion  = '2';
var frecuencia = 20;   // años mínimos con la misma clase para ser "estable"
var sufix      = '_85_24';

// 🔁 REPLACE: Update to your own GEE asset folder for the sample outputs.
var dirout = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/SAMPLES';

// --- ASSETS ---
// 🔁 REPLACE: National multi-year classification image.
var colecao = ee.Image('projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-2/INTEGRATION/mapbiomas_argentina_collection1_integration_v8');

// 🔁 REPLACE: Mask defining the (buffer minus locality-envelope) area
// this step is restricted to.
var envolventeBuffer = ee.FeatureCollection(
  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/col3_diferencia_envolvente')

var Argentina = ee.Geometry.BBox(-73.6, -55.1, -53.6, -21.8)

// --- PERÍODO 1985-2024 ---
var anos = [
  '1985','1986','1987','1988','1989','1990','1991','1992','1993','1994',
  '1995','1996','1997','1998','1999','2000','2001','2002','2003','2004',
  '2005','2006','2007','2008','2009','2010','2011','2012','2013','2014',
  '2015','2016','2017','2018','2019','2020','2021','2022','2023','2024'
];
var freq_lim = frecuencia;  // 20 años sobre 40

// --- MÁSCARA: diferencia buffer-envolvente ---
var i_msk_envolventeBuffer = envolventeBuffer.reduceToImage(['FID_Catego'], ee.Reducer.first());
var colecao_masked = colecao.updateMask(i_msk_envolventeBuffer);

// --- REMAPEO UNIFICADO (Colección 2) ---
// Leñoso (1):      3=Bosques cerrados, 4=Bosques abiertos, 6=Bosques inundables,
//                  9=Silvicultura, 66=Arbustales cerrados, 77=Arbustales abiertos
// Herbáceo (2):    11=Herbáceas inundables, 12=Herbáceas, 15=Pasturas,
//                  63=Mosaico arbustos/herbáceas, 73=Turberas
// No vegetado (3): 24=Áreas urbanas, 25=Otras no vegetadas
// Agua (4):        33=Ríos/lagunas/lagos, 34=Hielo/nieve permanente
// Agricultura (5): 18=Agricultura, 19=Cultivos temporarios, 36=Cultivos perennes,
//                  21=Mosaico de usos
// Máscara (0):     27=No observado
var fromClasses = [3, 4, 6, 9, 66, 77, 11, 12, 15, 63, 73, 24, 25, 33, 34, 18, 19, 36, 21, 27];
var toClasses   = [1, 1, 1, 1,  1,  1,  2,  2,  2,  2,  2,  3,  3,  4,  4,  5,  5,  5,  5,  0];

// --- CONSTRUCCIÓN DE COLECCIÓN ANUAL REMAPEADA ---
var colList = ee.List([]);

for (var i = 0; i < anos.length; i++) {
  var ano = anos[i];
  var colflor = colecao_masked
    .select('classification_' + ano)
    .remap(fromClasses, toClasses);
  colList = colList.add(colflor.int8());
}

var collection = ee.ImageCollection(colList);

// --- FUNCIÓN: FRECUENCIA POR CLASE ---
var classFrequency = {'1': freq_lim, '2': freq_lim, '3': freq_lim, '4': freq_lim, '5': freq_lim};

var getFrenquencyMask = function(classId) {
  var classIdInt = parseInt(classId, 10);

  var frequency = collection.map(function(image) {
    return image.eq(classIdInt);
  }).reduce(ee.Reducer.sum());

  var frequencyMask = frequency
    .gte(classFrequency[classId])
    .multiply(classIdInt)
    .toByte();

  frequencyMask = frequencyMask.mask(frequencyMask.eq(classIdInt));

  return frequencyMask.rename('frequency').set('class_id', classId);
};

// --- MAPA DE REFERENCIA ---
var frequencyMasks = ee.ImageCollection.fromImages(
  Object.keys(classFrequency).map(getFrenquencyMask)
);

var referenceMap = frequencyMasks
  .reduce(ee.Reducer.firstNonNull())
  .rename('reference')
  .clip(Argentina)
  .toInt8();

// --- EXPORTACIÓN ---
Export.image.toAsset({
  image: referenceMap,
  description: 'urban_stable_samples_national_c' + coleccion + sufix + '_' + version,
  // 🔁 REPLACE: Update to your own GEE asset folder (see `dirout` above).
  assetId: dirout + '/urban_stable_samples_national_c' + coleccion + sufix + '_' + version,
  scale: 30,
  pyramidingPolicy: {'.default': 'mode'},
  maxPixels: 1e13,
  region: Argentina
});
