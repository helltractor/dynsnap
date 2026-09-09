'use strict'
// 离线 fixture 测试：多图重排 / 底部留白 / 评论截图 / 评论区按钮（v3 shadow DOM + v1）
const { launch, loadComponent, analyzeLastShot, sleep, createReporter } = require('./helpers')

const svgImage = (r, g, b) =>
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">' +
      '<rect width="300" height="300" fill="rgb(' + r + ',' + g + ',' + b + ')"/></svg>',
  ).toString('base64')

const COLORS = {
  red: [220, 60, 60],
  green: [60, 180, 90],
  blue: [60, 120, 220],
  yellow: [230, 180, 40],
  avatar: [0, 170, 119],
}

const galleryHtml = ['red', 'green', 'blue', 'yellow']
  .map(name => {
    const [r, g, b] = COLORS[name]
    return '<img src="' + svgImage(r, g, b) + '">'
  })
  .join('')

const html =
  '<!DOCTYPE html><html><head><style>' +
  'body { margin: 0; background: #eef; font-family: sans-serif }' +
  '.bili-dyn-item { width: 520px; margin: 20px; background: #fff; border-radius: 8px }' +
  '.bili-dyn-item__main { padding: 16px }' +
  '.bili-dyn-item__avatar { width: 48px; height: 48px; margin-bottom: 10px }' +
  '.b-avatar { width: 48px; height: 48px; border-radius: 50%; background: rgb(0,170,119) }' +
  '.bili-dyn-gallery { display: flex; gap: 6px; width: 480px; overflow: hidden }' +
  '.bili-dyn-gallery img { flex: 0 0 480px; width: 480px; height: 240px; object-fit: cover }' +
  '.comment { width: 520px; margin: 20px; padding: 12px; background: #fff; border: 1px solid #ddd }' +
  '.v1 { width: 520px; margin: 20px; padding: 12px; background: #fff; border: 1px solid #ddd }' +
  '.bili-tabs__nav__items { display: flex; gap: 8px; margin-bottom: 8px }' +
  '</style></head><body>' +
  '<div class="bili-dyn-item" id="card"><div class="bili-dyn-item__main">' +
  '<div class="bili-dyn-item__avatar"><div class="b-avatar"></div></div>' +
  '<div class="bili-dyn-content">测试动态</div>' +
  '<div class="bili-dyn-gallery">' + galleryHtml + '</div>' +
  '</div></div>' +
  '<div class="comment" id="comment">测试评论内容</div>' +
  '<div class="v1" id="v1"><div class="bili-tabs__nav__items"><span>热门评论</span></div><div>v1 评论区</div></div>' +
  '<bili-comments id="v3"></bili-comments>' +
  '<script>' +
  'const host = document.getElementById("v3");' +
  'const shadow = host.attachShadow({ mode: "open" });' +
  'const header = document.createElement("bili-comments-header-renderer");' +
  'shadow.appendChild(header);' +
  'const headerShadow = header.attachShadow({ mode: "open" });' +
  'const sortByHot = document.createElement("bili-text-button");' +
  'sortByHot.textContent = "按热度";' +
  'headerShadow.appendChild(sortByHot);' +
  'shadow.appendChild(document.createElement("div")).textContent = "v3 评论区";' +
  '</script></body></html>'

const colorTargets = Object.entries(COLORS).map(([name, rgb]) => ({ name, rgb }))

const main = async () => {
  const report = createReporter('fixture 测试（离线）')
  const browser = await launch()
  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.setContent(html)
  await page.evaluate(targets => {
    window.__dynsnap = { saved: [], errors: [], colorTargets: targets }
  }, colorTargets)
  await loadComponent(page, {
    cards: '.bili-dyn-item',
    comments: '.comment',
    areas: '#v3, #v1',
  })
  await page.evaluate(targets => {
    window.__dynsnap.colorTargets = targets
  }, colorTargets)
  await sleep(300)

  // 1. 动态卡片截图：多图重排 + 底部留白
  await page.evaluate(() => document.querySelector('.dynsnap-test-截图动态').click())
  await sleep(4500)
  const card = await analyzeLastShot(page)
  report.check(!!card, '动态卡片截图产生下载')
  if (card) {
    report.check(card.type === 'image/png', '产物为 PNG', card.type)
    report.check(card.magic === '89 50 4e 47 0d 0a 1a 0a', 'PNG 魔数正确', card.magic)
    const { red, green, blue, yellow, avatar } = card.colors
    report.check(
      [red, green, blue, yellow].every(color => color.count > 10000),
      '4 张图集图片全部入图',
      { red: red.count, green: green.count, blue: blue.count, yellow: yellow.count },
    )
    report.check(
      red.maxX < green.minX && green.maxX < blue.minX,
      '图集重排为 3 列（红→绿→蓝）',
      { redMaxX: red.maxX, greenMinX: green.minX, blueMinX: blue.minX },
    )
    report.check(yellow.minY > red.maxY, '第 4 张图换行到第二行', {
      yellowMinY: yellow.minY,
      redMaxY: red.maxY,
    })
    report.check(card.whiteBottomRatio === 1, '底部留白为纯白', card.whiteBottomRatio)
    report.check(avatar.count > 1000, '头像已入图', avatar.count)
  }
  const restored = await page.evaluate(() => ({
    galleryDisplay: getComputedStyle(document.querySelector('.bili-dyn-gallery')).display,
    grids: document.querySelectorAll('.dynsnap-reflow-grid').length,
  }))
  report.check(restored.galleryDisplay === 'flex' && restored.grids === 0, '截图后 DOM 完整还原', restored)

  // 2. 评论截图
  await page.evaluate(() => document.querySelector('.dynsnap-test-截图评论').click())
  await sleep(4000)
  const comment = await analyzeLastShot(page)
  report.check(
    !!comment && comment.type === 'image/png' && comment.nonWhiteRatio > 0.005,
    '评论截图产生非空 PNG',
    comment && { type: comment.type, nonWhiteRatio: comment.nonWhiteRatio },
  )

  // 3. 评论区按钮注入（v3 shadow DOM / v1）
  const injected = await page.evaluate(() => {
    const host = document.getElementById('v3')
    const headerShadow = host.shadowRoot.querySelector('bili-comments-header-renderer').shadowRoot
    return {
      v3: [...headerShadow.querySelectorAll('bili-text-button')].map(button => button.textContent),
      v1: [...document.querySelectorAll('#v1 .dynsnap-area-trigger')].map(button => button.textContent),
    }
  })
  report.check(injected.v3.includes('截图评论区'), 'v3 评论区按钮注入到 shadow DOM 头部', injected.v3)
  report.check(injected.v1.includes('截图评论区'), 'v1 评论区按钮注入到导航栏', injected.v1)

  // 4. v3 评论区截图
  await page.evaluate(() => {
    const host = document.getElementById('v3')
    const headerShadow = host.shadowRoot.querySelector('bili-comments-header-renderer').shadowRoot
    headerShadow.querySelector('.dynsnap-area-trigger').click()
  })
  await sleep(5000)
  const area = await analyzeLastShot(page)
  report.check(
    !!area && area.type === 'image/png' && area.nonWhiteRatio > 0.002,
    'v3 评论区（shadow DOM）截图成功',
    area && { type: area.type, nonWhiteRatio: area.nonWhiteRatio },
  )

  const toastErrors = await page.evaluate(() => window.__dynsnap.errors)
  report.check(pageErrors.length === 0 && toastErrors.length === 0, '无页面/组件错误', {
    pageErrors,
    toastErrors,
  })

  const failed = report.summary()
  await browser.close()
  process.exit(failed ? 1 : 0)
}

main().catch(error => {
  console.error('FATAL', error)
  process.exit(1)
})
