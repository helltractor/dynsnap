# dynsnap 重构审计报告（2026-09-12）

> 基于 ts-refactor 工作流（valaxy 基准映射到 BE 外置组件场景）。分支 `refactor/v0.1.x`，目标版本 v0.1.0。

## 项目概况

Bilibili-Evolved 外置组件：3 个 TS 源文件共 558 行 + `build.js`（复用 BE 仓库 webpack/babel）+
3 个无头浏览器测试文件。类型与运行时 API 均来自外部 Bilibili-Evolved 仓库（`@/*` 别名）。

## 基线状态（Stage 0）

| 项 | 状态 |
|---|---|
| git | 干净（仅 `.mimosa/` 未跟踪），已建分支 `refactor/v0.0.8.x` |
| `node build.js` | ✅ 绿（`dist/dynsnap.js` 生成） |
| 离线测试 | ✅ 14/14 通过 |
| typecheck | ❌ 本项目 6 个错误；上游 BE 源码另有噪音 |
| lint | 无 ESLint/Prettier 配置（门禁 = tsc + build + fixture 测试） |

## P0 — 结构性债务

1. **typecheck 门禁缺失且为红**。构建走 babel（剥离类型不校验），类型错误永不拦截；
   `package.json` 无 typecheck 脚本。当前 6 个错误分两类：
   - 配置债：`tsconfig.json` 未纳入 `BE/src/global.d.ts`，导致 `lodash`（src/index.ts:190）、
     `componentsTags`（src/index.ts:206×2）报 `Cannot find name`。实测纳入后归零。
   - 真实代码错误：`src/capture.ts:74`（`Element` 上调 `pause()`，应为 `HTMLMediaElement`）、
     `src/capture.ts:134`（闭包内 `grid` 窄化失效）、`src/index.ts:172`（`CommentItem` 赋给
     `CommentReplyItem` 形参）。
2. **入口承载领域模型**。`src/index.ts`（207 行）混有三块非接线逻辑：
   B 站截图预设 `cardConfig`/`commentConfig`/`areaConfig`（L36-71）、URL→文件名解析
   `getPageId`（L74-93）、评论区按钮注入 `addAreaButton`（L96-136，UI 逻辑）。
   依赖方向目前单向无环（index → capture → snapdom ✅），但模型住在入口，抽取后才能锁住。

## P1 — 分层与重复

3. `src/capture.ts`（331 行）三职责一体：多图重排（L100-156）、底部留白（L158-264）、
   截图管线 + 预处理（L68-94、L266-331）。未超 1000 行阈值，但按关注点拆
   `core/reflow.ts` / `core/padding.ts` / `core/capture.ts` 可提高可测性与可读性。
4. `commentConfig` 与 `areaConfig` 对象完全相同（src/index.ts:62-71），去重。
5. 模块级互斥标志 `capturing`（src/capture.ts:266）藏在文件中部，随管线迁移时显式化。

## P2 — 文档 / 工具 / 卫生

6. `.gitignore` 死条目 `pnpm-lock.yaml`（npm 项目，package-lock.json 已跟踪）。
7. `.mimosa/`（扫描工具会话状态）未忽略。
8. `dist/dynsnap.js` 被 git 跟踪 —— **故意保留**：分发模型是"组件管理里粘贴 URL 安装"，
   raw URL 直指 dist 产物。不采纳基准中"构建产物应 gitignore"规则。
9. 生命周期无日志：`entry()` 全程无 scopedConsole；`pauseMedia`/`triggerLazyImages`
   空 catch 静默（宜 debug 级）。失败路径已覆盖（scopedConsole.error + Toast ✅）。
10. JSDoc 风格混杂：`captureElement` 用 `@param` 表，其余为中文单行注释；
    `defaults`/`sleep`/`avatarSelector` 无文档。
11. `docs/architecture.md`、`architecture.html`、README 的 `src/` 布局描述在重构后需再生成并归档旧版。
12. README 写构建"默认查找上级目录 ../Bilibili-Evolved"，实际 build.js 是
    `../../Bilibili-Evolved`（即工作区根的兄弟目录），文档措辞不准。

## i18n 维度：不适用（明确不采纳）

Bilibili-Evolved 组件生态为 zh-CN 单语：无键值字典、无双语文件，组件描述经 `src/index.md`
编译时注入。按基准拆 `i18n/{zh,en,types}.ts` 属于为拆而拆。UI 字符串保留中文硬编码是本生态惯例；
代码注释主语言即中文，因此 JSDoc 统一**结构**（summary → why → example）而非换语言。

## 已达标项（保持不动）

- 依赖方向单向（index → capture → snapdom），无运行时导入环。
- `snapdom.ts` vendor 已带 `/* eslint-disable */ @ts-nocheck`；vendor 入库支撑"零网络依赖"策略。
- 失败路径日志 + Toast 覆盖完整；fixture 测试含像素级断言，是可靠的重构安全网。
- `build.js` 注释充分、职责单一（含 pnpm 10 隔离布局兼容）。

## 执行计划（Stage 2，按依赖序）

| # | 提交 | 内容 |
|---|---|---|
| 1 | `fix(tsconfig)` | 纳入 BE `global.d.ts`；`package.json` 加 `typecheck` 脚本 |
| 2 | `fix(types)` | 修 3 个真实类型错误（`HTMLMediaElement`、`grid` 窄化、评论项类型） |
| 3 | `refactor(core)` | 提取 `core/presets.ts`、`core/page-id.ts`、`core/reflow.ts`、`core/padding.ts`、`core/capture.ts` |
| 4 | `refactor(ui)` | `addAreaButton` → `ui/area-button.ts`；入口瘦身为元数据 + 接线，去重预设 |
| 5 | `docs(jsdoc)` | 统一 JSDoc 结构（中文、summary → why → example） |
| 6 | `chore(hygiene)` | `.gitignore` 清死条目 + 加 `.mimosa/`；entry 生命周期日志 |
| 7 | `docs` | 同步 architecture.md / README 布局描述 |
| 8 | `chore(version)` | 按序递增 bump：package.json + CHANGELOG + 重建 dist + annotated tag（打在 bump 提交上） |

每步门禁：`tsc --noEmit`（本项目零错误）→ `node build.js` → 离线 fixture 测试。

## 发布线推导（skill Stage 0.3）

本次为结构性工作（层级迁移：入口拆出 core/ 与 ui/，入口接线重写）→ **新系列** →
取当前版本 0.0.6 的 **next minor：v0.1.0**，分支相应命名 `refactor/v0.1.x`。
按 skill"按序递增、绝不任意取号"的规则，不采用跳号版本（如 0.0.8）。
