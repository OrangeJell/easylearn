---
title: HashMap 的底层原理是什么？
category: Java集合
categorySlug: collections
categoryOrder: 2
order: 1
description: 从哈希定位、冲突处理到扩容与并发边界
updated: 2026-07-23
minutes: 4
level: 进阶
prerequisites: [java-basic/equals-hashcode]
next: [concurrency/volatile-happens-before]
related: [collections/arraylist-linkedlist]
---

# HashMap 的底层原理是什么？

## 先说结论

> HashMap 是基于哈希表的 Map 实现，底层使用数组定位桶，冲突元素使用链表或红黑树保存；当元素数量超过容量与负载因子的乘积时，哈希表会扩容并重新分布元素。

JDK 8 的典型结构可以抽象为 `Node<K,V>[] table`。数组长度通常保持为 2 的幂，这样可以使用 `(n - 1) & hash` 快速计算索引。

## put 的执行流程

1. 对 key 的 `hashCode()` 做扰动，减少高位信息丢失。
2. 根据数组长度计算桶下标。
3. 桶为空时创建节点。
4. 桶不为空时，先比较 hash 和 key；相同则替换 value。
5. key 不同则沿链表查找，或在红黑树中查找。
6. 新节点插入后检查树化和扩容条件。

```java
Map<String, Integer> counts = new HashMap<>();
counts.merge("java", 1, Integer::sum);
```

## 为什么需要扰动 hash？

数组定位只使用 hash 的一部分位。当数组较小时，高位信息可能没有参与定位，很多不同的 hash 可能落入同一个桶。JDK 8 使用 `h ^ (h >>> 16)` 将高位混入低位，在不增加太多成本的情况下改善分布。

## 链表为什么会树化？

哈希冲突严重时，链表查找接近 O(n)。JDK 8 在链表长度达到树化阈值、且数组容量达到最小树化容量时，将链表转换为红黑树；如果数组还很小，优先扩容而不是树化。这样可以避免小表因为偶然冲突就承担红黑树成本。

## 扩容与负载因子

容量是桶的数量，负载因子表示允许的装载程度。默认负载因子为 `0.75`，阈值约等于 `capacity * loadFactor`。超过阈值后，容量通常扩大为两倍。

扩容的成本包括创建新数组和迁移节点。提前估算数据量并设置合适的初始容量，可以减少多次扩容；但初始容量过大又会增加遍历空桶的成本。

## 时间复杂度与边界

在哈希分布良好的情况下，`get` 和 `put` 的平均时间复杂度接近 O(1)。大量 key 使用相同 hash、或者 key 的 `equals` / `hashCode` 实现不正确，都会破坏这个假设。

HashMap 允许一个 null key 和多个 null value，不保证遍历顺序。官方 API 明确说明它不是同步容器；多个线程并发访问且至少一个线程结构性修改时，必须在外部同步，或者改用并发容器。

## 参考资料

- [Oracle Java SE 21 HashMap API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html)
- OpenJDK 8 `HashMap` 源码与注释

## 常见问题

### 追问：为什么 ConcurrentHashMap 不允许 null？

并发环境中 `get` 返回 null 无法区分“键不存在”与“值就是 null”，会让原子语义产生歧义，因此键和值都禁止 null。

### 追问：扩容后元素如何迁移？

容量翻倍时，元素根据哈希中对应新增位分成原位置与“原位置 + 旧容量”两组，无需重新计算完整取模。
