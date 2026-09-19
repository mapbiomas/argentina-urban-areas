/*
======================================================
### FILTRO TEMPORAL FINAL — VERSIÓN 1              ###
### TF4 con umbral de evidencia — r1               ###
### Argentina | COLLECTION-3 | 1985-2025           ###
======================================================
Input: urban_TF3_r1_masked_renabap_1985_2025_v2

Reemplaza el TF4 acumulativo puro por una consolidación CON UMBRAL:
para cada año de inicio Y0 (primer urbano candidato), se valida que
de Y0 a 2025 el píxel sea urbano una fracción mínima del tiempo.
Si valida, se propaga urbano de Y0 a 2025 (acumulación hacia adelante).

Umbral por año de inicio Y0:
  Y0 <= 2019            → fracción urbana >= 70%
  Y0 in {2020,2021,2022}→ fracción urbana >= 50%
  Y0 in {2023,2024,2025}→ con 1 sola vez alcanza (sin fracción)

Se toma el onset validado MÁS TEMPRANO y se propaga. Los píxeles urbanos
aislados que no juntan evidencia se eliminan.

Exporta: urban_final_v1_TF4umbral_r1_1985_2025_v2

This is one of two alternative final consolidation methods in this chain
— see BreakPoint.js for the other (v2, transition-based, fixed 50%
threshold).

PREVIOUS STEP: Mask.js
NEXT STEP:     none documented in this repository beyond this point
*/

var config = {
  // 🔁 REPLACE: Mask.js output.
  input_asset:  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/FILTERS/urban_TF3_r1_masked_renabap_1985_2025_v2',
  // 🔁 REPLACE: Update to your own GEE asset folder for the filter outputs.
  output_path:  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/FILTERS/',
  // 🔁 REPLACE: Country boundary, used only as the export region.
  pais_asset:   'projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/ARG/ARG-Political_Level_1-Pais',
  output_version: '2',
  start_year: 1985, end_year: 2025, urban_value: 24,

  // Umbrales de fracción por año de inicio (Y0)
  thr_old: 0.70,           // Y0 <= year_old_max
  thr_mid: 0.50,           // year_old_max < Y0 <= year_mid_max
  year_old_max: 2019,      // hasta acá aplica thr_old
  year_mid_max: 2022,      // hasta acá aplica thr_mid; después: 1 sola vez alcanza
};

var START = config.start_year, END = config.end_year, URBAN = config.urban_value;
var YEARS = []; for (var y = START; y <= END; y++) YEARS.push(y);
var bn = function(year){ return 'classification_' + year; };
var region = ee.FeatureCollection(config.pais_asset).geometry().bounds();

// ===== INPUT → BINARIO =====
var input = ee.Image(config.input_asset);
var B = ee.Image.cat(YEARS.map(function(year){
  return input.select(bn(year)).eq(URBAN).rename(bn(year));
}));

// ===== VALIDACIÓN DE ONSET POR AÑO =====
// validOnset(Y0) = 1 donde el píxel es urbano en Y0 y cumple el umbral de
// fracción de Y0 a 2025 (o, para años recientes, basta que sea urbano).
var validOnsetByYear = {};
YEARS.forEach(function(Y0){
  var urbY0 = B.select(bn(Y0));

  // conteo urbano de Y0 a END
  var bandsFrom = [];
  for (var y = Y0; y <= END; y++) bandsFrom.push(bn(y));
  var countUrb  = B.select(bandsFrom).reduce(ee.Reducer.sum());
  var windowLen = END - Y0 + 1;

  var vo;
  if (Y0 <= config.year_mid_max) {
    var thr = (Y0 <= config.year_old_max) ? config.thr_old : config.thr_mid;
    // frac >= thr  <=>  countUrb >= thr * windowLen
    vo = urbY0.and(countUrb.gte(thr * windowLen));
  } else {
    // años recientes: 1 sola vez alcanza
    vo = urbY0;
  }
  validOnsetByYear[Y0] = vo;
});

// ===== PROPAGACIÓN HACIA ADELANTE DESDE EL ONSET VALIDADO MÁS TEMPRANO =====
var cum = null;
var out = YEARS.map(function(year){
  var vo = validOnsetByYear[year];
  cum = (cum === null) ? vo : cum.max(vo);
  return cum.multiply(URBAN).rename(bn(year));
});
var result = ee.Image.cat(out).toByte();

result = result.set({
  'collection_id':'3','version':config.output_version,'territory':'ARGENTINA',
  'theme':'Urban Area','source':'MapBiomas Argentina',
  'filter_type':'TF4_umbral_evidencia_v1',
  'input_asset':config.input_asset,
  'thr_old':config.thr_old,'thr_mid':config.thr_mid,
  'year_old_max':config.year_old_max,'year_mid_max':config.year_mid_max,
  'years':'1985-2025','n_bands':YEARS.length,'urban_value':URBAN,'spatial_version':'r1'
});

// ===== EXPORTAR =====
var name = 'urban_final_TF4_r1_1985_2025_v2';
Export.image.toAsset({
  image: result, description: name, assetId: config.output_path + name,
  region: region, scale: config.scale, maxPixels: config.maxPixels,
  pyramidingPolicy: {'.default':'mode'}
});
print('Export enviado:', config.output_path + name);
print('Umbral: Y0<=' + config.year_old_max + ' →' + (config.thr_old*100) + '% | ' +
      'Y0<=' + config.year_mid_max + ' →' + (config.thr_mid*100) + '% | recientes → 1 vez');
