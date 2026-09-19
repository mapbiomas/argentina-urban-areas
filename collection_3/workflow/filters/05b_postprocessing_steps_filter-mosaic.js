/*
=============================================================================
URBANO Col2 | Workflow 05b — Post-processing Filters (step-by-step exports)
### Post-processing Filters - Argentina ###
Colección: 3  |  Serie temporal: 1985-2025 (41 años)
Input: urbano-col2-prefilter-mosaic (imagen integrada, estrategia mosaic)

DIFERENCIAS CON EL SCRIPT POR ECORREGIÓN:
  - Input: única imagen integrada de todo el país (no loop por ecorregión)
  - Export: imagen única multibanda para todo el territorio nacional

PIPELINE:
  Input → ee.Image con bandas classification_1985...classification_2025
  B. TF 5yearsUnique   → Elimina píxeles urbanos que aparecen solo 1 de 5 años (2025 excluido)
  C. TF BreakPoint     → Detecta inicio real de urbanización y propaga hacia adelante (hasta 2025)
  D. Filtro Espacial   → Rellena huecos intraurbanos (<280px) + elimina ruido aislado (<44px)
  Output → ee.Image con bandas classification_1985...classification_2025 (valores 24/0)
=============================================================================

DESCRIPTION:
  Step-by-step / diagnostic variant of workflow/filters/05_postprocessing_filter-mosaic.js:
  no Paso A (GapFill — not needed here, see the note in SECTION "CONSTRUCCIÓN
  DE imCol_input" below), and it exports the intermediate result after EACH
  step (B, C, D) instead of only the final one, for QA.

  The original script also included a "Paso E — CheckTrans" diagnostic
  (counts urban↔non-urban transitions per pixel to sanity-check temporal
  stability) and a per-year, per-step visual comparison — both purely
  interactive Code Editor visualizations with no effect on the exported
  assets, removed here along with a large fully-commented-out
  click-to-chart tool.

INPUT:  National integrated classification
        (workflow/04b-integration-mosaic.js output).
OUTPUT: Three intermediate/final national classifications, exported as
        `urban-col2-B-TF5yearsUnique`, `urban-col2-C-TFbreakPoint`, and
        `urban-col2-D-SF` (the final, filtered product).

PREVIOUS STEP: 04b-integration-mosaic.js
NEXT STEP:     none documented in this repository beyond this point
=============================================================================
*/


// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

// 🔁 REPLACE: National integrated classification (workflow/04b-integration-mosaic.js output).
var input_path    = "projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/PREFILTER_CLASSIFICATION/urbano-col2-prefilter-mosaic";
// 🔁 REPLACE: Update to your own GEE asset folder for the filtered outputs.
var output_folder = "projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/FILTERS";
// 🔁 REPLACE: Country boundary, used only as the export region.
var pais_asset    = "projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/ARG/ARG-Political_Level_1-Pais";

var thres_SF_hole  = 280;
var thres_SF_noise = 44;
var escala = 30;

print("input:",  input_path);
print("output:", output_folder);

var description = "urban-col2-filter-mosaic | B-TF5yearsUnique(2025 excl) + C-TFbreakPoint(finalYear=2025) + D-SF(holes<" + thres_SF_hole + "px + noise<" + thres_SF_noise + "px, eightConnected=false)";


// ─── CARGAR IMAGEN INTEGRADA ──────────────────────────────────────────────────

var im_in = ee.Image(input_path);


// ─── CONVERSIÓN A SISTEMA INTERNO ────────────────────────────────────────────
// im_binary: 24→1, 0→0, masked(ex-27)→0  (unmask(0) trata los ex-27 como no urbano)
// im_valid:  footprint del asset integrado (para enmascarar fuera de ecorregiones)

var im_binary = im_in.eq(24).unmask(0);          // 24→1, 0 y ex-27→0
var im_valid  = im_in.gte(0).unmask(0);          // 1 donde había dato válido (0 o 24)


// ─── LISTAS DE AÑOS ───────────────────────────────────────────────────────────

var years          = ee.List.sequence(1985, 2025, 1).getInfo();
var years_excl2025 = ee.List.sequence(1985, 2024, 1).getInfo();
var years_excl1985 = ee.List.sequence(1986, 2025, 1).getInfo();


// ─── CONSTRUCCIÓN DE imCol_input ──────────────────────────────────────────────
// Sistema interno: 0 = no urbano | 1 = urbano

var imCol_input = ee.ImageCollection.fromImages(
  years.map(function(year) {
    var bandName = "classification_" + year;
    var im_year  = im_binary.select(bandName).rename("classification");

    // NOTA: NO se enmascara aquí (como en Brasil). El pipeline corre sobre una
    // colección 0/1 totalmente desenmascarada para que los filtros temporales
    // (especialmente las transiciones del Paso C) no se rompan junto a noData.
    // La máscara territorial (im_valid) se aplica recién en la exportación.

    return im_year
      .set('year', year)
      .set('system:time_start', ee.Date.fromYMD(year, 8, 1).millis());
  })
);


// ─── FUNCIONES AUXILIARES ─────────────────────────────────────────────────────

var exp = function(IM, DESC, ID, REG, SC) {
  Export.image.toAsset({
    image:            IM,
    description:      DESC,
    assetId:          ID,
    region:           REG,
    scale:            SC,
    maxPixels:        100000000000,
    pyramidingPolicy: {'.default': 'mode'},
  });
};


// ─── FUNCIONES DE FILTROS ─────────────────────────────────────────────────────

// ── Paso B: TF 5yearsUnique ───────────────────────────────────────────────────
var TempFilter_wMask_5yearsunique = function(LIST_YEARS, VAL1, VAL2, VAL3, VAL4, COL_IN) {
  var col_out = COL_IN.filter(ee.Filter.inList('year', LIST_YEARS).not());
  var col_years = LIST_YEARS.map(function(year) {
    var im_year = COL_IN.filter(ee.Filter.eq('year', year)).first();
    var im_years_sum = ee.ImageCollection(ee.List([
      im_year,
      COL_IN.filter(ee.Filter.eq('year', ee.Number(year).add(VAL1))).first(),
      COL_IN.filter(ee.Filter.eq('year', ee.Number(year).add(VAL2))).first(),
      COL_IN.filter(ee.Filter.eq('year', ee.Number(year).add(VAL3))).first(),
      COL_IN.filter(ee.Filter.eq('year', ee.Number(year).add(VAL4))).first(),
    ])).sum();
    var im_mask5yearsunique = im_year.multiply(im_years_sum.eq(1).unmask());
    return im_year.where(im_mask5yearsunique.eq(1), 0).set('year', year);
  });
  return col_out.merge(ee.ImageCollection(col_years));
};


// ── Paso C: Funciones para BreakPoint ─────────────────────────────────────────

var getTransitions_valid = function(LIST_YEARS, COL_IN) {
  return ee.ImageCollection(
    LIST_YEARS.map(function(year) {
      var year_prev    = ee.Number(year).subtract(1).getInfo();
      var im_year      = ee.Image(COL_IN.filter(ee.Filter.eq("year", year)).first());
      var im_year_prev = ee.Image(COL_IN.filter(ee.Filter.eq("year", year_prev)).first());
      var diff = im_year.subtract(im_year_prev);
      return im_year.remap([0, 1], [0, 0])
        .where(diff.eq(1), 1)
        .set("year", year)
        .set('system:time_start', ee.Date.fromYMD(year, 8, 1).millis())
        .rename(["transvalid"]);
    })
  );
};

var getUrbToEnd = function(LIST_YEARS, IMCOL, MASK, finalYear) {
  return ee.ImageCollection(
    LIST_YEARS.map(function(year) {
      year = ee.Number(year);
      var im_mask_year = MASK.filter(ee.Filter.eq('year', year)).first();
      var im_sumUrb    = IMCOL.filter(ee.Filter.gte('year', year)).reduce(ee.Reducer.sum());
      var im_sumUrb_valid = im_mask_year.remap([0, 1], [0, 0]).where(im_mask_year.eq(1), im_sumUrb);
      return im_sumUrb_valid.set('year', year).rename("classification");
    })
  );
};

var getBreakpoints = function(col_transicaoValid, col_UrbToEnd, finalYear) {
  return col_transicaoValid.map(function(imgTransicaoValid) {
    var year          = ee.Number(imgTransicaoValid.get('year'));
    var imgUrbToEnd   = col_UrbToEnd.filter(ee.Filter.eq('year', year)).first();
    var yearsRemaining = ee.Number(finalYear).subtract(year).add(1);
    var condition_i   = imgTransicaoValid.eq(1);
    var condition_ii  = imgUrbToEnd.gte(yearsRemaining.divide(2));
    var condition_iii = imgUrbToEnd.gte(1);
    var finalMask = condition_i.and(condition_ii).and(condition_iii);
    return finalMask.updateMask(finalMask)
      .set('year', year)
      .set('system:time_start', imgTransicaoValid.get('system:time_start'))
      .unmask(0);
  });
};

var accumulateForward = function(imgList) {
  var first = ee.Image(imgList.get(0));
  var rest  = imgList.slice(1);
  // Acumulador de LISTA: la imagen previa es siempre list.get(-1).
  // (Evita guardar ee.Image dentro de un ee.Dictionary, que no propaga bien.)
  var accumulated = ee.List(
    rest.iterate(function(img, listState) {
      listState = ee.List(listState);
      img       = ee.Image(img);
      var prev  = ee.Image(listState.get(-1));
      var newAcc = prev.max(img)                       // una vez 1, queda 1
        .set('year', img.get('year'))
        .set('system:time_start', img.get('system:time_start'));
      return listState.add(newAcc);
    }, ee.List([first]))
  );
  return ee.ImageCollection(accumulated);
};


// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE DE FILTROS
// ═══════════════════════════════════════════════════════════════════════════════

// ══ PASO B: TF 5yearsUnique ══════════════════════════════════════════════════

var col_B = imCol_input;
col_B = TempFilter_wMask_5yearsunique([2024],  1, -1, -2, -3, col_B);
col_B = TempFilter_wMask_5yearsunique(ee.List.sequence(1986, 2023, 1).reverse().getInfo(), 2, 1, -1, -2, col_B);
col_B = TempFilter_wMask_5yearsunique([1986], -1,  1,  2,  3, col_B);
col_B = TempFilter_wMask_5yearsunique([1985],  1,  2,  3,  4, col_B);
var col_TF_5yearsunique = col_B.sort('year');

col_TF_5yearsunique = col_TF_5yearsunique.map(function(im) {
  return im.set('system:time_start', ee.Date.fromYMD(im.get('year'), 8, 1).millis());
});


// ══ PASO C: TF BreakPoint ════════════════════════════════════════════════════

var im_1985_base = col_TF_5yearsunique.filter(ee.Filter.eq("year", 1985)).first()
  .rename(["transvalid"])
  .set('system:time_start', ee.Date.fromYMD(1985, 8, 1).millis());

var col_transicaoValid = ee.ImageCollection([im_1985_base])
  .merge(getTransitions_valid(years_excl1985, col_TF_5yearsunique));

var col_UrbToEnd = getUrbToEnd(years, col_TF_5yearsunique, col_transicaoValid, 2025);
var col_Breaks   = getBreakpoints(col_transicaoValid, col_UrbToEnd, 2025);
var list_Breaks  = col_Breaks.sort('year').toList(col_Breaks.size());
var col_TF       = accumulateForward(list_Breaks);


// ══ PASO D: Filtro Espacial ══════════════════════════════════════════════════

var list_au_SF = ee.List([]);
years.forEach(function(year) {
  var au_year = col_TF.filter(ee.Filter.eq("year", year)).first();

  var count_hole = au_year
    .eq(0).selfMask()
    .connectedPixelCount({maxSize: thres_SF_hole + 1, eightConnected: false});
  var au_noHole = au_year
    .where(count_hole.lt(thres_SF_hole), 1)
    .reproject({crs: 'EPSG:4326', scale: 30});

  var count_noise = au_noHole
    .eq(1).selfMask()
    .connectedPixelCount({maxSize: thres_SF_noise + 1, eightConnected: false});
  var au_SF = au_noHole
    .where(count_noise.lt(thres_SF_noise), 0)
    .reproject({crs: 'EPSG:4326', scale: 30});

  list_au_SF = list_au_SF.add(
    au_SF
      .set("year", year)
      .set('system:time_start', ee.Date.fromYMD(year, 8, 1).millis())
  );
});
var col_SF = ee.ImageCollection(list_au_SF);


// ─── EXPORTACIÓN ─────────────────────────────────────────────────────────────

var region = ee.FeatureCollection(pais_asset).geometry().bounds();

// Máscara territorial (footprint del asset integrado): 1 donde hubo dato algún año.
// Se aplica al final, igual que Brasil aplica cartas_hex_im en la exportación.
var im_footprint = im_valid.reduce(ee.Reducer.max()).gt(0);

// Helper: ImageCollection (valores 0/1) → imagen multibanda (valores 0/24)
// Enmascara fuera del footprint y rellena con 0 dentro (patrón updateMask + unmask de Brasil)
var colToImage = function(col, yrs) {
  var im = ee.Image([]);
  yrs.forEach(function(year) {
    var im_year = col.filter(ee.Filter.eq("year", year)).first();
    im = im.addBands(im_year.remap([0, 1], [0, 24]).rename("classification_" + year));
  });
  return im.updateMask(im_footprint).unmask(0);
};

var base_props = {'collection_version': 'Col3', 'input_strategy': 'mosaic'};

// ── Paso B — TF 5yearsUnique ─────────────────────────────────────────────────
exp(
  colToImage(col_TF_5yearsunique, years).set(base_props),
  "urban-col2-B-TF5yearsUnique",
  // 🔁 REPLACE: Update to your own GEE asset folder (see `output_folder`
  // above).
  output_folder + "/urban-col2-B-TF5yearsUnique",
  region, escala
);

// ── Paso C — TF BreakPoint ───────────────────────────────────────────────────
exp(
  colToImage(col_TF, years).set(base_props),
  "urban-col2-C-TFbreakPoint",
  output_folder + "/urban-col2-C-TFbreakPoint",
  region, escala
);

// ── Paso D — Filtro Espacial (output final) ──────────────────────────────────
var im_out = colToImage(col_SF, years)
  .set(base_props)
  .set('description', description);

print('Bandas output:', im_out.bandNames());

exp(
  im_out,
  "urban-col2-D-SF",
  output_folder + "/urban-col2-D-SF",
  region, escala
);
