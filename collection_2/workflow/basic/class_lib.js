// ============================================================
// URBANO Col2 | class_lib — Random Forest Training & Classification
// ============================================================
//
// DESCRIPTION:
//   Two small helper functions shared by every classification script in
//   this repository: extracting the feature space at training points, and
//   training/running the probability-output Random Forest classifier.
//
// 🔁 REPLACE: Update the path below to the GEE script URL where you have
// saved this file.
//   var batchClass = require('users/YOUR-GEE-USERNAME/YOUR-REPO:basic/class_lib.js');
// ============================================================

// Training sample preparation
function getFeatureSpace (image, samples){

  var samplesWithProperties = image.sampleRegions({
    collection:samples,
    scale:30,
    geometries:true,
    tileScale:16
    });

  return ee.FeatureCollection(samplesWithProperties);

}

function classifying (bands, samples, ntree, image_class){

  var classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: ntree,
    minLeafPopulation: 5,
    // seed:143,
  })
  .train({
    'features':samples,
    'classProperty':'value',
    // 'classProperty':'class',
    'inputProperties':bands
  })
  .setOutputMode('PROBABILITY')

  // print("explain classifier", classifier.explain());
  var classified = image_class.classify(classifier);

  return classified.multiply(100).byte();

};



////////////////////////////////////////////////////////////
exports.classifying = classifying;
exports.getFeatureSpace = getFeatureSpace;
