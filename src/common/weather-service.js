import storage from "@system.storage"
import fetch from "@system.fetch"

// 天气服务：异步请求队列 + 30 分钟本地缓存。
// 断网或请求失败时回退到最后一次缓存；缓存不存在时使用内置默认值。

const CACHE_KEY = "velaguard.weather.v1"
const CACHE_TTL_MS = 30 * 60 * 1000

// 演示用城市坐标（“校园东区”，取华东地区示例坐标）
const CITY_NAME = "校园东区"
const LATITUDE = 31.23
const LONGITUDE = 121.47

let requestQueue = []
let fetching = false

function defaultWeather() {
  return {
    city: CITY_NAME,
    temperature: 24,
    feelsLike: 26,
    condition: "晴",
    icon: "☀",
    updatedAt: Date.now(),
    cached: true,
    hourly: [
      {time: "现在", temp: 24, icon: "☀"},
      {time: "1 小时后", temp: 25, icon: "☀"},
      {time: "2 小时后", temp: 25, icon: "⛅"}
    ]
  }
}

function weatherCode(code) {
  if (code === 0) return {condition: "晴", icon: "☀"}
  if (code === 1) return {condition: "大部晴", icon: "🌤"}
  if (code === 2) return {condition: "多云", icon: "⛅"}
  if (code === 3) return {condition: "阴", icon: "☁"}
  if (code >= 45 && code <= 48) return {condition: "雾", icon: "🌫"}
  if (code >= 51 && code <= 67) return {condition: "雨", icon: "🌧"}
  if (code >= 71 && code <= 77) return {condition: "雪", icon: "❄"}
  if (code >= 80 && code <= 82) return {condition: "阵雨", icon: "🌦"}
  if (code >= 85 && code <= 86) return {condition: "阵雪", icon: "🌨"}
  if (code >= 95) return {condition: "雷雨", icon: "⛈"}
  return {condition: "晴", icon: "☀"}
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback
  }
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function loadCache(callback) {
  storage.get({
    key: CACHE_KEY,
    default: "",
    success: function(data) {
      callback(parseJson(data, null))
    },
    fail: function() {
      callback(null)
    }
  })
}

function saveCache(weather) {
  storage.set({
    key: CACHE_KEY,
    value: JSON.stringify(weather)
  })
}

function buildWeather(payload) {
  const current = payload.current || {}
  const hourly = payload.hourly || {}
  const cur = weatherCode(current.weather_code)
  const temps = hourly.temperature_2m || []
  const codes = hourly.weather_code || []
  const currentTemp = Math.round(current.temperature_2m || 24)
  const feelsLike = Math.round(current.apparent_temperature || currentTemp)

  const hourList = []
  for (let index = 1; index <= 3; index += 1) {
    const slot = index
    if (slot < temps.length) {
      const w = weatherCode(codes[slot])
      hourList.push({
        time: index + " 小时后",
        temp: Math.round(temps[slot]),
        icon: w.icon
      })
    }
  }
  while (hourList.length < 3) {
    hourList.push({
      time: hourList.length + 1 + " 小时后",
      temp: currentTemp,
      icon: cur.icon
    })
  }

  return {
    city: CITY_NAME,
    temperature: currentTemp,
    feelsLike: feelsLike,
    condition: cur.condition,
    icon: cur.icon,
    updatedAt: Date.now(),
    cached: false,
    hourly: hourList
  }
}

function doFetch(callback) {
  if (!fetch || typeof fetch.fetch !== "function") {
    console.log("fetch module unavailable, fallback to cache")
    callback(null)
    return
  }
  fetch.fetch({
    url:
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      LATITUDE +
      "&longitude=" +
      LONGITUDE +
      "&current=temperature_2m,apparent_temperature,weather_code" +
      "&hourly=temperature_2m,weather_code&forecast_hours=4&timezone=auto",
    method: "GET",
    success: function(response) {
      try {
        const payload =
          typeof response.data === "string" ? JSON.parse(response.data) : response.data
        callback(buildWeather(payload))
      } catch (error) {
        console.log("weather parse failed", error)
        callback(null)
      }
    },
    fail: function(data, code) {
      console.log("weather fetch failed", data, code)
      callback(null)
    }
  })
}

function pump() {
  if (fetching) {
    return
  }
  if (!requestQueue.length) {
    return
  }
  fetching = true
  const callbacks = requestQueue.splice(0, requestQueue.length)
  doFetch(function(result) {
    fetching = false
    for (let index = 0; index < callbacks.length; index += 1) {
      callbacks[index](result)
    }
    pump()
  })
}

function requestWeather(callback) {
  requestQueue.push(callback)
  pump()
}

export function getWeather(callback) {
  loadCache(function(cached) {
    const fresh = cached && Date.now() - cached.updatedAt < CACHE_TTL_MS
    if (fresh) {
      callback(cached)
      return
    }

    requestWeather(function(freshWeather) {
      if (freshWeather) {
        saveCache(freshWeather)
        callback(freshWeather)
      } else if (cached) {
        cached.cached = true
        callback(cached)
      } else {
        callback(defaultWeather())
      }
    })
  })
}
