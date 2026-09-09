// ==UserScript==
// @name         dynsnap · 动态与评论截图（Bilibili-Evolved 组件）
// @name:zh-CN   dynsnap · 动态与评论截图
// @namespace    helltractor/dynsnap
// @version      __DYN_SNAP_VERSION__
// @description  一键把 dynsnap（动态卡片 / 评论 / 评论区截图）安装到 Bilibili-Evolved；未安装 Bilibili-Evolved 时会提示
// @description:zh-CN  一键把 dynsnap（动态卡片 / 评论 / 评论区截图）安装到 Bilibili-Evolved；未安装 Bilibili-Evolved 时会提示
// @author       helltractor
// @match        *://*.bilibili.com/*
// @exclude      *://api.bilibili.com/*
// @exclude      *://api.*.bilibili.com/*
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

/**
 * 本脚本是 dynsnap 的 Greasy Fork 分发载体：不重复实现功能，
 * 而是把构建产物（与 dist/dynsnap.js 同一份代码）通过
 * Bilibili-Evolved 的 installFeatureFromCode API 安装为组件。
 * 组件本体见 https://github.com/helltractor/dynsnap
 */
(function () {
  'use strict'

  var COMPONENT_NAME = 'dynsnap'
  var COMPONENT_CODE = __DYN_SNAP_COMPONENT_CODE__
  var BE_INSTALL_URL = 'https://github.com/the1812/Bilibili-Evolved#%E5%AE%89%E8%A3%85'
  var MAX_WAIT_MS = 30000
  var POLL_MS = 500

  if (window.top !== window.self) {
    return
  }

  var log = function (message) {
    console.info('[dynsnap] ' + message)
  }

  var notify = function (message, type) {
    try {
      var be = window.bilibiliEvolved
      var toast = be && be.Toast
      if (toast && typeof toast[type || 'info'] === 'function') {
        toast[type || 'info'](message, 'dynsnap', 6000)
        return
      }
    } catch (error) {
      // 忽略通知失败，继续输出日志
    }
    log(message)
  }

  var waitForBilibiliEvolved = function (deadline) {
    return new Promise(function (resolve) {
      var tick = function () {
        var be = window.bilibiliEvolved
        if (be && typeof be.installFeatureFromCode === 'function') {
          resolve(be)
          return
        }
        if (Date.now() > deadline) {
          resolve(null)
          return
        }
        setTimeout(tick, POLL_MS)
      }
      tick()
    })
  }

  var isInstalled = function (be) {
    try {
      var components = be.settings && be.settings.userComponents
      return Boolean(components && components[COMPONENT_NAME])
    } catch (error) {
      return false
    }
  }

  waitForBilibiliEvolved(Date.now() + MAX_WAIT_MS)
    .then(function (be) {
      if (!be) {
        log('未检测到 Bilibili-Evolved，请先安装：' + BE_INSTALL_URL)
        notify('dynsnap 需要先安装 Bilibili-Evolved', 'error')
        return
      }
      if (isInstalled(be)) {
        log('组件已安装，跳过')
        return
      }
      log('正在安装组件...')
      return be.installFeatureFromCode(COMPONENT_CODE).then(function (result) {
        var message = (result && result.message) || '已安装，刷新后生效'
        notify(message, 'success')
        log(message)
      })
    })
    .catch(function (error) {
      console.error('[dynsnap] 安装失败', error)
      notify('dynsnap 安装失败：' + (error && error.message ? error.message : error), 'error')
    })
})()
