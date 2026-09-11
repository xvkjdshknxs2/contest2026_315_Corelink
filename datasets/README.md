# 数据目录

`training_features.csv` 是一组用于验证训练、导出和端侧调用链的特征级样例，不是可用于产品结论的真实人体跌倒数据集。

字段顺序：

1. `peakG`：窗口内合加速度峰值。
2. `minG`：窗口内合加速度最小值。
3. `variance`：完整窗口合加速度方差。
4. `postVariance`：窗口尾部方差。
5. `orientationChange`：窗口首尾 Z 轴变化。
6. `lowMotionRatio`：低变化相邻采样占比。
7. `durationMs`：窗口时长。
8. `label`：`normal`、`fall` 或 `immobility`。

正式参赛材料中应明确区分：

- 模拟器功能验证结果；
- 公开数据集离线评测结果；
- 真实设备测试结果。

不要将模拟数据准确率描述为真实环境准确率，也不要通过危险的真人摔倒方式采集数据。
