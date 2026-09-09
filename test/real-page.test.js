'use strict'
// 真实页面测试（需要网络）：opus 详情页 / t.bilibili.com 动态详情页 截图
const { launch, loadComponent, analyzeLastShot, sleep, createReporter } = require('./helpers')

const CASES = [
  {
    name: 'opus 详情页',
    url: 'https://www.bilibili.com/opus/1006354757808291875',
    card: '.bili-opus-view',
  },
  {
    name: 't.bilibili.com 动态详情页',
    url: 'https://t.bilibili.com/884386066101960707',
    card: '.bili-dyn-item',
  },
]

const main = async () => {
  const report = createReporter('real page 测试（需要网络）')
  const browser = await launch()
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 900 })
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  )
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))

  for (const testCase of CASES) {
    try {
      await page.goto(testCase.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await sleep(10000)
      await loadComponent(page, { cards: testCase.card })
      await sleep(500)
      const menu = await page.evaluate(() => !!document.querySelector('.dynsnap-test-截图动态'))
      report.check(menu, testCase.name + '：菜单项已注入')
      await page.evaluate(() => document.querySelector('.dynsnap-test-截图动态').click())
      await sleep(8000)
      const shot = await analyzeLastShot(page)
      report.check(
        !!shot && shot.type === 'image/png' && shot.nonWhiteRatio > 0.01,
        testCase.name + '：截图非空 PNG',
        shot && { type: shot.type, size: shot.size, nonWhiteRatio: shot.nonWhiteRatio },
      )
    } catch (error) {
      report.check(false, testCase.name + '：执行失败', error.message)
    }
  }

  const toastErrors = await page.evaluate(() => (window.__dynsnap ? window.__dynsnap.errors : []))
  report.check(pageErrors.length === 0 && toastErrors.length === 0, '无页面/组件错误', {
    pageErrors: pageErrors.slice(0, 3),
    toastErrors: toastErrors.slice(0, 3),
  })

  const failed = report.summary()
  await browser.close()
  process.exit(failed ? 1 : 0)
}

main().catch(error => {
  console.error('FATAL', error)
  process.exit(1)
})
