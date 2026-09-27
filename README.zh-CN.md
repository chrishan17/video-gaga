# canvas-video

**说出你想要的视频，得到一支有动效设计水准的 MP4。** canvas-video 是一个给 Claude Code 和其他编码 Agent 用的 skill。Agent 会先问几个关键问题，给你看风格样帧，写好分镜，然后用 HTML Canvas 设计每一帧并逐帧精确渲染。需要的话，还能配上免费的 Edge TTS 旁白和字幕。

[English →](README.md)

<p align="center">
  <img src="docs/media/clear-explainer.gif" width="49%" alt="Clear Explainer 知识讲解">
  <img src="docs/media/paper-sketch.gif" width="49%" alt="Paper Sketch 手绘纸感">
</p>

- **Canvas 逐帧确定性渲染**：每一帧都是 `draw(ctx, t)` 这个纯函数的结果。多个无头 Chromium 页面并行渲染，再由 ffmpeg 编码为 H.264（BT.709），帧与帧之间不会有偏差。
- **配音决定时间轴**：用微软 Edge 神经语音，免费、不需要 API Key，300 多种音色，中文效果很好，而且带**词级时间戳**。场景时长由语音长度决定，画面在说到某个词时准确出现（`s.when('三十')`）。
- **字幕认真做**：字幕用同一份词级时间生成。中文断行遵守避头尾规则，长句按意群均衡切分，中文字幕去掉逗号和句号、保留问号和感叹号。字幕可以按视频自己的字体样式烧进画面，也可以做卡拉 OK 高亮，同时导出 `.srt`、`.vtt` 或 MP4 软字幕轨。
- **像设计出来的，不像 AI 生成的**：内置 5 套差异明显的动效风格预设，并配有一份成文的动效设计规范，涵盖缓动、时长、层级、镜头、转场和反模式。Agent 会按规范做，并对照规范自查样帧。
- **先问再做**：按视频类型提 4–7 个问题。每题固定三个具体选项，其中一个标注"推荐"并写明理由。
- **自己验收**：`cv check` 会核对时长、帧率、音轨、响度、字幕是否重叠，以及**音画同步**（检测语音起点，再与字幕起点比对）。
- **免费开源**：MIT 许可。依赖 Node、Playwright（Apache-2.0）、ffmpeg 和 edge-tts。不需要 Remotion 公司授权，不需要构建步骤，也不需要注册账号。

## 风格画廊

下面每个示例都由本 skill 的 CLI 从 [`presets/`](presets/) 里的文件渲染而成。GIF 只截取片段，点"视频"可以看带声音的完整版（压缩后的 720p）。1080p 原画可以用一条命令重新渲染，也可以从 Release 附件下载。

| 风格 | 说明 |
|---|---|
| <img src="docs/media/launch-keynote.gif" width="360"> | **Launch Keynote 科技发布会** · 16:9 · 16 秒 · 英文旁白（AndrewNeural）+ 字幕。暗场舞台、被径向光波点亮的主角物体、高光扫过产品名、数字跟着读音滚动。[▶ 视频](docs/media/launch-keynote.mp4) · [源码](presets/launch-keynote/video.html) |
| <img src="docs/media/clear-explainer.gif" width="360"> | **Clear Explainer 知识讲解 / 信息图** · 16:9 · 20 秒 · 中文旁白（云希）+ 字幕。暖纸底、墨色字，算式跟着旁白逐项拼出，复利曲线按时间方向画出来。[▶ 视频](docs/media/clear-explainer.mp4) · [源码](presets/clear-explainer/video.html) |
| <img src="docs/media/paper-sketch.gif" width="360"> | **Paper Sketch 手绘纸感** · 16:9 · 16 秒 · 中文旁白（晓晓）+ 字幕。按手绘顺序逐笔画线，线条每 3 帧抖动一次（boiling），水彩晕染、荧光笔划重点，翻页式转场。[▶ 视频](docs/media/paper-sketch.mp4) · [源码](presets/paper-sketch/video.html) |
| <img src="docs/media/swiss-kinetic.gif" width="260"> | **Swiss Kinetic 极简排版** · 1:1 · 14 秒 · 无旁白 · 运动模糊。12 栏网格、只用一种红色、按 100 BPM 节拍硬切，红方块通过匹配剪辑变成句号。[▶ 视频](docs/media/swiss-kinetic.mp4) · [源码](presets/swiss-kinetic/video.html) |
| <img src="docs/media/neon-circuit.gif" width="180"> | **Neon Circuit 赛博霓虹** · 9:16 竖屏 · 16 秒 · 中文旁白（云健）+ 卡拉 OK 字幕。夜城、HUD 界面，RGB 分离只在命中点触发，霓虹灯管式闪亮，故障风转场。[▶ 视频](docs/media/neon-circuit.mp4) · [源码](presets/neon-circuit/video.html) |

选风格时，Agent 每次都会额外给一个"野卡"方案：专门为你的需求设计一套新风格，并用你的真实标题出样帧。详见 [STYLE_PRESETS.md](STYLE_PRESETS.md)。

## 工作流程

1. **提问**：4–7 个问题，每题三个选项，其中一个为推荐项并附理由。维度按视频类型挑选，例如时长、画幅、配音、字幕、品牌色、节奏、结尾。
2. **风格样帧**：用你的真实标题渲染 3 个方向（推荐预设、对比预设、定制野卡），由你挑选。
3. **分镜**：逐场景列出旁白原文、画面焦点、与哪个词同步、转场方式和时长，确认后再动手。
4. **制作**：编写 `video.html`（Canvas 场景）和 `narration.json`。先跑 Edge TTS 拿到词级时间，再生成探针样帧，由 Agent 自己看图挑问题、修改、再检查。
5. **渲染与验收**：并行渲染、混音（旁白、自动避让的背景音乐、loudnorm 响度标准化）、封装，然后用 `cv check` 核对，最后从成片里抽帧再看一遍。

## 安装

依赖：**Node ≥ 18**、**ffmpeg**（需带 libx264）、**uv**（推荐；或 `pip install edge-tts`）。字体和 TTS 需要联网。

```bash
git clone https://github.com/<you>/canvas-video.git ~/.claude/skills/canvas-video
cd ~/.claude/skills/canvas-video && npm install
npx playwright install chromium      # 本机已有浏览器可跳过
node scripts/cv.mjs doctor           # 环境自检
```

然后直接说：*"用 canvas-video 做一个 30 秒的视频，讲清楚复利"*。

其他 Agent（Codex、Gemini CLI、Cursor 等）：把仓库给它，让它按 `SKILL.md` 执行即可。

## 常用命令

```bash
node scripts/cv.mjs init my-video --preset clear-explainer [--ratio 9:16]
node scripts/cv.mjs tts my-video                    # 生成配音与词级时间（带缓存）
node scripts/cv.mjs still my-video --sheet --subs   # 探针样帧 + 缩略图拼版，供自检
node scripts/cv.mjs render my-video --subs burn     # 渲染 MP4，字幕烧录，同时导出 srt/vtt
node scripts/cv.mjs check my-video/out/my-video.mp4 --srt my-video/out/my-video.srt
node scripts/cv.mjs voices --lang zh-CN             # 列出中文音色
```

## 文档

- [SKILL.md](SKILL.md)：Agent 工作流（提问 → 风格 → 分镜 → 制作 → 验收 → 交付）
- [docs/motion-design.md](docs/motion-design.md)：动效设计规范（该做 / 不该做、时长表、自检清单）
- [docs/narration-and-subtitles.md](docs/narration-and-subtitles.md)：Edge TTS 音色推荐、为耳朵写稿、字幕规则
- [docs/prompt-templates.md](docs/prompt-templates.md)：从 X / GitHub 收集的提示词模式（附出处）与现成模板
- [docs/tech-selection.md](docs/tech-selection.md)：技术选型（对比 Remotion、HyperFrames、Motion Canvas、WebCodecs 等）

## 致谢与许可

结构参考 [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides)。配音使用 [rany2/edge-tts](https://github.com/rany2/edge-tts)（LGPLv3，作为外部工具调用）和微软 Edge 在线 TTS 服务，请确认服务条款适合你的用途。渲染依赖 Playwright 与 FFmpeg，字体来自 Google Fonts（OFL）。

[MIT](LICENSE) © 2026 Chris Han
