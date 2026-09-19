/*
======================================================
### TF3 · RELLENO DE HUECOS — r1 (kernel=1)        ###
### Argentina | COLLECTION-3 | 1985-2025           ###
======================================================
Lee TF2 y aplica TF3 (relleno de huecos). AGREGA urbano.
  first [1985]:      mantener actual
  medio [1986-2024]: si prev=urb & actual=no & next=urb -> rellenar
  last  [2025]:      actual O prev (continuidad)
Exporta: urban_TF3_r1_1985_2025_v2

PREVIOUS STEP: TF2.js
NEXT STEP:     Mask.js
*/

var config = {
  // 🔁 REPLACE: TF2 output.
  input_asset:  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/FILTERS/urban_TF2_r1_1985_2025_v2',
  // 🔁 REPLACE: Update to your own GEE asset folder for the filter outputs.
  output_path:  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/FILTERS/',
  // 🔁 REPLACE: Country boundary, used only as the export region.
  pais_asset:   'projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/ARG/ARG-Political_Level_1-Pais',
  output_version: '2',
  start_year: 1985, end_year: 2025, urban_value: 24,
  scale: 30, maxPixels: 1e13,
};

var START = config.start_year, END = config.end_year, URBAN = config.urban_value;
var YEARS = []; for (var y = START; y <= END; y++) YEARS.push(y);
var bn = function(year){ return 'classification_' + year; };
var sel = function(m, year){ if (year<START||year>END) return ee.Image(0).rename(bn(year)); return m.select(bn(year)); };
var toBinary = function(img){ return ee.Image.cat(YEARS.map(function(year){ return img.select(bn(year)).eq(URBAN).rename(bn(year)); })); };
var region = ee.FeatureCollection(config.pais_asset).geometry().bounds();
var exportAsset = function(binImg, name){
  var out = binImg.multiply(URBAN).toByte().set({
    'collection_id':'3','version':config.output_version,'territory':'ARGENTINA',
    'theme':'Urban Area','source':'MapBiomas Argentina','filter_type':'TF3',
    'years':'1985-2025','n_bands':YEARS.length,'urban_value':URBAN,'spatial_version':'r1'});
  Export.image.toAsset({ image: out, description: name, assetId: config.output_path + name,
    region: region, scale: config.scale, maxPixels: config.maxPixels, pyramidingPolicy: {'.default':'mode'} });
  print('Export enviado:', config.output_path + name);
};

var applyTF3 = function(m){
  return ee.Image.cat(YEARS.map(function(year){
    var cur = sel(m, year), res;
    if (year === START) res = cur;
    else if (year < END) res = cur.max(sel(m,year-1).and(cur.not()).and(sel(m,year+1)));
    else res = cur.max(sel(m,year-1));
    return res.rename(bn(year));
  }));
};

var input = toBinary(ee.Image(config.input_asset));
var tf3 = applyTF3(input);
exportAsset(tf3, 'urban_TF3_r1_1985_2025_v2');
print('TF3 (relleno de huecos) listo. Revisar Tasks.');
