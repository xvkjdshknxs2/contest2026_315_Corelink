import {MODEL_META, predict} from "./generated-model.js"

function magnitude(sample) {
  return Math.sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z)
}

function mean(values) {
  if (!values.length) {
    return 0
  }

  let total = 0
  for (let index = 0; index < values.length; index += 1) {
    total += values[index]
  }
  return total / values.length
}

function variance(values) {
  if (!values.length) {
    return 0
  }

  const average = mean(values)
  let total = 0
  for (let index = 0; index < values.length; index += 1) {
    const delta = values[index] - average
    total += delta * delta
  }
  return total / values.length
}

export function createWindow(maxSamples) {
  return {
    samples: [],
    maxSamples: maxSamples || 64,
    startedAt: 0,
    endedAt: 0
  }
}

export function resetWindow(window) {
  window.samples = []
  window.startedAt = 0
  window.endedAt = 0
}

export function pushSample(window, sample) {
  const now = sample.timestamp || Date.now()
  if (!window.startedAt) {
    window.startedAt = now
  }
  window.endedAt = now
  window.samples.push(sample)

  if (window.samples.length > window.maxSamples) {
    window.samples.shift()
  }
}

export function extractFeatures(window) {
  const samples = window.samples
  const magnitudes = []
  let peakG = 0
  let minG = 99
  let lowMotionCount = 0

  for (let index = 0; index < samples.length; index += 1) {
    const currentMagnitude = magnitude(samples[index])
    magnitudes.push(currentMagnitude)
    peakG = Math.max(peakG, currentMagnitude)
    minG = Math.min(minG, currentMagnitude)

    if (index > 0) {
      const previousMagnitude = magnitudes[index - 1]
      if (Math.abs(currentMagnitude - previousMagnitude) < 0.025) {
        lowMotionCount += 1
      }
    }
  }

  const tailSize = Math.min(10, magnitudes.length)
  const tail = magnitudes.slice(magnitudes.length - tailSize)
  const first = samples[0] || {z: 1}
  const last = samples[samples.length - 1] || {z: 1}
  const durationMs = Math.max(
    window.endedAt - window.startedAt,
    samples.length > 1 ? (samples.length - 1) * 80 : 0
  )

  return {
    peakG: peakG,
    minG: minG === 99 ? 0 : minG,
    variance: variance(magnitudes),
    postVariance: variance(tail),
    orientationChange: Math.abs(first.z - last.z),
    lowMotionRatio: samples.length > 1 ? lowMotionCount / (samples.length - 1) : 0,
    durationMs: durationMs,
    sampleCount: samples.length
  }
}

function reasonsFor(label, features) {
  if (label === "fall") {
    return [
      "检测到冲击峰值 " + features.peakG.toFixed(1) + "g",
      "冲击前出现失重特征",
      "冲击后姿态改变并趋于静止"
    ]
  }

  if (label === "immobility") {
    return [
      "持续低活动 " + Math.round(features.durationMs / 1000) + " 秒",
      "运动波动低于个体基线",
      "建议确认佩戴者状态"
    ]
  }

  return ["运动模式符合日常活动", "未形成危险事件组合"]
}

export function assessWindow(window) {
  const features = extractFeatures(window)
  const vector = [
    features.peakG,
    features.minG,
    features.variance,
    features.postVariance,
    features.orientationChange,
    features.lowMotionRatio,
    features.durationMs
  ]
  const prediction = predict(vector)

  return {
    label: prediction.label,
    confidence: prediction.confidence,
    features: features,
    reasons: reasonsFor(prediction.label, features),
    model: MODEL_META
  }
}
