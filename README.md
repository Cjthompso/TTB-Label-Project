# TTB Label Checker

Upload a photo of an alcohol label and this tells you whether it has what TTB requires: brand name, class/type, alcohol content, net contents, bottler name and address, country of origin for imports, and the government health warning, word for word.

You can also type in the values from the application (brand, ABV, and so on) and it'll check that the label matches them.

It all runs in the browser. I used Tesseract for the text recognition and bundled it with the app, so there's no API key, nothing to pay for, and the images never get uploaded anywhere.

## Running it

You need Node 20 or newer.

```bash
npm start     # then open http://localhost:3000
npm test
```

That's it. There's nothing to install, since the app has no runtime dependencies. 

There are 12 test labels in `samples/`. Some are compliant, some have specific problems, a couple are phone-style photos with tilt, glare, and blur, and one isn't a label at all. `samples/README.md` says what each one should come back as.

## Deploying

It's just static files in `public/`, so it'll run on any static host. I set it up for GitHub Pages:

1. Push to `main`.
2. In the repo settings, go to Pages and set the source to "GitHub Actions".
3. The workflow in `.github/workflows/pages.yml` runs the tests and then publishes the site. The URL shows up in the Actions tab.

Netlify or Cloudflare Pages work too. Point them at `public` and skip the build step.

## How it works

The pipeline is: photo → OCR → figure out which line is which field → run the rules → show the results.

**Reading the label.** Tesseract runs in a web worker with auto-deskew turned on, which made a big difference on tilted photos. I tried upscaling images first, thinking it would help, but it actually made things worse by breaking the layout into fragments, so now big photos just get scaled down.

**Figuring out the fields.** OCR only gives you lines of text, so the parser leans on patterns that show up on almost every label: "% Alc./Vol.", volume units, "Bottled by" and "Imported by", "Product of", and words like bourbon, cabernet, or lager for the class/type. For the brand name, it takes the biggest text on the label, since that's nearly always the brand.

**Checking for bold.** The warning heading has to be bold, and OCR doesn't tell you that. So the app measures how thick the letter strokes are in "GOVERNMENT WARNING" and compares that to the body text. On the samples, bold headings come out around 1.5 to 1.7 times thicker and the regular one comes out at 0.94, so there's plenty of room between them.

**The rules.** All the compliance logic is plain JavaScript in `public/lib/rules.js` and has tests. I wanted every result to come with a reason a reviewer can check, and to give the same answer every time.

**Not pretending to be sure.** OCR makes mistakes, so each check can be pass, fail, n/a, or "review", which means a person should look. A few examples:

- If the warning is off by a handful of characters, that's probably a misread, so it gets flagged for review. If whole words are different, it fails.
- If part of the photo is hard to read, a missing field is marked "may be obscured" instead of failing.
- If there's no readable text at all, it says so and asks for a better photo, rather than listing seven missing fields.

The text it read is editable too. If OCR gets something wrong, the reviewer can fix the line and re-check right there. Changing the beverage type or the application values re-checks instantly, since the images don't need to be read again.

## What it checks

| | |
|---|---|
| Brand name, class/type | Has to be there |
| Alcohol content | Required on spirits, and on wine over 14% (wine at 14% or under can say "table wine" instead). Optional on beer at the federal level. If proof is listed, it has to be exactly double the ABV |
| Net contents | Spirits and wine need metric and a standard bottle size. Beer needs U.S. units (fl oz) |
| Name and address | Has to be there, ideally with "Bottled by" or similar |
| Country of origin | Required if the label says it's imported |
| Health warning | Exact wording from 27 CFR 16.21, with "GOVERNMENT WARNING" in caps and bold. Any differences get highlighted word by word |
| Sulfites (wine) | Flagged for review if "Contains Sulfites" is missing |
| Application match | Ignores case and punctuation. ABV and volume are compared as numbers, so "45.0% ABV" matches "45% Alc./Vol." and "0.75 L" matches "750 mL". Near misses get flagged as possible typos |

## Assumptions

- The person using this is a reviewer checking labels against an application, so the comparison is there but optional.
- Federal rules only, not state rules.
- English labels only.
- Beverage type is detected automatically, but you can override it since a few rules depend on it.

## Limitations

The big trade-off is accuracy. An AI vision model would do better on script fonts and curved bottles. I went with local OCR so there's no API key, no cost, and no images going to a third party. On clean, flat, well-lit photos it's very reliable. On stylized labels, expect more "needs review".

Some other things I know about:

- Finding the fields is pattern matching, not real layout understanding, so an unusual label (say, one where the class/type is bigger than the brand) can get mixed up. Editing the text fixes it.
- Type size rules can't be checked from a photo, because they depend on the physical size of the bottle.
- The standard bottle sizes are hard-coded in `public/lib/constants.js`. They change every so often, so an unrecognized size gets "review" rather than "fail". Worth checking against the current eCFR.
- Some rules aren't covered yet, such as age statements, color additive disclosures, and wine appellations. Each one would be another function in `rules.js`.
- Front and back labels are checked separately. Ideally they'd be combined into one product.
- It takes about a second per label on a laptop, plus a one-time download of about 6 MB for the OCR engine.

## Where things are

```
public/              the site
  app.js             UI
  lib/ocr.js         runs Tesseract in the browser
  lib/ocr-core.js    tidies OCR output, measures bold
  lib/parse.js       works out which line is which field
  lib/rules.js       compliance checks
  lib/compare.js     label vs. application
  lib/text.js        parsing and diff helpers
  lib/constants.js   warning text, bottle sizes, units
  vendor/            Tesseract, the English model, and fonts
scripts/             local server, fixture capture, vendor update
test/                tests, including real OCR output for every sample
samples/             test labels and the script that makes them
```

## Tests

`npm test` runs 37 tests. The parser tests use real Tesseract output for every sample label, captured with the same settings the browser uses (`npm run fixtures` regenerates it), so they test what actually happens and not an idealized version.