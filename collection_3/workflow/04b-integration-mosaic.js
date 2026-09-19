/*
=============================================================================
URBANO Col2 | Workflow 04b (variant: MOSAIC) — National Integration
### Integración Urbana - Argentina ###
Colección: 3  |  Serie temporal: 1985-2025 (41 años)
Estrategia Pampa: MOSAIC (primer dato válido por orden de lista)

Combina las clasificaciones prefilter de cada ecorregión en una única imagen
multi-banda que cubre todo el territorio nacional.

Para Pampa (3 partes): se enmascaran valores 27 (no observado) y luego se
aplica .mosaic() → gana la primera imagen con dato válido (0 o 24).

Reglas de prioridad (FUNCIONA > SOBRE):
  - Altos Andes    > Estepa
  - Chaco Húmedo   > Delta                          [exc. Formosa  → Delta > Chaco Húmedo]
  - Chaco Seco     > Chaco Húmedo
  - Chaco Seco     > Yungas                         [exc. Salta    → Yungas > Chaco Seco]
  - Chaco Seco     > Espinal
  - Espinal        > Delta
  - Estepa         > Bosques Patagónicos             [exc. Bariloche → Bosques > Estepa]
  - Estepa         > Monte de Llanuras y Mesetas
  - Monte LyM      > Monte de Sierras y Bolsones
  - Monte SyB      > Puna                           [exc. Jachal   → Puna > Monte SyB]
  - Monte SyB      > Yungas
  - Pampa          > Espinal

Las reglas se aplican de menor a mayor prioridad del FUNCIONA: así, si hay
cadenas (C > A > B), la última regla en aplicarse (la más alta) prevalece
sobre cualquier valor previo en la zona de triple superposición.

Valores: 24 = urbano, 0 = no urbano, 27 = no observado (excluido del mosaic)
=============================================================================

DESCRIPTION:
  Merges the 16 per-ecoregion binary classifications (workflow/04 output,
  Pampa split into 3 parts) into one national multi-band image, resolving
  ecoregion-boundary overlaps with the same explicit priority table as
  workflow/04b-integration-max.js, but combining Pampa's 3 parts with
  `.mosaic()` — the first part (in list order) with a valid value wins,
  rather than urban always winning.

INPUT:
  - Per-ecoregion binary classification images (workflow/04 output),
    including the 3 Pampa parts.
  - City polygons used for the 4 priority-rule exceptions (Bariloche,
    Jachal, Formosa, Salta).
  - Country boundary (used only as the export region).

OUTPUT:
  - National multi-year binary classification, one `classification_<year>`
    band per year (1985-2025). Exported as `urbano-col2-prefilter-mosaic`.

PREVIOUS STEP: 04-classification_ecoregion_export.js (produces the
               per-ecoregion classifications merged here)
NEXT STEP:     none documented in this repository beyond this point
=============================================================================
*/


// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

// 🔁 REPLACE: Update to your own GEE asset folders.
var input_path   = "projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/PREFILTER_CLASSIFICATION";
var output_path  = "projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/PREFILTER_CLASSIFICATION";
var output_name  = "urbano-col2-prefilter-mosaic";
// 🔁 REPLACE: City polygons used for the priority-rule exceptions.
var cities_asset = "projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/ciudades-superposicion";
// 🔁 REPLACE: Country boundary, used only as the export region.
var pais_asset   = "projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/ARG/ARG-Political_Level_1-Pais";

var escala = 30;
var years  = ee.List.sequence(1985, 2025, 1).getInfo();

print("output:", output_path + "/" + output_name);


// ─── CARGAR IMÁGENES POR ECORREGIÓN ───────────────────────────────────────────

var lp = input_path + '/';

// Enmascara el valor 27 (no observado) de todas las bandas de una imagen
var mask27 = function(img) { return img.updateMask(img.neq(27)); };

var img_altosandes = mask27(ee.Image(lp + 'prefilter-urban-altos-andes'));
var img_bosquesP   = mask27(ee.Image(lp + 'prefilter-urban-bosquespatagonicos'));
var img_caymale    = mask27(ee.Image(lp + 'prefilter-urban-camposymalezales'));
var img_chacoH     = mask27(ee.Image(lp + 'prefilter-urban-chacohumedo'));
var img_chacoS     = mask27(ee.Image(lp + 'prefilter-urban-chacoseco'));
var img_delta      = mask27(ee.Image(lp + 'prefilter-urban-delta'));
var img_espinal    = mask27(ee.Image(lp + 'prefilter-urban-espinal'));
var img_estepa     = mask27(ee.Image(lp + 'prefilter-urban-estepa'));
var img_esteros    = mask27(ee.Image(lp + 'prefilter-urban-esteros'));
var img_islasA     = mask27(ee.Image(lp + 'prefilter-urban-islasdelatlanticosur'));
var img_monteLyM   = mask27(ee.Image(lp + 'prefilter-urban-montellanurasymesetas'));
var img_monteSyB   = mask27(ee.Image(lp + 'prefilter-urban-montesierrasbolsones'));
var img_puna       = mask27(ee.Image(lp + 'prefilter-urban-puna'));
var img_selvaP     = mask27(ee.Image(lp + 'prefilter-urban-selva-paranaense'));
var img_yungas     = mask27(ee.Image(lp + 'prefilter-urban-yungas'));

// Pampa: combina las 3 partes con mosaic()
// En zonas de overlap entre partes, gana la primera con dato válido (0 o 24).
var img_pampa = ee.ImageCollection([
  mask27(ee.Image(lp + 'prefilter-urban-pampa1')),
  mask27(ee.Image(lp + 'prefilter-urban-pampa2')),
  mask27(ee.Image(lp + 'prefilter-urban-pampa3')),
]).mosaic();


// ─── MÁSCARAS DE CIUDADES CON EXCEPCIÓN ───────────────────────────────────────

var cities = ee.FeatureCollection(cities_asset);

// Crea imagen 1 dentro del polígono de la ciudad, 0 fuera
var cityMask = function(cityName) {
  return ee.Image().paint(
    cities.filter(ee.Filter.eq('LEVEL_2', cityName)), 1
  ).unmask(0);
};

var maskBariloche = cityMask('Bariloche');
var maskJachal    = cityMask('Jachal');
var maskFormosa   = cityMask('Formosa');
var maskSalta     = cityMask('Salta');


// ─── FUNCIÓN DE REGLA DE PRIORIDAD ────────────────────────────────────────────

// En la superposición espacial entre imgFunciona e imgSobre:
//   → resultado = valor de imgFunciona (el FUNCIONA siempre tapa)
//   → dentro de exceptMask: resultado = valor de imgSobre (regla invertida)
// Pasar null en exceptMask si no hay excepción.
var applyRule = function(base, imgFunciona, imgSobre, exceptMask) {
  var overlap = imgFunciona.mask().and(imgSobre.mask());
  var result  = base.where(overlap, imgFunciona);
  if (exceptMask !== null) {
    result = result.where(overlap.and(exceptMask), imgSobre);
  }
  return result;
};


// ─── INTEGRACIÓN AÑO A AÑO ────────────────────────────────────────────────────

var im_out = ee.Image([]);

years.forEach(function(year) {
  var band = 'classification_' + year;

  var altosandes = img_altosandes.select(band);
  var bosquesP   = img_bosquesP.select(band);
  var caymale    = img_caymale.select(band);
  var chacoH     = img_chacoH.select(band);
  var chacoS     = img_chacoS.select(band);
  var delta      = img_delta.select(band);
  var espinal    = img_espinal.select(band);
  var estepa     = img_estepa.select(band);
  var esteros    = img_esteros.select(band);
  var islasA     = img_islasA.select(band);
  var monteLyM   = img_monteLyM.select(band);
  var monteSyB   = img_monteSyB.select(band);
  var pampa      = img_pampa.select(band);
  var puna       = img_puna.select(band);
  var selvaP     = img_selvaP.select(band);
  var yungas     = img_yungas.select(band);

  // ── Paso 1: mosaico base (cubre todo el territorio sin reglas de prioridad) ──
  // Las superposiciones no cubiertas por la tabla quedan con el primer dato válido.
  var base = ee.ImageCollection([
    altosandes, bosquesP, caymale, chacoH, chacoS, delta,
    espinal, estepa, esteros, islasA, monteLyM, monteSyB,
    pampa, puna, selvaP, yungas
  ]).mosaic();

  // ── Paso 2: reglas de prioridad ───────────────────────────────────────────────
  // Orden: de MENOR a MAYOR prioridad del FUNCIONA.

  // — Reglas sobre Delta (nodo más bajo de su cadena) —
  base = applyRule(base, chacoH,     delta,    maskFormosa);   // Chaco Húmedo > Delta  [exc. Formosa]
  base = applyRule(base, espinal,    delta,    null);          // Espinal > Delta

  // — Reglas sobre Yungas y Puna —
  base = applyRule(base, monteSyB,   yungas,   null);          // Monte SyB > Yungas
  base = applyRule(base, monteSyB,   puna,     maskJachal);    // Monte SyB > Puna      [exc. Jachal]

  // — Reglas sobre Monte SyB —
  base = applyRule(base, monteLyM,   monteSyB, null);          // Monte LyM > Monte SyB

  // — Reglas sobre Bosques Patagónicos y Monte LyM —
  base = applyRule(base, estepa,     bosquesP, maskBariloche); // Estepa > Bosques P.   [exc. Bariloche]
  base = applyRule(base, estepa,     monteLyM, null);          // Estepa > Monte LyM

  // — Reglas sobre Espinal —
  base = applyRule(base, pampa,      espinal,  null);          // Pampa > Espinal

  // — Chaco Seco (alta prioridad, se aplica al final para prevalecer) —
  base = applyRule(base, chacoS,     yungas,   maskSalta);     // Chaco Seco > Yungas   [exc. Salta]
  base = applyRule(base, chacoS,     espinal,  null);          // Chaco Seco > Espinal
  base = applyRule(base, chacoS,     chacoH,   null);          // Chaco Seco > Chaco Húmedo

  // — Altos Andes (el más alto de su cadena, se aplica al final) —
  base = applyRule(base, altosandes, estepa,   null);          // Altos Andes > Estepa

  im_out = im_out.addBands(base.rename(band));
});


// ─── METADATOS ────────────────────────────────────────────────────────────────

im_out = im_out
  .set('collection_version', 'Col3')
  .set('product',    'urban-integration-prefilter')
  .set('strategy',   'pampa-mosaic')
  .set('years',      '1985-2025')
  .set('n_bands',    41)
  .set('description','Integración prefilter urbano - Argentina - 1985/2025 - Pampa: mosaic (mask27)');

print('Bandas:', im_out.bandNames());


// ─── EXPORTACIÓN ─────────────────────────────────────────────────────────────

var region = ee.FeatureCollection(pais_asset).geometry().bounds();

Export.image.toAsset({
  image:            im_out,
  description:      output_name,
  // 🔁 REPLACE: Update to your own GEE asset folder (see `output_path`
  // above).
  assetId:          output_path + '/' + output_name,
  region:           region,
  scale:            escala,
  maxPixels:        100000000000,
  pyramidingPolicy: {'.default': 'mode'},
});
