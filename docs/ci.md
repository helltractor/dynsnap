# CI 与发布流程

> [← 文档总览](index.md) · workflow 定义见 [.github/workflows/](../.github/workflows/)

## CI（`ci.yml`）

push main / PR 时触发，三个 job 分工如下：

| Job | 触发 | 内容 |
|-----|------|------|
| `test (fixture)` | 仅 PR | 检出 Bilibili-Evolved 仓库 + pnpm install → `node build.js` 从**源码**构建 dist → 校验提交的 `dist/dynsnap.js` 与源码构建结果一致 → 用新产物跑离线 fixture 回归 |
| `typecheck` | PR + main | 类型门禁；构建走 babel 只剥类型不校验，类型门禁是真正的语义门 |
| `build & test dist` | 仅 main push | 同上的完整构建链路 + fixture 回归 → artifact 存档 |

分工逻辑：PR 阶段就要完成源码构建与产物回归——`dist/dynsnap.js` 是 tracked 的且其 raw URL
即安装入口，若 PR 只测仓库内那份旧产物，「改了 `src/` 却忘了重建」的 PR 依然会全绿。
main push 的 job 额外做 artifact 存档。

`dist/dynsnap.js` 与源码同步的校验用 `git diff --exit-code`，因此构建必须可复现：
`build.js` 会把拷贝到临时目录的源码归一化为 LF。产物内嵌 `index.md` 正文，
而 Windows 上 `core.autocrlf=true` 会把工作区检出成 CRLF——不归一化的话，
同一份源码在 Windows 与 Linux 上产物字节不同，该校验会本机通过、CI 失败。

## 发布（`release.yml`）

推送 `v*` tag 触发：校验 tag 与 `package.json` 版本一致 → `scripts/release-notes.js` 从 `CHANGELOG.md`
提取对应章节作为发布说明 → 构建 `dist/dynsnap.js` → 跑 `typecheck` 与 fixture 回归 →
创建 GitHub Release 并附上产物。

发布链路自带门禁是必要的：tag push **不会**触发 `ci.yml`（后者只监听 main 分支的 push），
若不在此处补跑，就会发布一个从未经过类型检查与测试的产物。

发布新版本：

1. 更新 `package.json` 的 `version` 与 `CHANGELOG.md`（新增 `## v0.x.y` 章节）。
2. 本地构建并更新 `dist/dynsnap.js`（`node build.js`）。
3. 提交后打 tag 并推送：`git tag v0.x.y && git push origin main --tags`。

## 仓库权限

- 合并方式仅限 **merge commit / rebase**（squash 已禁用），合并后自动删除 PR 分支。
- main 开启分支保护：进入 main 必须经 PR；必需检查 `test (fixture)`、`typecheck` 全绿且分支与 main 同步；
  审批不强制（单人维护）；禁止强制推送与删除分支。
