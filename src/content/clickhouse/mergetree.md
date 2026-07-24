---
title: ClickHouse MergeTree 引擎原理是什么？
category: CK
categorySlug: clickhouse
categoryOrder: 6
order: 1
description: 理解分区、排序键、数据片段与后台合并
updated: 2026-07-23
minutes: 4
level: 进阶
---

# ClickHouse MergeTree 引擎原理是什么？

## 先说结论

> MergeTree 将每批写入保存为不可变数据片段，并在后台持续合并；数据按排序键组织，查询可以通过稀疏主键索引跳过大量无关数据。

## 写入过程

一次 INSERT 通常形成一个新的 data part。片段内部按 `ORDER BY` 指定的键排序，并保存列式数据、标记和索引信息。大量极小批次写入会产生过多 parts，增加合并压力。

## 分区与排序键

`PARTITION BY` 主要用于数据管理和分区裁剪，不应产生过多细粒度分区；`ORDER BY` 决定数据的物理排序，是查询性能设计的核心。

```sql
CREATE TABLE events (
  event_time DateTime,
  user_id UInt64,
  event_type LowCardinality(String)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (event_type, event_time, user_id);
```

## 后台合并

后台线程把多个较小片段合并成更大片段。ReplacingMergeTree、SummingMergeTree 等变体会在合并阶段执行去重或聚合，但合并是异步的，查询不能假设数据已经立即完成最终合并。

## 设计注意点

- 排序键优先放常用过滤列，但也要考虑基数和查询模式。
- 避免大量小批量 INSERT。
- 分区不是越细越好。
- ClickHouse 更适合追加写和分析查询，不适合高频单行更新事务。

## 参考资料

- [ClickHouse Docs: MergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)

## Part 和稀疏索引

数据按排序键排序并分列保存，索引按固定粒度记录关键位置。查询先判断哪些 Granule 可能命中，再读取相关列。它牺牲逐行精确定位，换来更小的索引和高吞吐扫描。

## 常见问题

### 追问 1：ORDER BY 和 PRIMARY KEY 有何区别？

`ORDER BY` 决定物理排序；主键表达式可以是其前缀以减小索引，但不提供唯一性约束。

### 追问 2：为什么会出现 Too many parts？

写入批次过小或分区过多，Part 产生速度超过后台合并速度。应增大批次、优化分区并检查磁盘与合并负载。

### 追问 3：ReplacingMergeTree 能实时去重吗？

不能。后台合并前多个版本可能同时存在，查询 `FINAL` 虽可处理但成本较高，应结合版本列和业务查询设计。
