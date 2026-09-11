import vibrator from "@system.vibrator"

// 振动马达队列：串行执行单次振动，并支持可取消的循环振动会话。
// 避免心率预警、久坐提醒、闹钟等多个提醒同时抢占马达造成冲突。

let oneShotQueue = []
let oneShotBusy = false
let sessions = {}
let sessionSeq = 0

function tryVibrate(mode) {
  try {
    vibrator.vibrate({mode: mode || "short"})
  } catch (error) {
    console.log("vibrator unavailable", error)
  }
}

function pumpOneShot() {
  if (oneShotBusy) {
    return
  }
  const task = oneShotQueue.shift()
  if (!task) {
    return
  }
  oneShotBusy = true
  tryVibrate(task.mode)
  setTimeout(function() {
    oneShotBusy = false
    pumpOneShot()
  }, task.mode === "long" ? 900 : 400)
}

// 入队一次振动
export function vibrate(mode) {
  oneShotQueue.push({mode: mode})
  pumpOneShot()
}

// 启动循环振动会话（例如闹钟响铃 30 秒），返回会话 id
export function beginPattern(intervalMs, mode, totalMs) {
  const id = "vib-" + (sessionSeq += 1)
  const session = {
    mode: mode || "long",
    intervalMs: intervalMs || 1200,
    timer: null,
    stopTimer: null
  }
  session.timer = setInterval(function() {
    tryVibrate(session.mode)
  }, session.intervalMs)
  if (totalMs) {
    session.stopTimer = setTimeout(function() {
      endPattern(id)
    }, totalMs)
  }
  sessions[id] = session
  return id
}

// 停止指定会话
export function endPattern(id) {
  const session = sessions[id]
  if (!session) {
    return
  }
  if (session.timer) {
    clearInterval(session.timer)
  }
  if (session.stopTimer) {
    clearTimeout(session.stopTimer)
  }
  delete sessions[id]
}

export function endAllPatterns() {
  const ids = Object.keys(sessions)
  for (let index = 0; index < ids.length; index += 1) {
    endPattern(ids[index])
  }
}
