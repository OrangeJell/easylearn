---
title: MySQL 事务隔离级别与 MVCC 原理
category: MySQL
categorySlug: mysql
categoryOrder: 5
order: 2
description: 从 ACID、Read View、Undo Log 到当前读和间隙锁系统理解事务
updated: 2026-07-23
minutes: 5
level: 进阶
prerequisites: [mysql/btree-index]
next: [mysql/locks-deadlock, mysql/redo-undo-binlog]
---

# MySQL 事务隔离级别与 MVCC 原理

## 先说结论

MVCC 通过 Undo 版本链和 Read View 让普通查询尽量少加锁；真正修改数据或执行锁定读时，仍要靠记录锁、间隙锁等机制。RC 和 RR 的主要差别之一，是 Read View 的创建时机。

## ACID 是什么

- 原子性：事务中的操作全部成功或全部回滚，主要依赖 Undo Log。
- 一致性：事务执行前后业务约束保持成立，是前三项共同服务的目标。
- 隔离性：并发事务互相隔离，通过 MVCC 和锁实现。
- 持久性：事务提交后的数据可以恢复，主要依赖 Redo Log 和刷盘机制。

## 四种隔离级别

| 隔离级别 | 脏读 | 不可重复读 | 幻读 |
| --- | --- | --- | --- |
| Read Uncommitted | 可能 | 可能 | 可能 |
| Read Committed | 避免 | 可能 | 可能 |
| Repeatable Read | 避免 | 避免 | 需结合具体读方式分析 |
| Serializable | 避免 | 避免 | 避免 |

InnoDB 默认通常是 Repeatable Read，但部署环境可以修改，应用不应凭印象假设。

## MVCC 如何工作

InnoDB 的聚簇索引记录包含隐藏事务信息。修改记录时，旧版本通过 Undo Log 形成版本链。Read View 保存活跃事务范围，查询根据可见性规则沿版本链找到自己能看到的版本。

在 Read Committed 下，一般每条一致性读语句创建新的 Read View；在 Repeatable Read 下，事务内首次一致性读建立的视图通常会被后续一致性读复用，因此能够重复读取相同版本。

## 快照读与当前读

普通 `SELECT` 通常是快照读，读取符合 Read View 的历史版本。`SELECT ... FOR UPDATE`、`UPDATE`、`DELETE` 属于当前读，需要读取最新记录并加锁。

这也是理解“RR 是否完全解决幻读”的关键：快照读依靠一致性视图，当前读还会结合记录锁、间隙锁或 Next-Key Lock 控制范围内的并发写入。

## 锁与索引的关系

InnoDB 的行锁实质上加在索引记录上。更新条件没有合适索引时，可能扫描并锁定大量记录，显著扩大影响范围。间隙锁锁定的是索引区间而不是某条实际记录，主要用于防止范围内插入。

## 长事务为什么危险

长事务会持续持有锁和旧 Read View，导致 Undo 版本无法及时清理，增加存储和查询成本，也提高死锁与主从延迟风险。事务中不应执行远程调用、等待用户输入等不可控操作。

## 实战建议

1. 事务尽量短小，只包围必须保证一致性的数据库操作。
2. 按固定顺序访问资源，降低死锁概率。
3. 捕获死锁或锁等待超时后，只对幂等操作进行有限重试。
4. 用 `EXPLAIN` 检查索引，避免无谓扩大锁范围。
5. 明确业务能接受的隔离级别，不要盲目追求最高隔离。

## 常见问题

### 追问：MVCC 能避免所有锁吗？

不能。它主要优化一致性读；当前读、更新和唯一性检查仍需要锁，DDL 与元数据访问也有自己的协调机制。

### 追问：RR 下还有幻读吗？

快照读通过一致性视图避免前后结果变化，当前读结合 Next-Key Lock 控制范围插入。混用快照读和当前读时仍需准确分析语义，不能只背“完全解决”。
