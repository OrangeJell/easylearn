---
title: Elasticsearch 写入和搜索流程是什么？
category: ES
categorySlug: elasticsearch
categoryOrder: 8
order: 6
description: 串联协调节点、主分片、副本、scatter-gather 和相关性排序
updated: 2026-07-23
minutes: 7
level: 进阶
prerequisites: [elasticsearch/inverted-index, elasticsearch/shard-replica]
next: [elasticsearch/deep-pagination]
---

# Elasticsearch 写入和搜索流程是什么？

## 先说结论

> 写入请求由协调节点根据 routing 计算目标主分片，转发给主分片校验并执行，再并行复制到副本，最后按确认条件响应。搜索则由协调节点向相关分片发起 scatter，分片返回候选文档及排序信息，协调节点全局归并后再 fetch 所需文档内容。

自定义 routing 可减少查询扇出，但路由选择不均会制造热点，且所有读写必须遵守同一规则。

## 写入细节

文档先进入内存缓冲并记录 translog，refresh 后生成可搜索的 Lucene segment；flush、merge 和 translog 共同影响可见性、恢复与磁盘成本。Bulk 能显著减少请求开销，但批次要有界。

## 单文档写入路径

```text
协调节点解析 index/id/routing
        ↓
目标主分片写 translog + 内存 buffer
        ↓
主分片分配 seq_no，并复制给副本
        ↓
按 refresh 周期打开新 segment
        ↓
客户端得到成功响应（具体确认受 durability/replica 等配置影响）
```

主分片决定操作顺序，副本按顺序应用；更新文档并非原地修改 Lucene segment，而是写入新版本并标记旧版本删除，后台 merge 才会回收空间。高频 update 和 delete 会制造删除标记与 merge 压力，批量重建或 append-only 设计有时更适合。

## Bulk 的正确边界

Bulk 减少 HTTP 请求与协调开销，但单批太大时会占用协调节点内存、增加失败重试粒度和长尾。按字节、文档数和耗时设置批次，逐条检查响应中的失败项；HTTP 200 不代表每个 action 都成功。

发生 429、连接超时或节点负载高时用指数退避和有限重试，避免所有客户端同步重试形成风暴。写入顺序敏感时，重试和并发 bulk 还要携带版本或业务幂等键。

## 搜索两阶段

Query Phase 中协调节点向目标分片发起查询，各分片只返回局部 Top N 的 doc ID、score 和排序值；协调节点归并得到全局候选。Fetch Phase 再向持有文档的分片读取 `_source` 和 stored fields。`from + size` 越大，每个分片需保留的候选越多，协调节点内存和 CPU 都会放大。

聚合也通常先在分片做局部 bucket，再由协调节点合并。高基数 terms、全局排序、script 和跨大量分片的查询会把协调节点变成瓶颈。

## Routing 如何影响性能

自定义 routing 可让同一租户的数据落到固定分片，租户查询只需扇出一个或少数分片；代价是路由不均、漏写 routing 导致查不到数据，以及超级租户热点。路由是索引级契约，写入和读取必须一致，迁移和 reindex 时也要保留。

## 近实时与实时 GET

写入成功后按 ID GET 通常可从 translog/主分片读取到最新值，但普通 search 要等 refresh 才建立可搜索 segment。`refresh=wait_for` 会等待下一次刷新，`refresh=true` 强制刷新；两者都增加资源和延迟，不应对每条写入默认开启。

## 性能诊断顺序

先看协调节点耗时与分片扇出，再看分片 query/fetch、segment 数、refresh/merge、磁盘、heap 和 GC。写入慢还要检查 mapping 动态扩张、analyzer、bulk 批次和副本复制；搜索慢要拆分查询解析、候选归并、fetch 大 `_source` 和客户端网络。

## 查询细节

Query Phase 每个分片产生局部 Top N，协调节点归并全局结果；Fetch Phase 再向持有目标文档的分片取 `_source`。深分页会让每个分片保留更多候选，成本随 `from + size` 放大。

## 容易踩坑的地方

副本分片可以服务查询，但主分片和副本不是固定只写或只读角色。协调节点不是免费代理，大结果集、高扇出和复杂聚合可能让其堆内存成为瓶颈。

## 常见问题

### 追问：写入成功后为什么立即搜索不到？

普通搜索依赖 refresh 后的新 segment，Elasticsearch 是近实时搜索；按 ID 的实时读取和搜索可见性机制不同。

### 追问：协调节点一定要单独部署吗？

小集群可混合角色；大集群或查询扇出、聚合明显时可增加专用协调节点，但它仍需要足够 heap、网络和监控，不能把瓶颈简单转移。

### 追问：更新文档为什么会增加磁盘？

Lucene segment 近似不可变，更新会写新版本并标记旧版本删除，后台 merge 才回收空间。高更新率需要观察 merge 和磁盘临时空间。

### 追问：Bulk 返回 200 但业务仍丢数据吗？

Bulk HTTP 请求成功只代表整体请求被接收，响应 items 中每个 action 可能独立失败。必须逐项检查、记录失败原因并按幂等策略重试。
