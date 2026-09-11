function pad(value) {
  return value < 10 ? "0" + value : String(value)
}

export function formatTime(timestamp) {
  const date = new Date(timestamp)
  return (
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes()) +
    ":" +
    pad(date.getSeconds())
  )
}

function typeLabel(type) {
  if (type === "fall") {
    return "疑似跌倒"
  }
  if (type === "immobility") {
    return "异常静止"
  }
  if (type === "sos") {
    return "主动 SOS"
  }
  return "安全事件"
}

export function appendTimeline(event, title, detail, timestamp) {
  if (!event.timeline) {
    event.timeline = []
  }
  const time = timestamp || Date.now()
  event.timeline.push({
    id: event.id + "-timeline-" + event.timeline.length + "-" + time,
    time: time,
    timeLabel: formatTime(time),
    title: title,
    detail: detail
  })
  return event
}

function contactSummary(contacts) {
  if (!contacts || !contacts.length) {
    return "未配置紧急联系人"
  }

  const names = []
  for (let index = 0; index < contacts.length; index += 1) {
    names.push(contacts[index].name + "（P" + contacts[index].priority + "）")
  }
  return names.join("、")
}

export function buildEmergencyMessage(alert, action, offline, contacts) {
  const wearerStatus =
    action === "timeout" ? "佩戴者10秒内未响应" : "佩戴者主动确认需要帮助"
  const deviceStatus = "电量68%，" + (offline ? "当前离线，将自动补发" : "网络已连接")
  const message = {
    title: "VelaGuard安全提醒",
    type: alert.typeLabel,
    time: alert.timeLabel,
    location: alert.locationLabel,
    confidence: alert.confidence + "%",
    wearerStatus: wearerStatus,
    deviceStatus: deviceStatus,
    recipients: contactSummary(contacts)
  }
  message.body =
    message.title +
    "\n类型：" +
    message.type +
    "\n时间：" +
    message.time +
    "\n位置：" +
    message.location +
    "\n置信度：" +
    message.confidence +
    "\n佩戴者：" +
    message.wearerStatus +
    "\n设备状态：" +
    message.deviceStatus +
    "\n通知对象：" +
    message.recipients
  return message
}

export function createAlert(result, source) {
  const now = Date.now()
  const alert = {
    id: "event-" + now,
    type: result.label,
    typeLabel: typeLabel(result.label),
    confidence: Math.round(result.confidence * 100),
    reasons: result.reasons || [],
    source: source || "演示数据",
    createdAt: now,
    timeLabel: formatTime(now),
    status: "confirming",
    statusLabel: "等待确认",
    resultLabel: "尚未处理",
    locationLabel: "校园东区 · 模拟位置",
    peakG: result.features ? result.features.peakG.toFixed(1) : "--",
    timeline: []
  }
  appendTimeline(
    alert,
    alert.typeLabel === "主动 SOS" ? "用户主动触发 SOS" : "端侧检测到" + alert.typeLabel,
    "来源：" + alert.source + "，可信度 " + alert.confidence + "%",
    now
  )
  appendTimeline(
    alert,
    "进入腕端安全确认",
    alert.type === "sos" ? "启动6秒快速确认" : "启动10秒二次确认",
    now + 1
  )
  return alert
}

export function createSosAlert() {
  return createAlert(
    {
      label: "sos",
      confidence: 1,
      reasons: ["用户主动触发求助", "无需等待算法复核"],
      features: null
    },
    "腕端按钮"
  )
}

export function resolveAlert(alert, action, offline, contacts) {
  const resolved = {}
  const keys = Object.keys(alert)
  for (let index = 0; index < keys.length; index += 1) {
    resolved[keys[index]] = alert[keys[index]]
  }

  resolved.resolvedAt = Date.now()
  resolved.timeline = alert.timeline ? alert.timeline.slice() : []
  if (action === "safe") {
    resolved.status = "cancelled"
    resolved.statusLabel = "已取消"
    resolved.resultLabel = "佩戴者确认安全"
    appendTimeline(resolved, "佩戴者确认安全", "事件已取消，没有生成求助消息")
    return resolved
  }

  resolved.status = offline ? "queued" : "sent"
  resolved.statusLabel = offline ? "待发送" : "已发送"
  resolved.resultLabel = action === "timeout" ? "超时自动求助" : "用户立即求助"
  resolved.contacts = contacts || []
  resolved.message = buildEmergencyMessage(resolved, action, offline, contacts)
  appendTimeline(
    resolved,
    action === "timeout" ? "确认倒计时结束" : "用户点击立即求助",
    resolved.message.wearerStatus
  )
  appendTimeline(
    resolved,
    offline ? "求助消息进入离线队列" : "求助消息已发送",
    offline
      ? "等待网络恢复后补发至：" + resolved.message.recipients
      : "通知对象：" + resolved.message.recipients
  )
  return resolved
}

export function withdrawEvent(event, offline) {
  const updated = {}
  const keys = Object.keys(event)
  for (let index = 0; index < keys.length; index += 1) {
    updated[keys[index]] = event[keys[index]]
  }
  updated.timeline = event.timeline ? event.timeline.slice() : []
  updated.originalDeliveryStatus = event.originalDeliveryStatus || event.status
  updated.withdrawnAt = Date.now()
  updated.status = offline ? "withdrawal_queued" : "withdrawn"
  updated.statusLabel = offline ? "撤回待发" : "已撤回"
  updated.resultLabel = "用户随后确认安全"
  updated.withdrawalMessage =
    "VelaGuard状态更新\n事件：" +
    updated.typeLabel +
    "\n时间：" +
    formatTime(updated.withdrawnAt) +
    "\n状态：佩戴者已确认安全\n说明：保留原始求助记录，本消息用于更新联系人。"
  appendTimeline(
    updated,
    "用户随后确认安全",
    offline ? "撤回更新已进入离线队列" : "已向原通知对象发送安全状态更新"
  )
  if (!offline) {
    appendTimeline(updated, "撤回更新已发送", "原始求助记录保留，不执行删除")
  }
  return updated
}
