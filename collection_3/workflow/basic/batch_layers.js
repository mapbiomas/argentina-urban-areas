// ============================================================
// URBANO Col2 | batch_layers — Auxiliary Layer Overlay (reference / unused)
// ============================================================
//
// DESCRIPTION:
//   Builds a single-band "overlay" image by combining one auxiliary
//   layer (slope, HAND, informal settlements, urban perimeter, risk
//   areas, or a prior vegetation-in-urban classification) into a set of
//   ordinal subclasses, optionally per year.
//
// NOTE: this script is not `require()`-d by any other script in this
// repository's basic/, samples/, MuestrasComplementarias/ or workflow/
// folders — it appears to be reference/template tooling (several of its
// asset paths and comments point to a related Brazil urban-mapping
// project, not MapBiomas Argentina) rather than part of the active
// Patagonia... er, Urbano pipeline. Kept here because it was requested,
// but treat it as a reference implementation rather than a wired-in step.
//
// NOTE: the original file had a stray `#Script - ...` line where a `//`
// comment was clearly intended (a bare `#` is not a valid JavaScript
// comment and would throw a syntax error on load) — corrected to `//`
// below; no logic was changed.
//
// 🔁 REPLACE: Study-area geometry (used as a default Map view in the
// original Code Editor script; not used by `layer()` itself).
// ============================================================

var geometry =
    ee.Geometry.Polygon(
        [[[-74.70118799220933, 5.72047858492615],
          [-74.70118799220933, -34.36558566598061],
          [-34.359391117209334, -34.36558566598061],
          [-34.359391117209334, 5.72047858492615]]], null, false);

// Script - Batch Layers (sirve como base para el resto)
// layers dictionary
var layers = {
  /*
  -- Explaining the dictionary --
    {
    'layer_name': // the name of layer to overlay
    'asset':, // asset adress
    'prefix':, // a prefix of the assewt name, if applicable
    'sufix':, // a sufix of the asset name, if applicable
    'version':, // a number version of the actual asset
    'type': // the type of the asset (image, imageCollection, FeatureCollection)
    'function': // the function necessary to be applied to prepare the layer
    'subClasses':{
      'subclass': false, // true if there is subclasses
      'values': [], // values of classes to be used in a .map() function
    },
    ----
  },

  class code:
  abcdef
  a -slope
  b -hand
  c -slums
  d -urbanPerimeter
  e -risk
  f -vegurb

  */
  '0': {
    'layerName': 'slope',
    'asset':"NASA/NASADEM_HGT/001",
    'prefix':false,
    'sufix':false,
    'version':false,
    'type':false,
    'annual': false,
    'function': function (elev){
        var slope = ee.Terrain.slope(elev)
        var slopeAsPercent = slope.divide(180).multiply(Math.PI).tan().multiply(100)
        return slopeAsPercent.toInt().rename('slope')
      },
    'subClasses':{
      'subclass': true,
      'values': [10, 20, 30, 1000],
      'from':[4, 3, 2, 1],
      // class values will be reduced as 4, 3, 2 and 1
      // eg.: lte 10 will be 4, lte 12 will be 4 and so on
      // it is because a .sum() is applied as a reducer and then these classes become mutually exclusive
      'to':[400000, 300000, 200000, 100000],
    },
    'vis': {
      "min":100000,
      "max":400000,
      'palette': ['#d7191c','#fdae61','#ffffbf','#a6d96a','#1a9641']
    },
  },
  '1': {
    'layerName': 'hand',
    'asset': 'users/gena/global-hand/hand-100',
    'prefix':false,
    'sufix':false,
    'version':false,
    'type':false,
    'annual': false,
    'function': function (asset){return ee.ImageCollection(asset).median().unmask()},
    'subClasses':{
      'subclass': true,
      'values': [3, 6, 99999], //hand, 1 (lte 3m), 2 (lte 6m) or 3 (gt 6m)
      'from': [3, 2, 1],
      'to': [30000, 20000, 10000]
    },
    'vis': {
      'min': 10000,
      'max': 30000
    },
  },
  '2': {
    'layerName': 'slums',
    // 🔁 REPLACE: Informal-settlements (slums) reference asset. The
    // original points at a collaborator's Brazil-project asset.
    'asset': 'projects/YOUR-PROJECT/assets/Bases_IBGE/BR_setores_CD2022_Favelas',

    'prefix': false,
    'sufix': false,
    'version': false,
    'type': 'image',
    'annual': false,
    'function': function (assetFeatCol){
        var img = ee.Image().byte().paint({
          featureCollection:ee.FeatureCollection(assetFeatCol).filter(ee.Filter.eq('emFCU', 'SIM')),
          color: 1
        })
      return img.unmask()
    },

    'subClasses':{
      'subclass': false,
      'values': [],
      'from': [1,0],
      'to': [1000, 2000]
    },
  },
  '3': {
    'layerName': 'urbanPerimeter',
    // 🔁 REPLACE: Urban-perimeter reference asset.
    'asset': 'projects/YOUR-PROJECT/assets/Bases_IBGE/BR_setores_CD2022',
    'prefix':false,
    'sufix':false,
    'version':false,
    'type':false,
    'annual': false,
    'function': function (assetFeatCol){
        var img = ee.Image().byte().paint({
          featureCollection:ee.FeatureCollection(assetFeatCol)
              .filter(ee.Filter.eq('SITUACAO', 'Rural').not()),
          color: 1
        })
      return img.unmask()
    },
    'subClasses':{
      'subclass': false,
      'values': [],
      'from': [1,0],
      'to': [100, 200]
    },
    'vis': {
      'min': 100,
      'max': 200,
    },
  },
  '4': {
    'layerName': 'risks',
    // 🔁 REPLACE: Risk-areas reference asset.
    'asset': 'projects/YOUR-PROJECT/assets/RECORTES-GEOGRAFICOS/RISCO-IBGE-BATER-2018-MUN-REGIAO-BIOMA',
    'prefix':false,
    'sufix':false,
    'version':false,
    'type':false,
    'annual': false,
    'function': function (assetFeatCol){
        var img = ee.Image().byte().paint({
          featureCollection:ee.FeatureCollection(assetFeatCol),
          color: 1
        })
      return img.unmask()
    },
    'subClasses':{
      'subclass': false,
      'values': [1,0],
      'from': [1,0],
      'to': [10,20]
    },
    'vis': {
    }
  },
  '5': {
    'layerName': 'vegUrb',// the name of layer to overlay
    // Version history (kept for reference — earlier collection/versions
    // this pipeline stage was run against):
    // col 9:  "...LandsatCol9/VegUrb_Col9v0-24_Prob-lim-PosProcessv0-4_Holesv0-2_Usov0-24_v0-2"
    // col 10, v3: ".../Vegetation/C10_VegUrb_D-PP_VegIntra_v3"
    // col 10, v4: ".../Vegetation/C10_VegUrb_D-PP_VegIntra_v5"
    // col 10, v7 (current):
    // 🔁 REPLACE: Prior vegetation-in-urban-area classification asset.
    'asset': 'projects/YOUR-PROJECT/assets/Vegetation/C10_VegUrb_D-PP_VegIntra_v7',

    'prefix': 'classification_', // a prefix of the assewt name, if applicable
    'sufix': false, // a sufix of the asset name, if applicable
    'version': false, // a number version of the actual asset
    'type': 'image',// the type of the asset (image, imageCollection, FeatureCollection)
    'annual': true,
    'function': function (asset, year){

        return ee.ImageCollection(asset)
        .mosaic()
        .select('classification_' + year)

      },
    'subClasses':{
      'subclass': false, // true if there is subclasses
      'values': [],
      'from': [0,1,2,3,4],
      'to': [0,1,2,3,4]
    },
    'vis': {
      'min': 0,
      'max': 4,
    }
  }
}

// not year-based
// without subclasses
function layerWithoutSubClass (i){
  return ee.Image(layers[i].function(layers[i].asset))
    .remap(layers[i].subClasses.from, layers[i].subClasses.to)
    .rename('image_' + i)
    .set('inputImage', layers[i].layerName)
}

// with subclasses
function layerWithSubClass (i){

  // image of lulc
  var img = ee.Image(layers[i].function(layers[i].asset))

  var subClasses = layers[i].subClasses.values

  // function to set the subclasses according to pixel value
  function subClassesOverlay (k){

    var imgSubClassified = img.lte(k).unmask()

    return imgSubClassified.toByte()

  }

  // sub classes result
  var subReturn = ee.ImageCollection(subClasses.map(subClassesOverlay))
    .sum()
    .remap(layers[i].subClasses.from, layers[i].subClasses.to)
    .rename('image_' + i)
    .set('inputImage', layers[i].layerName)

  return subReturn
}

// year-based
// without subclasses
function layerWithoutSubClassByYear (i, year){
  return ee.Image(layers[i].function(layers[i].asset, year))
    .remap(layers[i].subClasses.from, layers[i].subClasses.to)
    .rename('image_' + i)
    .set('inputImage', layers[i].layerName)
}

// with subclasses
function layerWithSubClassByYear (i, year){

  // image of lulc
  var img = ee.Image(layers[i].function(layers[i].asset, year))

  var subClasses = layers[i].subClasses.values

  // function to set the subclasses according to pixel value
  function subClassesOverlay (k){

    var imgSubClassified = img.lte(k).unmask()

    return imgSubClassified.toByte()

  }

  // sub classes result
  var subReturn = ee.ImageCollection(subClasses.map(subClassesOverlay))
    .sum()
    .remap(layers[i].subClasses.from, layers[i].subClasses.to)
    .rename('image_' + i)
    .set('inputImage', layers[i].layerName)

  return subReturn
}

// get a layer according to rules
function layer (i, year){

  // sub class (false/true)
  var subClass = layers[i].subClasses.subclass

  var yearBased = layers[i].annual

  if (yearBased){

    if (subClass){

      // if true
      var imgReturn = layerWithSubClassByYear (i, year)

    } else {

      // if false
      var imgReturn = layerWithoutSubClassByYear (i, year)

    }

  } else {

    if (subClass){

      // if true
      var imgReturn = layerWithSubClass (i)

    } else {

      // if false
      var imgReturn = layerWithoutSubClass (i)

    }

  }

  return imgReturn.toInt().rename('overlay').unmask()
}

exports.layer = layer
