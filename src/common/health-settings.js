import storage from "@system.storage"

// 健康管理配置持久化：久坐阈值、开关、闹钟列表、今日步数与 7 天历史。
// 所有配置写入本地存储，应用启动时自动恢复。

const KEY = "velaguard.health.v1"

function clampThreshold(value) {
  const threshold = Number(value)
  if (!threshold || threshold < 30) {
    return 30
  }
  if (threshold > 120) {
    return 120
  }
  return Math.round(threshold)
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback
  }
  try {
    return JSON.parse(value)
  } catch (error) {
    console.log("health settings parse failed", error)
    return fallback
  }
}

export function defaultHealthSettings() {
  return {
    sedentaryEnabled: true,
    sedentaryThreshold: 60,
    alarms: [],
    stepsDate: "",
    steps: 0,
    stepsHistory: []
  }
}

function normalize(parsed) {
  const base = defaultHealthSettings()
  return {
    sedentaryEnabled: parsed.sedentaryEnabled !== false,
    sedentaryThreshold: clampThreshold(parsed.sedentaryThreshold),
    alarms: Array.isArray(parsed.alarms) ? parsed.alarms.slice(0, 10) : [],
    stepsDate: parsed.stepsDate || "",
    steps: Number(parsed.steps) || 0,
    stepsHistory: Array.isArray(parsed.stepsHistory) ? parsed.stepsHistory.slice() : []
  }
}

export function loadHealthSettings(callback) {
  storage.get({
    key: KEY,
    default: JSON.stringify(defaultHealthSettings()),
    success: function(data) {
      callback(normalize(parseJson(data, defaultHealthSettings())))
    },
    fail: function() {
      callback(defaultHealthSettings())
    }
  })
}

export function saveHealthSettings(settings, callback) {
  storage.set({
    key: KEY,
    value: JSON.stringify(settings),
    success: function() {
      if (callback) {
        callback(settings)
      }
    },
    fail: function() {
      if (callback) {
        callback(settings)
      }
    }
  })
}
