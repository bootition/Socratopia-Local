import type { StreamError } from '../../../shared/chat-stream-controller'

export interface FriendlyStreamError {
  title: string
  hint: string
  /** Raw provider message, shown as secondary detail when useful. */
  detail: string | null
}

/**
 * Turn a machine error code into something a learner can act on.
 *
 * The raw message is kept as detail because it sometimes carries the
 * real cause ("Connection refused"), which is valuable when debugging.
 */
export function describeStreamError(error: StreamError): FriendlyStreamError {
  const withDetail = (title: string, hint: string): FriendlyStreamError => ({
    title,
    hint,
    detail: error.message.trim().length > 0 ? error.message : null
  })

  switch (error.code) {
    case 'UNAUTHORIZED':
      return withDetail(
        'API Key 无效或已过期',
        '请到「设置」页（Settings）重新填写 DeepSeek API Key。'
      )
    case 'INSUFFICIENT_BALANCE':
      return withDetail('DeepSeek 余额不足', '请到 DeepSeek 平台充值后重试。')
    case 'RATE_LIMITED':
      return withDetail('请求过于频繁', '稍等几秒再重试即可。')
    case 'SERVER_ERROR':
    case 'SERVICE_UNAVAILABLE':
      return withDetail('DeepSeek 服务暂时不可用', '稍后重试即可，不需要修改设置。')
    case 'INVALID_REQUEST':
    case 'INVALID_PARAMETER':
      return withDetail('请求被 DeepSeek 拒绝', '可能是模型或参数问题，检查设置里的模型。')
    case 'FORBIDDEN':
      return withDetail('请求被拒绝（403）', '检查 DeepSeek 账号状态与模型权限。')
    case 'TIMEOUT':
      return withDetail('等待回复超时', '已保留生成到一半的内容；可以稍后重试。')
    case 'NETWORK_ERROR':
      return withDetail('网络连接失败', '检查网络或代理设置后重试。')
    case 'INVALID_RESPONSE':
    case 'EMPTY_RESPONSE':
      return withDetail('服务端返回异常', '稍后重试；若持续失败请检查网关或代理。')
    case 'BUSY':
      return {
        title: '上一条消息还在处理中',
        hint: '请稍候再发送。',
        detail: null
      }
    case 'NO_COMPANION':
      return {
        title: '还没有选择同伴',
        hint: '请先在左侧选择一位同伴。',
        detail: null
      }
    case 'PERSIST_FAILED':
      return withDetail(
        '消息没有保存成功',
        '点「重试」会先把你的问题写进记录，再生成回复。'
      )
    case 'LOAD_FAILED':
      return withDetail('课堂记录读取失败', '检查数据目录后重新打开这节课。')
    case 'ABORTED':
      return { title: '已停止', hint: '可以重新发送或继续提问。', detail: null }
    case 'STREAM_START_FAILED':
      return withDetail('无法开始回复', '检查网络、API Key 与余额后重试。')
    default:
      return withDetail('回复失败', '可以点「重试」；若持续失败请检查网络与 Key。')
  }
}
