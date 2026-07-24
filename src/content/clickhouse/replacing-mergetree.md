---
title: ReplacingMergeTree 如何实现去重？
category: CK
categorySlug: clickhouse
categoryOrder: 6
order: 6
description: 理解后台合并去重、版本列、FINAL 查询及最终一致边界
updated: 2026-07-23
minutes: 7
level: 进阶
prerequisites: [clickhouse/mergetree]
next: [clickhouse/partition-order-primary-key]
---

# ReplacingMergeTree 如何实现去重？

## 先说结论

> ReplacingMergeTree 在数据片段后台合并时，对排序键相同的行保留一行；指定版本列后通常保留版本最大的行。合并是异步的，因此写入后旧版本可能暂时共存，它提供最终去重而不是写入时唯一约束。

没有版本列时保留哪一行取决于合并顺序，不应承担明确的业务版本选择。

## 查询语义

`FINAL` 可在查询阶段合并重复版本，获得更接近最终状态的结果，但会增加 CPU、内存和读取成本。高频查询更适合通过版本聚合、物化结果或数据管道预处理，而不是所有请求都加 FINAL。

## 为什么“写入即去重”是误解

ReplacingMergeTree 先把每批 INSERT 写成独立 part，后台再按分区、排序范围选择 parts 合并。重复记录只有在相关 part 恰好被合并时才会折叠；合并调度受 part 数量、磁盘、分区、负载和配置影响，不能假设几秒内一定完成。

```text
part A: (order_id=1, version=1, status=CREATED)
part B: (order_id=1, version=2, status=PAID)
        ↓ 后台 Merge
part C: (order_id=1, version=2, status=PAID)
```

合并前普通 SELECT 可能返回两行。若业务把结果直接 sum，会发生重复统计；如果需要“当前状态”，必须在查询模型上显式处理版本。

## 版本列的选择

版本应表达同一业务键的单调更新顺序，例如数据库递增版本、事件序号或可靠的逻辑时钟。仅用应用服务器时间戳会受到时钟漂移、相同毫秒和乱序投递影响；仅用 Kafka offset 又只能在单分区内有序，跨分区需额外设计。

```sql
CREATE TABLE order_state (
  order_id String,
  version UInt64,
  status LowCardinality(String),
  updated_at DateTime64(3)
)
ENGINE = ReplacingMergeTree(version)
ORDER BY order_id;
```

`ORDER BY` 中的业务键决定什么被视为重复。若把 version 也放进排序键，版本不同的记录不再是同一排序键，去重不会按预期发生。

## 查询当前版本的替代方式

对低频审计可使用 `FINAL`。对高频查询，常见方案是 `argMax(status, version)`、按 key 聚合取最大版本，或通过物化视图把最新状态维护到另一张查询表。选择时要比较扫描数据量、实时性、写放大和查询复杂度。

```sql
SELECT order_id, argMax(status, version) AS current_status
FROM order_state
GROUP BY order_id;
```

这类聚合也要考虑分布式场景的最终合并，不能只在每个分片取局部最大版本后直接返回。

## 删除与撤销事件

分析系统中“删除”通常也建模成一条更高版本的删除标记，而不是立即物理删除。查询过滤 `is_deleted = 0`，后台合并后旧版本逐步消失。涉及隐私合规或强制删除时，还需设计 mutation、分区删除、备份清理和可验证的删除流程，不能只依赖逻辑标记。

## 运行维护要点

监控 parts、后台 merge 队列、磁盘空间、合并吞吐、重复率和 FINAL 查询比例。频繁手工 `OPTIMIZE TABLE ... FINAL` 会重写大量数据、竞争 I/O，并可能阻塞正常合并；它只能作为受控维护动作，根因通常是小批写入或错误的数据模型。

## 设计要点

排序键必须包含稳定的业务唯一键，同时兼顾常用过滤条件。版本可用单调递增序号或可靠事件版本，不能只依赖可能碰撞或乱序的低精度时间。

## 容易踩坑的地方

ReplacingMergeTree 不是 OLTP 的 `UNIQUE KEY`，不能阻止重复插入。手工 `OPTIMIZE FINAL` 也不应作为高频业务操作，它可能触发昂贵的大合并。

## 常见问题

### 追问：如何支持删除？

常见做法是写入带删除标记的新版本，查询过滤删除状态；具体引擎版本也可能支持删除标记参数，但仍要考虑合并前的查询语义。

### 追问：为什么同一个 order_id 仍会查到多条？

因为对应 parts 尚未完成合并，或 ORDER BY 没有把 order_id 作为去重键。先检查表定义和 part 状态，再选择 FINAL、聚合或物化查询模型。

### 追问：ReplacingMergeTree 能保证事件不重复吗？

不能阻止重复写入，只能最终折叠相同排序键的版本。写入链路仍应具备幂等键、重放策略和重复监控。

### 追问：版本相同怎么办？

结果可能依赖合并顺序，语义不确定。业务应避免为同一键产生相同版本的不同内容，或增加可比较的次级版本规则。
