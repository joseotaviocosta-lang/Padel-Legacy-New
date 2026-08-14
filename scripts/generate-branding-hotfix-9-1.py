"""Generate the Branding Hotfix 9.1 raster assets without morphology.

Requires Pillow. The 16/24/32 variants intentionally use 4/6/9 explicit
holes; detailed assets remain sourced from app-icon-master.png at 48px+.
"""

from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
LIME = (180, 230, 5, 255)
BLACK = (10, 13, 20, 255)
GRIP = (54, 62, 35, 255)
BALL = (245, 229, 0, 255)
SEAM = (255, 248, 176, 255)
MASTER = ROOT / "src/assets/brand/app-icon-master.png"
SMALL_DIR = ROOT / "src-tauri/icons-src"
RESAMPLE = Image.Resampling.LANCZOS
SUPERSAMPLE = 8


HOLES = {
    4: [(29, 23), (49, 23), (29, 41), (49, 41)],
    6: [(25, 22), (42, 21), (59, 22), (27, 40), (44, 39), (61, 39)],
    9: [(25, 20), (42, 19), (59, 20), (23, 34), (40, 33), (57, 34), (27, 47), (44, 46), (61, 45)],
    10: [(25, 20), (39, 18), (53, 19), (22, 32), (36, 31), (50, 31), (64, 31), (28, 44), (42, 43), (56, 42)],
}
HOLE_RADIUS = {4: 5.4, 6: 4.8, 9: 4.1, 10: 3.7}


def _scaled_box(values, scale):
    return tuple(round(value * scale) for value in values)


def render_symbol(size, hole_count=9, *, background=True, adaptive=False):
    work = 96 * SUPERSAMPLE
    scale = SUPERSAMPLE
    base = Image.new("RGBA", (work, work), (0, 0, 0, 0))
    draw = ImageDraw.Draw(base)

    if background:
        draw.rounded_rectangle(
            _scaled_box((2, 2, 94, 94), scale),
            radius=20 * scale,
            fill=LIME,
        )

    racket = Image.new("RGBA", base.size, (0, 0, 0, 0))
    racket_draw = ImageDraw.Draw(racket)
    racket_draw.rounded_rectangle(
        _scaled_box((12, 8, 72, 59), scale),
        radius=22 * scale,
        fill=BLACK,
    )
    racket_draw.polygon(
        [_scaled_box((34, 53), scale), _scaled_box((49, 54), scale), _scaled_box((44, 68), scale), _scaled_box((31, 66), scale)],
        fill=BLACK,
    )
    racket_draw.rounded_rectangle(
        _scaled_box((29, 61, 43, 91), scale),
        radius=5 * scale,
        fill=BLACK,
    )

    hole_fill = LIME if background else (0, 0, 0, 0)
    radius = HOLE_RADIUS[hole_count]
    for x, y in HOLES[hole_count]:
        racket_draw.ellipse(
            _scaled_box((x - radius, y - radius, x + radius, y + radius), scale),
            fill=hole_fill,
        )

    for y in (70, 77, 84):
        racket_draw.line(
            [_scaled_box((30, y), scale), _scaled_box((42, y + 2), scale)],
            fill=GRIP,
            width=2 * scale,
        )

    racket = racket.rotate(8, resample=Image.Resampling.BICUBIC, center=(42 * scale, 48 * scale))
    base.alpha_composite(racket)

    draw = ImageDraw.Draw(base)
    draw.ellipse(_scaled_box((59, 61, 83, 85), scale), fill=BALL)
    draw.arc(_scaled_box((59, 63, 84, 76), scale), 190, 335, fill=SEAM, width=2 * scale)

    if adaptive:
        safe = round(work * 0.68)
        symbol = base.resize((safe, safe), RESAMPLE)
        canvas = Image.new("RGBA", (work, work), (0, 0, 0, 0))
        offset = (work - safe) // 2
        canvas.alpha_composite(symbol, (offset, offset))
        base = canvas

    return base.resize((size, size), RESAMPLE)


def render_detailed(size):
    with Image.open(MASTER) as image:
        return image.convert("RGBA").resize((size, size), RESAMPLE)


def save_png(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def generate_small_sources():
    save_png(render_symbol(96, 9), ROOT / "src/assets/brand/app-icon-small.png")
    save_png(render_symbol(1024, 9), SMALL_DIR / "app-icon-simplified.png")
    save_png(render_symbol(1024, 9, background=False, adaptive=True), SMALL_DIR / "app-icon-fg.png")
    save_png(Image.new("RGBA", (1024, 1024), LIME), SMALL_DIR / "app-icon-bg.png")

    for size, holes in ((16, 4), (24, 6), (32, 9)):
        save_png(render_symbol(size, holes), SMALL_DIR / f"small-{size}.png")


def generate_favicons():
    public = ROOT / "public"
    shutil.copyfile(SMALL_DIR / "small-16.png", public / "favicon-16.png")
    shutil.copyfile(SMALL_DIR / "small-32.png", public / "favicon-32.png")
    shutil.copyfile(SMALL_DIR / "small-32.png", public / "favicon.png")


def generate_android():
    res = ROOT / "src-tauri/gen/android/app/src/main/res"
    for foreground in res.glob("mipmap-*/ic_launcher_foreground.png"):
        with Image.open(foreground) as current:
            size = current.width
        save_png(render_symbol(size, 9, background=False, adaptive=True), foreground)
        background_path = foreground.with_name("ic_launcher_background.png")
        save_png(Image.new("RGBA", (size, size), LIME), background_path)

    for legacy in list(res.glob("mipmap-*/ic_launcher.png")) + list(res.glob("mipmap-*/ic_launcher_round.png")):
        with Image.open(legacy) as current:
            size = current.width
        save_png(render_detailed(size), legacy)


def generate_ios():
    ios_dir = ROOT / "src-tauri/icons/ios"
    for icon_path in ios_dir.glob("*.png"):
        with Image.open(icon_path) as current:
            size = current.width
        logical_small = icon_path.name.startswith(("AppIcon-20", "AppIcon-29", "AppIcon-40"))
        save_png(render_symbol(size, 9) if logical_small else render_detailed(size), icon_path)


def generate_contact_sheet():
    sizes = [16, 24, 32, 48, 64, 256]
    sources = {
        16: render_symbol(16, 4),
        24: render_symbol(24, 6),
        32: render_symbol(32, 9),
        48: render_detailed(48),
        64: render_detailed(64),
        256: render_detailed(256),
    }
    panel_w, panel_h = 286, 330
    sheet = Image.new("RGB", (panel_w * len(sizes), panel_h), (24, 27, 32))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=22)
    for index, size in enumerate(sizes):
        icon = sources[size]
        preview_size = 224 if size < 256 else 256
        preview = icon.resize((preview_size, preview_size), Image.Resampling.NEAREST if size <= 32 else RESAMPLE)
        x = index * panel_w + (panel_w - preview_size) // 2
        y = 38
        sheet.paste(preview.convert("RGB"), (x, y))
        label = f"{size} x {size}"
        text_box = draw.textbbox((0, 0), label, font=font)
        label_x = index * panel_w + (panel_w - (text_box[2] - text_box[0])) // 2
        draw.text((label_x, 298), label, fill=(244, 247, 250), font=font)
    save_png(sheet, ROOT / "src-tauri/target/branding-hotfix-9-1/icon-contact-sheet.png")


def main():
    generate_small_sources()
    generate_favicons()
    generate_android()
    generate_ios()
    generate_contact_sheet()
    print("Branding Hotfix 9.1 assets generated: 4/6/9 holes at 16/24/32px.")


if __name__ == "__main__":
    main()
