// =============================================
// URBANO Col2 | Workflow 03 — Temporal Harmonization of Probabilities
// ARMONIZACIÓN TEMPORAL POR ECORREGIÓN — Collection 3
// MapBiomas Argentina - Urbano
// ============================================================
// Lógica de Patagonia:
//   - Año 1985: SIEMPRE se reemplaza por 1986 (regla global, no hay Landsat bueno).
//   - Ecorregiones 100% patagónicas: 1987–1996 también se reemplazan por 1986.
//   - Ecorregiones parcialmente patagónicas: 1987–1996 se mosaiquean
//       (1986 dentro del shape de Patagonia, imagen del año fuera).
//   - Resto: solo 1985 se reemplaza por 1986, el resto usa su propia imagen.
//
// DESCRIPTION:
//   Assembles the per-year probability exports from workflow/02 into one
//   multi-year image per ecoregion, filling in years that were never
//   classified in Patagonia (per the rules above), then smooths the
//   series with a ±`temporalWindow`-year moving average.
//
// INPUT:
//   - Per (ecoregion, year) probability images (workflow/02 output).
//   - Ecoregions FeatureCollection and the Patagonia boundary shape.
//
// OUTPUT:
//   - Multi-year, temporally harmonized probability image per ecoregion,
//     one `classification_<year>` band per year (1985–2025). Exported as
//     `HARMONIZED_PROBA_<ecoSlug>`.
//
// USAGE NOTE: uncomment ONE ecoregion in `listEcoregions` (SECTION 1) per
// run.
//
// PREVIOUS STEP: 02-probability-export.js (produces the per-year
//                probability images assembled here)
// NEXT STEP:     04-classification_ecoregion_export.js (thresholds /
//                classifies the harmonized probabilities produced here)
//
// AUTHORS: MapBiomas Argentina — Urbano team
// =============================================


// =============================================
// SECTION 1 — CONFIGURACIÓN GENERAL
// =============================================
var listEcoregions = [
  //'Altos Andes',
  //'Bosques Patagónicos',
  //'Campos y Malezales',
  //'Chaco Húmedo',
  'Chaco Seco',
  //'Delta e Islas del Paraná',
  //'Espinal',
  //'Estepa Patagónica',
  //'Esteros del Iberá',
  //'Islas del Atlántico Sur',
  //'Monte de Llanuras y Mesetas',
  //'Monte de Sierras y Bolsones',
  //'Pampa1',
  //'Pampa2',
  //'Pampa3',
  //'Puna',
  //'Selva Paranense',
  //'Yungas'
];

// Años a procesar (rango completo de la colección)
var startYear = 1985;
var endYear   = 2025;
var yearsList = ee.List.sequence(startYear, endYear).getInfo();

// Ventana temporal para suavizado (±2 años → ventana de 5 años, igual que ATBD Brasil)
var temporalWindow = 2;

// 🔁 REPLACE: Update to your own GEE asset folders.
var assetBaseClass = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/TRIAL_CLASSIFICATION/';
var assetOutput    = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/CLASSIFICATION/HARMONIZED_CLASSIFICATION/';

// Capa de ecorregiones
// 🔁 REPLACE: Ecoregions vector (18-ecoregion 2026 revision).
var PATH_ECORREGIONES = 'projects/YOUR-PROJECT/assets/LAND-COVER/COLLECTION-3/GENERAL/URBAN/AUXILIARY_DATA/VECTOR/2026-ARG-Ecorregion18_3857';
var PROP_NOMBRE_ECO   = 'LEVEL_2';
var ecorregiones = ee.FeatureCollection(PATH_ECORREGIONES);

// Shape Patagonia (para mosaicado y reglas patagónicas)
// 🔁 REPLACE: Patagonia boundary (simplified outline).
var patagoniaShape = ee.FeatureCollection(
  'projects/YOUR-PROJECT/assets/ANCILLARY_DATA/VECTOR/PAT/Patagonia_ContornoSimplificado'
);

// =============================================
// SECTION 2 — CONFIGURACIÓN DE PATAGONIA — HÍBRIDA
// =============================================

// Ecorregiones 100% (o casi 100%) dentro de Patagonia:
//   No se clasificaron 1985 ni 1987–1996.
//   Para esos años, toda la imagen es 1986.
var ecorregionesPatagonicas100 = [
  'Bosques Patagónicos',
  'Estepa Patagónica',
  'Islas del Atlántico Sur'
];

// Ecorregiones que cruzan Patagonia parcialmente:
//   SÍ se clasificaron todos los años (1986–2025).
//   Para 1987–1996, mosaicado: 1986 dentro de Patagonia, imagen del año fuera.
//   Para 1985, siempre se usa 1986 (regla global).
var ecorregionesPatagonicasParciales = [
  'Altos Andes',
  'Monte de Llanuras y Mesetas'
];

// Listas de años existentes según tipo
var aniosExistentes = {
  // Patagónicas 100%: solo desde 1986, saltando a 1997
  'patagonica100': [1986, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004,
                    2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015,
                    2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],

  // Parciales y no-patagónicas: tienen todos los años 1986–2025
  'completas': [1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996,
                1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004,
                2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015,
                2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
};

// =============================================
// SECTION 3 — FUNCIONES
// =============================================

// Carga la imagen de un año concreto para una ecorregión
function loadProbaImage(ecoSlug, year) {
  var path = assetBaseClass + 'CLASSIF_' + ecoSlug + '_' + year;
  return ee.Image(path).set('year', year);
}

// Carga toda la serie temporal aplicando reglas según el tipo de ecorregión.
function loadProbabilityImages(ecoSlug, ecoGeom, ecoName) {

  // Clasificar la ecorregión
  var esPatagonica100     = ecorregionesPatagonicas100.indexOf(ecoName) !== -1;
  var esPatagonicaParcial = ecorregionesPatagonicasParciales.indexOf(ecoName) !== -1;

  print(ecoName + ' — Tipo:',
        esPatagonica100      ? 'patagónica 100% (toda → 1986 en años faltantes)' :
        esPatagonicaParcial  ? 'patagónica parcial (mosaicado espacial)' :
                               'no patagónica (solo 1985 → 1986)');

  // Lista de años existentes como assets para esta ecorregión
  var listaExistentes = esPatagonica100
    ? aniosExistentes.patagonica100
    : aniosExistentes.completas;

  // Imagen 1986 (siempre existe)
  var img1986 = loadProbaImage(ecoSlug, 1986);

  // Máscara espacial: 1 dentro del shape de Patagonia, 0 fuera
  // (solo se usa para ecorregiones parciales)
  var maskPatagonia = ee.Image.constant(0).byte()
    .paint(patagoniaShape, 1)
    .rename('mask_patagonia');

  // Años problemáticos en Patagonia
  var aniosPatagonicos = [1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995, 1996];

  var images = yearsList.map(function(year) {

    // CASO A: año 1985 → SIEMPRE se reemplaza por 1986 (regla global)
    if (year === 1985) {
      return img1986.set('year', year);
    }

    // CASO B: ecorregión patagónica 100% + año faltante → toda la imagen es 1986
    if (esPatagonica100 && listaExistentes.indexOf(year) === -1) {
      return img1986.set('year', year);
    }

    // CASO C: ecorregión patagónica parcial + año 1987–1996 → MOSAICADO espacial
    if (esPatagonicaParcial && aniosPatagonicos.indexOf(year) !== -1) {
      var imgAnio = loadProbaImage(ecoSlug, year);
      // Dentro de Patagonia (mask=1): reemplazar por 1986.
      // Fuera (mask=0): mantener la imagen del año.
      var mosaico = imgAnio.where(maskPatagonia.eq(1), img1986);
      return mosaico.set('year', year);
    }

    // CASO D: cualquier otro caso → cargar la imagen propia del año
    return loadProbaImage(ecoSlug, year);
  });

  return ee.ImageCollection.fromImages(images);
}

// Suavizado temporal: promedio en ventana ±temporalWindow años
function temporalHarmonization(probCol) {
  var join = ee.Join.saveAll({matchesKey: 'images'});
  var filter = ee.Filter.maxDifference({
    difference: temporalWindow,
    leftField:  'year',
    rightField: 'year'
  });
  var joinedCol = join.apply(probCol, probCol, filter);
  var harmonized = ee.ImageCollection(joinedCol.map(function(image) {
    var imagesList = ee.ImageCollection.fromImages(ee.List(image.get('images')));
    var meanProb   = imagesList.reduce(ee.Reducer.mean());
    return meanProb.set('year', image.get('year'));
  }));
  return harmonized;
}

// =============================================
// SECTION 4 — PROCESAMIENTO POR ECORREGIÓN
// =============================================
listEcoregions.forEach(function(ecoName) {

  var ecoSlug = ecoName.replace(/[^a-zA-Z0-9]/g, '_');
  var ecoGeom = ecorregiones.filter(ee.Filter.eq(PROP_NOMBRE_ECO, ecoName)).geometry();

  print('━━━ Procesando: ' + ecoName + ' (slug: ' + ecoSlug + ') ━━━');

  // Cargar probabilidades originales (con reglas patagónicas aplicadas)
  var probCol = loadProbabilityImages(ecoSlug, ecoGeom, ecoName);

  // Aplicar armonización temporal (suavizado ±2 años)
  var harmonizedCol = temporalHarmonization(probCol);

  // Convertir a imagen multibanda (una banda por año)
  var bandNames = yearsList.map(function(year) {
    return 'classification_' + year;
  });

  var imgMultibanda = ee.ImageCollection(yearsList.map(function(year) {
    var img = harmonizedCol.filter(ee.Filter.eq('year', year)).first();
    return ee.Image(img).rename('classification_' + year);
  })).toBands().rename(bandNames);

  // Exportación
  Export.image.toAsset({
    image:       imgMultibanda.toByte(),
    description: 'HARMONIZED_PROBA_' + ecoSlug,
    // 🔁 REPLACE: Update to your own GEE asset folder (see `assetOutput`
    // above).
    assetId:     assetOutput + 'HARMONIZED_PROBA_' + ecoSlug,
    region:      ecoGeom.bounds(100),
    scale:       30,
    maxPixels:   1e13
  });
});
