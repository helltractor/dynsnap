# dynsnap 文档

## 文档导航

- [交互式架构图](architecture.html) —— 由 [archify](https://github.com/tt-a1i/archify) 生成，可缩放 / 搜索 / 按视图聚焦
- [架构与实现](architecture.md) —— 与架构图对应的文字说明
- [CI 与发布流程](ci.md) —— workflow 分工、发布步骤与仓库权限
- [第三方引用声明](../THIRD-PARTY-NOTICES.md) —— SnapDOM 内嵌许可与 Bilibili-Evolved 出处说明
- [测试](../test/) —— 无头浏览器测试套件（fixture / real-page）

## 快速上手

```powershell
# 1. 构建（需要已安装依赖的 Bilibili-Evolved 仓库，默认取工作区根的兄弟目录）
node build.js
# 产物: dist/dynsnap.js —— 组件 JS，Bilibili-Evolved 组件管理里粘贴 URL 安装

# 2. 测试（需要 puppeteer-core 与 Chrome/Edge）
npm test
```

## 架构一览（详见架构图）

```
构建与分发：src/ ──build.js──▶ dist/dynsnap.js ──▶ Bilibili-Evolved 组件管理

运行时：用户 ──▶ B 站页面 ──▶ BE 运行时 ──▶ dynsnap 组件入口
                                                 │
                                                 ▼
                             截图核心（重排 / 留白 / 排除）──▶ SnapDOM ──▶ PNG 下载
```
