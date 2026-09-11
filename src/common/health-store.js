import sensor from "@system.sensor"
import {loadHealthSettings, saveHealthSettings, defaultHealthSettings} from "./health-settings.js"
import {vibrate, beginPattern, endPattern} from "./vibrator-queue.js"

// 全局健康状态仓库（单例）：统一采集心率 / 步数 / IMU 数据，
// 避免多个页面重复订阅传感器。页面通过 subscribe 订阅变化，
// 久坐提醒与闹钟调度在此统一处理。

const state = {
  // 心率
  bpm: 0,
  bpmMin: 0,
  bpmMax: 0,
  bpmStatus: "normal", // normal | high | low
  // 步数
  steps: 0,
  distanceKm: "0.00",
  calories: 0,
  stepsHistory: [],
  // 久坐
  sedentarySeconds: 0,
  sedentaryMinutes: 0,
  sedentaryEnabled: true,
  sedentaryThreshold: 60,
  // 闹钟
  alarms: [],
  activeAlarm: null,
  alarmPatternId: null
}

const listeners = {
  heart: [],
  steps: [],
  sedentary: [],
  alarm: [],
  alarms: [],
  warning: []
}

function emit(channel, payload) {
  const list = listeners[channel] || []
  for (let index = 0; index < list.length; index += 1) {
    try {
      list[index](payload)
    } catch (error) {
      console.log("health-store emit failed", channel, error)
    }
  }
}

export function subscribe(channel, callback) {
  if (!listeners[channel]) {
    listeners[channel] = []
  }
  listeners[channel].push(callback)
  return function unsubscribe() {
    const list = listeners[channel] || []
    const position = list.indexOf(callback)
    if (position >= 0) {
      list.splice(position, 1)
    }
  }
}

export function getState() {
  return state
}

// —— 持久化配置 ——
let settings = defaultHealthSettings()

function dateKey(date) {
  return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate()
}

function seedStepsHistory(todaySteps) {
  const dayNames = ["日", "一", "二", "三", "四", "五", "六"]
  const baseline = [5200, 7300, 6100, 8800, 3900, 7600]
  const now = new Date()
  const history = []
  for (let index = 0; index < 6; index += 1) {
    const day = new Date(now)
    day.setDate(day.getDate() - (6 - index))
    history.push({label: dayNames[day.getDay()], steps: baseline[index]})
  }
  history.push({label: "今", steps: todaySteps})
  return history
}

function applySettingsToState() {
  state.sedentaryEnabled = settings.sedentaryEnabled
  state.sedentaryThreshold = settings.sedentaryThreshold
  state.alarms = settings.alarms.slice()

  const today = dateKey(new Date())
  if (settings.stepsDate === today) {
    state.steps = settings.steps
    state.stepsHistory =
      settings.stepsHistory.length === 7
        ? settings.stepsHistory.slice()
        : seedStepsHistory(settings.steps)
  } else {
    state.steps = 0
    state.stepsHistory = seedStepsHistory(0)
  }
  state.distanceKm = (state.steps * 0.0007).toFixed(2)
  state.calories = Math.round(state.steps * 0.04)
}

function persist() {
  settings.sedentaryEnabled = state.sedentaryEnabled
  settings.sedentaryThreshold = state.sedentaryThreshold
  settings.alarms = state.alarms.slice()
  settings.stepsDate = dateKey(new Date())
  settings.steps = state.steps
  if (state.stepsHistory.length === 7) {
    state.stepsHistory[6].steps = state.steps
  }
  settings.stepsHistory = state.stepsHistory.slice()
  saveHealthSettings(settings)
}

// —— 心率：优先真实 PPG，模拟器回退到模拟 ——
let realHeart = false

function applyBpm(bpm) {
  const rounded = Math.round(bpm)
  if (!state.bpm || rounded < state.bpmMin) {
    state.bpmMin = rounded
  }
  if (rounded > state.bpmMax) {
    state.bpmMax = rounded
  }
  const previous = state.bpmStatus
  state.bpm = rounded
  if (rounded > 120) {
    state.bpmStatus = "high"
  } else if (rounded < 50) {
    state.bpmStatus = "low"
  } else {
    state.bpmStatus = "normal"
  }

  if (previous !== state.bpmStatus && state.bpmStatus !== "normal") {
    vibrate("long")
    emit("warning", {type: "heart", bpm: rounded, status: state.bpmStatus})
  }
  emit("heart", {bpm: state.bpm, min: state.bpmMin, max: state.bpmMax, status: state.bpmStatus})
}

let heartPhase = 0

function simulateHeart() {
  heartPhase += 1
  // 静息基线 72，叠加轻微波动；每 90 秒出现一段约 25 秒的“活动”心率升高，
  // 用于在无 PPG 的模拟器上演示异常心率预警。
  const base = 72 + Math.sin(heartPhase / 7) * 3
  const cycle = heartPhase % 90
  let boost = 0
  if (cycle > 40 && cycle <= 65) {
    boost = Math.sin(((cycle - 40) / 25) * Math.PI) * 60
  }
  applyBpm(base + boost)
}

function trySubscribeHeart() {
  try {
    if (sensor && typeof sensor.subscribeHeartRate === "function") {
      sensor.subscribeHeartRate({
        interval: "normal",
        callback: function(data) {
          realHeart = true
          if (data && typeof data.heartRate === "number") {
            applyBpm(data.heartRate)
          }
        },
        fail: function() {
          realHeart = false
        }
      })
    }
  } catch (error) {
    console.log("heart rate sensor unavailable", error)
    realHeart = false
  }
}

// —— 步数：优先真实计步，模拟器回退到模拟 ——
let realSteps = false
let stepTick = 0

function applySteps(steps) {
  state.steps = Math.max(state.steps, Math.round(steps))
  state.distanceKm = (state.steps * 0.0007).toFixed(2)
  state.calories = Math.round(state.steps * 0.04)
  if (state.stepsHistory.length === 7) {
    state.stepsHistory[6].steps = state.steps
  }
  emit("steps", {
    steps: state.steps,
    distanceKm: state.distanceKm,
    calories: state.calories,
    history: state.stepsHistory.slice()
  })
}

function simulateSteps() {
  stepTick += 1
  if (stepTick % 2 === 0) {
    applySteps(state.steps + 1 + (stepTick % 3))
  }
}

function trySubscribeSteps() {
  try {
    if (sensor && typeof sensor.subscribeStepCounter === "function") {
      sensor.subscribeStepCounter({
        interval: "normal",
        callback: function(data) {
          realSteps = true
          if (data && typeof data.steps === "number") {
            applySteps(data.steps)
          }
        },
        fail: function() {
          realSteps = false
        }
      })
    }
  } catch (error) {
    console.log("step counter unavailable", error)
    realSteps = false
  }
}

// —— 久坐：基于 IMU 波动检测静坐 ——
let imuWindow = []

function onImuSample(sample) {
  const magnitude = Math.sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z)
  imuWindow.push(magnitude)
  if (imuWindow.length > 20) {
    imuWindow.shift()
  }
}

function isStillWindow() {
  if (imuWindow.length < 10) {
    return true
  }
  let total = 0
  for (let index = 0; index < imuWindow.length; index += 1) {
    total += imuWindow[index]
  }
  const average = total / imuWindow.length
  let variance = 0
  for (let index = 0; index < imuWindow.length; index += 1) {
    const delta = imuWindow[index] - average
    variance += delta * delta
  }
  variance = variance / imuWindow.length
  return variance < 0.001
}

function trySubscribeImu() {
  try {
    sensor.subscribeAccelerometer({
      interval: "game",
      callback: function(sample) {
        onImuSample(sample)
      },
      fail: function() {
        console.log("accelerometer unavailable, use simulated stillness")
      }
    })
  } catch (error) {
    console.log("accelerometer unavailable", error)
  }
}

function sedentaryView() {
  return {
    seconds: state.sedentarySeconds,
    minutes: state.sedentaryMinutes,
    enabled: state.sedentaryEnabled,
    threshold: state.sedentaryThreshold
  }
}

function updateSedentary() {
  if (!state.sedentaryEnabled) {
    return
  }

  // 有真实 IMU 时用波动判定；否则用模拟的“起身节律”驱动
  let moving = false
  if (imuWindow.length >= 10) {
    moving = !isStillWindow()
  } else {
    const cycle = Math.floor(Date.now() / 1000) % 150
    moving = cycle > 110 && cycle < 125
  }

  if (moving) {
    if (state.sedentarySeconds > 0) {
      state.sedentarySeconds = 0
      state.sedentaryMinutes = 0
      emit("sedentary", sedentaryView())
    }
    return
  }

  state.sedentarySeconds += 1
  state.sedentaryMinutes = Math.floor(state.sedentarySeconds / 60)
  if (state.sedentaryMinutes >= state.sedentaryThreshold) {
    state.sedentarySeconds = 0
    state.sedentaryMinutes = 0
    vibrate("long")
    emit("warning", {type: "sedentary", threshold: state.sedentaryThreshold})
  }
  emit("sedentary", sedentaryView())
}

// —— 闹钟 ——
function repeatLabel(repeat) {
  if (repeat === "daily") return "每天"
  if (repeat === "weekday") return "工作日"
  return "单次"
}

function triggerAlarm(alarm) {
  state.activeAlarm = {
    id: alarm.id,
    label: alarm.label,
    hour: alarm.hour,
    minute: alarm.minute
  }
  state.alarmPatternId = beginPattern(1200, "long", 30000)
  emit("alarm", state.activeAlarm)
}

function checkAlarms() {
  if (state.activeAlarm) {
    return
  }
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const day = now.getDay()
  const today = dateKey(now)

  for (let index = 0; index < state.alarms.length; index += 1) {
    const alarm = state.alarms[index]
    if (!alarm.enabled) {
      continue
    }
    if (alarm.hour !== hour || alarm.minute !== minute) {
      continue
    }
    if (alarm.repeat === "weekday" && (day === 0 || day === 6)) {
      continue
    }
    if (alarm.repeat === "once" && alarm.firedOn === today) {
      continue
    }

    if (alarm.repeat === "once") {
      alarm.firedOn = today
      alarm.enabled = false
    }
    triggerAlarm(alarm)
    persist()
    emit("alarms", state.alarms.slice())
    break
  }
}

// —— 生命周期 ——
let tickTimer = null
let started = false

function tick() {
  if (!realHeart) {
    simulateHeart()
  }
  if (!realSteps) {
    simulateSteps()
  }
  updateSedentary()
  checkAlarms()
}

export function start() {
  if (started) {
    return
  }
  started = true

  loadHealthSettings(function(loaded) {
    settings = loaded
    applySettingsToState()
    emit("alarms", state.alarms.slice())
    emit("steps", {
      steps: state.steps,
      distanceKm: state.distanceKm,
      calories: state.calories,
      history: state.stepsHistory.slice()
    })
    emit("sedentary", sedentaryView())
  })

  trySubscribeHeart()
  trySubscribeSteps()
  trySubscribeImu()
  tickTimer = setInterval(tick, 1000)
}

export function stop() {
  if (!started) {
    return
  }
  started = false
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  persist()
}

// —— 供页面调用的操作 ——
export function setSedentaryEnabled(enabled) {
  state.sedentaryEnabled = Boolean(enabled)
  if (!state.sedentaryEnabled) {
    state.sedentarySeconds = 0
    state.sedentaryMinutes = 0
  }
  persist()
  emit("sedentary", sedentaryView())
}

export function setSedentaryThreshold(threshold) {
  let value = Number(threshold)
  if (value < 30) value = 30
  if (value > 120) value = 120
  state.sedentaryThreshold = Math.round(value)
  persist()
  emit("sedentary", sedentaryView())
}

export function addAlarm(alarm) {
  if (state.alarms.length >= 10) {
    return false
  }
  state.alarms.push(alarm)
  persist()
  emit("alarms", state.alarms.slice())
  return true
}

export function removeAlarm(id) {
  const next = []
  for (let index = 0; index < state.alarms.length; index += 1) {
    if (state.alarms[index].id !== id) {
      next.push(state.alarms[index])
    }
  }
  state.alarms = next
  persist()
  emit("alarms", state.alarms.slice())
}

export function setAlarmEnabled(id, enabled) {
  for (let index = 0; index < state.alarms.length; index += 1) {
    if (state.alarms[index].id === id) {
      state.alarms[index].enabled = Boolean(enabled)
    }
  }
  persist()
  emit("alarms", state.alarms.slice())
}

export function dismissAlarm() {
  if (!state.activeAlarm) {
    return
  }
  endPattern(state.alarmPatternId)
  state.activeAlarm = null
  emit("alarm", null)
}

export function snoozeAlarm() {
  const alarm = state.activeAlarm
  if (!alarm) {
    return
  }
  endPattern(state.alarmPatternId)
  state.activeAlarm = null

  // 贪睡 5 分钟：插入一个一次性闹钟
  const snoozeAt = Date.now() + 5 * 60 * 1000
  const d = new Date(snoozeAt)
  const next = []
  for (let index = 0; index < state.alarms.length; index += 1) {
    if (state.alarms[index].id.indexOf("snooze-") !== 0) {
      next.push(state.alarms[index])
    }
  }
  next.push({
    id: "snooze-" + snoozeAt,
    hour: d.getHours(),
    minute: d.getMinutes(),
    label: alarm.label + " 贪睡",
    repeat: "once",
    enabled: true,
    firedOn: ""
  })
  state.alarms = next
  persist()
  emit("alarms", state.alarms.slice())
  emit("alarm", null)
}

export {repeatLabel}
