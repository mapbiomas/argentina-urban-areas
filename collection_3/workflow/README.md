# Collection 3 — Urban Areas

Google Earth Engine pipeline for MapBiomas Argentina — Urban area,
Collection 3 (1985–2025), classified per ecoregion (17 ecoregions) and
integrated nationally.

This is a documented, public-reproducibility version of the original GEE
Code Editor scripts. Every internal/organization-specific asset path and
external `require()` module has been replaced with a `🔁 REPLACE:` marker
and an explanation — see each script's header and inline comments for
details. No processing logic was changed; only visualization/debug code
(`Map.addLayer`, `Map.setCenter`, interactive UI panels) was removed and
the code was reorganized into labeled sections.

For the MapBiomas Argentina legend and class codes, see
[argentina.mapbiomas.org/codigos-de-la-leyenda](https://argentina.mapbiomas.org/codigos-de-la-leyenda/).

## `basic/` — shared libraries

| Script | Purpose |
|---|---|
| [class_lib.js](basic/class_lib.js) | Random Forest training (`getFeatureSpace`) and probability-mode classification (`classifying`). |
| [index_lib.js](basic/index_lib.js) | Spectral index and spectral-mixture-analysis (SMA) functions. |
| [preProcessing_lib.js](basic/preProcessing_lib.js) | Landsat cloud masking and SR scale factors. |
| [renameBands.js](basic/renameBands.js) | Per-sensor band-name lookup table (Landsat 4-9, Sentinel-2). |
| [mosaic_production.js](basic/mosaic_production.js) | Builds the annual predictor mosaic (`mosaicGen`) used throughout the pipeline. |
| [batch_layers.js](basic/batch_layers.js) | Auxiliary layer overlay tool (slope, HAND, informal settlements, etc.) — **not referenced by any other script in this repository**; kept as reference/template only (see the script's own NOTE). |

Not included: `basic/class_lib (copy).js`, an unused draft/refactor of
`class_lib.js` that no other script `require()`s.

## `MuestrasComplementarias/` — interactive complementary-points QA

[muestras-complementarias.js](MuestrasComplementarias/muestras-complementarias.js)
is a generic template for an interactive (no-export) Code Editor tool used
to visually compare a classification with vs. without manually digitized
correction points, per ecoregion. It is functionally identical to
[01-probability_map_with_complementary.js](01-probability_map_with_complementary.js);
the original repository keeps 15 saved copies of it, one per ecoregion,
each with that ecoregion's own hand-drawn polygons.

## `samples/` — national training samples

| # | Script | What it does |
|---|--------|---------------|
| 0a | [0a_generate_map_stable_nonurban.js](samples/0a_generate_map_stable_nonurban.js) | National stable-classes map (5 classes: leñoso, herbáceo, no vegetado, agua, agricultura). |
| 0b | [0b_export_stable_nonurban_samples.js](samples/0b_export_stable_nonurban_samples.js) | Stratified national sample of the stable map, tagged with a `Region_id` (Chaco/Pampa/Bosque Atlántico/Monte-Puna-Altos Andes/Patagonia). |
| 0c | [0c_select_nonurban_samples.js](samples/0c_select_nonurban_samples.js) | Splits the non-urban samples by ecoregion, sized to a per-ecoregion target table. |
| 0d | [0d_select_urban_samples.js](samples/0d_select_urban_samples.js) | Splits raw GHS-derived urban samples (1985/2005/2020) by ecoregion, 50/50 by urbanization intensity (`grid_code`). |

Note: across 0a→0b→0c, the exact asset filename referenced by the next
script drifts slightly from what the previous one exports (documented in
each script's header) — kept as in the original, not corrected.

## Main pipeline

| # | Script | What it does |
|---|--------|---------------|
| 01 | [01-probability_map_with_complementary.js](01-probability_map_with_complementary.js) | Interactive QA: compares classification with/without complementary points, per ecoregion (no export). |
| 02 | [02-probability-export.js](02-probability-export.js) | Trains and exports the probability-of-urban image, per ecoregion and year. |
| 03 | [03-harmonized_probabilities.js](03-harmonized_probabilities.js) | Assembles per-year exports into one multi-year image per ecoregion, filling Patagonia's un-classified years and smoothing with a ±2-year moving average. |
| 04 | [04-classification_ecoregion_export.js](04-classification_ecoregion_export.js) | Thresholds the harmonized probabilities into a binary classification, per ecoregion and calibration period. |
| 04b | [04b-integration-max.js](04b-integration-max.js) / [04b-integration-mosaic.js](04b-integration-mosaic.js) | Two alternative strategies for merging the 16 per-ecoregion classifications (Pampa's 3 parts merged with `.max()` vs `.mosaic()`) into one national image, resolving boundary overlaps with an explicit priority table. |

### `filters/` — post-processing (national, single chain)

| Script | What it does |
|---|---|
| [05_postprocessing_filter-max.js](filters/05_postprocessing_filter-max.js) / [05_postprocessing_filter-mosaic.js](filters/05_postprocessing_filter-mosaic.js) | Gap-fill + 5-year-uniqueness temporal filter + breakpoint-based onset detection + spatial hole-fill/noise removal, run on each of the two 04b integration variants. |
| [05b_postprocessing_steps_filter-mosaic.js](filters/05b_postprocessing_steps_filter-mosaic.js) | Step-by-step variant of the "mosaic" filter chain that exports each intermediate stage separately, for QA. |

### `filters2-este/` — post-processing (alternative chain)

A second, independent post-processing chain (kept separate from
`filters/`), run in this order:

```
SF → TF1 → TF2 → TF3 → Mask → (TF4umb_postmask.js  |  BreakPoint.js)
```

| Script | What it does |
|---|---|
| [SF.js](filters2-este/SF.js) | Morphological spatial filter (close → hole-fill → open → noise removal), exports 2 radius variants for comparison. |
| [TF1.js](filters2-este/TF1.js) | Temporal consistency filter (removes isolated single-year urban flickers). |
| [TF2.js](filters2-este/TF2.js) | Temporal smoothing filter. |
| [TF3.js](filters2-este/TF3.js) | Temporal hole-fill (adds urban between two urban years). |
| [Mask.js](filters2-este/Mask.js) | Applies the final-year valid-area mask, with an exception for RENABAP (informal settlements) polygons. |
| [TF4umb_postmask.js](filters2-este/TF4umb_postmask.js) | Final consolidation v1: evidence-threshold onset validation (staged thresholds by year). |
| [BreakPoint.js](filters2-este/BreakPoint.js) | Final consolidation v2: transition-based onset + fixed 50% threshold (adapted from the MapBiomas Brazil approach). |
| [TF4_postmask.js](filters2-este/TF4_postmask.js) | Applies the same RENABAP-exception mask to a separate "TF4 original" (plain cumulative) output — that upstream script is not included in this repository (see the script's own NOTE). |

`TF4umb_postmask.js` and `BreakPoint.js` are two alternative final
outputs of this chain, not a sequential pair.

## Adapting to your own project

Every script marks the values you need to change with `🔁 REPLACE:`
comments — mainly:

- **Asset paths** (`ee.Image(...)`, `ee.FeatureCollection(...)`,
  `Export.*.assetId`, `Export.*.region`): replace
  `projects/YOUR-PROJECT/...` with your own GEE asset paths.
- **Manually digitized geometries** (the `ComplUrbano`/`ComplNoUrbano`
  correction polygons in `01-probability_map_with_complementary.js` and
  `MuestrasComplementarias/`): these are placeholders — digitize your own
  per ecoregion.
- **`require()` modules**: scripts reference `basic/*.js` via
  `require('users/YOUR-GEE-USERNAME/YOUR-REPO:...')` — update the path
  prefix to wherever you save this repo in GEE.

## Original source

Adapted from the internal GEE-hosted repository
`users/mapbiomas-arg/urbano-col2`. MapBiomas Argentina — Urbano team
(Sofia Sarrailhé, Luna Schteingart, and others credited in individual
script headers).
