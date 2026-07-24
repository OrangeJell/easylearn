---
title: fail-fast 和 fail-safe 迭代器有什么区别？
category: Java集合
categorySlug: collections
categoryOrder: 2
order: 5
description: 理解结构修改检测、弱一致遍历以及并发修改异常的正确处理方式
updated: 2026-07-23
minutes: 6
level: 基础
prerequisites: [collections/arraylist-linkedlist]
next: [collections/copy-on-write-arraylist]
---

# fail-fast 和 fail-safe 迭代器有什么区别？

## 先说结论

> ArrayList、HashMap 等普通集合的迭代器通常是 fail-fast：迭代器记录预期修改次数，发现集合被非迭代器路径结构性修改时尽快抛出异常。并发容器通常提供快照或弱一致迭代，不抛该异常但也不承诺强一致快照。

“fail-safe”不是 Java 集合 API 的正式术语。聊到它时，最好直接说明具体容器到底是复制快照，还是弱一致读取。

## 关键机制

结构修改通常指改变元素数量或桶结构，替换某个已有位置的值未必触发检测。修改次数检查是尽力而为，不能依赖它发现所有竞态。

## modCount 如何工作

创建 ArrayList 迭代器时，它把集合当前 `modCount` 保存为 `expectedModCount`。每次 `next`、`remove` 等操作都会检查二者：

```java
if (modCount != expectedModCount) {
    throw new ConcurrentModificationException();
}
```

通过迭代器自己的 `remove` 删除后，迭代器会同步更新 expectedModCount，所以这是合法路径。直接调用原集合 `remove` 只改变 modCount，下一次迭代检查就会失败。

这不是完整并发检测协议：计数通常不是 volatile，溢出、竞态和检查时机都可能让异常没有立即出现。Java 文档明确不保证用它判断程序线程安全。

## 三种遍历一致性

| 类型 | 代表容器 | 遍历期间修改后的观察 |
| --- | --- | --- |
| fail-fast | ArrayList、HashMap | 尽力抛出并发修改异常 |
| 快照 | CopyOnWriteArrayList | 始终读取创建迭代器时的数组 |
| 弱一致 | ConcurrentHashMap、ConcurrentLinkedQueue | 可看到部分后续变化，不重复或损坏容器结构 |

“弱一致”不等于随机错误，而是容器定义了在不冻结全局状态的前提下可安全遍历。具体是否能看到新增或删除，要以对应类型文档为准。

## 正确删除示例

```java
Iterator<Order> iterator = orders.iterator();
while (iterator.hasNext()) {
    if (iterator.next().expired()) {
        iterator.remove();
    }
}

// 表达简单过滤时更清楚
orders.removeIf(Order::expired);
```

Stream 管道中也不要同时修改来源集合。需要转换时收集到新集合；需要并发消费时使用队列或先建立稳定快照。

## 线上常见问题

一个定时任务遍历普通 HashMap，另一个请求线程更新它，偶尔抛出异常只是表象。即使改成捕获异常重试，也可能读取不一致数据或无限重试。正确修复是明确共享状态所有权：加锁、换并发容器、不可变快照原子替换，或让单线程负责所有更新。

## 正确修改方式

单线程遍历删除使用 `Iterator.remove()` 或 `removeIf()`。多线程共享数据应选择合适并发容器并设计一致性语义，而不是捕获异常后重试。

## 容易踩坑的地方

即使只有一个线程，在增强 for 循环里直接调用集合的 `remove` 也可能抛异常；原因是修改路径绕过了当前迭代器，并非一定存在多线程。

## 常见问题

### 追问：CopyOnWriteArrayList 迭代时能看到新增元素吗？

不能。迭代器持有创建时的数组快照，后续写入复制到新数组，不影响当前迭代过程。

### 追问：为什么修改 list.set(i, value) 不一定抛异常？

它通常不改变集合结构和元素数量，因此不递增 modCount。但迭代器读到旧值还是新值不能作为线程安全保证。

### 追问：ConcurrentHashMap 遍历会重复同一个元素吗？

它提供弱一致迭代，不抛并发修改异常，也不会因为并发更新破坏内部结构。对变化的精确观察边界应以 JDK 契约为准，业务不能把遍历结果当原子快照。

### 追问：如何获得并发 Map 的一致快照？

ConcurrentHashMap 没有免费全局快照。可以在外部停止写入或持有统一锁后复制；也可以让写线程发布版本化不可变 Map，以更高写成本换稳定读取。
