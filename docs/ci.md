# CI 与发布流程

> [← 文档总览](index.md) · workflow 定义见 [.github/workflows/](../.github/workflows/)

## CI（`ci.yml`）

push main / PR 时触发，三个 job 分工如下：

| Job | 触发 | 内容 |
|-----|------|------|
| `test (fixture)` | 仅 PR | 离线 fixture 回归；测试对象为仓库内 tracked 的 `dist/dynsnap.js`（基线回归） |
| `typecheck` | PR + main | 类型门禁；构建走 babel 只剥类型不校验，类型门禁是真正的语义门 |
| `build & test dist` | 仅 main push | 检出 Bilibili-Evolved 仓库 + pnpm install → `node build.js` 构建 dist → 立即用**新构建的产物**跑 fixture 回归 → artifact 存档 |

分工逻辑：PR 阶段只跑轻量必需检查；合版后在主分支完成任务构建，并用新产物回归验证合并态的行为。

## 发布（`release.yml`）

推送 `v*` tag 触发：校验 tag 与 `package.json` 版本一致 → `scripts/release-notes.js` 从 `CHANGELOG.md`
提取对应章节作为发布说明 → 构建 `dist/dynsnap.js` → 创建 GitHub Release 并附上产物。

发布新版本：

1. 更新 `package.json` 的 `version` 与 `CHANGELOG.md`（新增 `## v0.x.y` 章节）。
2. 本地构建并更新 `dist/dynsnap.js`（`node build.js`）。
3. 提交后打 tag 并推送：`git tag v0.x.y && git push origin main --tags`。

## 仓库权限

- 合并方式仅限 **merge commit / rebase**（squash 已禁用），合并后自动删除 PR 分支。
- main 开启分支保护：进入 main 必须经 PR；必需检查 `test (fixture)`、`typecheck` 全绿且分支与 main 同步；
  审批不强制（单人维护）；禁止强制推送与删除分支。
