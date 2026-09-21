"""
Genera todos los iconos (Android + PWA) a partir de una imagen fuente cuadrada.
Uso: python gen-icon-assets.py <ruta_imagen_fuente>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

if len(sys.argv) != 2:
    print("Uso: python gen-icon-assets.py <ruta_imagen_fuente>")
    sys.exit(1)

SRC = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parent.parent
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
WEB_PUBLIC = ROOT / "web" / "public"

src = Image.open(SRC).convert("RGBA")
assert src.width == src.height, "la imagen fuente debe ser cuadrada"

def resized(size: int) -> Image.Image:
    return src.resize((size, size), Image.LANCZOS)

def circular(size: int) -> Image.Image:
    """Recorte circular con mascara alfa, para el ic_launcher_round legado."""
    img = resized(size).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    img.putalpha(mask)
    return img

def flattened(size: int) -> Image.Image:
    """Para iOS: sin transparencia, fondo solido detras por si acaso."""
    img = resized(size).convert("RGBA")
    flat = Image.new("RGB", (size, size), (10, 10, 11))
    flat.paste(img, (0, 0), img)
    return flat

# --- Android: icono legado por densidad -------------------------------
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for name, size in DENSITIES.items():
    out_dir = ANDROID_RES / f"mipmap-{name}"
    out_dir.mkdir(parents=True, exist_ok=True)
    resized(size).save(out_dir / "ic_launcher.png")
    circular(size).save(out_dir / "ic_launcher_round.png")
    print(f"mipmap-{name}/ic_launcher{{,_round}}.png ({size}px)")

# --- Android: capa foreground del icono adaptativo (API 26+) ----------
adaptive_dir = ANDROID_RES / "drawable"
adaptive_dir.mkdir(parents=True, exist_ok=True)
resized(432).save(adaptive_dir / "ic_launcher_foreground.png")
print("drawable/ic_launcher_foreground.png (432px)")

# --- PWA -----------------------------------------------------------------
WEB_PUBLIC.mkdir(parents=True, exist_ok=True)
for size in (180, 192, 512):
    flattened(size).save(WEB_PUBLIC / f"icon-{size}.png")
    print(f"web/public/icon-{size}.png")

print("\nListo.")
