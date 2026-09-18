'use strict'
const fs = require('fs')
const nodePath = require('path')
const { createRequire } = require('module')

const projectRoot = __dirname
const beRoot = process.env.BILI_EVOLVED_PATH || nodePath.resolve(projectRoot, '..', '..', 'Bilibili-Evolved')
const srcDir = nodePath.join(projectRoot, 'src')
// 官方 description 注入只处理 BE registry 下的 index.ts,
// 因此构建时把 src 临时同步到 BE 仓库 registry/lib/components/feeds/dynsnap, 构建后清理。
const tempComponentDir = nodePath.join(beRoot, 'registry/lib/components/feeds/dynsnap')

if (!fs.existsSync(nodePath.join(beRoot, 'package.json'))) {
  console.error('[dynsnap] 未找到 Bilibili-Evolved 仓库: ' + beRoot)
  console.error('[dynsnap] 请设置环境变量 BILI_EVOLVED_PATH 指向 Bilibili-Evolved 仓库, 或将仓库放在本项目上级目录')
  process.exit(1)
}

const requireFromBe = createRequire(nodePath.join(beRoot, 'package.json'))
const pnpmStoreDir = nodePath.join(beRoot, 'node_modules', '.pnpm')

// 优先按普通 node_modules 解析, 失败时从 pnpm 虚拟仓库 (.pnpm/<name>@<ver>/node_modules/<name>) 定位,
// 兼容 pnpm 10+ 的隔离布局。
const resolveFromBe = name => {
  try {
    return requireFromBe.resolve(name)
  } catch (e) {
    // fall through
  }
  if (fs.existsSync(pnpmStoreDir)) {
    const prefix = name.replace('/', '+') + '@'
    const dir = fs.readdirSync(pnpmStoreDir).find(d => d.startsWith(prefix))
    if (dir) {
      const candidate = nodePath.join(pnpmStoreDir, dir, 'node_modules', name)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return null
}
const requirePkg = name => {
  const resolved = resolveFromBe(name)
  if (!resolved) {
    console.error('[dynsnap] 无法从 Bilibili-Evolved 仓库加载 ' + name + ': ' + beRoot)
    console.error('[dynsnap] 请先在 Bilibili-Evolved 仓库执行: pnpm install && cd registry && pnpm install')
    process.exit(1)
  }
  return require(resolved)
}

const webpack = requirePkg('webpack')
const TerserPlugin = requirePkg('terser-webpack-plugin')
const t = requirePkg('@babel/types')
const { parseExpression } = requirePkg('@babel/parser')

// lodash.camelCase 的极简替代（组件名均为短横线命名）
const camelCase = name =>
  name
    .replace(/[-_]+(\w)/g, (_, c) => c.toUpperCase())
    .replace(/^(\w)/, (_, c) => c.toLowerCase())

// 复刻 Bilibili-Evolved 的官方 description 注入逻辑（MIT）:
// https://github.com/the1812/Bilibili-Evolved/blob/master/webpack/inject-metadata/description.ts
// 当入口 index.ts 旁存在 index.md 时, 自动注入 description（zh-CN 懒加载）。
const injectDescription = () => ({
  visitor: {
    ExportNamedDeclaration(path, state) {
      const filename = state.file.opts.filename
      if (nodePath.basename(filename) !== 'index.ts') return
      const { node } = path
      if (!node.declaration || node.declaration.type !== 'VariableDeclaration') return
      node.declaration.declarations.forEach(d => {
        if (!d.id || d.id.type !== 'Identifier' || d.id.name !== 'component') return
        const target = d.init && d.init.type === 'CallExpression' ? d.init.arguments[0] : d.init
        if (!target || target.type !== 'ObjectExpression') return
        const defaultDesc = nodePath.join(nodePath.dirname(filename), 'index.md')
        if (!fs.existsSync(defaultDesc)) return
        const regex = /index\.(.+)\.md$/
        target.properties.push(
          t.objectProperty(
            t.identifier('description'),
            parseExpression(`
(() => {
  const context = require.context('./', false, ${regex})
  return {
    ...Object.fromEntries(context.keys().map(path => {
      const key = path.match(${regex})[1]
      const value = context(path)
      return [key, value]
    })),
    'zh-CN': () => import('./index.md').then(m => m.default),
  }
})()
            `, { plugins: ['typescript'] }),
          ),
        )
      })
    },
  },
})

const main = () => {
  fs.rmSync(tempComponentDir, { recursive: true, force: true })
  fs.mkdirSync(tempComponentDir, { recursive: true })
  fs.cpSync(srcDir, tempComponentDir, { recursive: true })
  const entry = nodePath.join(tempComponentDir, 'index.ts')

  const babelLoader = resolveFromBe('babel-loader')
  const babelPresetEnv = resolveFromBe('@babel/preset-env')
  const babelPresetTs = resolveFromBe('@babel/preset-typescript')
  if (!babelLoader || !babelPresetEnv || !babelPresetTs) {
    console.error('[dynsnap] 缺少 babel 相关依赖, 请先在 Bilibili-Evolved 仓库执行: pnpm install')
    process.exit(1)
  }

  const config = {
    mode: 'production',
    context: beRoot,
    cache: false,
    devtool: false,
    entry: { dynsnap: entry },
    output: {
      path: nodePath.join(projectRoot, 'dist'),
      filename: 'dynsnap.js',
      library: { name: 'dynsnap', type: 'umd', export: 'component' },
    },
    optimization: {
      minimizer: [new TerserPlugin({ extractComments: false })],
      splitChunks: false,
    },
    plugins: [new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })],
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.json'],
      alias: {
        '@': nodePath.join(beRoot, 'src'),
      },
    },
    module: {
      rules: [
        { test: /\.md$/, type: 'asset/source', include: [tempComponentDir] },
        {
          test: /\.tsx?$/,
          include: [tempComponentDir],
          use: {
            loader: babelLoader,
            options: {
              presets: [[babelPresetEnv], [babelPresetTs, { allExtensions: true }]],
              plugins: [injectDescription],
            },
          },
        },
      ],
    },
    externals: [
      { vue: 'global Vue' },
      ({ request }, callback) => {
        const regexMatch = (regex, base) => {
          const match = request.match(regex)
          if (match) {
            const subModules = match[1]
              ? match[1].split('/').map(name =>
                  name.match(/\.vue$/) ? name.replace(/\.vue$/, '') : camelCase(name),
                )
              : []
            return () => callback(null, ['coreApis', ...base, ...subModules], 'root')
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
          if (matchCallback) return matchCallback()
        }
        return callback()
      },
    ],
  }

  const cleanup = () => fs.rmSync(tempComponentDir, { recursive: true, force: true })
  try {
    webpack(config, (err, stats) => {
      if (err) {
        cleanup()
        console.error(err)
        process.exit(1)
      }
      if (stats && stats.hasErrors()) {
        cleanup()
        console.error(stats.toString({ all: false, errors: true, warnings: true }))
        process.exit(1)
      }
      cleanup()
      console.log('✅ 已生成 dist/dynsnap.js')
      process.exit(0)
    })
  } catch (e) {
    cleanup()
    console.error(e)
    process.exit(1)
  }
}

main()
