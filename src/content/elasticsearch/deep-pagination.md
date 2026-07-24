---
title: Elasticsearch 深分页有哪些解决方案？
category: ES
categorySlug: elasticsearch
categoryOrder: 8
order: 7
description: 比较 from-size、search_after、PIT、scroll 的成本和适用场景
updated: 2026-07-23
minutes: 6
level: 进阶
prerequisites: [elasticsearch/write-search-process]
next: [elasticsearch/near-real-time]
---

# Elasticsearch 深分页有哪些解决方案？

## 先说结论

> `from + size` 很大时，每个分片都要收集足够多候选并由协调节点全局排序，CPU 和内存成本高。连续向后翻页应使用 `search_after`，并配合 PIT 固定索引视图；全量离线遍历可使用 scroll，但不适合实时用户翻页。

`search_after` 是无状态游标思路，下一页携带上一页最后一条结果的完整排序值。

## 排序要求

排序字段必须稳定且最好有唯一的 tiebreaker，例如时间后追加唯一 id。若只有非唯一时间，跨页可能重复或遗漏；字段还要适合 doc values，避免昂贵脚本排序。

## from-size 为什么在分片上放大

请求第 1000 页、每页 20 条时，每个相关分片不能只返回 20 条，而要先找出前 20020 条候选，协调节点再从所有分片结果中取全局第 20001–20020 条。分片越多、排序越复杂、`_source` 越大，内存和 CPU 放大越明显。

`index.max_result_window` 是保护阈值，不是性能优化。把它调到几百万只是允许更昂贵的请求进入集群，可能导致协调节点 OOM 或长尾雪崩。

## search_after 的游标语义

```json
{
  "sort": ["2026-07-22T10:00:00.000Z", "A1001"]
}
```

下一次请求把上一页最后一条的 sort 值作为 `search_after`，每个分片只找排在该位置之后的结果。它不需要知道前面有多少页，因此适合“下一页/继续加载”，但不能免费跳到任意页。

排序字段需支持 doc values，脚本或高成本运行时字段会让每页都重新计算。tiebreaker 必须在所有分片全局唯一或至少稳定，否则同值文档的相对顺序可能变化。

## PIT 如何稳定视图

PIT 保存一组逻辑索引 reader，使分页期间 refresh、merge 和新写入不会改变已打开视图。search_after 请求还要携带 PIT 返回的隐含 `_shard_doc` 或稳定字段，以便跨分片继续读取。

PIT 不是免费快照：它会保留旧 segment，阻碍删除和 merge，过多或过长的 PIT 会增加磁盘和资源。设置短 keep_alive、及时关闭、限制并发导出，并监控 open contexts。

## scroll 何时使用

scroll 适合批量导出、reindex、离线处理等不面向用户的长遍历。它维护服务端上下文，客户端必须及时消费和清理；切片 scroll 可并行，但会放大磁盘和下游压力。交互式滚动列表优先 search_after + PIT，不要长期占用 scroll。

## 数据变化下的选择

不使用 PIT 的 search_after 允许近实时变化：新文档可能插入游标之前而不会出现在后页，更新排序字段也可能造成跳过或重复。若产品允许“继续往后看当前结果”，这是可接受的；若需要导出一致快照，使用 PIT 或在事实源侧生成批次版本。

## 方案选择

普通浅分页保留 from-size；无限滚动或下一页使用 search_after + PIT；批处理导出使用 scroll 或平台推荐的切片方案，并及时释放上下文。产品上限制任意跳转页数也很重要。

## 容易踩坑的地方

仅提高 `max_result_window` 把保护阈值放大，不会消除深分页成本。search_after 也不能自然跳到任意第 N 页，它用能力约束换取稳定性能。

## 常见问题

### 追问：为什么需要 PIT？

多次分页期间索引 refresh 和数据变更会改变结果排序，PIT 提供同一逻辑视图，减少跨页重复和遗漏，但会占用资源并需要超时管理。

### 追问：search_after 可以按页码跳转吗？

不能直接跳转。它需要前一页的 sort 游标；任意跳页需要额外索引、预计算锚点或接受从头扫描的成本。

### 追问：PIT 期间删除文档还能释放磁盘吗？

旧 reader 仍被 PIT 引用时，相关 segment 不能立即安全删除，merge 也受到影响。PIT 必须设置合理生命周期并主动关闭。

### 追问：scroll 和 PIT 选哪个做导出？

取决于版本、数据规模、排序和资源策略。scroll 适合长批处理，PIT + search_after 更接近无状态分页；两者都需限制并发、超时和下游速度。
