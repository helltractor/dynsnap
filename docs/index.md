# dynshot 文档

## 文档导航

- [交互式架构图](architecture.html) —— 由 [archify](https://github.com/tt-a1i/archify) 生成，可缩放 / 搜索 / 按视图聚焦
- [架构与实现](architecture.md) —— 与架构图对应的文字说明
- [测试](../test/) —— 无头浏览器测试套件（fixture / userscript / real-page）

## 快速上手

```powershell
# 1. 构建（需要已安装依赖的 Bilibili-Evolved 仓库，默认 ../Bilibili-Evolved）
node build.js
# 产物:
#   dist/dynshot.js       —— 组件 JS，Bilibili-Evolved 组件管理里粘贴 URL 安装
#   dist/dynshot.user.js  —— Greasy Fork 用户脚本，一键把组件安装进 Bilibili-Evolved

# 2. 测试（需要 puppeteer-core 与 Chrome/Edge）
npm test
```

## 架构一览（详见架构图）

```
构建与分发：src/ ──build.js──▶ dist/ ──▶ Bilibili-Evolved 组件管理
                                   └──▶ Greasy Fork 用户脚本

运行时：用户 ──▶ B 站页面 ──▶ BE 运行时 ──▶ dynshot 组件入口
                                                 │
                                                 ▼
                             截图核心（重排 / 留白 / 排除）──▶ SnapDOM ──▶ PNG 下载
```
