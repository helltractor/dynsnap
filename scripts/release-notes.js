'use strict'
// 从 CHANGELOG.md 提取当前 tag 对应章节，写入 release-notes.md，
// 供 release workflow 的 GitHub Release 正文使用（tag 需与 CHANGELOG 章节标题一致，如 v0.1.0）。
const fs = require('fs')

const tag = process.env.GITHUB_REF_NAME
if (!tag || !/^v\d+\.\d+\.\d+/.test(tag)) {
  console.error('[dynsnap] 非预期的 tag: ' + tag)
  process.exit(1)
}

const changelog = fs.readFileSync('CHANGELOG.md', 'utf8')
const headingRegex = new RegExp('^## ' + tag.replace(/\./g, '\\.') + '\\b', 'm')
const startMatch = changelog.match(headingRegex)
if (!startMatch) {
  console.error('[dynsnap] CHANGELOG.md 中未找到 ' + tag + ' 章节，请先补充 CHANGELOG 再打 tag')
  process.exit(1)
}
const start = startMatch.index
const next = changelog.indexOf('\n## ', start + 1)
const section = (next === -1 ? changelog.slice(start) : changelog.slice(start, next)).trim()
fs.writeFileSync('release-notes.md', section + '\n')
console.log('[dynsnap] 已提取 ' + tag + ' 发布说明:\n' + section)
