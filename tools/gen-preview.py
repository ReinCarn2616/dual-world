"""
【已弃用 / DEPRECATED】请改用 tools/gen-assets.py

这个脚本是早期版本的占位图生成器，它的瓦片集索引与 §7.5.4 不一致
（旧版把熔岩与终点门混在瓦片集里，而规格要求 0=通用砖 / 1-15=边缘变体 /
16=单向平台 / 17=终点门底座，熔岩与门分别在 hazard/ 与 ui/ 下）。
**不要再用它生成 assets/**，否则游戏画面会与 manifest 的声明对不上。

保留它只是为了留一份"早期占位图长什么样"的记录。当前的正式生成器：
    python tools/gen-assets.py     # 全部 PNG + preview/ 预览图
"""

import sys

if "--i-know-this-is-deprecated" not in sys.argv:
    print(__doc__)
    sys.exit(1)

import os
from PIL import Image, ImageDraw, ImageFilter

TILE = 32
GRID_W, GRID_H = 20, 12
SPR_W, SPR_H = 32, 64

# ── §7.1 双世界调色板 ────────────────────────────────────────────────
PALETTE = {
    "light": dict(bg="#F4EFE2", brick="#2B2B33", player="#E4572E", lava="#C1292E", exit="#3D9970"),
    "dark":  dict(bg="#14161F", brick="#8A93B5", player="#4ECDC4", lava="#FF6B35", exit="#F5D547"),
}
GHOST_RGB = (0x7A, 0x7A, 0x7A)   # §7.2 叠影用统一灰色，不用危险物的颜色


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(c, target, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c, target))


def lighten(c, t): return mix(c, (255, 255, 255), t)
def darken(c, t):  return mix(c, (0, 0, 0), t)


def rgba(c, a=255):
    return (c[0], c[1], c[2], a)


# ── 瓦片：实心砖 ────────────────────────────────────────────────────
def draw_brick(color):
    im = Image.new("RGBA", (TILE, TILE), rgba(color))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, TILE - 1, 1), fill=rgba(lighten(color, 0.22)))       # 顶部高光
    d.rectangle((0, 0, 1, TILE - 1), fill=rgba(lighten(color, 0.10)))       # 左侧微亮
    d.rectangle((0, TILE - 3, TILE - 1, TILE - 1), fill=rgba(darken(color, 0.40)))  # 底部阴影
    d.rectangle((TILE - 3, 0, TILE - 1, TILE - 1), fill=rgba(darken(color, 0.26)))  # 右侧阴影
    # 确定性噪点，制造砖面质感
    seed = 12345
    for _ in range(14):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        x = 4 + seed % (TILE - 8)
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        y = 4 + seed % (TILE - 8)
        d.point((x, y), fill=rgba(darken(color, 0.16)))
        d.point((x + 1, y), fill=rgba(darken(color, 0.16)))
    d.rectangle((0, 0, TILE - 1, TILE - 1), outline=rgba(darken(color, 0.55)))  # §7.2 1px 描边
    return im


# ── 瓦片：熔岩（可指定动画帧） ────────────────────────────────────────
def draw_lava(color, frame=0):
    im = Image.new("RGBA", (TILE, TILE), rgba(darken(color, 0.35)))
    d = ImageDraw.Draw(im)
    blobs = [(8, 22, 7, 5), (22, 18, 6, 4), (15, 27, 9, 4)]
    for i, (cx, cy, rx, ry) in enumerate(blobs):
        off = ((frame + i) % 3 - 1) * 2
        d.ellipse((cx - rx + off, cy - ry, cx + rx + off, cy + ry), fill=rgba(color))
        d.ellipse((cx - rx // 2 + off, cy - ry // 2, cx + rx // 2 + off, cy + ry // 2),
                  fill=rgba(lighten(color, 0.38)))
    d.rectangle((0, 0, TILE - 1, 2), fill=rgba(darken(color, 0.60)))   # 表层结壳
    return im


# ── 瓦片：终点门 ────────────────────────────────────────────────────
def draw_exit(color, frame=0):
    im = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((5, 3, 26, 31), fill=rgba(darken(color, 0.55)))        # 门框
    d.rectangle((8, 6, 23, 31), fill=rgba(color))                      # 门体
    d.rectangle((8, 6, 23, 8), fill=rgba(lighten(color, 0.30)))
    pulse = [0.55, 0.35, 0.20, 0.35][frame % 4]
    d.rectangle((13, 14, 18, 22), fill=rgba(lighten(color, pulse)))    # 发光核心
    return im


# ── 角色精灵：参数化绘制 ─────────────────────────────────────────────
def draw_player(color, body_dy=0, head_dy=0, squash=0,
                leg_l=(0, 0), leg_r=(0, 0), arm_l=(0, 0), arm_r=(0, 0), alpha=255):
    """返回一张 32×64 的 RGBA 精灵。脚底固定在 y=63。"""
    parts = []
    base_legs = [((9, 46), (14, 63)), ((17, 46), (22, 63))]
    base_arms = [((3, 28), (7, 42)), ((24, 28), (28, 42))]
    parts.append((base_legs[0], leg_l))
    parts.append((base_legs[1], leg_r))
    parts.append((base_arms[0], arm_l))
    parts.append((base_arms[1], arm_r))
    parts.append((((8, 27), (23, 45)), (0, body_dy)))                  # 躯干
    head = ((9, 11), (22, 26))

    mask = Image.new("L", (SPR_W, SPR_H), 0)
    md = ImageDraw.Draw(mask)

    def blit(box, off, dy_extra=0):
        (x0, y0), (x1, y1) = box
        dx, dy = off
        x0, x1 = x0 + dx, x1 + dx
        y0, y1 = y0 + dy + dy_extra, y1 + dy + dy_extra
        x0, x1 = max(0, x0), min(SPR_W - 1, x1)
        y0, y1 = max(0, y0), min(SPR_H - 1, y1)
        md.rectangle((x0, y0, x1, y1), fill=255)
        return (x0, y0, x1, y1)

    boxes = []
    for box, off in parts:
        boxes.append((blit(box, off), off, box))
    hb = blit(head, (0, head_dy))

    # 1px 白色描边（§7.2 第 6 层：玩家在任何背景上都要可见）
    dilated = mask.filter(ImageFilter.MaxFilter(3))
    sprite = Image.new("RGBA", (SPR_W, SPR_H), (0, 0, 0, 0))
    outline = Image.new("RGBA", (SPR_W, SPR_H), rgba((255, 255, 255), 0))
    outline.putalpha(dilated)
    sprite = Image.alpha_composite(sprite, outline)

    body = Image.new("RGBA", (SPR_W, SPR_H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    for (b, off, orig) in boxes:
        bd.rectangle(b, fill=rgba(color))
    bd.rectangle(hb, fill=rgba(lighten(color, 0.08)))
    # 眼睛
    ex0 = hb[0] + 8
    bd.rectangle((ex0, hb[1] + 5, ex0 + 3, hb[1] + 8), fill=(255, 255, 255, 255))
    bd.rectangle((ex0 + 1, hb[1] + 6, ex0 + 2, hb[1] + 7), fill=rgba(darken(color, 0.8)))
    # 用 mask 裁掉描边外溢，保证只有轮廓内是实心
    body.putalpha(Image.composite(body.getchannel("A"), Image.new("L", (SPR_W, SPR_H), 0), mask))
    sprite = Image.alpha_composite(sprite, body)

    if alpha < 255:
        a = sprite.getchannel("A").point(lambda v: v * alpha // 255)
        sprite.putalpha(a)
    return sprite


# ── 20 帧精灵表（§7.5.3 的必需动作） ─────────────────────────────────
def build_spritesheet(color):
    import math
    frames = []

    for i in range(4):                                   # idle ×4：躯干轻微呼吸
        frames.append(draw_player(color, body_dy=[0, -1, 0, 1][i], head_dy=[0, -1, 0, 1][i]))

    for i in range(6):                                   # run ×6：双腿反相摆动
        p = i / 6.0 * 2 * math.pi
        s = math.sin(p)
        frames.append(draw_player(
            color,
            leg_l=(round(3 * s), round(-2 * max(0, s))),
            leg_r=(round(-3 * s), round(-2 * max(0, -s))),
            arm_l=(0, round(-3 * s)), arm_r=(0, round(3 * s)),
            body_dy=round(-abs(s) * 1)))

    frames.append(draw_player(color, leg_l=(0, -6), leg_r=(1, -4),          # jump ×2
                              arm_l=(0, -6), arm_r=(0, -6), body_dy=-1))
    frames.append(draw_player(color, leg_l=(0, -4), leg_r=(0, -3),
                              arm_l=(0, -5), arm_r=(0, -5), body_dy=-1))
    frames.append(draw_player(color, leg_l=(-3, -1), leg_r=(3, -1),         # fall ×2
                              arm_l=(-2, -3), arm_r=(2, -3)))
    frames.append(draw_player(color, leg_l=(-3, 0), leg_r=(3, 0),
                              arm_l=(-2, -3), arm_r=(2, -3), body_dy=1))
    frames.append(draw_player(color, body_dy=3, head_dy=4,                  # land ×2
                              leg_l=(-2, 0), leg_r=(2, 0), arm_l=(0, 4), arm_r=(0, 4)))
    frames.append(draw_player(color, body_dy=1, head_dy=2,
                              leg_l=(-1, 0), leg_r=(1, 0), arm_l=(0, 2), arm_r=(0, 2)))
    for i in range(4):                                   # die ×4：塌陷 + 渐隐
        frames.append(draw_player(color, body_dy=4 + i * 3, head_dy=6 + i * 4,
                                  leg_l=(-4 - i, 0), leg_r=(4 + i, 0),
                                  arm_l=(-3 - i, 3), arm_r=(3 + i, 3),
                                  alpha=230 - i * 55))

    sheet = Image.new("RGBA", (SPR_W * len(frames), SPR_H), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * SPR_W, 0), f)
    return sheet


# ── §6.4 的 L1 真实关卡数据（直接抄自需求文档） ───────────────────────
L1 = {
    "light": ["####################", "#..................#", "#..................#",
              "#..................#", "#..................#", "#..................#",
              "#..................#", "#..................#", "#..................#",
              "#P..........E......#", "#####.....##########", "#####XXXXX##########"],
    "dark":  ["####################", "#..................#", "#..................#",
              "#..................#", "#..................#", "#..................#",
              "#....#.............#", "#....#.............#", "#....#.............#",
              "#P...#......E......#", "####################", "####################"],
}


def render_scene(world, tileset, sprite, ghost_grid=None):
    """渲染一个世界的完整画面（640×384），含 §7.2 的叠影层。"""
    pal = PALETTE[world]
    grid = L1[world]
    scene = Image.new("RGBA", (GRID_W * TILE, GRID_H * TILE), rgba(hex2rgb(pal["bg"])))

    if ghost_grid:                                        # 第 2–3 层：另一世界的实体幽灵
        g = Image.new("RGBA", scene.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        for r, row in enumerate(ghost_grid):
            for c, ch in enumerate(row):
                if ch == "#":
                    gd.rectangle((c * TILE, r * TILE, c * TILE + TILE - 1, r * TILE + TILE - 1),
                                 fill=rgba(GHOST_RGB, 46))          # alpha ≈ 0.18
                elif ch == "X":
                    gd.rectangle((c * TILE, r * TILE, c * TILE + TILE - 1, r * TILE + TILE - 1),
                                 fill=rgba(GHOST_RGB, 31))          # alpha ≈ 0.12
        scene = Image.alpha_composite(scene, g)

    for r, row in enumerate(grid):                        # 第 4–5 层：当前世界实体
        for c, ch in enumerate(row):
            x, y = c * TILE, r * TILE
            if ch == "#":
                scene.paste(tileset["brick"], (x, y), tileset["brick"])
            elif ch == "X":
                lava = draw_lava(hex2rgb(pal["lava"]), frame=1)
                scene.paste(lava, (x, y), lava)
            elif ch == "E":
                door = draw_exit(hex2rgb(pal["exit"]), frame=0)
                scene.paste(door, (x, y), door)

    for r, row in enumerate(grid):                        # 第 6 层：玩家
        if "P" in row:
            c = row.index("P")
            scene.paste(sprite, (c * TILE, (r + 1) * TILE - SPR_H), sprite)
    return scene


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(os.path.join(root, "assets", "tiles"), exist_ok=True)
    os.makedirs(os.path.join(root, "assets", "player"), exist_ok=True)
    os.makedirs(os.path.join(root, "preview"), exist_ok=True)

    scenes, sheets = {}, {}
    for world in ("light", "dark"):
        pal = PALETTE[world]
        brick = draw_brick(hex2rgb(pal["brick"]))
        # 瓦片集：索引 0 = 砖，16 = 单向平台，17 = 门底座，18 = 熔岩（静态帧）
        strip = Image.new("RGBA", (TILE * 4, TILE), (0, 0, 0, 0))
        strip.paste(brick, (0, 0))
        plat = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
        ImageDraw.Draw(plat).rectangle((0, 0, TILE - 1, 7), fill=rgba(lighten(hex2rgb(pal["brick"]), 0.18)))
        strip.paste(plat, (TILE, 0))
        strip.paste(draw_exit(hex2rgb(pal["exit"])), (TILE * 2, 0))
        strip.paste(draw_lava(hex2rgb(pal["lava"])), (TILE * 3, 0))
        strip.save(os.path.join(root, "assets", "tiles", f"tileset-{world}.png"))

        sheet = build_spritesheet(hex2rgb(pal["player"]))
        sheet.save(os.path.join(root, "assets", "player", f"player-{world}.png"))
        sheets[world] = sheet

        other = "dark" if world == "light" else "light"
        scene = render_scene(world, {"brick": brick}, sheet.crop((0, 0, SPR_W, SPR_H)), L1[other])
        scene.save(os.path.join(root, "preview", f"l1-{world}.png"))
        scenes[world] = scene

    # 2× 拼接对比图
    gap = 16
    W = scenes["light"].width * 2 + gap
    H = scenes["light"].height
    comp = Image.new("RGB", (W, H), (24, 24, 28))
    comp.paste(scenes["light"].convert("RGB"), (0, 0))
    comp.paste(scenes["dark"].convert("RGB"), (scenes["light"].width + gap, 0))
    comp.resize((W * 2, H * 2), Image.NEAREST).save(os.path.join(root, "preview", "l1-compare@2x.png"))

    print("生成完毕：")
    for rel in ("assets/tiles/tileset-light.png", "assets/tiles/tileset-dark.png",
                "assets/player/player-light.png", "assets/player/player-dark.png",
                "preview/l1-light.png", "preview/l1-dark.png", "preview/l1-compare@2x.png"):
        fp = os.path.join(root, rel)
        with Image.open(fp) as im:
            print(f"  {rel:42s} {im.size[0]:>5} × {im.size[1]:<5} {im.mode}")


if __name__ == "__main__":
    main()
