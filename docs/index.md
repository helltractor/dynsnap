# dynshot 文档

- [架构与实现](architecture.md)

## 快速上手

```powershell
node build.js
# 产物: dist/dynshot.js（依赖 BILI_EVOLVED_PATH 指向的 Bilibili-Evolved 仓库）
```

将 `dist/dynshot.js` 通过静态服务器暴露后，在 Bilibili-Evolved 的组件管理中粘贴 URL 安装。
