---
title: CAS 的原理是什么？如何解决 ABA 问题？
category: Java多线程
categorySlug: concurrency
categoryOrder: 3
order: 5
description: 理解比较交换、原子类、自旋代价以及版本戳解决 ABA 的方式
updated: 2026-07-23
minutes: 7
level: 进阶
prerequisites: [concurrency/volatile-happens-before]
next: [concurrency/threadlocal]
---

# CAS 的原理是什么？如何解决 ABA 问题？

## 先说结论

> CAS 比较内存当前位置与预期值，相等时原子写入新值，否则失败重试。Java 原子类借助硬件原子指令和可见性语义实现无锁更新；竞争激烈时持续自旋会浪费 CPU，并不一定优于阻塞锁。

ABA 指值从 A 变为 B 又回到 A，CAS 只比较当前值会误以为没有变化。若中间变化有业务意义，应同时比较递增版本号，可使用 `AtomicStampedReference`。

## 关键机制

典型更新先读取旧值、计算新值，再循环 CAS。无锁意味着某个线程暂停不会占着互斥锁阻塞其他线程，但不代表没有重试、饥饿或复杂的内存回收问题。

## CAS 循环长什么样

```java
AtomicInteger stock = new AtomicInteger(10);

boolean reserve() {
    while (true) {
        int current = stock.get();
        if (current <= 0) return false;
        if (stock.compareAndSet(current, current - 1)) return true;
        // 竞争失败，重新读取并计算
    }
}
```

CAS 的三个参数是内存位置 V、预期值 A、新值 B。仅当 V 仍等于 A 时，硬件原子地写入 B 并返回成功。Java 的 `compareAndSet` 还提供与 volatile 读写相匹配的可见性语义，不是只比较一个裸 CPU 寄存器。

## ABA 到底会造成什么问题

以无锁栈为例，线程 1 读取头节点 A 和 next B 后暂停；线程 2 弹出 A、弹出 B，又把 A 压回栈顶。线程 1 恢复时发现头仍是 A，CAS 成功，却把 next 指向已经不属于原链路的 B，可能丢失节点。

若业务只关心当前数值，A -> B -> A 未必有害；若中间状态代表资源被占用、版本被修改或链表拓扑变更，就必须检测。版本戳把比较条件从“值 A”升级为“值 A 且版本 N”。

```java
AtomicStampedReference<String> ref =
    new AtomicStampedReference<>("A", 0);
```

版本并非越大越好，还要处理溢出、持久化和跨进程一致性。数据库通常用版本列，分布式系统常用 fencing token，解决的都是“旧持有者不能覆盖新状态”的同类问题。

## 自旋与锁的取舍

CAS 失败时自旋会继续占用 CPU。低冲突、短操作下，重试一次往往比线程阻塞和唤醒更快；高冲突下，很多线程反复失败会造成缓存一致性流量和 CPU 空转，吞吐反而下降。

常见缓解手段是退避、分段、批量合并、LongAdder 或改用锁。不能只用“无锁一定快”判断，需要观察失败率、CPU 利用率、P99 和热点分布。

## 原子类选择

| 需求 | 常用类型 | 注意点 |
| --- | --- | --- |
| 单个 int/long | AtomicInteger/AtomicLong | CAS 更新单值 |
| 高竞争累计 | LongAdder/LongAccumulator | 读取为汇总近似值 |
| 对象引用 | AtomicReference | 保护引用替换，不保护对象内部 |
| 版本/标记 | AtomicStampedReference / AtomicMarkableReference | 额外元数据与分配成本 |
| 多字段一致状态 | 不可变状态对象 + AtomicReference | 一次替换完整快照 |

## 常见业务误用

库存扣减可用 CAS 限制单个数字不为负，但“扣库存、创建订单、冻结优惠券”是多资源事务，单个 AtomicInteger 无法保证整体一致。应通过数据库条件更新、消息状态机或单分片串行化处理完整业务不变量。

## 适用边界

低冲突、状态小且更新逻辑简单时 CAS 很合适；高冲突或操作需要维护多个变量不变量时，锁通常更清楚。热点计数可用 LongAdder 分散竞争，但读取是汇总值。

## 容易踩坑的地方

CAS 解决的是单次条件更新原子性，不能自动让一段复合业务逻辑成为事务。给引用加 `volatile` 也只能保证引用读写可见，不能保证对象内部多字段一致。

## 常见问题

### 追问：LongAdder 为什么高并发下更快？

它把竞争分散到多个计数单元，更新线程更少争用同一位置，读取时再求和；代价是更多内存且 `sum()` 不代表严格瞬时快照。

### 追问：CAS 会有 ABA 之外的问题吗？

会。高竞争自旋、单线程长期失败造成饥饿、多变量一致性无法表达，以及无锁链表等结构的内存回收复杂性，都是实际工程挑战。

### 追问：weakCompareAndSet 和 compareAndSet 有何不同？

弱版本在某些平台允许无原因失败，调用方本就应在循环中重试；普通业务更常用语义直观的 compareAndSet。具体内存语义还需看所选 JDK API 变体。

### 追问：为什么自旋锁在单核机器上风险大？

持锁线程可能没有机会获得 CPU 运行并释放锁，而等待线程持续自旋占用唯一核心，造成活锁式浪费。
