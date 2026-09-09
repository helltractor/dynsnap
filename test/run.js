'use strict'
// 测试入口：先跑离线 fixture，再跑真实页面（可用 DYN_SNAP_SKIP_REAL=1 跳过）
const { spawnSync } = require('child_process')
const path = require('path')

const run = file => {
  console.log('\n>>> ' + file)
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' })
  return result.status === 0
}

const results = [run('fixture.test.js'), run('userscript.test.js')]
if (process.env.DYN_SNAP_SKIP_REAL === '1') {
  console.log('\n>>> 已跳过真实页面测试（DYN_SNAP_SKIP_REAL=1）')
} else {
  results.push(run('real-page.test.js'))
}

const failed = results.filter(ok => !ok).length
console.log('\n总结果：' + (results.length - failed) + ' 个套件通过，' + failed + ' 个失败')
process.exit(failed ? 1 : 0)
