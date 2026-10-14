'use strict'
// 离线 fixture 测试：多图重排 / 底部留白 / 评论截图 / 评论区按钮（v3 shadow DOM + v1）
// 回归用例：媒体与懒加载属性还原 / 挂起图片不阻断截图 / 失败后互斥锁释放 / data URL 不被 '@' 截断
const { launch, loadComponent, analyzeLastShot, sleep, createReporter } = require('./helpers')

const svgImage = (r, g, b) =>
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">' +
      '<rect width="300" height="300" fill="rgb(' + r + ',' + g + ',' + b + ')"/></svg>',
  ).toString('base64')

// 含字面量 '@' 的 data URL：重排若按 '@' 截断取原图，这个 URL 会被切坏导致图片加载失败
const svgImageWithAt = (r, g, b) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">' +
      '<rect width="300" height="300" fill="rgb(' + r + ',' + g + ',' + b + ')"/>' +
      '<text x="10" y="20">@</text></svg>',
  ).replace(/%40/g, '@')

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
    // yellow 用带 '@' 的 data URL，验证重排不会误伤非 http(s) 图片地址
    return '<img src="' + (name === 'yellow' ? svgImageWithAt(r, g, b) : svgImage(r, g, b)) + '">'
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
  '#huge { width: 25000px; height: 10px }' +
  // 单边未超限但总面积超过画布上限：用于验证面积守卫（而非只看单边）
  '#massive { position: absolute; top: 0; left: 0; width: 20000px; height: 20000px; pointer-events: none }' +
  '</style></head><body>' +
  '<div class="bili-dyn-item" id="card"><div class="bili-dyn-item__main">' +
  '<div class="bili-dyn-item__avatar"><div class="b-avatar"></div></div>' +
  '<div class="bili-dyn-content">测试动态</div>' +
  '<audio id="media"></audio>' +
  '<div class="bili-dyn-gallery">' + galleryHtml + '</div>' +
  '</div></div>' +
  '<div class="comment" id="comment">测试评论内容' +
  '<img id="lazy" loading="lazy" data-src="' + svgImage(120, 120, 120) + '">' +
  // 「占位图 + data-src」懒加载写法：src 非空，只判 !src 的实现会漏掉它
  '<img id="lazy2" src="' + svgImage(10, 10, 10) + '" data-src="' + svgImage(200, 40, 40) +
  '" srcset="' + svgImage(10, 10, 10) + ' 1x">' +
  '<img id="stuck" src="' + svgImage(90, 90, 90) + '">' +
  '</div>' +
  '<div class="v1" id="v1"><div class="bili-tabs__nav__items"><span>热门评论</span></div><div>v1 评论区</div></div>' +
  '<bili-comments id="v3"></bili-comments>' +
  '<div id="huge"></div>' +
  '<div id="massive"></div>' +
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

/** 轮询等待页面内某个计数达到目标值（替代固定 sleep，避免慢机器上的偶发失败） */
const waitUntil = async (page, read, target, timeout = 25000) => {
  const deadline = Date.now() + timeout
  for (;;) {
    if ((await page.evaluate(read)) >= target) {
      return true
    }
    if (Date.now() > deadline) {
      return false
    }
    await sleep(200)
  }
}
const waitForShots = (page, count, timeout) =>
  waitUntil(page, () => window.__dynsnap.saved.length, count, timeout)
const waitForErrors = (page, count, timeout) =>
  waitUntil(page, () => window.__dynsnap.errors.length, count, timeout)

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
    comments: '.comment, #huge, #massive',
    areas: '#v3, #v1',
  })
  await page.evaluate(targets => {
    window.__dynsnap.colorTargets = targets
  }, colorTargets)
  // 造两个测试夹具：
  // - #media：假装正在播放（paused=false），记录 pause/play 调用顺序
  // - #stuck：假装永远加载不完（complete=false），验证 waitForImages 会超时放行
  await page.evaluate(() => {
    const media = document.getElementById('media')
    window.__dynsnap.media = []
    Object.defineProperty(media, 'paused', { get: () => false, configurable: true })
    media.pause = () => {
      window.__dynsnap.media.push('pause')
    }
    media.play = () => {
      window.__dynsnap.media.push('play')
      return Promise.resolve()
    }
    const stuck = document.getElementById('stuck')
    Object.defineProperty(stuck, 'complete', { get: () => false, configurable: true })
    Object.defineProperty(stuck, 'naturalWidth', { get: () => 0, configurable: true })
  })
  await sleep(300)

  // 1. 动态卡片截图：多图重排 + 底部留白
  await page.evaluate(() => document.querySelector('.dynsnap-test-截图动态').click())
  report.check(await waitForShots(page, 1), '动态卡片截图在超时前完成')
  await sleep(300)
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
  const mediaCalls = await page.evaluate(() => window.__dynsnap.media)
  report.check(
    mediaCalls.join(',') === 'pause,play',
    '被暂停的媒体在截图后恢复播放',
    mediaCalls,
  )

  // 2. 评论截图（内含一个永远加载不完的图片，验证不会被无限等待卡住）
  await page.evaluate(() => document.querySelector('.dynsnap-test-截图评论').click())
  report.check(await waitForShots(page, 2), '评论截图在图片挂起时仍按时完成')
  await sleep(300)
  const comment = await analyzeLastShot(page)
  report.check(
    !!comment && comment.type === 'image/png' && comment.nonWhiteRatio > 0.005,
    '评论截图产生非空 PNG',
    comment && { type: comment.type, nonWhiteRatio: comment.nonWhiteRatio },
  )
  const lazyState = await page.evaluate(() => {
    const img = document.getElementById('lazy')
    return { loading: img.getAttribute('loading'), hasSrc: !!img.getAttribute('src') }
  })
  report.check(
    lazyState.loading === 'lazy' && lazyState.hasSrc,
    '懒加载图片 loading 属性已还原、src 已就位',
    lazyState,
  )
  // 「占位图 + data-src」写法：必须用真图替换占位图，且 srcset 要还原
  const lazy2State = await page.evaluate(() => {
    const img = document.getElementById('lazy2')
    return {
      src: img.getAttribute('src'),
      want: img.getAttribute('data-src'),
      srcset: img.getAttribute('srcset'),
    }
  })
  report.check(
    lazy2State.src === lazy2State.want,
    '占位图 + data-src 写法已替换为真图',
    { src: (lazy2State.src || '').slice(0, 32), want: (lazy2State.want || '').slice(0, 32) },
  )
  report.check(!!lazy2State.srcset, '被清除的 srcset 已还原', {
    srcset: (lazy2State.srcset || '').slice(0, 32),
  })

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
  report.check(await waitForShots(page, 3), 'v3 评论区截图在超时前完成')
  await sleep(300)
  const area = await analyzeLastShot(page)
  report.check(
    !!area && area.type === 'image/png' && area.nonWhiteRatio > 0.002,
    'v3 评论区（shadow DOM）截图成功',
    area && { type: area.type, nonWhiteRatio: area.nonWhiteRatio },
  )

  // 4b. 宿主重复回调同一条评论：seenComments 去重后菜单项只能注入一次
  const commentMenuCount = await page.evaluate(
    () => document.querySelectorAll('#comment .dynsnap-test-截图评论').length,
  )
  report.check(commentMenuCount === 1, '重复回调不重复注入评论菜单项', commentMenuCount)

  // 4c. repliesUpdate：新增回复后应为该回复补上截图菜单项
  const repliesAdded = await page.evaluate(() => {
    const item = window.__dynsnap.commentItems.find(entry => entry.element.id === 'comment')
    if (!item || !item.listeners.repliesUpdate) {
      return false
    }
    item.listeners.repliesUpdate({ detail: [{ id: 'reply1', element: item.element }] })
    return true
  })
  const replyMenuCount = await page.evaluate(
    () => document.querySelectorAll('#comment .dynsnap-test-截图评论').length,
  )
  report.check(
    repliesAdded && replyMenuCount === 2,
    'repliesUpdate 后为新增回复注入菜单项',
    { repliesAdded, replyMenuCount },
  )

  // 4d. v3 区域更新事件：按钮被移除后应经 debounce 重新注入，且不重复注入
  await page.evaluate(() => {
    const host = document.getElementById('v3')
    const headerShadow = host.shadowRoot.querySelector('bili-comments-header-renderer').shadowRoot
    headerShadow.querySelectorAll('.dynsnap-area-trigger').forEach(button => button.remove())
    host.dispatchEvent(new Event('dynsnap-updated'))
  })
  await sleep(600)
  const v3AfterUpdate = await page.evaluate(() => {
    const host = document.getElementById('v3')
    const headerShadow = host.shadowRoot.querySelector('bili-comments-header-renderer').shadowRoot
    return headerShadow.querySelectorAll('.dynsnap-area-trigger').length
  })
  report.check(v3AfterUpdate === 1, 'v3 更新事件后按钮重新注入且不重复', v3AfterUpdate)

  await page.evaluate(() => {
    const host = document.getElementById('v3')
    const headerShadow = host.shadowRoot.querySelector('bili-comments-header-renderer').shadowRoot
    headerShadow.querySelectorAll('.dynsnap-area-trigger').forEach(button => button.remove())
    document.getElementById('v1').querySelectorAll('.dynsnap-area-trigger').forEach(b => b.remove())
    window.__dynsnap.videoChange()
  })
  await sleep(400)
  const afterVideoChange = await page.evaluate(() => ({
    v3: (() => {
      const host = document.getElementById('v3')
      const headerShadow = host.shadowRoot.querySelector('bili-comments-header-renderer').shadowRoot
      return headerShadow.querySelectorAll('.dynsnap-area-trigger').length
    })(),
    v1: document.querySelectorAll('#v1 .dynsnap-area-trigger').length,
  }))
  report.check(
    afterVideoChange.v3 === 1 && afterVideoChange.v1 === 1,
    'videoChange 后所有评论区按钮重新注入',
    afterVideoChange,
  )

  // 5. 失败路径：超长内容被守卫拦截后，互斥锁必须释放，后续截图仍可用
  const errorsBefore = await page.evaluate(() => window.__dynsnap.errors.length)
  await page.evaluate(() => document.querySelector('#huge .dynsnap-test-截图评论').click())
  report.check(await waitForErrors(page, errorsBefore + 1), '超长内容截图失败并上报错误')
  const failMessage = await page.evaluate(
    () => window.__dynsnap.errors[window.__dynsnap.errors.length - 1] || '',
  )
  report.check(failMessage.includes('内容过长'), '失败提示为内容过长', failMessage)

  // 5b. 面积守卫：单边未超 24000 但总面积超过画布上限，也必须被拦下
  const errorsBeforeArea = await page.evaluate(() => window.__dynsnap.errors.length)
  await page.evaluate(() => document.querySelector('#massive .dynsnap-test-截图评论').click())
  report.check(await waitForErrors(page, errorsBeforeArea + 1), '超大面积截图被面积守卫拦截')
  const areaMessage = await page.evaluate(
    () => window.__dynsnap.errors[window.__dynsnap.errors.length - 1] || '',
  )
  report.check(areaMessage.includes('内容过长'), '面积超限提示与边长超限一致', areaMessage)

  await page.evaluate(() => document.querySelector('.dynsnap-test-截图动态').click())
  report.check(await waitForShots(page, 4), '失败后互斥锁已释放，可继续截图')

  const toastErrors = await page.evaluate(() => window.__dynsnap.errors)
  const unexpected = toastErrors.filter(message => !message.includes('内容过长'))
  report.check(pageErrors.length === 0 && unexpected.length === 0, '无页面/组件错误（超长守卫除外）', {
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
