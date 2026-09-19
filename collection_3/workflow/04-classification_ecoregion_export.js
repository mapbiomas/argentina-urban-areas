// ============================================================
// URBANO Col2 | Workflow 04 — Binary Urban Classification Export (per ecoregion)
// EXPORT DE CLASIFICACIÓN URBANA BINARIA
// Una imagen por ecorregión, 41 bandas (1985-2025)
// ============================================================
//
// DESCRIPTION:
//   Thresholds the harmonized probability series (workflow/03 output)
//   into a binary urban/non-urban classification, per ecoregion and per
//   calibration period, using pre-computed per-ecoregion/per-period
//   thresholds (ROC-optimal or a fixed percentile criterion, chosen per
//   ecoregion/period in `CRITERIO_ELEGIDO`).
//
// INPUT:
//   - Harmonized probability image per ecoregion (workflow/03 output).
//   - Ecoregions FeatureCollection.
//
// OUTPUT:
//   - Per-ecoregion binary classification image, one
//     `classification_<year>` band per year (1985-2025): 24 = urbano,
//     0 = no urbano, 27 = sin datos. Exported as
//     `PREFILTER_URBAN_<ecoSlug>`.
//
// PREVIOUS STEP: 03-harmonized_probabilities.js (produces the harmonized
//                probability series thresholded here)
// NEXT STEP:     04b-integration-max.js / 04b-integration-mosaic.js
//                (merge the per-ecoregion exports produced here into one
//                national image)
// ============================================================

// ---------- 1. PARÁMETROS ----------
// 🔁 REPLACE: Update to your own GEE asset folder.
var BASE_PATH = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/';
// 🔁 REPLACE: Ecoregions vector (18-ecoregion 2026 revision).
var PATH_ECOREGIONES = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/2026-ARG-Ecorregion18_3857';
var HARMONIZED_PROBA_ASSET = BASE_PATH + 'CLASSIFICATION/HARMONIZED_CLASSIFICATION/HARMONIZED_PROBA_';

// Carpeta destino de los assets exportados
var EXPORT_FOLDER = BASE_PATH + 'CLASSIFICATION/PREFILTER_CLASSIFICATION/';

var YEARS = [];
for (var y = 1985; y <= 2025; y++) YEARS.push(y);


// ---------- 2. SLUG ----------
function ecoToSlug(name) {
  var slug = '';
  for (var i = 0; i < name.length; i++) {
    var c = name.charAt(i);
    var code = name.charCodeAt(i);
    if (c === ' ') slug += '_';
    else if (code < 128) slug += c;
    else slug += '_';
  }
  return slug.replace(/_+/g, '_');
}


// ---------- 3. UMBRALES (todos los criterios calculados) ----------
var UMBRALES_POR_PERIODO = {
  'Espinal': {
    '1985-2004': {roc: 39.75, p15: 46.50, p10: 39.61, p7_5: 35.96},
    '2005-2019': {roc: 35.73, p15: 55.60, p10: 43.35, p7_5: 35.66},
    '2020-2024': {roc: 42.33, p15: 67.17, p10: 56.35, p7_5: 49.11}
  },
  'Pampa1': {
    '1985-2004': {roc: 25.75, p15: 28.57, p10: 22.88, p7_5: 19.69},
    '2005-2019': {roc: 26.13, p15: 40.96, p10: 30.16, p7_5: 24.52},
    '2020-2024': {roc: 39.33, p15: 56.37, p10: 44.97, p7_5: 37.10}
  },
  'Pampa2': {
    '1985-2004': {roc: 40.40, p15: 50.59, p10: 38.33, p7_5: 31.95},
    '2005-2019': {roc: 32.13, p15: 63.73, p10: 50.69, p7_5: 41.70},
    '2020-2024': {roc: 38.67, p15: 73.17, p10: 61.50, p7_5: 53.67}
  },
  'Pampa3': {
    '1985-2004': {roc: 41.85, p15: 46.55, p10: 40.23, p7_5: 36.29},
    '2005-2019': {roc: 50.60, p15: 62.94, p10: 55.08, p7_5: 49.48},
    '2020-2024': {roc: 48.33, p15: 60.98, p10: 53.60, p7_5: 48.41}
  },
  'Puna': {
    '1985-2004': {roc: 15.15, p15: 8.42,  p10: 6.43,  p7_5: 4.69},
    '2005-2019': {roc: 23.73, p15: 18.23, p10: 13.87, p7_5: 11.38},
    '2020-2024': {roc: 36.17, p15: 35.28, p10: 28.55, p7_5: 23.08}
  },
  'Campos y Malezales': {
    '1985-2004': {roc: 30.35, p15: 39.32, p10: 32.75, p7_5: 29.95},
    '2005-2019': {roc: 45.67, p15: 67.06, p10: 57.93, p7_5: 51.85},
    '2020-2024': {roc: 37.00, p15: 65.88, p10: 53.55, p7_5: 49.18}
  },
  'Altos Andes': {
    '1985-2004': {roc: 47.60, p15: 42.64, p10: 39.17, p7_5: 37.61},
    '2005-2019': {roc: 48.93, p15: 53.52, p10: 49.87, p7_5: 47.43},
    '2020-2024': {roc: 50.67, p15: 52.38, p10: 51.50, p7_5: 50.85}
  },
  'Chaco Seco': {
    '1985-2004': {roc: 27.90, p15: 28.50, p10: 22.41, p7_5: 19.20},
    '2005-2019': {roc: 25.00, p15: 29.75, p10: 21.80, p7_5: 17.88},
    '2020-2024': {roc: 23.50, p15: 34.33, p10: 26.33, p7_5: 22.01}
  },
  'Monte de Llanuras y Mesetas': {
    '1985-2004': {roc: 40.60, p15: 41.85, p10: 36.00, p7_5: 32.60},
    '2005-2019': {roc: 44.00, p15: 52.20, p10: 41.82, p7_5: 35.50},
    '2020-2024': {roc: 41.67, p15: 52.33, p10: 44.67, p7_5: 39.83}
  },
  'Monte de Sierras y Bolsones': {
    '1985-2004': {roc: 28.45, p15: 24.77, p10: 21.05, p7_5: 19.16},
    '2005-2019': {roc: 34.80, p15: 24.10, p10: 18.90, p7_5: 16.25},
    '2020-2024': {roc: 43.17, p15: 45.71, p10: 40.92, p7_5: 38.04}
  },
  'Selva Paranense': {
    '1985-2004': {roc: 28.95, p15: 26.54, p10: 20.82, p7_5: 17.72},
    '2005-2019': {roc: 26.47, p15: 25.63, p10: 19.57, p7_5: 15.86},
    '2020-2024': {roc: 46.00, p15: 61.33, p10: 49.58, p7_5: 44.92}
  },
  'Yungas': {
    '1985-2004': {roc: 24.90, p15: 22.71, p10: 18.36, p7_5: 16.16},
    '2005-2019': {roc: 19.73, p15: 26.46, p10: 18.83, p7_5: 15.49},
    '2020-2024': {roc: 37.33, p15: 55.00, p10: 41.90, p7_5: 35.45}
  },
  'Bosques Patagónicos': {
    '1985-2004': {roc: 21.75, p15: 34.23, p10: 25.94, p7_5: 22.00},
    '2005-2019': {roc: 34.93, p15: 43.75, p10: 38.20, p7_5: 33.64},
    '2020-2024': {roc: 30.33, p15: 46.91, p10: 40.07, p7_5: 35.02}
  },
  'Chaco Húmedo': {
    '1985-2004': {roc: 25.40, p15: 24.61, p10: 19.19, p7_5: 16.32},
    '2005-2019': {roc: 23.40, p15: 26.61, p10: 17.43, p7_5: 12.50},
    '2020-2024': {roc: 22.67, p15: 29.18, p10: 18.02, p7_5: 12.76}
  },
  'Delta e Islas del Paraná': {
    '1985-2004': {roc: 30.95, p15: 49.42, p10: 42.33, p7_5: 38.48},
    '2005-2019': {roc: 21.33, p15: 52.98, p10: 39.65, p7_5: 32.68},
    '2020-2024': {roc: 44.83, p15: 77.67, p10: 68.83, p7_5: 62.59}
  },
  'Estepa Patagónica': {
    '1985-2004': {roc: 37.20, p15: 36.13, p10: 30.53, p7_5: 27.04},
    '2005-2019': {roc: 35.87, p15: 42.44, p10: 37.36, p7_5: 34.61},
    '2020-2024': {roc: 51.83, p15: 57.85, p10: 51.73, p7_5: 47.00}
  },
  'Esteros del Iberá': {
    '1985-2004': {roc: 34.35, p15: 36.08, p10: 30.78, p7_5: 27.63},
    '2005-2019': {roc: 36.93, p15: 39.17, p10: 33.75, p7_5: 31.52},
    '2020-2024': {roc: 44.17, p15: 54.88, p10: 48.53, p7_5: 46.98}
  },
  'Islas del Atlántico Sur': {
    '1985-2004': {roc: 80.85, p15: 81.42, p10: 75.67, p7_5: 74.67},
    '2005-2019': {roc: 58.53, p15: 61.97, p10: 57.51, p7_5: 54.85},
    '2020-2024': {roc: 44.33, p15: 51.57, p10: 46.47, p7_5: 44.42}
  }
};


// ---------- 4. CRITERIO ELEGIDO POR ECORREGIÓN Y PERÍODO ----------
// 'roc' o 'p15' = se busca en UMBRALES_POR_PERIODO.
// Número (ej. 71.4) = umbral fijo manual (caso especial: Islas del Atlántico Sur).
var CRITERIO_ELEGIDO = {
  'Altos Andes':                  {'1985-2004': 'roc', '2005-2019': 'p15', '2020-2024': 'p15'},
  'Bosques Patagónicos':          {'1985-2004': 'p15', '2005-2019': 'p15', '2020-2024': 'p15'},
  'Campos y Malezales':           {'1985-2004': 'p15', '2005-2019': 'p15', '2020-2024': 'p15'},
  'Chaco Húmedo':                 {'1985-2004': 'roc', '2005-2019': 'roc', '2020-2024': 'roc'},
  'Chaco Seco':                   {'1985-2004': 'roc', '2005-2019': 'roc', '2020-2024': 'roc'},
  'Delta e Islas del Paraná':     {'1985-2004': 'p15', '2005-2019': 'roc', '2020-2024': 'roc'},
  'Espinal':                      {'1985-2004': 'p15', '2005-2019': 'p15', '2020-2024': 'p15'},
  'Estepa Patagónica':            {'1985-2004': 'roc', '2005-2019': 'p15', '2020-2024': 'p15'},
  'Esteros del Iberá':            {'1985-2004': 'p15', '2005-2019': 'p15', '2020-2024': 'p15'},
  'Monte de Llanuras y Mesetas':  {'1985-2004': 'p15', '2005-2019': 'p15', '2020-2024': 'roc'},
  'Monte de Sierras y Bolsones':  {'1985-2004': 'roc', '2005-2019': 'roc', '2020-2024': 'p15'},
  'Pampa1':                       {'1985-2004': 'p15', '2005-2019': 'p15', '2020-2024': 'roc'},
  'Pampa2':                       {'1985-2004': 'roc', '2005-2019': 'roc', '2020-2024': 'roc'},   // AMBA en tabla
  'Pampa3':                       {'1985-2004': 'p15', '2005-2019': 'p15', '2020-2024': 'p15'},
  'Puna':                         {'1985-2004': 'roc', '2005-2019': 'roc', '2020-2024': 'roc'},
  'Selva Paranense':              {'1985-2004': 'roc', '2005-2019': 'p15', '2020-2024': 'p15'},
  'Yungas':                       {'1985-2004': 'roc', '2005-2019': 'p15', '2020-2024': 'roc'},
  'Islas del Atlántico Sur':      {'1985-2004': 71.4,  '2005-2019': 'p15', '2020-2024': 37.47}    // valores manuales
};


// ---------- 5. HELPERS ----------
function getPeriodo(year) {
  if (year >= 1985 && year <= 2004) return '1985-2004';
  if (year >= 2005 && year <= 2019) return '2005-2019';
  if (year >= 2020 && year <= 2025) return '2020-2024';  // 2025 usa el último período
  return null;
}

function getUmbralFinal(ecoName, year) {
  var periodo = getPeriodo(year);
  if (!periodo) return null;

  var criterio = CRITERIO_ELEGIDO[ecoName] && CRITERIO_ELEGIDO[ecoName][periodo];
  if (criterio === undefined || criterio === null) return null;

  // Si el criterio es un número, es un umbral fijo manual (caso Islas)
  if (typeof criterio === 'number') return criterio;

  // Si es string ('roc' o 'p15'), lo busco en la tabla de umbrales
  var umbrales = UMBRALES_POR_PERIODO[ecoName] && UMBRALES_POR_PERIODO[ecoName][periodo];
  if (!umbrales) return null;
  return umbrales[criterio];
}


// ---------- 6. CONSTRUCCIÓN DE IMAGEN BINARIA POR ECORREGIÓN ----------
function buildBinaryImage(ecoName) {
  var ecoSlug = ecoToSlug(ecoName);
  var probImg = ee.Image(HARMONIZED_PROBA_ASSET + ecoSlug).toFloat();
  var geom = ee.FeatureCollection(PATH_ECOREGIONES)
    .filter(ee.Filter.eq('LEVEL_2', ecoName))
    .geometry();

  // Para cada año, binarizo con su umbral
  var bands = YEARS.map(function(year) {
    var bandName = 'classification_' + year;
    var th = getUmbralFinal(ecoName, year);
    if (th === null) {
      print('⚠️ Sin umbral para', ecoName, year);
      return null;
    }
   // Reclasificación MapBiomas:
    // 24 = urbano, 0 = no urbano, 27 = no observado (sin datos)
    var probBand = probImg.select([bandName]);
    var binary = probBand.gte(th);

    return binary
      .multiply(24)                  // urbano (1) → 24, no urbano (0) → 0
      .updateMask(probBand.mask())   // mantiene la máscara original de la proba
      .unmask(27)                    // sin datos → 27
      .rename([bandName])
      .toUint8();
      }).filter(function(b) { return b !== null; });

  // Combino todas las bandas en una sola imagen multibanda
  var multi = ee.Image.cat(bands)

  // Metadata útil
  multi = multi.set({
    'ecoregion': ecoName,
    'n_bands': bands.length,
    'year_start': YEARS[0],
    'year_end': YEARS[YEARS.length - 1],
    'system:time_start': ee.Date.fromYMD(YEARS[0], 1, 1).millis()
  });

  return {image: multi, geom: geom, slug: ecoSlug};
}


// ---------- 7. EXPORT ----------
function exportEcorregion(ecoName) {
  var result = buildBinaryImage(ecoName);
  var slug = result.slug;
  var taskName = 'PREFILTER_URBAN_' + slug;
  // 🔁 REPLACE: Update to your own GEE asset folder (see `EXPORT_FOLDER`
  // above).
  var assetId = EXPORT_FOLDER + 'PREFILTER_URBAN_' + slug;

  Export.image.toAsset({
    image: result.image,
    description: taskName,
    assetId: assetId,
    region: result.geom,
    scale: 30,
    crs: 'EPSG:4326',
    maxPixels: 1e13,
    pyramidingPolicy: {'.default': 'mode'}
  });

  print('Export creada:', taskName, '→', assetId);
}


// ---------- 8. EJECUTAR ----------
// Opción A: exportar UNA sola ecorregión (para probar)
//exportEcorregion('Espinal');

// Opción B: exportar TODAS (descomentar cuando estés seguro)

var ECOS = Object.keys(UMBRALES_POR_PERIODO);
ECOS.forEach(function(eco) {
  exportEcorregion(eco);
});
