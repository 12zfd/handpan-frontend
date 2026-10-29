# 手碟谱面统一转换 · 前端

纯静态单文件前端。**无需构建**，整个应用就是仓库根目录的 `index.html` 一个文件。

## 为什么没有构建步骤

2026-10-30 起前端从 React + Vite 重写为纯 HTML + 原生 JS：

| | React 版（旧） | 纯 HTML 版（现） |
|---|---|---|
| 体积 | JS 171.3 KB + CSS 18.8 KB + HTML 0.4 KB = **190.5 KB** | **57 KB 单文件** |
| 请求数 | 3 个（HTML + JS + CSS） | **1 个** |
| 首屏可交互 | ~5–8 秒 | **< 1 秒** |

旧版首屏要等 React bundle 下载 + 解析，Render 免费档上实测 5 秒以上；新版零框架、零外链，打开即用。

## 在 Render 部署（Static Site）

| 配置项 | 填什么 |
|---|---|
| **Build Command** | **留空**（不要填 `npm run build`，没有构建步骤） |
| **Publish Directory** | **`.`**（仓库根目录，`index.html` 就在这里） |
| Runtime / Static site type | `Static` |

Render 的 Static Site 类型不需要 Node 运行时，也不需要 `package.json`。

## API 基址如何决定

页面在启动时自动探测当前域名是不是后端服务（请求 `/healthz` 看是否返回 `{"ok":true}`）：

- **当前域名就是后端** → 用相对路径请求，**完全同源，没有 CORS 问题**（推荐，最稳）
- **当前域名不是后端**（独立 Static Site）→ 用绝对地址 `https://handpan-backend.onrender.com` 请求

也可以手动指定：

- 临时：URL 加参数 `?api=https://example.com`
- 长期：登录页底部「后端地址设置」填写，会存到 localStorage

> ⚠️ **注意**：如果访客本地开了会改写请求的代理软件，跨域请求的 `OPTIONS` 预检可能被拦截，导致"连不上后端"。这种情况下请把前端部署到**后端同域**下（即把 `index.html` 放进后端服务的 `frontend-dist/` 目录），彻底避免跨域。

## 后端接口契约

前端严格按后端 `main.py` 的路由调用，未做任何私有约定：

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/login` | 登录，返回 JWT |
| POST | `/upload` | 上传文件（multipart，字段名 `files`，最多 5 张图片） |
| POST | `/convert/{score_id}` | 触发转换 |
| GET | `/history` | 历史任务列表 |
| GET | `/scores/{score_id}` | 任务详情（含 `midi_data_json`） |
| PATCH | `/scores/{score_id}/notes` | 保存校对后的谱面 |
| PATCH | `/scores/{score_id}` | 改歌曲名 |
| PATCH | `/scores/{score_id}/tempo` | 改 BPM（整首重排） |
| GET | `/download/{score_id}` | 下载 PDF |
| GET | `/files/{score_id}/original/{index}` | 原谱预览 |
| GET | `/version` | 前端版本号（用于提示刷新） |

鉴权：除 `/login` 外全部带 `Authorization: Bearer <token>`。

## 功能清单

登录 · 拖拽/点选上传（图片最多 5 张合并成一份谱，视频/MIDI 一次一个）· 转换队列与状态轮询 · 历史列表 · 谱面预览与逐格校对（9 音位 + 删除）· 全谱批量改记号（S/D/1-9/删除）· 改歌曲名 · 改 BPM 整首重排 · 下载 PDF · 原谱对照 · 深链接 `?score={id}` · 新版本提示刷新 · 后端地址可视化设置

---

本项目为产品设计参考，具体实施请结合公司合规与法务要求确认。
