---
title: 如何定位和避免 Java 死锁？
category: Java多线程
categorySlug: concurrency
categoryOrder: 3
order: 8
description: 从死锁四条件、线程转储、固定加锁顺序和超时获取锁系统分析
updated: 2026-07-23
minutes: 6
level: 进阶
prerequisites: [concurrency/locks-aqs]
next: [concurrency/java-memory-model]
---

# 如何定位和避免 Java 死锁？

## 先说结论

> 死锁需要互斥、占有且等待、不可抢占和循环等待同时成立。线上先保存多次线程转储，确认线程长期停在同一锁关系，并查看 JVM 是否报告 Java-level deadlock；修复通常通过统一锁顺序、缩小锁范围或超时获取锁破坏条件。

如果涉及数据库、分布式锁和 JVM 锁，还要把各层等待关系放在一起分析，单份 Java 堆栈可能看不到完整等待环。

## 定位步骤

先确认请求停滞和线程池占用，再使用 `jstack`、`jcmd Thread.print` 或监控平台获取线程转储。找到 BLOCKED 或等待锁的线程、它等待的锁以及锁持有者，沿关系检查是否形成环。

## 一个最小死锁示例

```java
Object left = new Object();
Object right = new Object();

// 线程 1
synchronized (left) {
    synchronized (right) { }
}

// 线程 2
synchronized (right) {
    synchronized (left) { }
}
```

若两个线程各自拿到第一把锁后再等待对方，就满足循环等待。实际系统中锁可能是账户锁、缓存 Key 锁、数据库行锁、连接池许可或分布式锁，等待环跨越组件时更难发现。

## 如何读线程转储

线程转储中关注三部分：线程当前状态、`waiting to lock` 的对象标识，以及 `locked` 的对象标识。JVM 有时会在末尾直接报告 “Found one Java-level deadlock”，但它只能识别 JVM 监视器或可识别同步器中的环，无法看到 HTTP、数据库或消息系统中的等待。

连续采样可以区分死锁和慢操作：死锁线程的锁等待关系长期不变；慢 SQL 可能最终返回，线程栈和持锁对象随时间变化。生产排查应同时保存应用 trace、数据库事务与锁等待、线程池队列长度。

## 用锁顺序破坏循环等待

```java
void transfer(Account a, Account b, long amount) {
    Account first = a.id() < b.id() ? a : b;
    Account second = a.id() < b.id() ? b : a;
    synchronized (first) {
        synchronized (second) {
            doTransfer(a, b, amount);
        }
    }
}
```

全局排序可以是 ID、资源类型加 ID，必须对所有调用路径一致。相同 ID 的边界也要处理，避免两个相等资源导致排序退化。若资源动态集合很大，锁顺序规则需要作为架构契约记录下来。

## tryLock 与超时

ReentrantLock 的 `tryLock(timeout)` 能让线程在拿不到第二把锁时退出、释放已持有锁并重试或报错。它不是自动修复：失败分支必须完整释放资源，重试需要抖动和上限，否则大量线程可能同步重试形成活锁。

## 不只是死锁：饥饿与活锁

线程池饥饿是任务等待同一线程池内尚未运行的任务；活锁是线程都在运行和重试，却没有任何实际进展；优先级不公平还可能导致低优先级任务长期拿不到资源。排障与治理方式不同，不能把所有无响应都归为死锁。

## 预防策略

- 多把锁按全局稳定顺序获取，按逆序释放。
- 锁内不做网络 I/O、回调和不可控耗时操作。
- 使用 `tryLock` 加超时并在失败时完整回滚已持有资源。
- 能用单一所有者、消息传递或并发容器时减少显式锁。

## 容易踩坑的地方

线程都不动不一定是死锁，也可能是下游超时、线程池饥饿或长时间 GC。`tryLock` 只避免无限等待，若失败后没有释放已持有锁仍可能造成问题。

## 常见问题

### 追问：数据库死锁为什么有时会自动恢复？

数据库能检测事务等待图并选择牺牲者回滚，从而打破环；应用仍需捕获对应错误、保证幂等并有限重试，同时修正不一致的访问顺序。

### 追问：synchronized 死锁能设置超时吗？

不能直接设置获取监视器锁的超时。需要超时语义时可使用 ReentrantLock.tryLock，或重新设计为消息串行化、分段锁等模型。

### 追问：如何在线上自动检测 JVM 死锁？

可通过 ThreadMXBean 的死锁检测 API、JFR 或监控平台代理采集；自动检测后应记录转储并告警，谨慎自动重启，先评估是否会影响正在执行的写操作。

### 追问：固定锁顺序能解决数据库死锁吗？

对同一业务访问多行时保持一致顺序可显著降低概率，但索引范围、隔离级别、间隙锁和其他事务路径仍可能形成等待环，必须结合数据库执行计划治理。
