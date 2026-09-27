# Sample labels

Synthetic labels for testing. Regenerate with `python3 samples/make_samples.py`.

| File | Type | Expected result | Why |
|---|---|---|---|
| 01_old_tom_bourbon_compliant.png | Spirits | Compliant | The example label from the brief |
| 02_casa_luna_cabernet_compliant.png | Wine | Compliant | ABV over 14% stated, sulfites declared |
| 03_sundown_lager_compliant.png | Beer | Compliant | U.S. measure (12 FL OZ) with metric alongside |
| 04_agave_alto_tequila_import_compliant.png | Spirits, import | Compliant | Country of origin present for an import |
| 05_harbor_scotch_multiple_violations.png | Spirits, import | Not compliant | 86 proof ≠ 2 × 40%; no country of origin; "Government Warning" not in capitals; "birth defects" changed to "health issues" |
| 06_river_bend_ipa_metric_only.png | Beer | Not compliant | Net contents in mL only; beer needs U.S. measure |
| 07_northwind_vodka_no_warning.png | Spirits | Not compliant | Government warning missing entirely |
| 08_bellwether_gin_needs_review.png | Spirits | Needs review | Warning heading not bold; 800 mL isn't a standard fill; no "Bottled by" phrase |
| 09_sierra_roja_zinfandel_missing_abv.png | Wine | Not compliant | No alcohol content and not labeled "table wine"; no sulfite statement (review) |
| 10_old_tom_phone_photo.jpg | Spirits | Compliant | Label 01 tilted with glare and noise, like a quick phone photo |
| 11_old_tom_blurry_photo.jpg | Spirits | Compliant or needs review | Heavily blurred; tests how the app handles hard-to-read images |
| 12_not_a_label.png | — | Not compliant | Not an alcohol label; tests the rejection path |

To test the application comparison, check label 01 with these values. Everything should match except the net contents:

- Brand name: `Old Tom Distillery` (different capitalization, should still match)
- Alcohol content: `45.0% ABV` (different format, should still match)
- Net contents: `1 L` (should fail)
