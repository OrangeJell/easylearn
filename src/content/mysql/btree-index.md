---
title: MySQL 为什么使用 B+Tree 索引？
category: MySQL
categorySlug: mysql
categoryOrder: 5
order: 1
description: 从磁盘 IO、树高和范围查询理解 InnoDB 索引
updated: 2026-07-23
minutes: 4
level: 进阶
next: [mysql/transactions-mvcc, mysql/sql-execution-explain]
related: [mysql/slow-sql-troubleshooting]
---

# MySQL 为什么使用 B+Tree 索引？

## 先说结论

> B+Tree 分支多、树高低，单次查询需要的磁盘 IO 较少；叶子节点按顺序连接，既适合等值查询，也适合范围扫描。

## B+Tree 的结构优势

数据库页面一次可以保存大量索引键和子节点指针。相比二叉树，B+Tree 在相同数据量下树高更低。非叶子节点主要用于导航，数据集中在叶子节点，因此每层能容纳更多分支。

## 聚簇索引与二级索引

InnoDB 主键索引的叶子节点保存整行数据，也叫聚簇索引。二级索引叶子节点保存索引列和主键值，通过二级索引查询其他列时，可能还要根据主键回到聚簇索引，这个过程称为回表。

## 联合索引与最左匹配

联合索引按定义顺序排序。索引 `(a, b, c)` 可以高效支持以 `a` 开始的查询条件；跳过最左列后，通常无法直接利用完整索引顺序完成定位。

```sql
CREATE INDEX idx_user_status_time
ON orders(user_id, status, created_at);
```

## 常见索引失效场景

- 对索引列进行函数或计算。
- 隐式类型转换。
- 联合索引未满足最左匹配。
- 前导模糊查询，如 `LIKE '%java'`。
- 优化器判断全表扫描成本更低。

## 参考资料

- [MySQL 8.4 Reference Manual: InnoDB Indexes](https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html)

## 为什么不用普通二叉树或 Hash

B+Tree 分支多、树高低，一次页读取能获得大量键；叶子有序连接，兼顾等值、范围、排序和前缀查询。Hash 擅长等值定位，却不天然支持范围和排序。

## 常见问题

### 追问 1：索引下推是什么？

存储引擎遍历二级索引时直接使用索引中的字段过滤，减少不满足条件记录的回表次数，但不一定减少索引扫描量。

### 追问 2：为什么索引会“失效”？

可能是不满足最左前缀、函数计算、隐式转换或返回比例过大。更准确地说，优化器认为其他路径更便宜，应结合 `EXPLAIN ANALYZE` 判断。

### 追问 3：为什么不能为每列都建索引？

每个索引都占空间并增加插入、更新、日志和缓存压力，应围绕高价值查询设计，定期清理冗余索引。
