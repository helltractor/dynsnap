'use strict'
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
const beRoot = process.env.BILI_EVOLVED_PATH || path.resolve(projectRoot, '..', 'Bilibili-Evolved')

if (!fs.existsSync(path.join(beRoot, 'package.json'))) {
  console.error('[dynshot] 未找到 Bilibili-Evolved 仓库: ' + beRoot)
  console.error('[dynshot] 请设置环境变量 BILI_EVOLVED_PATH 指向 Bilibili-Evolved 仓库, 或将仓库放在本项目上级目录')
  process.exit(1)
}

const result = spawnSync('pnpm', ['tsx', path.join(projectRoot, 'build-webpack.ts')], {
  cwd: beRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, BILI_EVOLVED_PATH: beRoot },
})
process.exit(result.status ?? 1)
