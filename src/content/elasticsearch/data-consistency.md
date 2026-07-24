---
title: Elasticsearch 如何处理并发更新和数据一致性？
category: ES
categorySlug: elasticsearch
categoryOrder: 8
order: 9
description: 理解乐观并发控制、版本冲突、主副本复制及数据库同步方案
updated: 2026-07-23
minutes: 6
level: 高级
prerequisites: [elasticsearch/write-search-process]
next: [elasticsearch/index-lifecycle]
---

# Elasticsearch 如何处理并发更新和数据一致性？

## 先说结论

> Elasticsearch 为操作分配序列号，并用 primary term 区分主分片任期。更新时携带 `if_seq_no` 与 `if_primary_term`，只有文档仍是读取时版本才执行，否则返回冲突，由业务决定重读、合并或放弃。

这能防止同一文档的丢失更新，但不能自动让关系数据库和 Elasticsearch 形成分布式事务。

## 主副本一致性

写操作先由主分片排序并执行，再复制到副本。故障切主需要依赖复制历史和检查点恢复；副本确认、超时与重试会影响调用方看到的结果，重试操作应具有幂等语义。

## 乐观并发控制示例

```http
PUT orders/_doc/O1001?if_seq_no=42&if_primary_term=7
{"status":"PAID","version":8}
```

如果文档在读取后已被其他请求更新，seq_no 或 primary_term 不匹配，Elasticsearch 返回 409。调用方可以重新读取并合并字段、按业务状态机拒绝，或把冲突放入补偿队列；不能无脑覆盖，否则会丢失更新。

`_version`、seq_no、primary_term 和业务 version 不是同一个层次：前者帮助 ES 判断并发操作顺序，业务 version 表达订单/库存等领域事实。跨系统同步通常需要同时携带业务版本。

## 更新脚本与状态机

```json
POST orders/_update/O1001
{
  "script": {
    "source": "if (ctx._source.version + 1 != params.version) { ctx.op = 'none' } else { ctx._source.status = params.status; ctx._source.version = params.version }",
    "params": {"version": 8, "status": "PAID"}
  }
}
```

脚本可以防止过旧事件覆盖新状态，但只有在业务状态合法时才应更新；例如 SHIPPED 不能退回 CREATED。更复杂状态机应在事实源或服务层校验，ES 只作为查询投影。

## 主副本复制的故障边界

主分片对操作排序并复制，副本可能暂时落后。请求成功的确认级别、refresh 时机和副本可用性会影响读到的数据。主节点故障切换后，系统通过复制历史和 checkpoint 处理已确认/未确认操作，但客户端重试仍可能重复，因此写入接口需要幂等。

## 数据库到 ES 的最终一致闭环

```text
数据库事务 -> Outbox/CDC -> Kafka/队列 -> ES bulk
        ↘ 对账任务、重试、死信、版本过滤 ↗
```

事件应包含业务主键、版本、事件 ID、发生时间和删除标记。消费者按版本拒绝旧事件，按事件 ID 去重；失败记录持久化而非只打日志。定期从数据库抽取关键字段与 ES 比较，修复漏写、乱序、映射失败和删除遗漏。

## 删除和重建

ES 索引可删除重建，但重建期间别名切换、双写和读一致性需要设计。先创建新索引并回填，持续消费增量，校验文档数与版本，再原子切 alias；失败可切回旧索引。直接在原索引大量 update_by_query 可能长时间占用资源且难以回滚。

## 跨系统同步

数据库通常作为事实源，通过 Outbox、Binlog CDC 或可靠消息更新 ES。事件携带业务主键和单调版本，ES 只接受更新版本；失败进入重试与死信，并用定期对账修复漏数。

## 容易踩坑的地方

外部版本号使用普通时间戳可能因精度或时钟问题冲突。遇到 409 就无限重试也可能覆盖业务意图，应针对计数合并、状态机更新和整文档替换使用不同策略。

## 常见问题

### 追问：数据库已提交但 ES 更新失败怎么办？

不要在请求线程里只重试几次就结束；使用可持久化事件记录、异步重试、监控和对账，让更新最终可恢复且可追踪。

### 追问：ES 的版本控制可以替代数据库事务吗？

不能。它只控制 ES 内部文档并发更新，不会回滚数据库，也不保证多个外部系统原子提交。

### 追问：如何处理乱序 CDC 事件？

事件带单调业务版本，消费者只接受更高版本；旧事件丢弃但记录指标，缺版本可等待、回查或进入重试。不能仅按接收时间覆盖。

### 追问：为什么重试 ES 写入仍可能重复？

请求可能已在服务端成功而响应在网络中丢失，客户端重试又提交一次。使用稳定文档 ID、幂等 upsert 或事件去重记录消除重复副作用。
