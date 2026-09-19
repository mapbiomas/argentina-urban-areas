/*
======================================================
### FILTRO TEMPORAL FINAL — VERSIÓN 2              ###
### BreakPoint (adaptado de Brasil) — r1           ###
### Argentina | COLLECTION-3 | 1985-2025           ###
======================================================
Input: urban_TF3_r1_masked_renabap_1985_2025_v2  (mismo que v1)

Replica el paso C (TF BreakPoint) del código de Brasil, adaptado a nuestro
TF3. Por píxel:
  (i)   detecta transición no-urbano→urbano (0→1); 1985 base cuenta como onset
  (ii)  valida: urbano en >= la mitad de los años restantes hasta 2025 (50% fijo)
  (iii) al menos 1 año urbano (implícito si hubo transición)
  → propaga hacia adelante desde el primer quiebre validado (máx acumulativo)

Diferencia con v1: el onset debe ser una TRANSICIÓN 0→1 (no cualquier año
urbano), y el umbral es 50% fijo (yearsRemaining/2), no escalonado.

Exporta: urban_final_v2_breakpoint_r1_1985_2025_v2

This is the second of two alternative final consolidation methods in this
chain — see TF4umb_postmask.js for the other (v1, evidence-threshold-based,
staged thresholds).

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
  frac: 0.5,               // condición (ii): urbToEnd >= frac * yearsRemaining
  scale: 30, maxPixels: 1e13,
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

// ===== BREAKPOINT POR AÑO =====
// breakpoint(Y) = transición(Y) & (urbToEnd(Y) >= frac*yearsRemaining) & (urbToEnd(Y) >= 1)
var breakpointByYear = {};
YEARS.forEach(function(Y){
  var urbY = B.select(bn(Y));

  // (i) transición 0→1 ; 1985 (base) cuenta como onset si es urbano
  var trans;
  if (Y === START) {
    trans = urbY;                                   // año base
  } else {
    trans = urbY.and(B.select(bn(Y - 1)).not());    // urbano ahora y no-urbano antes
  }

  // urbToEnd(Y): cantidad de años urbanos de Y a END
  var bandsFrom = [];
  for (var y = Y; y <= END; y++) bandsFrom.push(bn(y));
  var urbToEnd = B.select(bandsFrom).reduce(ee.Reducer.sum());
  var yearsRemaining = END - Y + 1;

  // (ii) y (iii)
  var cond_ii  = urbToEnd.gte(config.frac * yearsRemaining);
  var cond_iii = urbToEnd.gte(1);

  breakpointByYear[Y] = trans.and(cond_ii).and(cond_iii);
});

// ===== PROPAGACIÓN HACIA ADELANTE (accumulateForward) =====
var cum = null;
var out = YEARS.map(function(year){
  var bp = breakpointByYear[year];
  cum = (cum === null) ? bp : cum.max(bp);
  return cum.multiply(URBAN).rename(bn(year));
});
var result = ee.Image.cat(out).toByte();

result = result.set({
  'collection_id':'3','version':config.output_version,'territory':'ARGENTINA',
  'theme':'Urban Area','source':'MapBiomas Argentina',
  'filter_type':'TF_breakpoint_v2',
  'input_asset':config.input_asset,
  'break_fraction':config.frac,
  'years':'1985-2025','n_bands':YEARS.length,'urban_value':URBAN,'spatial_version':'r1'
});

// ===== EXPORTAR =====
var name = 'urban_final_BP_r1_1985_2025_v2';
Export.image.toAsset({
  image: result, description: name, assetId: config.output_path + name,
  region: region, scale: config.scale, maxPixels: config.maxPixels,
  pyramidingPolicy: {'.default':'mode'}
});
print('Export enviado:', config.output_path + name);
print('BreakPoint: onset = transición 0→1 (1985 base), umbral (ii) = ' + (config.frac*100) + '% de años restantes.');
