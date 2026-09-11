import storage from "@system.storage"
import {appendTimeline} from "./event-machine.js"

const EVENTS_KEY = "velaguard.events.v1"
const SETTINGS_KEY = "velaguard.settings.v1"
const CONTACTS_KEY = "velaguard.contacts.v1"

const DEFAULT_SETTINGS = {
  demoOffline: false,
  useRealSensor: false
}

const DEFAULT_CONTACTS = [
  {
    id: "contact-1",
    name: "张老师",
    maskedContact: "138****2468",
    priority: 1
  },
  {
    id: "contact-2",
    name: "家人",
    maskedContact: "186****5310",
    priority: 2
  }
]

function parseJson(value, fallback) {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch (error) {
    console.log("VelaGuard storage parse failed", error)
    return fallback
  }
}

export function loadEvents(callback) {
  storage.get({
    key: EVENTS_KEY,
    default: "[]",
    success: function(data) {
      callback(parseJson(data, []))
    },
    fail: function(data, code) {
      console.log("load events failed", data, code)
      callback([])
    }
  })
}

export function saveEvents(events, callback) {
  storage.set({
    key: EVENTS_KEY,
    value: JSON.stringify(events.slice(0, 30)),
    success: function() {
      if (callback) {
        callback(events)
      }
    },
    fail: function(data, code) {
      console.log("save events failed", data, code)
      if (callback) {
        callback(events)
      }
    }
  })
}

export function addEvent(event, callback) {
  loadEvents(function(events) {
    events.unshift(event)
    saveEvents(events, callback)
  })
}

export function updateEvent(event, callback) {
  loadEvents(function(events) {
    let replaced = false
    for (let index = 0; index < events.length; index += 1) {
      if (events[index].id === event.id) {
        events[index] = event
        replaced = true
        break
      }
    }
    if (!replaced) {
      events.unshift(event)
    }
    saveEvents(events, callback)
  })
}

export function clearEvents(callback) {
  storage.delete({
    key: EVENTS_KEY,
    success: function() {
      if (callback) {
        callback([])
      }
    },
    fail: function() {
      saveEvents([], callback)
    }
  })
}

export function loadSettings(callback) {
  storage.get({
    key: SETTINGS_KEY,
    default: JSON.stringify(DEFAULT_SETTINGS),
    success: function(data) {
      const parsed = parseJson(data, DEFAULT_SETTINGS)
      callback({
        demoOffline: Boolean(parsed.demoOffline),
        useRealSensor: Boolean(parsed.useRealSensor)
      })
    },
    fail: function() {
      callback(DEFAULT_SETTINGS)
    }
  })
}

export function saveSettings(settings, callback) {
  storage.set({
    key: SETTINGS_KEY,
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

export function loadContacts(callback) {
  storage.get({
    key: CONTACTS_KEY,
    default: JSON.stringify(DEFAULT_CONTACTS),
    success: function(data) {
      const contacts = parseJson(data, DEFAULT_CONTACTS)
      callback(contacts.length ? contacts : DEFAULT_CONTACTS)
    },
    fail: function() {
      callback(DEFAULT_CONTACTS)
    }
  })
}

export function saveContacts(contacts, callback) {
  storage.set({
    key: CONTACTS_KEY,
    value: JSON.stringify(contacts),
    success: function() {
      if (callback) {
        callback(contacts)
      }
    },
    fail: function() {
      if (callback) {
        callback(contacts)
      }
    }
  })
}

export function flushQueuedEvents(callback) {
  loadEvents(function(events) {
    let changed = 0
    for (let index = 0; index < events.length; index += 1) {
      if (events[index].status === "queued") {
        events[index].status = "sent"
        events[index].statusLabel = "已补发"
        events[index].sentAt = Date.now()
        if (events[index].message) {
          events[index].message.deviceStatus = "电量68%，网络恢复后已补发"
        }
        appendTimeline(events[index], "离线求助已补发", "网络恢复，消息发送状态更新为已补发")
        changed += 1
      } else if (events[index].status === "withdrawal_queued") {
        events[index].status = "withdrawn"
        events[index].statusLabel = "撤回已补发"
        events[index].withdrawalSentAt = Date.now()
        appendTimeline(
          events[index],
          "撤回更新已补发",
          "联系人已收到“用户已确认安全”状态更新"
        )
        changed += 1
      }
    }

    saveEvents(events, function() {
      if (callback) {
        callback(changed, events)
      }
    })
  })
}

export function countQueued(events) {
  let count = 0
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].status === "queued" || events[index].status === "withdrawal_queued") {
      count += 1
    }
  }
  return count
}
