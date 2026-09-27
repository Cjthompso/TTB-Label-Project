import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
HERE = os.path.dirname(os.path.abspath(__file__))
WARNING_BODY = (
    "(1) According to the Surgeon General, women should not drink alcoholic beverages during "
    "pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs "
    "your ability to drive a car or operate machinery, and may cause health problems."
)


def font(name, size):
    return ImageFont.truetype(FONT_DIR + name, size)


def SERIF_B(s): return font("DejaVuSerif-Bold.ttf", s)
def SERIF(s): return font("DejaVuSerif.ttf", s)
def SANS(s): return font("DejaVuSans.ttf", s)
def SANS_B(s): return font("DejaVuSans-Bold.ttf", s)


def draw_warning(d, y, width, fg, heading, body, heading_bold=True):
    head_font = SANS_B(22) if heading_bold else SANS(22)
    body_font = SANS(22)
    d.text((70, y), heading, font=head_font, fill=fg)
    x = 70 + d.textlength(heading + " ", font=head_font)
    line, rows = "", []
    for word in body.split():
        trial = f"{line} {word}".strip()
        if x + d.textlength(trial, font=body_font) > width - 70:
            rows.append((x, line))
            line, x = word, 70
        else:
            line = trial
    rows.append((x, line))
    for i, (lx, text) in enumerate(rows):
        d.text((lx, y + i * 30), text, font=body_font, fill=fg)


def make_label(bg, fg, accent, lines, warning=("GOVERNMENT WARNING:", WARNING_BODY),
               heading_bold=True, size=(900, 1200)):
    """lines: list of (text, font, color or None). warning: (heading, body), or None to omit it."""
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)
    d.rectangle([24, 24, size[0] - 24, size[1] - 24], outline=accent, width=6)
    d.rectangle([40, 40, size[0] - 40, size[1] - 40], outline=accent, width=1)

    y = 90
    for text, fnt, color in lines:
        w = d.textlength(text, font=fnt)
        d.text(((size[0] - w) / 2, y), text, font=fnt, fill=color or fg)
        y += fnt.size + 26

    if warning:
        draw_warning(d, max(y + 20, size[1] - 330), size[0], fg, *warning, heading_bold=heading_bold)
    return img


def phone_photo(img, angle=4, blur=1.6, glare=True, seed=1):
    """Make a clean label look like a quick phone snapshot: tilt, glare, blur, noise, background."""
    rnd = random.Random(seed)
    bg = (92, 84, 74)
    canvas = Image.new("RGB", (img.width + 260, img.height + 260), bg)
    canvas.paste(img, (130, 130))
    canvas = canvas.rotate(angle, resample=Image.BICUBIC, fillcolor=bg)
    if glare:
        mask = Image.new("L", canvas.size, 0)
        cx, cy = int(canvas.width * 0.62), int(canvas.height * 0.3)
        ImageDraw.Draw(mask).ellipse([cx - 170, cy - 260, cx + 170, cy + 260], fill=150)
        mask = mask.filter(ImageFilter.GaussianBlur(70))
        canvas = Image.composite(Image.new("RGB", canvas.size, "white"), canvas, mask)
    canvas = canvas.filter(ImageFilter.GaussianBlur(blur))
    px = canvas.load()
    for _ in range(40000):
        x, y = rnd.randrange(canvas.width), rnd.randrange(canvas.height)
        n = rnd.randint(-18, 18)
        px[x, y] = tuple(max(0, min(255, c + n)) for c in px[x, y])
    return canvas.resize((canvas.width * 3 // 4, canvas.height * 3 // 4))


def save(img, name):
    path = os.path.join(HERE, name)
    img.save(path, quality=82) if name.endswith(".jpg") else img.save(path)


old_tom = make_label("#f3e6c8", "#2a1a0a", "#7a4a1a", [
    ("OLD TOM", SERIF_B(64), None),
    ("DISTILLERY", SERIF_B(44), None),
    ("Kentucky Straight Bourbon Whiskey", SERIF(34), "#7a4a1a"),
    ("45% Alc./Vol. (90 Proof)", SANS(30), None),
    ("750 mL", SANS(30), None),
    ("Distilled and Bottled by Old Tom Distillery", SANS(24), None),
    ("Bardstown, Kentucky", SANS(24), None),
])
save(old_tom, "01_old_tom_bourbon_compliant.png")

save(make_label("#f6f1ea", "#3b0d1a", "#7b1e3a", [
    ("CASA LUNA", SERIF_B(62), "#7b1e3a"),
    ("2022", SERIF(34), None),
    ("Napa Valley Cabernet Sauvignon", SERIF(32), None),
    ("Alcohol 14.5% by Volume", SANS(28), None),
    ("750 mL", SANS(28), None),
    ("Produced and Bottled by Casa Luna Cellars", SANS(24), None),
    ("St. Helena, California", SANS(24), None),
    ("Contains Sulfites", SANS(24), None),
]), "02_casa_luna_cabernet_compliant.png")

save(make_label("#fdf3d8", "#1d2b3a", "#d98e04", [
    ("SUNDOWN", SERIF_B(64), "#d98e04"),
    ("BREWING CO.", SERIF_B(38), None),
    ("Golden Lager", SERIF(40), None),
    ("5.0% Alc./Vol.", SANS(28), None),
    ("12 FL OZ (355 mL)", SANS(28), None),
    ("Brewed and Canned by Sundown Brewing Co.", SANS(24), None),
    ("Tulsa, Oklahoma", SANS(24), None),
]), "03_sundown_lager_compliant.png")

save(make_label("#e7f1ee", "#0f3b33", "#2a7f6f", [
    ("AGAVE ALTO", SERIF_B(60), "#2a7f6f"),
    ("Tequila Blanco", SERIF(40), None),
    ("100% de Agave", SERIF(28), None),
    ("40% Alc./Vol. (80 Proof)", SANS(28), None),
    ("750 mL", SANS(28), None),
    ("Product of Mexico", SANS(26), None),
    ("Imported by Alto Spirits LLC, San Antonio, TX", SANS(24), None),
]), "04_agave_alto_tequila_import_compliant.png")

save(make_label("#1f2d3a", "#e8e2d0", "#c9a95a", [
    ("HARBOR MIST", SERIF_B(64), "#c9a95a"),
    ("Blended Scotch Whisky", SERIF(36), None),
    ("40% Alc./Vol. (86 Proof)", SANS(30), None),
    ("700 mL", SANS(30), None),
    ("Imported by Harbor Spirits Co., New York, NY", SANS(24), None),
], warning=("Government Warning:", WARNING_BODY.replace("birth defects", "health issues"))),
    "05_harbor_scotch_multiple_violations.png")

save(make_label("#e9f0e4", "#17301c", "#3f7a4a", [
    ("RIVER BEND", SERIF_B(64), "#3f7a4a"),
    ("BREWING", SERIF_B(40), None),
    ("India Pale Ale", SERIF(38), None),
    ("6.8% ABV", SANS(28), None),
    ("355 mL", SANS(28), None),
    ("Brewed and Canned by River Bend Brewing Co.", SANS(24), None),
    ("Asheville, North Carolina", SANS(24), None),
]), "06_river_bend_ipa_metric_only.png")

save(make_label("#f4f6f8", "#14213d", "#5c7aa8", [
    ("NORTHWIND", SERIF_B(64), "#5c7aa8"),
    ("Vodka", SERIF(44), None),
    ("Distilled from Grain", SERIF(28), None),
    ("40% Alc./Vol. (80 Proof)", SANS(28), None),
    ("1 L", SANS(28), None),
    ("Distilled and Bottled by Northwind Spirits", SANS(24), None),
    ("Duluth, Minnesota", SANS(24), None),
], warning=None), "07_northwind_vodka_no_warning.png")

save(make_label("#fbf7ef", "#2f2a1f", "#8a7b4f", [
    ("BELLWETHER", SERIF_B(60), "#8a7b4f"),
    ("London Dry Gin", SERIF(40), None),
    ("47% Alc./Vol.", SANS(28), None),
    ("800 mL", SANS(28), None),
    ("Bellwether Distilling, Portland, Oregon", SANS(24), None),
], heading_bold=False), "08_bellwether_gin_needs_review.png")

save(make_label("#f7efe6", "#3a1e12", "#a0522d", [
    ("SIERRA ROJA", SERIF_B(60), "#a0522d"),
    ("Zinfandel", SERIF(40), None),
    ("Dry Creek Valley", SERIF(28), None),
    ("750 mL", SANS(28), None),
    ("Vinted and Bottled by Sierra Roja Winery", SANS(24), None),
    ("Healdsburg, California", SANS(24), None),
]), "09_sierra_roja_zinfandel_missing_abv.png")


save(phone_photo(old_tom, angle=5, blur=1.4, seed=3), "10_old_tom_phone_photo.jpg")
save(phone_photo(old_tom, angle=-9, blur=3.2, seed=7), "11_old_tom_blurry_photo.jpg")

not_label = Image.new("RGB", (900, 700), "#dfe7ee")
ImageDraw.Draw(not_label).text((80, 300), "Quarterly team lunch: Friday at noon", font=SANS_B(36), fill="#223")
save(not_label, "12_not_a_label.png")

print("Sample labels written to", HERE)
