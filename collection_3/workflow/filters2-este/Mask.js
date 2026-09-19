/*
======================================================
### MÁSCARA CON EXCEPCIÓN RENABAP — TF3 · r1       ###
### Argentina | COLLECTION-3 | 1985-2025           ###
======================================================
Aplica Supermascara_2025 sobre TF3 (quita no-válido = pone 0 fuera del área
válida), PERO rescata las zonas RENABAP aunque caigan fuera de la máscara.

Máscara efectiva = (Supermáscara == 1)  OR  (dentro de RENABAP)

Nota: unir con "todo el RENABAP" o solo con "RENABAP fuera de máscara" da el
MISMO resultado, porque la parte de RENABAP dentro del área válida ya sobrevivía.

La máscara es RASTER y RENABAP es VECTOR → se rasteriza el RENABAP sobre la
grilla/proyección de la máscara antes de combinarlos.

Exporta: urban_TF3_r1_masked_renabap_1985_2025_v2

PREVIOUS STEP: TF3.js
NEXT STEP:     TF4umb_postmask.js (v1) or BreakPoint.js (v2) — two
               alternative final consolidation methods, both reading this
               script's output directly.
*/

var config = {
  // 🔁 REPLACE: TF3 output.
  tf3_asset:    'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/FILTERS/urban_TF3_r1_1985_2025_v2',
  // 🔁 REPLACE: Raster mask defining the valid study area for the final year.
  mask_asset:   'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/AUXILIARY_DATA/RASTER/Supermascara_2025',
  // 🔁 REPLACE: RENABAP (informal settlements registry) polygons kept as an
  // exception even outside the valid mask.
  renabap_asset:'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/RENABAP_porfuera_LCLU_2025_1',
  // 🔁 REPLACE: Update to your own GEE asset folder for the filter outputs.
  output_path:  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/FILTERS/',
  // 🔁 REPLACE: Country boundary, used only as the export region.
  pais_asset:   'projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/ARG/ARG-Political_Level_1-Pais',
  output_version: '2',
  start_year: 1985, end_year: 2025,
  urban_value: 24, mask_value: 1,
  scale: 30, maxPixels: 1e13,
};

var START = config.start_year, END = config.end_year, URBAN = config.urban_value;
var YEARS = []; for (var y = START; y <= END; y++) YEARS.push(y);
var bn = function(year){ return 'classification_' + year; };
var region = ee.FeatureCollection(config.pais_asset).geometry().bounds();

// ===== MÁSCARA EFECTIVA: área válida OR RENABAP =====
var maskRaster = ee.Image(config.mask_asset);
var maskProj   = maskRaster.projection();
var maskValid  = maskRaster.eq(config.mask_value).unmask(0);       // 1 = área válida

var renabap    = ee.FeatureCollection(config.renabap_asset);
var renabapImg = ee.Image(0).byte().paint(renabap, 1)
  .reproject(maskProj)                                             // alinear a grilla de máscara
  .eq(1);                                                          // 1 = dentro de RENABAP

var effectiveMask = maskValid.or(renabapImg);                      // 1 = conservar

// ===== DIAGNÓSTICO =====
var cov = effectiveMask.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: region, scale: 1000, maxPixels: 1e9, tileScale: 4
});
print('Cobertura máscara efectiva (área válida ∪ RENABAP) (0-1):', cov.get('constant'));

// ===== APLICAR A TF3 (todas las bandas) =====
var tf3 = ee.Image(config.tf3_asset);
var tf3Masked = ee.Image.cat(YEARS.map(function(year){
  return tf3.select(bn(year)).multiply(effectiveMask).rename(bn(year));
})).toByte();

tf3Masked = tf3Masked.set({
  'collection_id':'3','version':config.output_version,'territory':'ARGENTINA',
  'theme':'Urban Area','source':'MapBiomas Argentina',
  'filter_type':'TF3_masked_renabap_exception',
  'mask_asset':config.mask_asset,'mask_value':config.mask_value,
  'renabap_asset':config.renabap_asset,'mask_applied':true,
  'exception':'renabap_kept_outside_valid_mask',
  'years':'1985-2025','n_bands':YEARS.length,'urban_value':URBAN,'spatial_version':'r1'
});

// ===== EXPORTAR =====
var name = 'urban_TF3_r1_masked_renabap_1985_2025_v2';
Export.image.toAsset({
  image: tf3Masked, description: name, assetId: config.output_path + name,
  region: region, scale: config.scale, maxPixels: config.maxPixels,
  pyramidingPolicy: {'.default':'mode'}
});
print('Export enviado:', config.output_path + name);
