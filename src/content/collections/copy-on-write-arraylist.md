---
title: CopyOnWriteArrayList 适合什么场景？
category: Java集合
categorySlug: collections
categoryOrder: 2
order: 6
description: 理解写时复制、快照迭代及其在读多写少场景下的收益与代价
updated: 2026-07-23
minutes: 6
level: 进阶
prerequisites: [collections/fail-fast-iterator, concurrency/locks-aqs]
next: [collections/concurrent-collections]
---

# CopyOnWriteArrayList 适合什么场景？

## 先说结论

> CopyOnWriteArrayList 写操作加锁并复制整个底层数组，修改完成后发布新数组；读操作无需加锁，迭代器读取创建时的稳定快照。它适合监听器、配置列表等读远多于写且规模有限的场景。

写入成本是 O(n)，高频写或大集合会造成复制、内存峰值和 GC 压力，因此不能把它当作通用线程安全 List。

## 关键机制

新数组发布依靠可见性保证，读线程要么看到旧快照，要么看到完整新数组，不会看到复制一半的状态。迭代器不支持修改操作，因为它面对的是历史快照。

## 写入过程

以 add 为例，核心过程可以概括为：

1. 获取写锁，避免多个写线程同时覆盖结果。
2. 读取当前数组并创建长度加一的新数组。
3. 复制旧元素，把新元素放到末尾。
4. 通过可见性语义发布新数组引用。
5. 释放写锁。

读线程只读取当前数组引用和指定位置，不参与写锁竞争。一次写入至少复制 O(n) 个引用，旧数组还可能被正在遍历的线程持有，暂时不能回收。

## 内存一致性与快照

把对象放入 CopyOnWriteArrayList 之前的写入，对之后读取到该对象的线程可见；但这不等于对象后续字段修改自动线程安全。容器只保护列表结构，元素若可变，仍需自身同步或不可变设计。

```java
CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();

void publish(Event event) {
    for (Listener listener : listeners) {
        listener.onEvent(event);
    }
}
```

发布期间注册或注销监听器不会影响当前轮遍历，也不会持有全局读锁。这正是监听器列表、路由规则快照等典型用途。

## 成本如何估算

假设列表有 100 万个引用，一次写入需要复制约 8 MB 引用数据（是否压缩指针取决于 JVM），并瞬时同时持有新旧数组。若每秒写几十次，就会制造显著内存带宽和 GC 压力。

因此“读写比 100:1”也不一定足够，集合大小同样关键。10 个元素的配置列表偶尔写入非常合适，百万元素列表即使写得少也可能在单次更新时产生长尾。

## 替代方案

- 读写都频繁：普通 ArrayList 配合读写锁，或重新设计分片结构。
- 只需最新完整配置：构造不可变 List 后用 volatile/AtomicReference 整体替换。
- 高频追加和消费：选择并发队列而不是 CopyOnWriteArrayList。
- 按键访问：使用 ConcurrentHashMap，避免每次线性查找。

## 适用边界

它适合“允许读到稍旧数据”的场景。若读取必须立即看到最新写入，或多个操作需要形成事务性约束，应通过锁、不可变快照整体替换或其他数据结构实现。

## 容易踩坑的地方

读操作线程安全不代表 `contains` 后 `add` 的组合天然原子；需要去重时可用 `addIfAbsent`，并评估它的线性扫描成本。

## 常见问题

### 追问：为什么迭代时不会抛并发修改异常？

迭代器持有旧数组引用，写线程操作的是复制后的新数组，二者互不修改同一结构。

### 追问：迭代器为什么不支持 remove？

它只能看到历史数组，无法安全表达“从当前最新数组删除这个位置”的语义，调用会抛出 UnsupportedOperationException。

### 追问：addIfAbsent 的成本是什么？

它需要扫描判断是否存在，并在获取写锁后再次检查以处理并发写入，时间复杂度为 O(n)。大集合频繁去重不适合该结构。

### 追问：快照会造成数据不一致吗？

它提供的是明确的时间点视图而非最新视图。若业务允许一轮通知使用同一版本，这反而更一致；若每次读必须立刻看到更新，就不适合。
