"""Generate every Padel Legacy icon from the canonical official PNG.

Branding Hotfix 9.2 deliberately performs technical image processing only:
high-quality resize, light small-size sharpening, and Android foreground
extraction. It never draws, replaces, or simplifies the racket or ball.
"""

from __future__ import annotations

import colorsys
import hashlib
import json
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "src/assets/brand/app-icon-master.png"
ICONS_SRC = ROOT / "src-tauri/icons-src"
TAURI_ICONS = ROOT / "src-tauri/icons"
PUBLIC = ROOT / "public"
ANDROID_RES = ROOT / "src-tauri/gen/android/app/src/main/res"
CONTACT_SHEET = ROOT / "src-tauri/target/branding-hotfix-9-2/icon-contact-sheet.png"

RESAMPLE = Image.Resampling.LANCZOS
OFFICIAL_GREEN = (180, 230, 5, 255)
ICO_SIZES = (16, 24, 32, 48, 64, 256)

TAURI_PNG_SIZES = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 512,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

PUBLIC_SIZES = {
    "favicon-16.png": 16,
    "favicon-24.png": 24,
    "favicon-32.png": 32,
    "favicon-48.png": 48,
    "favicon-64.png": 64,
    "favicon.png": 64,
    "icon-192.png": 192,
    "icon-512.png": 512,
}

ANDROID_LEGACY_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

ANDROID_ADAPTIVE_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def resize_official(master: Image.Image, size: int) -> Image.Image:
    """Downscale the unmodified official art; never reconstruct its geometry."""
    resized = master.resize((size, size), RESAMPLE)
    if size <= 64:
        resized = resized.filter(ImageFilter.UnsharpMask(radius=0.45, percent=28, threshold=3))
    return resized


def extract_official_foreground(master: Image.Image) -> Image.Image:
    """Chroma-key the lime backdrop while retaining original racket/ball pixels."""
    source = master.convert("RGBA")
    alpha = Image.new("L", source.size, 0)
    source_pixels = source.load()
    alpha_pixels = alpha.load()

    # Both rectangles come from the subject bounds in the official master.
    # They restrict the chroma key to the original racket and ball composition.
    subject_regions = ((270, 35, 810, 900), (485, 570, 800, 900))
    for left, top, right, bottom in subject_regions:
        for y in range(top, bottom):
            for x in range(left, right):
                red, green, blue, _ = source_pixels[x, y]
                hue, saturation, _value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
                hue_degrees = hue * 360

                # The backdrop is centered around 73 degrees. The yellow ball
                # is around 56 degrees and is intentionally outside this key.
                green_distance = abs(hue_degrees - 73)
                green_dominance = green - red
                if saturation > 0.18 and green_dominance > 20 and green_distance <= 13:
                    keyed_alpha = 0
                elif saturation > 0.12 and green_dominance > 10 and green_distance <= 20:
                    keyed_alpha = max(0, min(255, round(255 * (green_distance - 13) / 7)))
                else:
                    keyed_alpha = 255
                if keyed_alpha > alpha_pixels[x, y]:
                    alpha_pixels[x, y] = keyed_alpha

    foreground = source.copy()
    foreground.putalpha(alpha)
    subject_bbox = foreground.getbbox()
    if subject_bbox is None:
        raise RuntimeError("Android foreground extraction produced an empty image")

    subject = foreground.crop(subject_bbox)
    safe_edge = round(master.width * 0.55)
    scale = min(safe_edge / subject.width, safe_edge / subject.height)
    subject = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        RESAMPLE,
    )
    canvas = Image.new("RGBA", master.size, (0, 0, 0, 0))
    canvas.alpha_composite(
        subject,
        ((master.width - subject.width) // 2, (master.height - subject.height) // 2),
    )
    return canvas


def write_ico(frames: dict[int, bytes], output: Path) -> None:
    ordered = [(size, frames[size]) for size in ICO_SIZES]
    header = struct.pack("<HHH", 0, 1, len(ordered))
    data_offset = 6 + len(ordered) * 16
    directory = bytearray()
    payload = bytearray()
    for size, png_bytes in ordered:
        directory.extend(
            struct.pack(
                "<BBBBHHII",
                0 if size == 256 else size,
                0 if size == 256 else size,
                0,
                0,
                1,
                32,
                len(png_bytes),
                data_offset + len(payload),
            )
        )
        payload.extend(png_bytes)
    output.write_bytes(header + directory + payload)


def generate_contact_sheet(frames: dict[int, Image.Image]) -> None:
    panel_width, panel_height = 260, 326
    sheet = Image.new("RGB", (panel_width * len(ICO_SIZES), panel_height), (24, 27, 32))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=20)
    for index, size in enumerate(ICO_SIZES):
        preview_size = 224 if size < 256 else 256
        preview = frames[size].resize(
            (preview_size, preview_size),
            Image.Resampling.NEAREST if size <= 32 else RESAMPLE,
        )
        x = index * panel_width + (panel_width - preview_size) // 2
        sheet.paste(preview.convert("RGB"), (x, 32))
        label = f"{size} x {size}"
        box = draw.textbbox((0, 0), label, font=font)
        draw.text(
            (index * panel_width + (panel_width - (box[2] - box[0])) // 2, 294),
            label,
            fill=(244, 247, 250),
            font=font,
        )
    save_png(sheet, CONTACT_SHEET)


def main() -> None:
    if not MASTER_PATH.exists():
        raise FileNotFoundError(f"Official master not found: {MASTER_PATH}")
    master = Image.open(MASTER_PATH).convert("RGBA")
    if master.size != (1024, 1024):
        raise ValueError(f"Official master must be 1024x1024, got {master.size}")

    ico_images = {size: resize_official(master, size) for size in ICO_SIZES}
    for size, image in ico_images.items():
        save_png(image, ICONS_SRC / f"small-{size}.png")

    ico_frames = {size: (ICONS_SRC / f"small-{size}.png").read_bytes() for size in ICO_SIZES}
    write_ico(ico_frames, TAURI_ICONS / "icon.ico")

    for filename, size in TAURI_PNG_SIZES.items():
        save_png(resize_official(master, size), TAURI_ICONS / filename)
    for filename, size in PUBLIC_SIZES.items():
        save_png(resize_official(master, size), PUBLIC / filename)

    foreground = extract_official_foreground(master)
    background = Image.new("RGBA", master.size, OFFICIAL_GREEN)
    save_png(foreground, ICONS_SRC / "app-icon-fg.png")
    save_png(background, ICONS_SRC / "app-icon-bg.png")

    for density, size in ANDROID_LEGACY_SIZES.items():
        directory = ANDROID_RES / f"mipmap-{density}"
        legacy = resize_official(master, size)
        save_png(legacy, directory / "ic_launcher.png")
        save_png(legacy, directory / "ic_launcher_round.png")
    for density, size in ANDROID_ADAPTIVE_SIZES.items():
        directory = ANDROID_RES / f"mipmap-{density}"
        save_png(foreground.resize((size, size), RESAMPLE), directory / "ic_launcher_foreground.png")
        save_png(Image.new("RGBA", (size, size), OFFICIAL_GREEN), directory / "ic_launcher_background.png")

    ios_directory = TAURI_ICONS / "ios"
    for icon_path in ios_directory.glob("*.png"):
        with Image.open(icon_path) as current:
            size = current.width
        save_png(resize_official(master, size), icon_path)

    generate_contact_sheet(ico_images)

    derived_files = [
        *(ICONS_SRC / f"small-{size}.png" for size in ICO_SIZES),
        TAURI_ICONS / "icon.ico",
        *(TAURI_ICONS / filename for filename in TAURI_PNG_SIZES),
        *(PUBLIC / filename for filename in PUBLIC_SIZES),
        ICONS_SRC / "app-icon-fg.png",
        ICONS_SRC / "app-icon-bg.png",
    ]
    provenance = {
        "hotfix": "9.2",
        "official_source_name": "ChatGPT Image 14 de ago. de 2026, 08_31_39(1).png",
        "master": "../../src/assets/brand/app-icon-master.png",
        "master_sha256": sha256(MASTER_PATH),
        "derivation": "Pillow LANCZOS downscale; light sharpen at <=64px; no redraw",
        "ico_frames": list(ICO_SIZES),
        "derived_sha256": {
            path.relative_to(ROOT).as_posix(): sha256(path) for path in derived_files
        },
    }
    (ICONS_SRC / "icon-manifest.json").write_text(
        json.dumps(provenance, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Branding Hotfix 9.2 generated from {MASTER_PATH.relative_to(ROOT)}")
    print(f"Master SHA-256: {provenance['master_sha256']}")
    print(f"Contact sheet: {CONTACT_SHEET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
