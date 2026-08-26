import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import type { Configuration } from 'webpack'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(currentDir)
const beRoot = process.env.BILI_EVOLVED_PATH || path.resolve(projectRoot, '..', 'Bilibili-Evolved')
const srcDir = path.join(projectRoot, 'src')
// 官方 description/core-info 注入只处理 BE registry 下的 index.ts,
// 因此构建时把 src 临时同步到 BE 仓库 registry/lib/components/feeds/dynshot, 构建后清理。
const tempComponentDir = path.join(beRoot, 'registry/lib/components/feeds/dynshot')

const main = async () => {
  const { getDefaultConfig } = await import(
    pathToFileURL(path.join(beRoot, 'webpack/webpack.config.ts')).href,
  )
  const require = createRequire(path.join(beRoot, 'package.json'))
  const webpack = require('webpack') as typeof import('webpack')
  const lodash = require('lodash')

  fs.rmSync(tempComponentDir, { recursive: true, force: true })
  fs.mkdirSync(tempComponentDir, { recursive: true })
  fs.cpSync(srcDir, tempComponentDir, { recursive: true })

  const entry = path.join(tempComponentDir, 'index.ts')
  const config = getDefaultConfig(tempComponentDir) as Configuration
  config.mode = 'production'
  config.cache = false
  config.entry = { dynshot: entry }
  config.output = {
    path: path.join(projectRoot, 'dist'),
    filename: 'dynshot.js',
    library: { name: 'dynshot', type: 'umd', export: 'component' },
  }
  config.devtool = false
  config.resolve = config.resolve ?? {}
  config.resolve.alias = { ...(config.resolve.alias ?? {}), '@dynshot/src': tempComponentDir }

  // 与 Bilibili-Evolved 相同的 externals: @/core、@/components、@/plugins 等运行时由脚本本体提供
  config.externals = [
    { vue: 'global Vue' },
    ...((config.externals as any[]) ?? []),
    ({ request }, callback) => {
      const regexMatch = (regex: RegExp, base: string[]) => {
        const match = request.match(regex)
        if (match) {
          const subModules = match[1]
            ? match[1].split('/').map(name => {
                if (name.match(/\.vue$/)) {
                  return name.replace(/\.vue$/, '')
                }
                return lodash.camelCase(name)
              })
            : []
          return () => (callback as any)(null, ['coreApis', ...base, ...subModules], 'root')
        }
        return null
      }
      const matches = [
        { regex: /^@\/core\/(.+)$/, base: [] },
        { regex: /^@\/ui$/, base: ['ui'] },
        { regex: /^@\/components\/(.+)$/, base: ['componentApis'] },
        { regex: /^@\/plugins\/(.+)$/, base: ['pluginApis'] },
      ]
      for (const { regex, base } of matches) {
        const matchCallback = regexMatch(regex, base)
        if (matchCallback) {
          return matchCallback()
        }
      }
      return callback()
    },
  ]

  try {
    await new Promise<void>((resolve, reject) => {
      webpack(config as any, (err, stats) => {
        if (err) {
          reject(err)
          return
        }
        if (stats?.hasErrors()) {
          console.error(stats.toString({ all: false, errors: true, warnings: true }))
          reject(new Error('dynshot 构建失败'))
          return
        }
        console.log('✅ 已生成 dist/dynshot.js')
        resolve()
      })
    })
  } finally {
    fs.rmSync(tempComponentDir, { recursive: true, force: true })
  }
}
main()
