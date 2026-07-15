# Windows Tray Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成一套可替换的 Windows 系统托盘图标草稿资源，并验证透明通道、小尺寸辨识度和稳定的文件命名。

**Architecture:** 使用内置图像生成工具创建平坦色键背景的高分辨率母图，再由已安装的背景移除工具生成透明 PNG。所有派生尺寸从同一透明母图离线导出；Electron 运行时暂不读取这些文件，因此本次不引入依赖或启动失败路径。

**Tech Stack:** OpenAI 内置图像生成工具、imagegen 背景移除脚本、Python Pillow（仅用于本地离线缩放与验证）、PNG、Markdown、Git。

## Global Constraints

- 图标为 MVP 草稿，允许后续整体替换，不作为最终品牌定稿。
- 主体使用陶土橙 `#D4784C`，双眼使用近黑色 `#1E1E20`。
- 使用实心圆脸、短耳朵、克制浅色描边和约 12% 安全边距。
- 不使用文字、渐变、投影、状态圆点、Agent 标记或动画。
- 只生成 16、20、24、32、40、48、64、128、256px 的透明 PNG。
- 本次不修改 `main.js`，不创建 Electron `Tray`，不实现托盘菜单和鼠标交互。
- 最终资源必须进入仓库 `assets/tray/`，不能只留在 Codex 生成目录。

---

### Task 1: 生成并确认透明母图

**Files:**
- Create: `assets/tray/tray-icon-source.png`
- Temporary: `tmp/imagegen/tray-icon-chroma.png`

**Interfaces:**
- Consumes: `renderer/css/pet.css` 中的 `#D4784C` 和 `#1E1E20` 视觉定义。
- Produces: 透明 RGBA 正方形母图 `assets/tray/tray-icon-source.png`，供 Task 2 的所有尺寸导出。

- [ ] **Step 1: 创建临时目录**

Run:

```powershell
New-Item -ItemType Directory -Force tmp/imagegen, assets/tray | Out-Null
```

Expected: 两个目录存在；尚未创建最终 PNG。

- [ ] **Step 2: 使用内置图像生成工具创建色键母图**

使用 `image_gen` 的 built-in 模式，生成一张图片，提示词固定为：

```text
Use case: logo-brand
Asset type: Windows system tray icon draft source
Primary request: Create a friendly minimal desktop-pet face icon: a solid rounded terracotta-orange circular face with two very short rounded ears and two simple near-black circular eyes.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal
Style/medium: flat vector-friendly raster icon, geometric, clean, warm, no texture
Composition/framing: centered square composition, symmetrical face, about 12% clear safe padding on every side, features large enough to remain visible at 16 pixels
Color palette: face #D4784C, eyes #1E1E20, thin restrained warm off-white outer keyline
Constraints: one icon only; uniform #00ff00 background; crisp opaque subject edges; no shadows, gradients, floor plane, reflections, lighting variation, text, letters, terminal symbol, status badge, watermark, extra facial features, body, paws, tail, accessories, or animation marks; do not use #00ff00 in the subject
Avoid: photorealism, fur, detailed illustration, thin fragile lines, sharp complex ear tips
```

Expected: 返回一张正方形草稿，背景为均匀 `#00ff00`，主体只有圆脸、短耳朵和双眼。

- [ ] **Step 3: 把生成结果复制为可处理的临时文件**

从 `image_gen` 返回结果中取得实际本地文件路径，使用 `Copy-Item -LiteralPath` 将该文件复制到：

```text
tmp/imagegen/tray-icon-chroma.png
```

Expected: `tmp/imagegen/tray-icon-chroma.png` 存在，且未覆盖任何旧的正式资源。

- [ ] **Step 4: 移除色键背景**

Run:

```powershell
python C:/Users/lenovo/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py --input tmp/imagegen/tray-icon-chroma.png --out assets/tray/tray-icon-source.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

Expected: `assets/tray/tray-icon-source.png` 为 RGBA PNG，四角 alpha 为 0，主体边缘无明显绿色色边。

- [ ] **Step 5: 视觉检查透明母图**

使用本地图片查看工具打开 `assets/tray/tray-icon-source.png`，检查：主体居中、特征对称、约 12% 留白、颜色接近指定色值、没有多余五官或文字。

Expected: 若仅有单一明确问题，使用一次有针对性的生成调整后重新执行 Step 3～5；不要同时改变多个设计变量。

- [ ] **Step 6: 暂存母图**

Run:

```powershell
git add -- assets/tray/tray-icon-source.png
git diff --cached --stat
```

Expected: 暂存区只新增透明母图，不包含 `tmp/imagegen/`。

### Task 2: 导出并自动验证全部托盘尺寸

**Files:**
- Create: `assets/tray/tray-icon-16.png`
- Create: `assets/tray/tray-icon-20.png`
- Create: `assets/tray/tray-icon-24.png`
- Create: `assets/tray/tray-icon-32.png`
- Create: `assets/tray/tray-icon-40.png`
- Create: `assets/tray/tray-icon-48.png`
- Create: `assets/tray/tray-icon-64.png`
- Create: `assets/tray/tray-icon-128.png`
- Create: `assets/tray/tray-icon-256.png`

**Interfaces:**
- Consumes: `assets/tray/tray-icon-source.png` RGBA 正方形母图。
- Produces: 九个文件名和像素尺寸一一对应的 RGBA PNG，供后续 #29 选择稳定路径加载。

- [ ] **Step 1: 检查本地 Pillow 可用**

Run:

```powershell
python -c "from PIL import Image; print(Image.__version__)"
```

Expected: 输出 Pillow 版本号并以退出码 0 结束。若默认 Python 缺少 Pillow，先调用工作区依赖定位工具取得捆绑 Python 路径，再用该 Python 重试；不修改 `package.json`。

- [ ] **Step 2: 从同一母图导出全部尺寸**

Run:

```powershell
@'
from pathlib import Path
from PIL import Image

source = Path("assets/tray/tray-icon-source.png")
sizes = (16, 20, 24, 32, 40, 48, 64, 128, 256)

with Image.open(source) as image:
    rgba = image.convert("RGBA")
    if rgba.width != rgba.height:
        raise SystemExit(f"source must be square, got {rgba.size}")
    for size in sizes:
        output = source.parent / f"tray-icon-{size}.png"
        rgba.resize((size, size), Image.Resampling.LANCZOS).save(output, "PNG", optimize=True)
'@ | python -
```

Expected: `assets/tray/` 中出现九个派生 PNG。

- [ ] **Step 3: 自动验证尺寸、模式、透明四角和主体覆盖率**

Run:

```powershell
@'
from pathlib import Path
from PIL import Image

root = Path("assets/tray")
sizes = (16, 20, 24, 32, 40, 48, 64, 128, 256)

for size in sizes:
    path = root / f"tray-icon-{size}.png"
    with Image.open(path) as image:
        if image.size != (size, size):
            raise SystemExit(f"{path}: expected {(size, size)}, got {image.size}")
        if image.mode != "RGBA":
            raise SystemExit(f"{path}: expected RGBA, got {image.mode}")
        alpha = image.getchannel("A")
        corners = (alpha.getpixel((0, 0)), alpha.getpixel((size - 1, 0)), alpha.getpixel((0, size - 1)), alpha.getpixel((size - 1, size - 1)))
        if any(corners):
            raise SystemExit(f"{path}: corners are not transparent: {corners}")
        visible = sum(value > 16 for value in alpha.getdata())
        coverage = visible / (size * size)
        if not 0.25 <= coverage <= 0.75:
            raise SystemExit(f"{path}: unexpected visible coverage {coverage:.3f}")
        print(f"ok {path} {image.size} coverage={coverage:.3f}")
'@ | python -
```

Expected: 九行均以 `ok assets\tray\tray-icon-` 开头，退出码为 0。

- [ ] **Step 4: 创建浅色和深色背景检查图但不提交**

Run:

```powershell
@'
from pathlib import Path
from PIL import Image, ImageDraw

root = Path("assets/tray")
sizes = (16, 20, 24, 32, 40, 48, 64)
scale = 4
cell = 96
preview = Image.new("RGB", (cell * len(sizes), cell * 2), "white")
draw = ImageDraw.Draw(preview)

for row, background in enumerate(("#F3F3F3", "#202020")):
    draw.rectangle((0, row * cell, preview.width, (row + 1) * cell), fill=background)
    for column, size in enumerate(sizes):
        with Image.open(root / f"tray-icon-{size}.png") as icon:
            enlarged = icon.convert("RGBA").resize((size * scale, size * scale), Image.Resampling.NEAREST)
            x = column * cell + (cell - enlarged.width) // 2
            y = row * cell + (cell - enlarged.height) // 2
            preview.paste(enlarged, (x, y), enlarged)

preview.save("tmp/imagegen/tray-icon-preview.png")
'@ | python -
```

Expected: `tmp/imagegen/tray-icon-preview.png` 同时显示浅色、深色背景下的七种常见小尺寸。

- [ ] **Step 5: 视觉检查派生尺寸**

使用本地图片查看工具打开 `tmp/imagegen/tray-icon-preview.png`。确认 16px 下仍能分辨双眼和短耳朵，边缘没有绿色残留，浅色/深色背景下轮廓均可辨。

Expected: 视觉检查通过；若不通过，只回到 Task 1 调整母图，不手工分别修补派生尺寸。

- [ ] **Step 6: 暂存派生资源并提交图标资产**

Run:

```powershell
git add -- assets/tray/tray-icon-16.png assets/tray/tray-icon-20.png assets/tray/tray-icon-24.png assets/tray/tray-icon-32.png assets/tray/tray-icon-40.png assets/tray/tray-icon-48.png assets/tray/tray-icon-64.png assets/tray/tray-icon-128.png assets/tray/tray-icon-256.png
git diff --cached --check
git commit -m "🎨 添加 Windows 托盘图标草稿资源"
```

Expected: 提交只包含 `assets/tray/` 下的一张母图和九张派生图，`tmp/imagegen/` 保持未跟踪或被忽略。

### Task 3: 记录资源职责和替换方法

**Files:**
- Create: `docs/notes/14-Windows系统托盘图标与资源路径.md`

**Interfaces:**
- Consumes: Task 1～2 最终采用的文件结构、导出尺寸和验证结论。
- Produces: 后续 #29 接入以及未来视觉替换可以复用的学习笔记。

- [ ] **Step 1: 编写学习笔记**

创建文档并完整写明：

```markdown
# Windows 系统托盘图标与资源路径

## 为什么托盘图标需要专用资源

说明托盘显示面积、DPI 缩放、透明边缘与普通窗口图标的差异。

## 母图与派生尺寸

记录 `tray-icon-source.png` 的职责，以及 16、20、24、32、40、48、64、128、256px 均从母图生成、不能单独漂移的约束。

## 透明通道与小尺寸可读性

解释 alpha、透明四角、安全边距、浅色/深色背景对比和 16px 人工检查。

## 开发路径与打包路径

说明本次只建立资源；#29 应在主进程使用基于 `__dirname` 的稳定路径，并对资源缺失安全降级。不要依赖当前工作目录或 Codex 生成目录。

## 如何替换草稿

说明替换母图后必须重新导出全部派生尺寸、运行自动验证并重新完成浅色/深色预览；不得把皮肤包资源直接当成固定托盘图标。

## 本次未覆盖的验收

明确真实 Windows 托盘、100%～200% 缩放截图、开发版/打包版路径和 tooltip 将在 #29 接入后验证。
```

Expected: 文档面向初学者解释“为什么”，不只罗列文件名。

- [ ] **Step 2: 检查文档与资源清单一致**

Run:

```powershell
rg -n "16|20|24|32|40|48|64|128|256|tray-icon-source|__dirname|#29" docs/notes/14-Windows系统托盘图标与资源路径.md
```

Expected: 输出覆盖全部尺寸、母图职责、未来稳定路径和 #29 验收边界。

- [ ] **Step 3: 提交学习笔记**

Run:

```powershell
git add -- docs/notes/14-Windows系统托盘图标与资源路径.md
git diff --cached --check
git commit -m "📖 记录 Windows 托盘图标资源规范"
```

Expected: 提交只包含学习笔记，空白检查通过。

### Task 4: 完成交付验证

**Files:**
- Verify: `assets/tray/*.png`
- Verify: `docs/notes/14-Windows系统托盘图标与资源路径.md`
- Verify: `docs/superpowers/specs/2026-07-15-windows-tray-icon-design.md`

**Interfaces:**
- Consumes: Task 1～3 的最终资产与文档。
- Produces: 可交接的 #28 本地分支和清晰的未覆盖验收记录。

- [ ] **Step 1: 重跑 PNG 自动检查**

重新运行 Task 2 Step 3 的完整 Python 校验命令。

Expected: 九个派生尺寸全部输出 `ok`，退出码为 0。

- [ ] **Step 2: 运行仓库回归测试**

Run:

```powershell
npm test
```

Expected: 当前 8 组 Node 测试全部通过。虽然本次不改 JavaScript，这一步确认静态资产没有意外污染项目结构或脚本。

- [ ] **Step 3: 检查空白、状态和提交范围**

Run:

```powershell
git diff --check
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: `git diff --check` 无输出；工作区只允许存在被 `.gitignore` 忽略的 `tmp/imagegen/`；提交列表只包含 #28 的设计、资产和学习文档。

- [ ] **Step 4: 汇报静态验收与未覆盖项目**

交接必须明确：

- 已生成并验证一张透明母图和九个派生尺寸；
- 已通过浅色/深色预览与 16px 人工检查；
- 已运行 `npm test` 与 `git diff --check`；
- 尚未创建真实 Electron `Tray`；
- Windows 任务栏主题、100%～200% 缩放、打包路径与真实托盘截图留到 #29。

Expected: 不把静态预览描述成真实系统托盘验收，不推送分支、不创建 PR。
