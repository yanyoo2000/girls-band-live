"""v1.0.1 视觉可见性实测（dev-three）。

用法：
  python measure.py stats <png>
  python measure.py diff <pngA> <pngB>

区域定义（1280×720 与 1920×1080 按比例换算）：
  full      整帧（含 HUD）
  stage     舞台区：x 0.20–0.80、y 0.60–0.86（台面 + 乐手）
  audience  观众席：x 0.10–0.90、y 0.15–0.57（座椅/观众/噪音）
  hudFree   去掉上下 HUD 带（y 0.10–0.94、x 0.02–0.98）后的画面
亮度 = RGB 三通道均值（0–255，与试玩报告的“平均亮度”同口径）；另给 Rec.709 luma 作参照。
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


REGIONS = {
    "full": (0.0, 0.0, 1.0, 1.0),
    "hudFree": (0.02, 0.10, 0.98, 0.94),
    "stage": (0.20, 0.60, 0.80, 0.86),
    "audience": (0.10, 0.15, 0.90, 0.57),
}


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def region_box(image: Image.Image, box: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    width, height = image.size
    left, top, right, bottom = box
    return (
        max(0, int(left * width)),
        max(0, int(top * height)),
        min(width, int(right * width)),
        min(height, int(bottom * height)),
    )


def mean_rgb(image: Image.Image) -> float:
    pixels = list(image.getdata())
    total = 0
    for r, g, b in pixels:
        total += r + g + b
    return total / (3 * len(pixels))


def mean_luma(image: Image.Image) -> float:
    pixels = list(image.getdata())
    total = 0.0
    for r, g, b in pixels:
        total += 0.2126 * r + 0.7152 * g + 0.0722 * b
    return total / len(pixels)


def stats(path: Path) -> None:
    image = load(path)
    print(f"file: {path.name}  size: {image.size[0]}x{image.size[1]}")
    for name, box in REGIONS.items():
        crop = image.crop(region_box(image, box))
        pixels = list(crop.getdata())
        dark = sum(1 for r, g, b in pixels if max(r, g, b) < 40)
        bright = sum(1 for r, g, b in pixels if (r + g + b) / 3 > 80)
        print(
            f"{name:9s} meanRGB={mean_rgb(crop):6.2f}  luma={mean_luma(crop):6.2f}"
            f"  <40: {100.0 * dark / len(pixels):5.1f}%  >80: {100.0 * bright / len(pixels):5.1f}%"
        )


def diff(path_a: Path, path_b: Path, threshold: int = 6) -> None:
    a = load(path_a)
    b = load(path_b)
    if a.size != b.size:
        raise SystemExit(f"size mismatch: {a.size} vs {b.size}")
    for name, box in REGIONS.items():
        crop_a = a.crop(region_box(a, box))
        crop_b = b.crop(region_box(b, box))
        changed = 0
        pixels_a = list(crop_a.getdata())
        pixels_b = list(crop_b.getdata())
        for (r1, g1, b1), (r2, g2, b2) in zip(pixels_a, pixels_b):
            if max(abs(r1 - r2), abs(g1 - g2), abs(b1 - b2)) > threshold:
                changed += 1
        ratio = 100.0 * changed / len(pixels_a)
        print(f"{name:9s} pixels diff>{threshold}: {changed:7d} / {len(pixels_a):7d} = {ratio:5.2f}%")


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    mode = argv[1]
    if mode == "stats":
        stats(Path(argv[2]))
        return 0
    if mode == "diff":
        if len(argv) < 4:
            print(__doc__)
            return 2
        diff(Path(argv[2]), Path(argv[3]))
        return 0
    print(f"unknown mode: {mode}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
