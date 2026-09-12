/**
 * 从当前 URL 提取用于截图文件名的页面 ID。
 *
 * 覆盖 B 站四类页面形态；都不匹配时（未来新增页面）退化为时间戳，
 * 保证文件名始终可用而非 undefined。
 *
 * @example
 * // https://www.bilibili.com/video/BV1xx411c7mD
 * getPageId(); // 'BV1xx411c7mD'
 * // https://www.bilibili.com/opus/1006354757808291875
 * getPageId(); // 'opus_1006354757808291875'
 * // https://www.bilibili.com/read/cv1234567
 * getPageId(); // 'cv1234567'
 * // https://t.bilibili.com/884386066101960707
 * getPageId(); // '884386066101960707'
 */
export const getPageId = () => {
  const url = location.href
  const videoMatch = url.match(/bilibili\.com\/video\/(BV[\w]+|av\d+)/i)
  if (videoMatch) {
    return videoMatch[1]
  }
  const opusMatch = url.match(/bilibili\.com\/opus\/(\d+)/)
  if (opusMatch) {
    return `opus_${opusMatch[1]}`
  }
  const columnMatch = url.match(/bilibili\.com\/read\/cv(\d+)/)
  if (columnMatch) {
    return `cv${columnMatch[1]}`
  }
  const detailMatch = url.match(/t\.bilibili\.com\/(\d+)/)
  if (detailMatch) {
    return detailMatch[1]
  }
  return String(Date.now())
}
