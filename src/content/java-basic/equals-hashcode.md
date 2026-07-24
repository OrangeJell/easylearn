---
title: ==、equals 和 hashCode 的区别？
category: Java基础
categorySlug: java-basic
categoryOrder: 1
order: 2
description: 对象相等性契约与集合中的实际影响
updated: 2026-07-23
minutes: 3
level: 基础
prerequisites: [java-basic/string-immutable]
next: [java-basic/generics]
related: [collections/hashmap]
---

# ==、equals 和 hashCode 的区别？

## 先说结论

`==` 比较基本类型的值，比较引用类型时判断是否指向同一对象。`equals` 默认与 `==` 相同，但值对象通常会重写它。`hashCode` 为哈希容器提供桶定位依据。

## equals 与 hashCode 契约

两个对象 equals 相等，它们的 hashCode 必须相等；hashCode 相等，equals 不一定相等。重写 equals 时必须同时重写 hashCode。

## 常见错误

只重写 equals 会导致逻辑上相等的对象进入 HashSet 后仍然重复，或者无法从 HashMap 中正确取回。

## HashMap 为什么同时需要两者

查询时先用 `hashCode` 定位桶，再用 `equals` 确认具体键。哈希只是缩小范围，不是相等性的最终判断。只重写 `equals` 会让逻辑相等的对象落入不同桶，导致 `get` 失败或 `HashSet` 出现重复。

## 常见问题

### 追问 1：hashCode 相同，equals 一定为 true 吗？

不一定。哈希空间有限，碰撞必然存在，所以命中桶后必须继续比较 `equals`。

### 追问 2：为什么不建议用可变对象作为键？

若参与哈希计算的字段在插入后变化，新哈希位置与原桶不一致，即使对象仍在 Map 中也可能无法查询和删除。

### 追问 3：BigDecimal 比较有什么陷阱？

`1.0` 与 `1.00` 使用 `compareTo` 数值相等，但 `equals` 还比较精度。金额逻辑必须明确需要数值相等还是严格对象相等。
