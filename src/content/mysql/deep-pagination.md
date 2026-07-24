---
title: MySQL 深分页为什么慢？如何优化？
category: MySQL
categorySlug: mysql
categoryOrder: 5
order: 9
description: 从 OFFSET 扫描、回表成本和游标分页设计高性能翻页查询
updated: 2026-07-23
minutes: 8
level: 进阶
prerequisites: [mysql/btree-index, mysql/sql-execution-explain]
next: [mysql/sharding]
---

# MySQL 深分页为什么慢？如何优化？

## 先说结论

> `LIMIT offset, size` 的 offset 很大时，MySQL 通常仍要扫描 offset + size 条记录并丢弃前面部分；若排序或筛选不能由覆盖索引完成，还会产生大量回表。连续翻页优先使用基于稳定排序键的游标分页。

例如按 `(created_at, id)` 倒序，下一页带上上一页最后一条的两个值，用小于条件继续查询，复杂度不再随页码线性增长。

## 常见方案

覆盖索引加延迟关联可以先在窄索引上选出目标主键，再回表获取少量完整行。只支持跳到有限页时可限制最大页数；离线导出应按主键或时间区间分批，而不是不断增加 OFFSET。

## OFFSET 的真实成本

```sql
SELECT id, order_no, created_at
FROM orders
WHERE tenant_id = 1001
ORDER BY created_at DESC, id DESC
LIMIT 1000000, 20;
```

即使最终只返回 20 行，引擎仍要沿满足条件的索引扫描约 1000020 个候选，跳过前 100 万行。若查询列不在索引中，扫描到的候选还可能逐行回表；若 ORDER BY 无法利用索引顺序，还会出现大范围排序或临时表。成本随页码线性增加，缓存命中时可能只是慢，缓存未命中或并发高时会直接挤占 I/O。

`EXPLAIN ANALYZE` 中应重点比较实际扫描行数、回表次数、排序时间和返回行数。不要只看 SQL 文本里 LIMIT 很小就假定开销很小。

## 游标分页的完整写法

```sql
-- 第一页
SELECT id, order_no, created_at
FROM orders
WHERE tenant_id = :tenantId
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- 下一页，cursor 是上一页末条的 (created_at, id)
SELECT id, order_no, created_at
FROM orders
WHERE tenant_id = :tenantId
  AND (created_at < :lastCreatedAt
       OR (created_at = :lastCreatedAt AND id < :lastId))
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

索引应与条件和排序一致，例如 `(tenant_id, created_at DESC, id DESC)`。游标不是简单的 id 字符串，而是“完整排序位置”；服务端可以把排序字段、查询条件版本和签名编码成不透明 token，防止客户端伪造或把 A 查询的游标用于 B 查询。

## 延迟关联什么时候有效

当列表页必须返回大字段而索引无法覆盖时，可先在窄索引中定位主键，再关联完整行：

```sql
SELECT o.*
FROM orders o
JOIN (
    SELECT id
    FROM orders FORCE INDEX (idx_tenant_time_id)
    WHERE tenant_id = :tenantId
    ORDER BY created_at DESC, id DESC
    LIMIT :offset, :size
) page ON page.id = o.id
ORDER BY o.created_at DESC, o.id DESC;
```

它并没有消除 offset 扫描，但把“扫描一百万行完整宽记录”缩小为“扫描一百万个索引条目后回表 20 行”。必须用真实执行计划验证，盲目 FORCE INDEX 可能在不同参数下退化。

## 翻页一致性如何定义

用户翻页期间数据会新增、更新、删除。普通游标分页提供的是沿当前排序继续读取，不保证整套结果是某个时刻的快照；新插入且排在游标之前的数据通常不会出现在后页，这往往符合无限滚动预期。

需要报表级稳定结果时，可固定查询上界（例如 `created_at <= requestStartedAt`）、使用版本号或在可承受的事务快照中导出。强快照会占用更多资源，不能默认给所有在线列表使用。

## COUNT(*) 与任意跳页

产品若要求“跳到第 5000 页”和精确总数，数据库无法同时免费提供。精确 count 可能扫描大范围索引；可使用近似数、异步统计、按时间分段、限制最大页数，或者把检索需求交给更适合的搜索系统。技术方案必须和产品交互能力一起讨论。

## 线上治理清单

- 为页面尺寸设置最大值，拒绝无限 size。
- 对 offset 设置可接受上限，并提供“按条件继续加载”的替代体验。
- 把导出、全量扫描移到异步任务，使用 seek 分批和限速。
- 监控深分页 SQL 指纹、扫描行数、临时表和慢查询占比。
- 索引变更前评估写放大、磁盘空间和在线 DDL 风险。

## 一致性设计

排序必须稳定且唯一，时间相同要追加主键。游标还应绑定查询条件和排序方向；数据实时变化时，需要接受弱一致翻页，或通过快照版本、时间上界固定结果集。

## 容易踩坑的地方

只把 `LIMIT 100000, 20` 改成子查询不一定更快，关键是子查询能否覆盖索引、减少扫描列和回表。游标分页也不擅长任意跳转到第 N 页，这是产品能力上的取舍。

## 常见问题

### 追问：为什么只用 id 作为游标可能不正确？

如果业务按时间或其他字段排序，id 顺序未必等同展示顺序；游标必须包含完整排序键，才能避免遗漏或重复。

### 追问：游标分页可以向上一页吗？

可以保存当前页首条的排序键，用相反比较符和反向排序查询前一批，再在应用层反转结果；实现比下一页复杂，要明确 token 中的方向和边界。

### 追问：深分页能靠分区表自动解决吗？

只有 WHERE 条件能有效裁剪到少量分区时才有帮助。单个分区内部的大 offset 仍要扫描，分区不替代正确索引和游标设计。

### 追问：为什么 SELECT * 更容易让深分页变慢？

宽行增加回表、页读取、网络传输和应用对象创建；列表接口只选必要列更容易实现覆盖索引，也减少总链路成本。
