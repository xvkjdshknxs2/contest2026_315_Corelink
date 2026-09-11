const SAMPLE_INTERVAL_MS = 80

const SCENARIOS = [
  {
    id: "normal",
    title: "日常步行",
    subtitle: "低风险基线",
    samples: 40
  },
  {
    id: "run",
    title: "正常跑步",
    subtitle: "验证不误报",
    samples: 44
  },
  {
    id: "shake",
    title: "剧烈晃动",
    subtitle: "冲击但持续运动",
    samples: 44
  },
  {
    id: "fall",
    title: "疑似跌倒",
    subtitle: "失重·冲击·静止",
    samples: 48
  },
  {
    id: "immobility",
    title: "异常静止",
    subtitle: "长时间低活动",
    samples: 56
  }
]

function oscillation(index, speed) {
  return Math.sin(index * speed)
}

function normalSample(index) {
  return {
    x: 0.08 * oscillation(index, 0.7),
    y: 0.06 * oscillation(index, 0.43),
    z: 1 + 0.08 * oscillation(index, 0.9)
  }
}

function runSample(index) {
  return {
    x: 0.3 * oscillation(index, 1.1),
    y: 0.18 * oscillation(index, 0.73),
    z: 1.05 + 0.72 * oscillation(index, 1.45)
  }
}

function shakeSample(index) {
  if (index === 12) {
    return {x: 2.6, y: 1.7, z: 1.4}
  }

  return {
    x: 0.8 * oscillation(index, 1.9),
    y: 0.65 * oscillation(index, 1.2),
    z: 1 + 0.55 * oscillation(index, 1.55)
  }
}

function fallSample(index) {
  if (index < 13) {
    return normalSample(index)
  }
  if (index === 13) {
    return {x: 0.08, y: 0.05, z: 0.18}
  }
  if (index === 14) {
    return {x: 2.9, y: 1.7, z: 1.3}
  }
  if (index < 21) {
    const decay = (21 - index) / 7
    return {
      x: 0.96 + 0.25 * decay * oscillation(index, 1.4),
      y: 0.08 * decay,
      z: 0.2 + 0.3 * decay
    }
  }

  return {
    x: 0.97 + 0.004 * oscillation(index, 0.5),
    y: 0.03,
    z: 0.18 + 0.004 * oscillation(index, 0.8)
  }
}

function immobilitySample(index) {
  if (index < 6) {
    return {
      x: 0.03 + index * 0.002,
      y: 0.02,
      z: 0.99
    }
  }

  return {
    x: 0.025 + 0.002 * oscillation(index, 0.31),
    y: 0.018 + 0.001 * oscillation(index, 0.47),
    z: 0.999 + 0.002 * oscillation(index, 0.27)
  }
}

function makeSample(scenarioId, index) {
  let vector = normalSample(index)
  if (scenarioId === "run") {
    vector = runSample(index)
  } else if (scenarioId === "shake") {
    vector = shakeSample(index)
  } else if (scenarioId === "fall") {
    vector = fallSample(index)
  } else if (scenarioId === "immobility") {
    vector = immobilitySample(index)
  }

  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
    timestamp: Date.now()
  }
}

export function getScenarioCatalog() {
  return SCENARIOS
}

export function createReplayEngine(callbacks) {
  let timer = null

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function start(scenarioId) {
    stop()
    let definition = SCENARIOS[0]
    for (let index = 0; index < SCENARIOS.length; index += 1) {
      if (SCENARIOS[index].id === scenarioId) {
        definition = SCENARIOS[index]
        break
      }
    }

    let sampleIndex = 0
    if (callbacks.onStart) {
      callbacks.onStart(definition)
    }

    timer = setInterval(function() {
      const sample = makeSample(definition.id, sampleIndex)
      if (callbacks.onSample) {
        callbacks.onSample(sample, sampleIndex + 1, definition.samples)
      }
      sampleIndex += 1

      if (sampleIndex >= definition.samples) {
        stop()
        if (callbacks.onComplete) {
          callbacks.onComplete(definition)
        }
      }
    }, SAMPLE_INTERVAL_MS)
  }

  return {
    start: start,
    stop: stop
  }
}
