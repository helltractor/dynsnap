'use strict'
// 无头浏览器测试公共工具：启动浏览器 / 注入 Bilibili-Evolved API 桩 / 分析截图结果
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const distPath = path.join(projectRoot, 'dist', 'dynsnap.js')

const browserCandidates = [
  process.env.DYN_SNAP_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const findBrowser = () => {
  const found = browserCandidates.find(candidate => fs.existsSync(candidate))
  if (!found) {
    throw new Error('未找到浏览器，请设置 DYN_SNAP_BROWSER 指向 Chrome/Edge 可执行文件')
  }
  return found
}

const launch = async () => {
  const puppeteer = require('puppeteer-core')
  // DYN_SNAP_BROWSER_ARGS: 追加 Chromium 启动参数，如 --no-proxy-server
  // （系统代理指向已失效的本地端口时，无头浏览器会 ERR_CONNECTION_CLOSED，需绕过）
  const extraArgs = (process.env.DYN_SNAP_BROWSER_ARGS || '').split(' ').filter(Boolean)
  return puppeteer.launch({
    executablePath: findBrowser(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...extraArgs],
  })
}

const loadComponent = async (page, config) => {
  const dist = fs.readFileSync(distPath, 'utf8')
  await page.evaluate(buildStub, config)
  await page.evaluate(dist)
  await page.evaluate(() => window.dynsnap.entry())
}

/** 注入 Bilibili-Evolved 运行时 API 桩，并把组件回调指向页面上真实存在的元素 */
const buildStub = config => {
  const cfg = config || {}
  window.__dynsnap = { saved: [], errors: [] }
  window.lodash = { debounce: fn => fn }
  window.componentsTags = { feeds: 'feeds', utils: 'utils', video: 'video' }
  const toast = {
    info: message => ({ close() {}, message }),
    success: () => ({ close() {} }),
    error: message => {
      window.__dynsnap.errors.push(String(message))
      return { close() {} }
    },
  }
  const queryAll = selector => (selector ? [...document.querySelectorAll(selector)] : [])
  const addButton = (host, text, action) => {
    const button = document.createElement('button')
    button.className = `dynsnap-test-${text}`
    button.textContent = text
    button.addEventListener('click', action)
    host.appendChild(button)
  }
  window.coreApis = {
    download: {
      DownloadPackage: {
        single: async (name, blob) => {
          window.__dynsnap.saved.push({ name, type: blob.type, size: blob.size, blob })
        },
      },
    },
    toast: { Toast: toast },
    observer: { videoChange: () => {} },
    spinQuery: {
      select: async fn => {
        for (let i = 0; i < 40; i++) {
          const result = fn()
          if (result) return result
          await new Promise(resolve => setTimeout(resolve, 50))
        }
        return null
      },
    },
    shadowRoot: { ShadowRootEvents: { Updated: 'dynsnap-updated' } },
    utils: {
      urls: { videoUrls: [], columnUrls: [], feedsUrls: [] },
      log: { useScopedConsole: () => console },
    },
    componentApis: {
      define: { defineComponentMetadata: metadata => metadata },
      feeds: {
        api: {
          forEachFeedsCard: ({ added }) => {
            queryAll(cfg.cards).forEach((element, index) =>
              added({ id: `card${index}`, element }),
            )
          },
          addMenuItem: (card, menu) => addButton(card.element, menu.text, menu.action),
        },
      },
      utils: {
        commentApis: {
          forEachCommentItem: ({ added }) => {
            queryAll(cfg.comments).forEach((element, index) => {
              const item = { id: `comment${index}`, element, replies: [], addEventListener: () => {} }
              added(item)
            })
          },
          forEachCommentArea: callback => queryAll(cfg.areas).forEach(element => callback({ element })),
          addMenuItem: (item, menu) => addButton(item.element, menu.text, menu.action),
          commentAreaManager: { commentAreas: [] },
          CommentAreaV3: class CommentAreaV3 {},
        },
      },
    },
  }
}

/** 读取组件最近一次截图结果，并在页面内做像素统计 */
const analyzeLastShot = page =>
  page.evaluate(async () => {
    const { saved } = window.__dynsnap
    const shot = saved[saved.length - 1]
    if (!shot) return null
    const url = URL.createObjectURL(shot.blob)
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const near = (index, rgb, tolerance = 25) =>
      Math.abs(data[index] - rgb[0]) < tolerance &&
      Math.abs(data[index + 1] - rgb[1]) < tolerance &&
      Math.abs(data[index + 2] - rgb[2]) < tolerance
    const colors = {}
    ;(window.__dynsnap.colorTargets || []).forEach(({ name, rgb }) => {
      const box = { count: 0, minX: Infinity, maxX: -1, minY: Infinity, maxY: -1 }
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (near((y * canvas.width + x) * 4, rgb)) {
            box.count++
            box.minX = Math.min(box.minX, x)
            box.maxX = Math.max(box.maxX, x)
            box.minY = Math.min(box.minY, y)
            box.maxY = Math.max(box.maxY, y)
          }
        }
      }
      colors[name] = box
    })
    const bottomRows = Math.min(20, canvas.height)
    let whiteBottom = 0
    for (let y = canvas.height - bottomRows; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4
        if (data[index] > 245 && data[index + 1] > 245 && data[index + 2] > 245) whiteBottom++
      }
    }
    let nonWhite = 0
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] < 240 || data[index + 1] < 240 || data[index + 2] < 240) nonWhite++
    }
    const bytes = new Uint8Array(await shot.blob.arrayBuffer())
    return {
      name: shot.name,
      type: shot.type,
      size: shot.size,
      width: canvas.width,
      height: canvas.height,
      magic: [...bytes.slice(0, 8)].map(byte => byte.toString(16).padStart(2, '0')).join(' '),
      colors,
      whiteBottomRatio: whiteBottom / (bottomRows * canvas.width),
      nonWhiteRatio: nonWhite / (canvas.width * canvas.height),
    }
  })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const createReporter = title => {
  let pass = 0
  let fail = 0
  console.log(`\n${title}`)
  return {
    check(condition, label, detail) {
      if (condition) {
        pass++
        console.log(`  ✓ ${label}`)
      } else {
        fail++
        console.log(`  ✗ ${label}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
      }
    },
    summary() {
      console.log(`  结果：${pass} 通过，${fail} 失败`)
      return fail
    },
  }
}

module.exports = { projectRoot, distPath, launch, loadComponent, analyzeLastShot, sleep, createReporter }
