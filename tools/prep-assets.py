#!/usr/bin/env python3
"""ComfyUI 产出的后处理链（需求文档 §7.7.3）。

ComfyUI 只能离线出图，产出的 PNG 必须经过这条链才能进 assets/：
    裁切出单个瓦片（人工对齐到网格）
      → 最近邻下采样到 32×32      （绝不能用双线性/双三次，会糊成一团）
      → 调色板量化到 §7.1 的 5 色以内
      → 无缝检查（左右/上下拼接后放大看有没有缝）
      → 去背 / 补 alpha 通道
      → 存入 assets/tiles/tileset-<world>.png

用法示例
--------
# 1) 一张大图切成 4×4 张瓦片，拼成 tileset 的一行（会把每格下采样到 32×32 并量化）
python tools/prep-assets.py sheet big.png --out assets/tiles/custom-light.png \
    --grid 4x4 --world light --check-seam

# 2) 单张图当整张瓦片用
python tools/prep-assets.py tile big.png --out assets/tiles/one.png \
    --crop 100,100,512,512 --world dark

# 3) 视差远景：直接缩放到 960×576（背景是照片类图像，用 LANCZOS 更好看）
python tools/prep-assets.py bg keyvisual.png --out assets/bg/bg-light.png --world light

# 4) 只看无缝检查结果，不写文件
python tools/prep-assets.py tile big.png --crop 0,0,512,512 --world light --check-seam
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# §7.1 的双世界调色板（每世界 5 色）——量化目标
PALETTE = {
    "light": ["#F4EFE2", "#2B2B33", "#E4572E", "#C1292E", "#3D9970"],
    "dark": ["#14161F", "#8A93B5", "#4ECDC4", "#FF6B35", "#F5D547"],
}

TILE = 32
BG_SIZE = (960, 576)


def hex2rgb(h: str) -> tuple:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def palette_image(world: str) -> Image.Image:
    """把调色板做成一整块调色板图像，交给 Pillow 的 quantize 用"""
    colors = [hex2rgb(c) for c in PALETTE[world]]
    pal = Image.new("P", (1, 1))
    flat = []
    for c in colors:
        flat.extend(c)
    flat.extend([0, 0, 0] * (256 - len(colors)))
    pal.putpalette(flat)
    return pal


def quantize(img: Image.Image, world: str) -> Image.Image:
    """把图像量化到该世界的 5 色以内（保留 alpha）"""
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if has_alpha:
        rgba = img.convert("RGBA")
        alpha = rgba.getchannel("A")
        rgb = rgba.convert("RGB")
    else:
        alpha = None
        rgb = img.convert("RGB")
    q = rgb.quantize(palette=palette_image(world), dither=Image.Dither.NONE).convert("RGB")
    if alpha is not None:
        q = q.convert("RGBA")
        q.putalpha(alpha)
    return q


def seam_report(img: Image.Image, label: str = "") -> float:
    """无缝检查：左右边缘、上下边缘的平均色差（0 最好）"""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    left = [px[0, y] for y in range(h)]
    right = [px[w - 1, y] for y in range(h)]
    top = [px[x, 0] for x in range(w)]
    bottom = [px[x, h - 1] for x in range(w)]

    def diff(a, b):
        return sum(abs(x[i] - y[i]) for x, y in zip(a, b) for i in range(4)) / (len(a) * 4)

    dlr = diff(left, right)
    dtb = diff(top, bottom)
    print(f"   无缝检查{(' ' + label) if label else ''}：左右边缘平均色差 {dlr:6.2f}，上下边缘平均色差 {dtb:6.2f}"
          f"（0 = 完美衔接；> 18 就说明有缝，铺一墙会露出网格线）")
    return max(dlr, dtb)


def seam_preview(img: Image.Image, out: Path) -> None:
    """把瓦片拼成 3×3、放大 4 倍存一份，肉眼确认有没有缝"""
    w, h = img.size
    sheet = Image.new("RGBA", (w * 3, h * 3))
    for i in range(3):
        for j in range(3):
            sheet.alpha_composite(img.convert("RGBA"), (i * w, j * h))
    sheet = sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"   无缝预览（3×3 拼接、4 倍放大）：{out.relative_to(ROOT)}")


def parse_crop(text: str):
    parts = [p.strip() for p in text.split(",")]
    if len(parts) != 4:
        raise SystemExit("--crop 需要四个数字：x,y,w,h")
    return tuple(int(float(p)) for p in parts)


def parse_grid(text: str):
    parts = [p.strip().lower() for p in text.replace("×", "x").split("x")]
    if len(parts) != 2:
        raise SystemExit("--grid 需要形如 4x4")
    return int(parts[0]), int(parts[1])


def cmd_tile(args) -> None:
    src = Image.open(args.input)
    if args.crop:
        src = src.crop(parse_crop(args.crop))
    tile = src.convert("RGBA").resize((TILE, TILE), Image.NEAREST)
    if args.quantize:
        tile = quantize(tile, args.world)
    if args.check_seam:
        seam_report(tile)
        if args.out:
            seam_preview(tile, Path(args.out).with_name(Path(args.out).stem + "-seam-preview.png"))
    if not args.out:
        print("   （没有 --out，只做了检查，未写文件）")
        return
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tile.save(out)
    print(f"   写出 {out.relative_to(ROOT)}（{tile.width}×{tile.height}）")


def cmd_sheet(args) -> None:
    src = Image.open(args.input).convert("RGBA")
    cols, rows = parse_grid(args.grid)
    cw = src.width // cols
    ch = src.height // rows
    print(f"   输入 {src.width}×{src.height} → 切成 {cols}×{rows}，每格 {cw}×{ch}")
    cells = []
    for r in range(rows):
        for c in range(cols):
            cell = src.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            cell = cell.resize((TILE, TILE), Image.NEAREST)
            if args.quantize:
                cell = quantize(cell, args.world)
            cells.append(cell)
    sheet = Image.new("RGBA", (TILE * len(cells), TILE))
    for i, cell in enumerate(cells):
        sheet.alpha_composite(cell, (i * TILE, 0))
    if args.check_seam:
        worst = 0.0
        for i, cell in enumerate(cells):
            worst = max(worst, seam_report(cell, f"第 {i + 1} 格"))
        print(f"   最差缝隙评分 {worst:.2f}" + ("（建议重出图）" if worst > 18 else "（可以接受）"))
    if not args.out:
        print("   （没有 --out，只做了检查，未写文件）")
        return
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"   写出 {out.relative_to(ROOT)}（{sheet.width}×{sheet.height}，{len(cells)} 格）")
    print("   注意：瓦片集索引含义见 §7.5.4（0 通用砖 / 1-15 边缘 / 16 单向平台 / 17 门座）")


def cmd_bg(args) -> None:
    src = Image.open(args.input).convert("RGB")
    # 先按比例裁到 5:3，再缩放，避免拉伸变形
    target_ratio = BG_SIZE[0] / BG_SIZE[1]
    w, h = src.size
    if w / h > target_ratio:
        new_w = int(h * target_ratio)
        src = src.crop(((w - new_w) // 2, 0, (w - new_w) // 2 + new_w, h))
    else:
        new_h = int(w / target_ratio)
        src = src.crop((0, (h - new_h) // 2, w, (h - new_h) // 2 + new_h))
    bg = src.resize(BG_SIZE, Image.LANCZOS)
    if not args.out:
        print("   （没有 --out，只做了处理，未写文件）")
        return
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    bg.save(out)
    print(f"   写出 {out.relative_to(ROOT)}（{bg.width}×{bg.height}）")
    print("   背景为 960×576：视差 ±0.5 时横竖都不需要放大，任何偏移都不会露边（已确认决策）")


def main() -> None:
    ap = argparse.ArgumentParser(description="ComfyUI 产出 → assets/ 的后处理链（§7.7.3）")
    sub = ap.add_subparsers(dest="mode", required=True)

    for name, fn in (("tile", cmd_tile), ("sheet", cmd_sheet), ("bg", cmd_bg)):
        p = sub.add_parser(name)
        p.add_argument("input", help="ComfyUI 产出的 PNG 路径")
        p.add_argument("--out", help="输出路径（省略则只做检查）")
        p.add_argument("--world", choices=["light", "dark"], default="light", help="量化用哪套调色板")
        p.add_argument("--no-quantize", dest="quantize", action="store_false", help="不做调色板量化")
        p.add_argument("--check-seam", action="store_true", help="做无缝检查（瓦片必做）")
        p.set_defaults(quantize=True, func=fn)
        if name == "tile":
            p.add_argument("--crop", help="人工对齐的裁切框：x,y,w,h")
        if name == "sheet":
            p.add_argument("--grid", default="4x4", help="把输入切成几行几列，默认 4x4")

    args = ap.parse_args()
    if not Path(args.input).exists():
        raise SystemExit(f"输入文件不存在：{args.input}")
    args.func(args)


if __name__ == "__main__":
    main()
