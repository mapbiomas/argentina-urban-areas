/*
======================================================
### MÁSCARA CON EXCEPCIÓN RENABAP — TF4 · r1       ###
### Argentina | COLLECTION-3 | 1985-2025           ###
======================================================
TF4 ORIGINAL (acumulativo puro) con la máscara final aplicada.
Máscara efectiva = (Supermáscara == 1) OR (dentro de RENABAP), igual que TF3.

Input:  urban_TF4_r1_1985_2025_v2  (TF4 original, sin máscara)
Exporta: urban_TF4_r1_masked_renabap_1985_2025_v2

NOTE: `tf4_asset` below (the "TF4 original, acumulativo puro" — a simple
cumulative-forward consolidation, analogous to workflow/filters'
accumulateForward step) is not itself included as a separate script in
this repository; only its masked-output step is. If you're rebuilding
this chain, TF4 original = per-pixel running-max of TF3's binary urban
flag across years (see Mask.js's output as its input, and
BreakPoint.js/TF4umb_postmask.js for two more sophisticated alternatives
to a plain running-max).

PREVIOUS STEP: TF4 original (not included in this repository — see NOTE)
NEXT STEP:     none documented in this repository beyond this point
*/

var config = {
  // 🔁 REPLACE: TF4 (original, cumulative) output — see NOTE above.
  tf4_asset:    'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/FILTERS/urban_TF4_r1_1985_2025_v2',
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
// El RENABAP (vector) se rasteriza SIN reproject global (que reventaba el
// límite de 2^31). paint() ya produce una imagen alineable con el raster;
// al combinarla con la máscara y multiplicar por TF4, GEE resuelve la
// proyección/escala por tile automáticamente en el export.
var maskRaster = ee.Image(config.mask_asset);
var maskValid  = maskRaster.eq(config.mask_value).unmask(0);

var renabap    = ee.FeatureCollection(config.renabap_asset);
var renabapImg = ee.Image(0).byte().paint(renabap, 1).gt(0);   // 1 dentro de RENABAP

var effectiveMask = maskValid.or(renabapImg);

// ===== DIAGNÓSTICO (a escala gruesa para no reventar memoria) =====
var cov = effectiveMask.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: region, scale: 5000, maxPixels: 1e9, tileScale: 4, bestEffort: true
});
print('Cobertura máscara efectiva ~aprox (área válida ∪ RENABAP) (0-1):', cov.get('constant'));

// ===== APLICAR A TF4 =====
var tf4 = ee.Image(config.tf4_asset);
var tf4Masked = ee.Image.cat(YEARS.map(function(year){
  return tf4.select(bn(year)).multiply(effectiveMask).rename(bn(year));
})).toByte();

tf4Masked = tf4Masked.set({
  'collection_id':'3','version':config.output_version,'territory':'ARGENTINA',
  'theme':'Urban Area','source':'MapBiomas Argentina',
  'filter_type':'TF4_masked_renabap_exception',
  'mask_asset':config.mask_asset,'mask_value':config.mask_value,
  'renabap_asset':config.renabap_asset,'mask_applied':true,
  'exception':'renabap_kept_outside_valid_mask',
  'years':'1985-2025','n_bands':YEARS.length,'urban_value':URBAN,'spatial_version':'r1'
});

// ===== EXPORTAR =====
var name = 'urban_TF4masked_r1_1985_2025_v2';
Export.image.toAsset({
  image: tf4Masked, description: name, assetId: config.output_path + name,
  region: region, scale: config.scale, maxPixels: config.maxPixels,
  pyramidingPolicy: {'.default':'mode'}
});
print('Export enviado:', config.output_path + name);
