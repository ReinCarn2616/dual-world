# assets/promo/

这里放**不参与游戏运行**的展示用图：

| 文件 | 用途 | 建议尺寸 |
| --- | --- | --- |
| `key-art.png` | README 头图、答辩封面 | 1280×720 或 1920×1080 |
| `capsule.png` | 仓库/展示用的胶囊图 | 616×353（Steam 小胶囊比例） |

这些图是 ComfyUI 最擅长的部分（§7.7.2 的"适合交给 ComfyUI"一栏：标题 key art、结局插画、UI 装饰边框、capsule）。
出图后不需要任何后处理链，直接丢在这里即可 —— 游戏运行时**不会加载**这个目录。

游戏实际使用的贴图在上一级目录：`tiles/`、`hazard/`、`player/`、`ui/`、`bg/`，
它们由 `python tools/gen-assets.py` 生成，或被 ComfyUI 产出经 `python tools/prep-assets.py` 处理后的同名文件覆盖。
