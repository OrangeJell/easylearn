---
title: Redis 事务、Lua 和 Pipeline 有什么区别？
category: Redis
categorySlug: redis
categoryOrder: 5.5
order: 10
description: 比较批量发送、命令排队、乐观锁和服务端原子脚本的语义
updated: 2026-07-23
minutes: 7
level: 进阶
prerequisites: [redis/data-structures-use-cases]
related: [redis/distributed-lock]
---

# Redis 事务、Lua 和 Pipeline 有什么区别？

## 先说结论

> Pipeline 在客户端批量发送命令，主要减少网络往返，不保证其他客户端命令不会穿插；MULTI/EXEC 把命令排队后连续执行，可配合 WATCH 做乐观并发控制；Lua 脚本在服务端原子执行，适合带条件的多步读写。

Redis 事务执行中某条命令发生运行时错误，其他已排队命令仍可能继续执行，不提供关系数据库那样的自动回滚。

## 选择原则

只为吞吐批处理使用 Pipeline；需要无条件连续执行一组命令可用事务；需要“读取后判断再写入”的原子逻辑优先 Lua 或已有原子命令。Cluster 中多 Key 操作还要求 Key 位于同一槽。

## 三者解决的问题不同

| 工具 | 是否减少网络往返 | 是否保证连续执行 | 是否能按读取结果分支 | 是否自动回滚 |
| --- | --- | --- | --- | --- |
| Pipeline | 是 | 否 | 否 | 否 |
| MULTI/EXEC | 可批量发送 | 是 | WATCH 仅决定是否执行 | 否 |
| Lua | 是 | 脚本整体原子 | 是 | 否，脚本内部错误不会撤销已执行写入 |

原子性意味着脚本或 EXEC 期间其他客户端命令不会穿插，不意味着所有命令成功或失败后状态自动恢复。把数据库事务的 ACID 直觉直接套到 Redis 是常见错误。

## Pipeline 的使用边界

```java
Pipeline pipeline = redis.pipelined();
for (String id : ids) {
    pipeline.get("product:" + id);
}
List<Object> results = pipeline.syncAndReturnAll();
```

客户端连续发送多条命令后统一读取响应，显著减少 RTT，适合批量预热、批量读取和迁移工具。批次过大时，客户端输出缓冲、服务端输入队列和响应列表都会占用内存；应按字节数、命令数和超时分批。Pipeline 中其他客户端仍可穿插执行，所以不能用于 read-modify-write 的原子业务。

## WATCH 的乐观并发控制

```text
WATCH balance:1001
GET balance:1001
MULTI
DECRBY balance:1001 10
EXEC
```

如果从 WATCH 到 EXEC 期间被监视 Key 被其他客户端修改，EXEC 返回空结果，调用方读取最新值后决定有限重试。WATCH 适合冲突不高、逻辑简单的场景；高冲突下反复重试会浪费 CPU，Lua 或原子命令通常更合适。

## Lua 设计示例

```lua
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local amount = tonumber(ARGV[1])
if current < amount then
  return {err = 'INSUFFICIENT'}
end
redis.call('DECRBY', KEYS[1], amount)
return current - amount
```

脚本把读取、判断和扣减放在同一事件循环中执行，避免客户端两次命令之间的竞态。所有 KEY 应通过 KEYS 参数声明，尤其在 Cluster 中方便校验同槽；脚本不能执行未受控循环、大范围扫描或网络 I/O。

## 脚本治理

脚本内容应版本化、可测试、限制执行时长，并定义错误码和幂等语义。可以通过 SHA 缓存调用，但节点重启或切换后需要处理脚本未加载。长脚本会阻塞整个节点，不能把复杂业务规则搬进 Lua 以逃避服务层设计。

## 事务错误分类

排队阶段的语法/参数错误会让 EXEC 无法正常执行；执行阶段某条命令错误时，其他命令可能仍然执行。调用方必须检查每条结果并设计补偿或重试，而不是假定“其中一条失败所以全部没生效”。

## 实际用时要注意什么

Lua 脚本必须短小、有边界，长脚本会阻塞核心线程。脚本要明确返回值、失败语义和版本管理；大批 Pipeline 也要限制批次，避免响应占用过多内存。

## 容易踩坑的地方

Pipeline 不是事务，事务也不提供隔离级别和回滚。WATCH 监视的 Key 在 EXEC 前变化会让事务失败，调用方需要决定是否有限重试。

## 常见问题

### 追问：Lua 脚本执行到一半报错会回滚吗？

不会自动撤销错误前已经执行的写入，因此脚本应先校验参数与类型，再进入修改阶段，避免部分生效。

### 追问：为什么 Pipeline 不能保证原子性？

它只是客户端传输优化，服务器仍按收到的命令顺序与其他客户端请求交错执行。只有事务或脚本能在服务端建立连续执行边界。

### 追问：Lua 和事务哪个更适合库存扣减？

需要读取库存、判断并修改时 Lua 或已有原子命令更直接；WATCH 事务在冲突高时会频繁失败重试。无论选择哪种，跨数据库订单创建仍需外部幂等与一致性方案。

### 追问：MULTI/EXEC 可以跨 Cluster 槽吗？

通常不可以，多 Key 事务需要相关 Key 位于同一槽。应通过合理 hash tag 建模，或拆分为上层可恢复流程。
