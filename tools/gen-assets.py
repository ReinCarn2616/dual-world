#!/usr/bin/env python3
"""生成《光影之间》的全部美术资源与预览图（离线脚本，Pillow，不属于游戏运行时）。

用法（项目根目录）：
    python tools/gen-assets.py

产物：
    assets/tiles/tileset-{light,dark}.png    18 帧 × 32×32（索引见 §7.5.4）
    assets/hazard/lava-{light,dark}.png      4 帧 × 32×32
    assets/ui/exit-{light,dark}.png          4 帧 × 32×32
    assets/player/player-{light,dark}.png    20 帧 × 32×64（帧序见 §7.5.3）
    assets/bg/bg-{light,dark}.png            960×576 视差远景
    preview/l1-light.png / l1-dark.png       第 1 关渲染预览
    preview/l1-compare@2x.png                光暗对比（2 倍最近邻）
    preview/assets-sheet@3x.png              全部素材的接触印相表

调色板与关卡数据都从 src/palette.js / src/levels.js 里解析，
保证"改一行关卡字符串 → 重跑脚本 → 预览跟着更新"（§6.5）。
"""

from __future__ import annotations

import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
PREVIEW = ROOT / "preview"

TILE = 32
COLS, ROWS = 20, 12
FRAMES_PLAYER = 20
FRAMES_TILE = 18
FRAMES_ANIM = 4


# --------------------------------------------------------------------- 读取源码

def read_text(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def parse_palette() -> dict:
    txt = read_text("src/palette.js")
    out = {}
    for world in ("light", "dark"):
        m = re.search(world + r":\s*\{(.*?)\}", txt, re.S)
        if not m:
            raise SystemExit(f"无法从 src/palette.js 解析 {world} 调色板")
        out[world] = dict(re.findall(r"(\w+):\s*'(#[0-9A-Fa-f]{6})'", m.group(1)))
    return out


def parse_levels() -> list:
    txt = read_text("src/levels.js")
    # id 与 name 之间允许出现任意数量的其它字段（group 会被单独抓出来，
    # 其余字段跳过），这样以后往关卡对象里加字段不会把预览生成器弄坏。
    pattern = re.compile(
        r"id:\s*(\d+),\s*(?:group:\s*'([^']*)',\s*)?(?:[A-Za-z_]+:\s*(?:'[^']*'|\d+),\s*)*name:\s*'([^']*)',.*?light:\s*\[(.*?)\],\s*dark:\s*\[(.*?)\],",
        re.S,
    )
    levels = []
    for m in pattern.finditer(txt):
        lid = int(m.group(1))
        group = m.group(2) or "tutorial"
        name = m.group(3)
        light = re.findall(r"'([^']*)'", m.group(4))
        dark = re.findall(r"'([^']*)'", m.group(5))
        levels.append({"id": lid, "group": group, "name": name, "light": light, "dark": dark})
    if not levels:
        raise SystemExit("无法从 src/levels.js 解析关卡数据")
    return levels


def hex2rgb(h: str) -> tuple:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgba(h: str, a: int = 255) -> tuple:
    r, g, b = hex2rgb(h)
    return (r, g, b, a)


# --------------------------------------------------------------------- 绘制工具

def new_image(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def rect(d: ImageDraw.ImageDraw, x, y, w, h, color) -> None:
    if w <= 0 or h <= 0:
        return
    d.rectangle([int(x), int(y), int(x + w - 1), int(y + h - 1)], fill=color)


def overlay_rect(img: Image.Image, x, y, w, h, color, alpha: float) -> None:
    """按 alpha 叠加一块颜色（用于砖块的内部亮带）"""
    if w <= 0 or h <= 0:
        return
    layer = new_image(img.width, img.height)
    d = ImageDraw.Draw(layer)
    rect(d, x, y, w, h, rgba(color, int(round(255 * alpha))))
    img.alpha_composite(layer)


def outline_rect(d: ImageDraw.ImageDraw, x, y, w, h, fill, outline) -> None:
    rect(d, x - 1, y - 1, w + 2, h + 2, outline)
    rect(d, x, y, w, h, fill)


# --------------------------------------------------------------------- 瓦片集

def draw_brick(img: Image.Image, ox: int, oy: int, mask: int, pal: dict) -> None:
    d = ImageDraw.Draw(img)
    S = TILE
    rect(d, ox, oy, S, S, rgba(pal["brick"]))
    # 砖缝
    overlay_rect(img, ox, oy + 10, S, 2, pal["bg"], 0.16)
    overlay_rect(img, ox, oy + 22, S, 2, pal["bg"], 0.16)
    overlay_rect(img, ox + 8, oy, 2, 10, pal["bg"], 0.16)
    overlay_rect(img, ox + 22, oy + 12, 2, 10, pal["bg"], 0.16)
    if mask & 1:   # 上
        overlay_rect(img, ox, oy + 1, S, 2, pal["bg"], 0.25)
        overlay_rect(img, ox, oy, S, 1, pal["bg"], 0.55)
    if mask & 4:   # 下
        overlay_rect(img, ox, oy + S - 3, S, 2, pal["bg"], 0.25)
        overlay_rect(img, ox, oy + S - 1, S, 1, pal["bg"], 0.45)
    if mask & 8:   # 左
        overlay_rect(img, ox + 1, oy, 2, S, pal["bg"], 0.25)
        overlay_rect(img, ox, oy, 1, S, pal["bg"], 0.55)
    if mask & 2:   # 右
        overlay_rect(img, ox + S - 3, oy, 2, S, pal["bg"], 0.25)
        overlay_rect(img, ox + S - 1, oy, 1, S, pal["bg"], 0.45)


def make_tileset(pal: dict) -> Image.Image:
    img = new_image(TILE * FRAMES_TILE, TILE)
    for mask in range(16):
        index = 0 if mask == 15 else 1 + mask
        draw_brick(img, index * TILE, 0, mask, pal)
    d = ImageDraw.Draw(img)
    # 16 单向平台
    px = 16 * TILE
    overlay_rect(img, px, 0, TILE, 8, pal["brick"], 0.9)
    rect(d, px, 1, TILE, 2, rgba(pal["bg"]))
    # 17 终点门底座
    ex = 17 * TILE
    rect(d, ex, 0, TILE, TILE, rgba(pal["brick"]))
    rect(d, ex + 7, 6, 18, 26, rgba(pal["exit"]))
    rect(d, ex + 13, 12, 6, 10, rgba(pal["bg"]))
    return img


# --------------------------------------------------------------------- 熔岩 / 终点

def make_hazard(pal: dict) -> Image.Image:
    img = new_image(TILE * FRAMES_ANIM, TILE)
    d = ImageDraw.Draw(img)
    for f in range(FRAMES_ANIM):
        ox = f * TILE
        rect(d, ox, 0, TILE, TILE, rgba(pal["hazard"]))
        for i in range(TILE):
            h = 3 + round(2.5 + 2.5 * math.sin((i + f * 5) * 0.45))
            overlay_rect(img, ox + i, 0, 1, h, pal["bg"], 0.22)
        for i in range(TILE):
            h = 1 + round(1.5 + 1.5 * math.sin((i + f * 3) * 0.7))
            overlay_rect(img, ox + i, 0, 1, h, pal["bg"], 0.35)
        overlay_rect(img, ox + 6 + ((f * 7) % 5), 14, 3, 3, pal["bg"], 0.3)
        overlay_rect(img, ox + 21 - ((f * 5) % 4), 22, 2, 2, pal["bg"], 0.3)
    return img


def make_exit(pal: dict) -> Image.Image:
    img = new_image(TILE * FRAMES_ANIM, TILE)
    d = ImageDraw.Draw(img)
    pulse = [0, 1, 2, 1]
    for f in range(FRAMES_ANIM):
        ox = f * TILE
        rect(d, ox, 0, TILE, TILE, rgba(pal["bg"]))
        rect(d, ox + 4, 2, 24, 30, rgba(pal["brick"]))
        rect(d, ox + 7, 5, 18, 27, rgba(pal["exit"]))
        overlay_rect(img, ox + 10, 9, 12, 20, pal["bg"], 0.18 + pulse[f] * 0.08)
        overlay_rect(img, ox + 20, 18, 3, 3, pal["bg"], 0.5)
    return img


# --------------------------------------------------------------------- 角色

ANIM_FRAMES = {
    "idle": [0, 1, 2, 3],
    "run": [4, 5, 6, 7, 8, 9],
    "jump": [10, 11],
    "fall": [12, 13],
    "land": [14, 15],
    "die": [16, 17, 18, 19],
}

FRAME_W, FRAME_H = 32, 64
FOOT_OFFSET = 2  # 底部留 2 px 给白色描边


def pose_for(index: int) -> dict:
    if index in ANIM_FRAMES["idle"]:
        i = ANIM_FRAMES["idle"].index(index)
        return {"bob": [0, -1, 0, 1][i]}
    if index in ANIM_FRAMES["run"]:
        i = ANIM_FRAMES["run"].index(index)
        return {
            "bob": [0, -1, 0, 0, -1, 0][i],
            "legL": [0, -3, -5, 0, 3, 5][i],
            "legR": [0, 3, 5, 0, -3, -5][i],
            "arms": 2 if i % 2 else 0,
        }
    if index == 10:
        return {"stretch": 2, "legL": 2, "legR": -2, "arms": 3}
    if index == 11:
        return {"stretch": 1, "legL": 1, "legR": -1, "arms": 2}
    if index == 12:
        return {"legL": 2, "legR": -3, "arms": 2}
    if index == 13:
        return {"legL": -2, "legR": 3, "arms": 1}
    if index == 14:
        return {"squash": 5, "legL": -2, "legR": 2}
    if index == 15:
        return {"squash": 3, "legL": -1, "legR": 1}
    i = index - 16
    return {
        "dieT": [0.2, 0.45, 0.7, 0.95][i],
        "bob": [0, 2, 4, 6][i],
        "legL": [0, 3, -3, 5][i],
        "legR": [0, -3, 3, -5][i],
    }


def draw_actor(img: Image.Image, ox: int, oy: int, pal: dict, pose: dict) -> None:
    """把一帧角色画到 img 的 (ox, oy) 位置。

    注意：所有绘制坐标都是**帧内局部坐标**，最后整层按 (ox, oy) 合成。
    早期版本用帧内尺寸的图层却按整张精灵表的坐标绘制，结果只有第 0 帧有像素、
    第 1–19 帧全空 —— 表现就是角色"一闪一闪"（idle 只有 1/4 帧可见）
    和"跑起来人没了"（run 用的是第 4–9 帧，全空）。
    """
    bob = pose.get("bob", 0)
    legL = pose.get("legL", 0)
    legR = pose.get("legR", 0)
    squash = pose.get("squash", 0)
    stretch = pose.get("stretch", 0)
    die_t = pose.get("dieT", 0.0)
    arms = pose.get("arms", 0)

    c = rgba(pal["player"])
    line = rgba(pal["brick"])
    eye = rgba(pal["bg"])

    layer = new_image(FRAME_W, FRAME_H)
    d = ImageDraw.Draw(layer)

    feet = FRAME_H - FOOT_OFFSET
    body_h = 56 + stretch - squash
    top = feet - body_h + bob
    cx = FRAME_W / 2

    leg_top = top + body_h * 0.62
    leg_h = feet - leg_top

    # 腿
    outline_rect(d, cx - 8 + legL, leg_top, 6, leg_h, c, line)
    outline_rect(d, cx + 2 + legR, leg_top, 6, leg_h, c, line)
    # 身体
    outline_rect(d, cx - 9, top + 12, 18, body_h - 12 - (feet - leg_top) + 6, c, line)
    # 手臂
    outline_rect(d, cx - 13, top + 16 - arms, 5, 16, c, line)
    outline_rect(d, cx + 8, top + 16 - arms, 5, 16, c, line)
    # 头
    outline_rect(d, cx - 8, top, 16, 15, c, line)
    # 眼（朝右）
    rect(d, cx + 1, top + 5, 5, 5, eye)
    rect(d, cx + 3, top + 6, 2, 3, line)

    if die_t > 0:
        layer.putalpha(layer.getchannel("A").point(lambda a, t=die_t: int(a * max(0.0, 1 - t))))
    img.alpha_composite(layer, (ox, oy))


def make_player_sheet(pal: dict) -> Image.Image:
    img = new_image(FRAME_W * FRAMES_PLAYER, FRAME_H)
    for i in range(FRAMES_PLAYER):
        draw_actor(img, i * FRAME_W, 0, pal, pose_for(i))
    return img


# --------------------------------------------------------------------- 远景背景

BG_W, BG_H = 960, 576


def make_background(pal: dict, world: str) -> Image.Image:
    img = new_image(BG_W, BG_H)
    d = ImageDraw.Draw(img)

    top = hex2rgb(pal["bg"])
    mid = (27, 31, 46) if world == "dark" else (239, 231, 214)
    bot = (14, 16, 23) if world == "dark" else (228, 218, 197)
    for y in range(BG_H):
        t = y / (BG_H - 1)
        if t < 0.55:
            k = t / 0.55
            col = tuple(round(top[i] + (mid[i] - top[i]) * k) for i in range(3))
        else:
            k = (t - 0.55) / 0.45
            col = tuple(round(mid[i] + (bot[i] - mid[i]) * k) for i in range(3))
        d.line([(0, y), (BG_W, y)], fill=col + (255,))

    # 光斑 / 星点（确定性伪随机，形状与 JS 兜底一致的做法）
    seed = 20261004 if world == "dark" else 20261005

    def rnd():
        nonlocal seed
        seed = (seed * 1664525 + 1013904223) % (2 ** 32)
        return seed / 2 ** 32

    brick = hex2rgb(pal["brick"])
    for _ in range(150 if world == "dark" else 90):
        x = rnd() * BG_W
        y = rnd() * BG_H
        if world == "dark":
            r = 1 + rnd() * 2.5
            a = 0.12 + rnd() * 0.30
        else:
            r = 4 + rnd() * 9
            a = 0.03 + rnd() * 0.04
        layer = new_image(BG_W, BG_H)
        dl = ImageDraw.Draw(layer)
        dl.ellipse([x - r, y - r, x + r, y + r], fill=brick + (int(255 * a),))
        img.alpha_composite(layer)

    # 远景剪影
    for layer_i in range(3):
        a = (0.10 + layer_i * 0.05) if world == "dark" else (0.06 + layer_i * 0.03)
        base = BG_H * (0.62 + layer_i * 0.11)
        pts = [(0, BG_H)]
        for x in range(0, BG_W + 24, 24):
            yy = base - math.sin((x / BG_W) * math.pi * (1.5 + layer_i * 0.7) + layer_i) * (40 - layer_i * 10) - layer_i * 18
            pts.append((x, yy))
        pts.append((BG_W, BG_H))
        lay = new_image(BG_W, BG_H)
        ImageDraw.Draw(lay).polygon(pts, fill=brick + (int(255 * a),))
        img.alpha_composite(lay)
    return img


# --------------------------------------------------------------------- 关卡预览

def exposed_mask(grid, c, r) -> int:
    def solid(cc, rr):
        if cc < 0 or cc >= COLS:
            return True
        if rr < 0 or rr >= len(grid):
            return False
        return grid[rr][cc] == "#"

    mask = 0
    if not solid(c, r - 1):
        mask |= 1
    if not solid(c + 1, r):
        mask |= 2
    if not solid(c, r + 1):
        mask |= 4
    if not solid(c - 1, r):
        mask |= 8
    return mask


def render_level(level: dict, world: str, sheets: dict, pals: dict, scale: int = 1, ghosts: bool = False) -> Image.Image:
    grid = level[world]
    rows = len(grid)
    cols = len(grid[0])
    other = level["dark" if world == "light" else "light"]
    pal = pals[world]
    w = cols * TILE
    h = rows * TILE
    img = new_image(w, h)
    d = ImageDraw.Draw(img)

    # 背景：平铺 bg 图（进阶关地图比背景大得多）
    bg = sheets[f"bg-{world}"]
    for by in range(0, h, bg.height):
        for bx in range(0, w, bg.width):
            img.alpha_composite(bg, (bx, by))

    # 叠影（可选，游戏里默认关闭）：另一世界的实体 0.18 / 危险 0.12，统一灰色（§7.2）
    if ghosts:
        ghost = new_image(w, h)
        dg = ImageDraw.Draw(ghost)
        solid_gray = (122, 122, 122, int(255 * 0.18))
        hazard_gray = (122, 122, 122, int(255 * 0.12))
        for r in range(rows):
            for c in range(cols):
                ch = other[r][c]
                if ch == "#":
                    rect(dg, c * TILE, r * TILE, TILE, TILE, solid_gray)
                elif ch == "X":
                    rect(dg, c * TILE, r * TILE, TILE, TILE, hazard_gray)
        img.alpha_composite(ghost)

    # 当前世界的实心砖（带自动图块）+ 危险物 + 终点
    tiles = sheets[f"tileset-{world}"]
    hazard = sheets[f"lava-{world}"]
    exit_img = sheets[f"exit-{world}"]
    for r in range(rows):
        for c in range(cols):
            ch = grid[r][c]
            if ch == "#":
                idx = 0 if exposed_mask(grid, c, r) == 15 else 1 + exposed_mask(grid, c, r)
                img.alpha_composite(tiles.crop((idx * TILE, 0, idx * TILE + TILE, TILE)), (c * TILE, r * TILE))
            elif ch == "X":
                img.alpha_composite(hazard.crop((0, 0, TILE, TILE)), (c * TILE, r * TILE))
            elif ch == "E":
                img.alpha_composite(exit_img.crop((0, 0, TILE, TILE)), (c * TILE, r * TILE))
            elif ch == "P":
                pass
    # 玩家（出生点，idle 第 0 帧）
    sheet = sheets[f"player-{world}"]
    px = py = None
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == "P":
                px, py = c, r
    if px is not None:
        frame = sheet.crop((0, 0, FRAME_W, FRAME_H))
        feet_y = (py + 1) * TILE
        img.alpha_composite(frame, (px * TILE + TILE // 2 - FRAME_W // 2, feet_y - (FRAME_H - FOOT_OFFSET)))

    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    return img


# --------------------------------------------------------------------- 接触印相表

def load_font(size: int):
    for name in ("msyh.ttc", "simhei.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def make_sheet(entries: list, width: int = 2000) -> Image.Image:
    font = load_font(20)
    items = []
    for label, img in entries:
        scale = 1
        if img.width > width - 40:
            scale = (width - 40) / img.width
        if scale < 1:
            shown = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.NEAREST)
        elif img.width * 3 <= width - 40:
            shown = img.resize((img.width * 3, img.height * 3), Image.NEAREST)
        else:
            shown = img
        items.append((label, shown, img.width, img.height))

    height = 40
    for _label, shown, _w, _h in items:
        height += shown.height + 34
    out = Image.new("RGBA", (width, height), (18, 20, 28, 255))
    d = ImageDraw.Draw(out)
    y = 16
    for label, shown, w, h in items:
        d.text((20, y), f"{label}  ({w}x{h})", font=font, fill=(230, 230, 240, 255))
        y += 28
        out.alpha_composite(shown, (20, y))
        y += shown.height + 6
    return out


# --------------------------------------------------------------------- main

def main() -> None:
    pals = parse_palette()
    levels = parse_levels()

    for sub in ("tiles", "hazard", "ui", "player", "bg", "promo"):
        (ASSETS / sub).mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)

    sheets = {}
    for world in ("light", "dark"):
        pal = pals[world]
        sheets[f"tileset-{world}"] = make_tileset(pal)
        sheets[f"lava-{world}"] = make_hazard(pal)
        sheets[f"exit-{world}"] = make_exit(pal)
        sheets[f"player-{world}"] = make_player_sheet(pal)
        sheets[f"bg-{world}"] = make_background(pal, world)

    written = []
    for key, path in (
        ("tileset-light", ASSETS / "tiles" / "tileset-light.png"),
        ("tileset-dark", ASSETS / "tiles" / "tileset-dark.png"),
        ("lava-light", ASSETS / "hazard" / "lava-light.png"),
        ("lava-dark", ASSETS / "hazard" / "lava-dark.png"),
        ("exit-light", ASSETS / "ui" / "exit-light.png"),
        ("exit-dark", ASSETS / "ui" / "exit-dark.png"),
        ("player-light", ASSETS / "player" / "player-light.png"),
        ("player-dark", ASSETS / "player" / "player-dark.png"),
        ("bg-light", ASSETS / "bg" / "bg-light.png"),
        ("bg-dark", ASSETS / "bg" / "bg-dark.png"),
    ):
        sheets[key].save(path)
        written.append(path.relative_to(ROOT))

    # 预览图：第 1 关（默认外观 = 不画叠影，与游戏出厂设置一致）
    l1 = next((lv for lv in levels if lv["id"] == 1), levels[0])
    light = render_level(l1, "light", sheets, pals)
    dark = render_level(l1, "dark", sheets, pals)
    light.save(PREVIEW / "l1-light.png")
    dark.save(PREVIEW / "l1-dark.png")
    written.append(Path("preview/l1-light.png"))
    written.append(Path("preview/l1-dark.png"))

    gap = 16

    def compare(a: Image.Image, b: Image.Image, name: str):
        out = Image.new("RGBA", (a.width * 2 + gap, a.height), (18, 20, 28, 255))
        out.alpha_composite(a, (0, 0))
        out.alpha_composite(b, (a.width + gap, 0))
        out = out.resize((out.width * 2, out.height * 2), Image.NEAREST)
        out.save(PREVIEW / name)
        written.append(Path("preview") / name)

    compare(light, dark, "l1-compare@2x.png")

    # 另一组：打开叠影后的样子（设置 → 显示 → 显示另一个世界的残影）
    light_g = render_level(l1, "light", sheets, pals, ghosts=True)
    dark_g = render_level(l1, "dark", sheets, pals, ghosts=True)
    light_g.save(PREVIEW / "l1-light-ghosts.png")
    dark_g.save(PREVIEW / "l1-dark-ghosts.png")
    written.append(Path("preview/l1-light-ghosts.png"))
    written.append(Path("preview/l1-dark-ghosts.png"))
    compare(light_g, dark_g, "l1-compare-ghosts@2x.png")

    # 进阶关：整张地图画出来（地图比画面大，这里是没有摄像机的全貌）
    for lv in levels:
        if lv.get("group") != "advanced":
            continue
        parts = []
        for world in ("light", "dark"):
            im = render_level(lv, world, sheets, pals)
            parts.append(im)
            im.save(PREVIEW / f"l{lv['id']}-{world}.png")
            written.append(Path(f"preview/l{lv['id']}-{world}.png"))
        gap_v = 12
        out = Image.new("RGBA", (max(p.width for p in parts), sum(p.height for p in parts) + gap_v), (18, 20, 28, 255))
        y = 0
        for p in parts:
            out.alpha_composite(p, (0, y))
            y += p.height + gap_v
        out.save(PREVIEW / f"l{lv['id']}-map.png")
        written.append(Path(f"preview/l{lv['id']}-map.png"))

    entries = [
        ("player-light (idle4/run6/jump2/fall2/land2/die4)", sheets["player-light"]),
        ("player-dark", sheets["player-dark"]),
        ("tileset-light (0 通用 / 1-15 边缘 / 16 单向 / 17 门座)", sheets["tileset-light"]),
        ("tileset-dark", sheets["tileset-dark"]),
        ("lava-light 4 帧", sheets["lava-light"]),
        ("lava-dark 4 帧", sheets["lava-dark"]),
        ("exit-light 4 帧", sheets["exit-light"]),
        ("exit-dark 4 帧", sheets["exit-dark"]),
        ("bg-light 960x576", sheets["bg-light"]),
        ("bg-dark 960x576", sheets["bg-dark"]),
    ]
    sheet = make_sheet(entries)
    sheet.save(PREVIEW / "assets-sheet@3x.png")
    written.append(Path("preview/assets-sheet@3x.png"))

    print(f"调色板：{pals}")
    print(f"关卡：{len(levels)} 关（{', '.join(lv['name'] for lv in levels)}）")
    for p in written:
        print(f"  写出 {p}")


if __name__ == "__main__":
    main()
