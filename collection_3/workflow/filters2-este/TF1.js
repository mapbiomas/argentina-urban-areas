/*
======================================================
### TF1 · CONSISTENCIA — r1 (kernel=1)             ###
### Argentina | COLLECTION-3 | 1985-2025           ###
======================================================
Lee el filtro espacial r1 y aplica TF1 (consistencia). REMUEVE urbano.
  first [1985,1986]: cur + 2 futuros, >=2/3
  last  [2024,2025]: 2 pasados + cur, >=2/3
  medio [1987-2023]: 2 pasados + cur + 2 futuros, >=3/5
Exporta: urban_TF1_r1_1985_2025_v2

PREVIOUS STEP: SF.js (pick the radius-1 or radius-2 export as input)
NEXT STEP:     TF2.js
*/

var config = {
  // 🔁 REPLACE: Spatial filter output (SF.js), radius-1 variant.
  input_asset:  'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/FILTERS/urban_spatial_filter_r1_1985_2025_v2',
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
    'theme':'Urban Area','source':'MapBiomas Argentina','filter_type':'TF1',
    'years':'1985-2025','n_bands':YEARS.length,'urban_value':URBAN,'spatial_version':'r1'});
  Export.image.toAsset({ image: out, description: name, assetId: config.output_path + name,
    region: region, scale: config.scale, maxPixels: config.maxPixels, pyramidingPolicy: {'.default':'mode'} });
  print('Export enviado:', config.output_path + name);
};

var applyTF1 = function(m){
  return ee.Image.cat(YEARS.map(function(year){
    var cur = sel(m, year), pass;
    if (year <= START + 1) pass = cur.add(sel(m,year+1)).add(sel(m,year+2)).gte(2);
    else if (year >= END - 1) pass = sel(m,year-2).add(sel(m,year-1)).add(cur).gte(2);
    else pass = sel(m,year-2).add(sel(m,year-1)).add(cur).add(sel(m,year+1)).add(sel(m,year+2)).gte(3);
    return pass.multiply(cur).rename(bn(year));
  }));
};

var input = toBinary(ee.Image(config.input_asset));
var tf1 = applyTF1(input);
exportAsset(tf1, 'urban_TF1_r1_1985_2025_v2');
print('TF1 (consistencia) listo. Revisar Tasks.');
