'use strict'
// Greasy Fork 用户脚本测试：检测 Bilibili-Evolved、安装组件、已安装时跳过
const fs = require('fs')
const path = require('path')
const { launch, sleep, createReporter, distPath } = require('./helpers')

const userscriptPath = path.join(path.dirname(distPath), 'dynshot.user.js')

const stubBilibiliEvolved = installed => {
  window.__calls = []
  window.__toasts = []
  window.bilibiliEvolved = {
    settings: { userComponents: installed ? { dynshot: {} } : {} },
    Toast: {
      info: message => window.__toasts.push(['info', message]),
      success: message => window.__toasts.push(['success', message]),
      error: message => window.__toasts.push(['error', message]),
    },
    installFeatureFromCode: code => {
      window.__calls.push(code)
      return Promise.resolve({ metadata: { name: 'dynshot' }, message: '已安装组件 dynshot，刷新后生效' })
    },
  }
  window.lodash = { debounce: fn => fn }
  window.componentsTags = {}
  window.coreApis = {
    download: {}, toast: {}, observer: {}, spinQuery: {}, shadowRoot: {},
    utils: { urls: { videoUrls: [], columnUrls: [], feedsUrls: [] }, log: { useScopedConsole: () => console } },
    componentApis: {
      define: { defineComponentMetadata: metadata => metadata },
      feeds: { api: {} },
      utils: { commentApis: {} },
    },
  }
}

const main = async () => {
  const report = createReporter('userscript 测试（Greasy Fork 分发）')
  report.check(fs.existsSync(userscriptPath), '存在 dist/dynshot.user.js')
  const script = fs.readFileSync(userscriptPath, 'utf8')
  report.check(script.startsWith('// ==UserScript=='), '包含 UserScript 头')
  report.check(/@version\s+\d+\.\d+\.\d+/.test(script), '包含 @version')
  report.check(/@match\s+\*:\/\/\*\.bilibili\.com\/\*/.test(script), '包含 bilibili 站点匹配')
  report.check(script.includes('installFeatureFromCode'), '通过 BE API 安装组件')

  const browser = await launch()

  // 1. 未安装 BE 组件时：调用 installFeatureFromCode 并注入组件代码
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent('<!DOCTYPE html><html><body></body></html>')
  await page.evaluate(stubBilibiliEvolved, false)
  await page.evaluate(script)
  await sleep(1200)
  const installed = await page.evaluate(() => {
    const code = window.__calls[0]
    if (!code) return { called: false }
    const exports = {}
    const result = new Function('window', 'exports', 'with (window) { return eval(arguments[2]) }')(
      window,
      exports,
      code,
    )
    const component = Object.values(exports)[0] || result
    return { called: true, codeLength: code.length, name: component && component.name, toasts: window.__toasts }
  })
  report.check(installed.called, '检测到 Bilibili-Evolved 后调用安装 API')
  report.check(
    !!installed.name && installed.name === 'dynshot',
    '内嵌组件代码可解析为 dynshot 组件',
    installed.name,
  )
  report.check(
    (installed.toasts || []).some(([type]) => type === 'success'),
    '安装成功后有成功提示',
    installed.toasts,
  )
  report.check(errors.length === 0, '无脚本错误', errors)

  // 2. 组件已安装时：跳过安装
  const page2 = await browser.newPage()
  await page2.setContent('<!DOCTYPE html><html><body></body></html>')
  await page2.evaluate(stubBilibiliEvolved, true)
  await page2.evaluate(script)
  await sleep(1200)
  const skipped = await page2.evaluate(() => ({ calls: window.__calls.length }))
  report.check(skipped.calls === 0, '组件已安装时跳过重复安装', skipped)

  const failed = report.summary()
  await browser.close()
  process.exit(failed ? 1 : 0)
}

main().catch(error => {
  console.error('FATAL', error)
  process.exit(1)
})
