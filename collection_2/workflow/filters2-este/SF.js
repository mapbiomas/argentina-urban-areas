/*
======================================
### Filtro Espacial Urbano - Argentina ###
### Collection 3 - Imagen nacional multibanda ###
### 1985-2025 (41 bandas) ###
======================================

Input : urbano-col2-prefilter-mosaic (integración nacional, valores 24/0/27)
Output: DOS imágenes multibanda 1985-2025 con filtro espacial aplicado:
          - radius 1 (agrupa parches adyacentes)
          - radius 2 (agrupa parches más distantes)
        para comparar visualmente y elegir cuál usar como input del temporal.

El filtro espacial opera sobre la máscara binaria urbana (==24) en una sola
pasada. Orden = AGRUPAR primero, REMOVER suelto después:
  1. Cierre morfológico  (focal_max → focal_min): AGRUPA parches cercanos
  2. Relleno de huecos    (no-urbanos embebidos en urbano, < nPix → urbano)
  3. Apertura morfológica (focal_min → focal_max): suaviza bordes
  4. Remoción de ruido    (manchas urbanas aisladas <=noise_max px → no urbano)

El radio del kernel de cierre (paso 1) controla "qué tan lejos pueden estar
dos parches para considerarse el mismo grupo". noise_max (paso 4) controla el
tamaño mínimo que sobrevive DESPUÉS de agrupar.

El 27 (no observado) se preserva: reclassImage lo restaura donde el original
era 27, igual que el unmask(27) de C2.

This is the first script of an alternative post-processing chain
("filters2-este"), independent from workflow/filters/05_postprocessing_filter-*.js.
Pipeline: SF (this script) → TF1 → TF2 → TF3 → Mask → then either
TF4umb_postmask (v1) or BreakPoint (v2) as alternative final outputs.

PREVIOUS STEP: 04b-integration-mosaic.js
NEXT STEP:     TF1.js (choose ONE of the two exported radius variants as
               its input)
*/

// ===== CONFIGURACIÓN =====
var params = {
  collection_id: '3',
  output_version: '2',
  description: 'Urbano filtro espacial - Argentina Collection 3',
  territory: 'ARGENTINA',
  source: 'MAPBIOMAS ARGENTINA',
  theme: 'Urban Area',
  urban_value: 24,
  no_obs_value: 27,
  scale: 30,
  maxPixels: 1e13,
  nPix: 60,        // área urbana mínima para relleno de huecos (igual a C2)
  noise_max: 5     // componentes urbanos aislados <= 5 px → eliminar (igual a C2)
};

// Radios a exportar (un asset por cada uno)
var RADII = [1, 2];

// ===== RUTAS =====
// 🔁 REPLACE: Update to your own GEE asset folder.
var BASE = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/';
// 🔁 REPLACE: National integrated classification (workflow/04b-integration-mosaic.js output).
var input_asset = BASE + 'PREFILTER_CLASSIFICATION/urbano-col2-prefilter-mosaic';
var output_path = BASE + 'FILTERS/';

// 🔁 REPLACE: Country boundary, used only as the export region.
var pais_asset = 'projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/ARG/ARG-Political_Level_1-Pais';

// ===== AÑOS =====
var listYears = ee.List.sequence(1985, 2025, 1).getInfo();
print('Años a procesar:', listYears.length, '(' + listYears[0] + '-' + listYears[listYears.length - 1] + ')');

// ===== CARGAR IMAGEN NACIONAL =====
var integrada = ee.Image(input_asset);
print('Imagen integrada cargada. Bandas:', integrada.bandNames().size());


// ===== FILTRO ESPACIAL (sólo morfológico, radio parametrizable) =====
var applySpatialFilter = function(image, closeRadius) {
  // image: binaria 0/1 (1 = urbano); closeRadius: radio del cierre (paso 1)
  var closeKernel = ee.Kernel.circle({radius: closeRadius});
  var openKernel  = ee.Kernel.circle({radius: 1}); // apertura siempre suave (=1)

  // 1. Cierre morfológico → AGRUPA parches cercanos (radio = closeRadius)
  image = image.unmask(0)
    .focal_max({iterations: 1, kernel: closeKernel})
    .focal_min({iterations: 1, kernel: closeKernel});

  // 2. Relleno de huecos (no-urbano rodeado de urbano, área < nPix → urbano)
  var image_pixelcount_inverted = image.remap([0, 1], [1, 0])
    .selfMask()
    .connectedPixelCount(params.nPix, true);

  image = image.where(image_pixelcount_inverted.lt(params.nPix), 1)
    .reproject({crs: 'EPSG:4326', scale: params.scale});

  // 3. Apertura morfológica (suavizar bordes)
  image = image.focal_min({iterations: 1, kernel: openKernel})
    .focal_max({iterations: 1, kernel: openKernel});

  // 4. Remoción de ruido → REMUEVE lo que quedó suelto tras agrupar
  var image_pixel_count = image.selfMask().connectedPixelCount();
  image = image.where(image_pixel_count.lte(params.noise_max), 0)
    .reproject({crs: 'EPSG:4326', scale: params.scale});

  return image;
};


// ===== RECLASIFICACIÓN (binario → 24/0/27, preservando no observado) =====
var reclassImage = function(image_original, image_filtered) {
  // image_original: 24/0/27 ; image_filtered: 0/1
  image_original = image_original.unmask(params.no_obs_value);
  var image_24 = image_filtered.remap([0, 1], [0, params.urban_value]);
  // donde el original era 27 (no observado) → restaurar 27
  var image = image_24.where(image_original.eq(params.no_obs_value), params.no_obs_value);
  return image;
};


// ===== PROCESAMIENTO BANDA A BANDA (para un radio dado) =====
var processYear = function(year, closeRadius) {
  var band = 'classification_' + year;
  var original = integrada.select(band);                 // 24/0/27
  var urbanBin = original.eq(params.urban_value).unmask(0); // 1 urbano, 0 resto
  var filtered = applySpatialFilter(urbanBin, closeRadius);
  return reclassImage(original, filtered).rename(band).toByte();
};

var buildImage = function(closeRadius) {
  var im = ee.Image([]);
  listYears.forEach(function(year) {
    im = im.addBands(processYear(year, closeRadius));
  });
  return im.set({
    'collection_id': params.collection_id,
    'version': params.output_version,
    'territory': params.territory,
    'theme': params.theme,
    'source': params.source,
    'filter_type': 'spatial_filter',
    'description': params.description,
    'years': '1985-2025',
    'n_bands': listYears.length,
    'close_radius': closeRadius,
    'min_urban_area_px': params.nPix,
    'noise_removal_px': params.noise_max,
    'urban_value': params.urban_value,
    'no_obs_value': params.no_obs_value,
    'system:time_start': ee.Date.fromYMD(listYears[0], 1, 1).millis(),
    'system:time_end': ee.Date.fromYMD(listYears[listYears.length - 1], 12, 31).millis()
  });
};


// ===== REGIÓN DE EXPORTACIÓN =====
var region = ee.FeatureCollection(pais_asset).geometry().bounds();


// ===== EXPORT POR CADA RADIO =====
RADII.forEach(function(r) {
  var im_out = buildImage(r);
  var output_name = 'urban_spatial_filter_r' + r + '_1985_2025_v' + params.output_version;

  Export.image.toAsset({
    image: im_out,
    description: output_name,
    // 🔁 REPLACE: Update to your own GEE asset folder (see `output_path`
    // above).
    assetId: output_path + output_name,
    region: region,
    scale: params.scale,
    maxPixels: params.maxPixels,
    pyramidingPolicy: {'.default': 'mode'}
  });

  print('Export enviado (radius ' + r + '):', output_path + output_name);
});
