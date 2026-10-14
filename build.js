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
// 归属标记：只有带这个标记的目录才是本工具创建的临时目录。
// 没有标记说明那是 BE 仓库里真实存在的同名组件，绝不能删。
const sentinelName = '.dynsnap-temp'
const sentinelPath = nodePath.join(tempComponentDir, sentinelName)
const hasSentinel = () => fs.existsSync(sentinelPath)

/**
 * 删除临时目录，但只在确认它是本工具创建的前提下。
 *
 * 本构建会写入并删除一个**外部仓库**（BE）的源码路径，而该路径恰好是
 * 本组件在 BE 生态里的自然归属位置，用户可能真的在那儿放了一个组件。
 * 因此删除前必须校验归属标记，宁可留下残渣也不能误删用户代码。
 */
const removeTempDir = () => {
  if (fs.existsSync(tempComponentDir) && hasSentinel()) {
    fs.rmSync(tempComponentDir, { recursive: true, force: true })
  }
}

/**
 * 准备临时目录：已存在的同名真实组件直接拒绝构建，绝不覆盖。
 *
 * 只校验删除是不够的——若目录里是用户自己的组件，先拷贝再打标记会污染它，
 * 而下次构建看到标记就会把它删掉。所以没有标记时必须在此中止。
 */
const prepareTempDir = () => {
  if (fs.existsSync(tempComponentDir) && !hasSentinel()) {
    console.error(`[dynsnap] 目标路径已存在且不是本工具创建的临时目录: ${tempComponentDir}`)
    console.error(`[dynsnap] 该目录缺少 ${sentinelName} 标记，构建会覆盖它，已中止以免破坏你的代码`)
    console.error('[dynsnap] 请先备份 / 移走该目录，或改用 BILI_EVOLVED_PATH 指向另一个 BE 仓库')
    process.exit(1)
  }
  removeTempDir()
  fs.mkdirSync(tempComponentDir, { recursive: true })
  // 先落标记再拷源码：这样即使拷贝过程中断，残留目录也仍可被安全清理
  fs.writeFileSync(sentinelPath, '此目录由 dynsnap/build.js 临时创建，可安全删除\n')
}

if (!fs.existsSync(nodePath.join(beRoot, 'package.json'))) {
  console.error('[dynsnap] 未找到 Bilibili-Evolved 仓库: ' + beRoot)
  console.error('[dynsnap] 请设置环境变量 BILI_EVOLVED_PATH 指向 Bilibili-Evolved 仓库, 或将仓库放在本项目上两级目录')
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

/**
 * 把拷贝到临时目录的源码统一为 LF。
 *
 * 产物里内嵌了 index.md 的正文（description 注入），而 Windows 上
 * core.autocrlf=true 会把工作区文件检出成 CRLF。若不归一化，同一份源码在
 * Windows 与 Linux 上会构建出字节不同的产物，CI 的「产物与源码同步」校验
 * 就会在本机通过、在 CI 失败（反之亦然）。
 */
const normalizeToLf = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = nodePath.join(dir, entry.name)
    if (entry.isDirectory()) {
      normalizeToLf(full)
      continue
    }
    // 跳过符号链接等非普通文件：不穿透链接改写，避免动到 src 之外的内容
    if (!entry.isFile()) {
      continue
    }
    const raw = fs.readFileSync(full)
    // 只处理文本：二进制文件里出现 \r\n 字节对属于巧合，替换会破坏它
    if (raw.includes(0)) {
      continue
    }
    const text = raw.toString('utf8')
    if (text.includes('\r\n')) {
      fs.writeFileSync(full, text.replace(/\r\n/g, '\n'))
    }
  }
}

const main = () => {
  prepareTempDir()
  fs.cpSync(srcDir, tempComponentDir, { recursive: true })
  normalizeToLf(tempComponentDir)
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

  const cleanup = () => removeTempDir()
  // 中断兜底：Ctrl+C / 被 kill / 正常退出时也清掉临时目录，
  // 否则 BE 仓库里会残留一个未跟踪目录（其 git status 被污染）。
  let interrupted = false
  const onInterrupt = signal => {
    if (interrupted) {
      return
    }
    interrupted = true
    cleanup()
    console.error(`\n[dynsnap] 收到 ${signal}，已清理临时目录，构建中止`)
    process.exit(130)
  }
  process.on('SIGINT', () => onInterrupt('SIGINT'))
  process.on('SIGTERM', () => onInterrupt('SIGTERM'))
  process.on('exit', cleanup)
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
