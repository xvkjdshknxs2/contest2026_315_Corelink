# VelaGuard 智能手表五页滑动健康管理系统

面向 openvela 手表赛道的可穿戴健康管理应用。以 `lv_swiper`（`swiper` 组件）作为主容器，实现五页水平轮播滑动切换，底部圆点指示器显示当前位置，适配圆形表盘深色主题。在保留原有 SOS 求助与跌倒检测能力的基础上，重构为天气 / 心率 / 步数 / 久坐提醒 / 闹钟五个核心页面。

> 本项目为比赛原型，健康数据用于演示，不用于医疗诊断。

## 五个核心页面

1. **天气**：当前温度、天气图标、体感温度、未来 3 小时预报；请求走异步队列并缓存 30 分钟，断网时展示最后缓存数据。
2. **心率**：PPG 传感器实时采集 BPM（无传感器时模拟），显示今日最高 / 最低；静息异常（>120 或 <50）触发振动预警；底部保留 SOS 按钮，长按 3 秒触发，复用现有跌倒检测与紧急联系人逻辑。
3. **步数**：统计今日步数、活动距离、消耗卡路里，点击可查看近 7 天柱状图。
4. **久坐提醒**：基于 IMU 数据检测连续静坐时长，可设置 30-120 分钟阈值与开关，超时振动提醒并自动重置。
5. **闹钟**：最多 10 个闹钟，支持单次 / 每天 / 工作日重复；触发时全屏显示并振动 30 秒，支持贪睡 5 分钟。

每个页面左上角均带返回键，返回表盘首页（cover）。

## 技术架构

- `pages/swiper-container/swiper-container.ux`：主容器，`swiper` 承载五页，底部圆点指示器，闹钟全屏响铃与提示条叠加在轮播之上。
- `common/health-store.js`：全局状态仓库（单例），统一采集心率 / 步数 / IMU，避免各页面重复订阅传感器；久坐与闹钟调度在此统一处理，页面通过 `subscribe` 订阅变化。
- `common/weather-service.js`：天气异步请求队列 + 30 分钟本地缓存，断网回退。
- `common/vibrator-queue.js`：振动马达队列，串行单次振动 + 可取消循环会话，避免多提醒冲突。
- `common/health-settings.js`：久坐阈值 / 开关 / 闹钟 / 今日步数等配置持久化，开机自恢复。
- `common/event-machine.js`、`fall-model.js`、`generated-model.js`、`storage.js`：保留的 SOS / 跌倒检测 / 紧急联系人逻辑，由心率页 SOS 复用。

## 运行环境

- Windows 10/11
- AIoT-IDE（AIoT Toolkit 2.0.5）
- IDE 内置 Node.js 20，或本地兼容 Node.js

## 在 AIoT-IDE 中运行

1. 使用 AIoT-IDE 打开本目录。
2. 等待项目依赖检查完成。
3. 点击顶部“运行/调试”，选择 Watch 模拟器。

命令行构建：

```powershell
npm install
npm run build
```

构建产物位于：

```text
dist/com.openvela.contest.velaguard.debug.1.0.0.rpk
```

## 项目结构

```text
src/
├── app.ux
├── manifest.json
├── common/
│   ├── health-store.js
│   ├── health-settings.js
│   ├── weather-service.js
│   ├── vibrator-queue.js
│   ├── event-machine.js
│   ├── fall-model.js
│   ├── generated-model.js
│   ├── sensor-replay.js
│   └── storage.js
└── pages/
    ├── cover/cover.ux                 # 表盘首页，点击进入五页轮播
    ├── swiper-container/swiper-container.ux  # 五页滑动主容器
    ├── alert/alert.ux                 # SOS 安全确认
    └── event-detail/event-detail.ux   # SOS 事件详情
```

## 推荐演示流程

1. 从表盘首页轻触进入五页轮播，左右滑动切换页面，观察底部圆点指示器。
2. 天气页展示当前温度与 3 小时预报；断网时显示“已缓存”标记。
3. 心率页观察实时 BPM 波动；模拟活动段时心率超过 120，触发振动预警并红色高亮。
4. 心率页长按 SOS 按钮 3 秒，进入安全确认倒计时，复用紧急联系人逻辑生成求助消息。
5. 步数页查看今日步数 / 距离 / 卡路里，点击查看近 7 天柱状图。
6. 久坐提醒页切换开关、调整阈值（30-120 分钟），观察静坐计时与超时提示。
7. 闹钟页添加闹钟，选择单次 / 每天 / 工作日重复；到点触发全屏响铃，支持贪睡 5 分钟。
