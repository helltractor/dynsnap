'use strict'
// 类型门禁：对本项目 src/ 做 --noEmit 全量类型检查。
//
// 为什么不直接跑 tsc：
// 1. `@/*` 导入会把 Bilibili-Evolved 源码拉进编译单元，其自身错误不属于本组件的门禁范围，
//    因此这里只统计本项目 src/ 下的诊断；
// 2. BE 的 global.d.ts（lodash / componentsTags 等宿主全局声明）不在本 tsconfig 的 include 里，
//    由本脚本动态纳入，保持 tsconfig 纯净；BE 仓库位置可用 BILI_EVOLVED_PATH 覆盖（与 build.js 一致）。
const fs = require('fs')
const nodePath = require('path')
const ts = require('typescript')

const projectRoot = nodePath.resolve(__dirname, '..')
const beRoot = process.env.BILI_EVOLVED_PATH || nodePath.resolve(projectRoot, '..', '..', 'Bilibili-Evolved')
const globalDts = nodePath.join(beRoot, 'src', 'global.d.ts')

if (!fs.existsSync(globalDts)) {
  console.error('[dynsnap] 未找到宿主全局声明: ' + globalDts)
  console.error('[dynsnap] 请设置 BILI_EVOLVED_PATH 指向 Bilibili-Evolved 仓库')
  process.exit(1)
}

const configFile = ts.readConfigFile(nodePath.join(projectRoot, 'tsconfig.json'), ts.sys.readFile)
if (configFile.error) {
  console.error('[dynsnap] tsconfig 解析失败: ' + ts.flattenDiagnosticMessageText(configFile.error.messageText, ' '))
  process.exit(1)
}
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot)
const program = ts.createProgram([...parsed.fileNames, globalDts], parsed.options)

// TS 的 fileName 在 Windows 上也是正斜杠, 前缀匹配前先归一化, 否则过滤全部落空(假绿)
const toPosix = value => value.replace(/\\/g, '/')
const ownPrefix = toPosix(nodePath.join(projectRoot, 'src')) + '/'
const ownDiagnostics = ts
  .getPreEmitDiagnostics(program)
  .filter(diag => diag.file && toPosix(diag.file.fileName).startsWith(ownPrefix))

for (const diag of ownDiagnostics) {
  const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start)
  const file = nodePath.relative(projectRoot, diag.file.fileName).replace(/\\/g, '/')
  console.error(`${file}:${line + 1}:${character + 1} - ${ts.flattenDiagnosticMessageText(diag.messageText, ' ')}`)
}

if (ownDiagnostics.length > 0) {
  console.error(`[dynsnap] typecheck 失败: src/ 下 ${ownDiagnostics.length} 个类型错误`)
  process.exit(1)
}
console.log('[dynsnap] typecheck 通过: src/ 下 0 个类型错误')
