---
title: ArrayList 与 LinkedList 应该怎么选？
category: Java集合
categorySlug: collections
categoryOrder: 2
order: 2
description: 从数据结构、扩容、随机访问和真实插入成本比较两种 List
updated: 2026-07-23
minutes: 4
level: 基础
---

# ArrayList 与 LinkedList 应该怎么选？

## 先说结论

绝大多数业务场景优先使用 `ArrayList`。它的随机访问是 O(1)，连续内存带来更好的 CPU 缓存局部性。`LinkedList` 只有在已经持有节点位置并频繁在该位置插入、删除时才可能占优。

## ArrayList 的结构与扩容

`ArrayList` 底层是动态数组。添加元素超过容量后会创建更大的数组并复制旧元素。常见 JDK 实现按原容量约 1.5 倍扩容，但不应把具体倍数当成 Java API 契约。

```java
List<Integer> values = new ArrayList<>(10_000);
for (int i = 0; i < 10_000; i++) values.add(i);
```

已知数据规模时设置初始容量，可以减少扩容和数组复制。`size` 是元素数量，`capacity` 是内部数组容量，两者不是一回事。

## LinkedList 的结构

`LinkedList` 是双向链表，每个节点保存元素以及前驱、后继引用。访问第 n 个元素需要从头或尾逐个移动，因此随机访问为 O(n)。此外，每个节点都是额外对象，内存开销和 GC 压力通常更大。

## 操作复杂度

| 操作 | ArrayList | LinkedList |
| --- | --- | --- |
| 按下标读取 | O(1) | O(n) |
| 尾部追加 | 均摊 O(1) | O(1) |
| 头部插入 | O(n) | O(1) |
| 按下标插入 | 查找 O(1) + 移动 O(n) | 查找 O(n) + 链接 O(1) |
| 迭代 | 缓存友好 | 需要追逐节点引用 |

“LinkedList 插入一定快”并不准确。若先调用 `get(index)` 或 `add(index, value)` 定位节点，查找本身仍是 O(n)。

## 删除元素的陷阱

`List<Integer>` 同时存在 `remove(int index)` 和 `remove(Object value)`。传入基本类型会删除指定下标，想按值删除需要显式装箱：

```java
list.remove(Integer.valueOf(1));
```

遍历时直接调用集合的 `remove` 可能触发 `ConcurrentModificationException`，应使用迭代器的 `remove`，或使用 `removeIf`。

## 并发与 fail-fast

二者都不是线程安全集合。迭代期间检测到结构性修改时通常会快速失败，但 fail-fast 只是尽力检测的错误提示机制，不能当作并发安全保证。读多写少可评估 `CopyOnWriteArrayList`，高并发写入则应重新考虑数据结构和同步策略。

## 选择建议

- 普通查询、批量遍历、尾部追加：选择 `ArrayList`。
- 队列或双端队列：通常选择 `ArrayDeque`，而不是 `LinkedList`。
- 大量头部操作：优先评估 `ArrayDeque`。
- 只有确实需要链表节点操作，并通过基准测试证明收益时，才选择 `LinkedList`。

## 常见问题

### 追问：ArrayList 扩容为什么是均摊 O(1)？

单次扩容要复制 O(n) 个元素，但容量按比例增长，连续多次追加的总复制成本可摊到每次操作上。

### 追问：CopyOnWriteArrayList 适合什么场景？

适合读远多于写、集合较小且允许读取短暂快照的场景；每次写都会复制数组，不适合频繁写入或大集合。
