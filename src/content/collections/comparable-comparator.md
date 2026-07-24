---
title: Comparable 和 Comparator 有什么区别？
category: Java集合
categorySlug: collections
categoryOrder: 2
order: 9
description: 掌握自然顺序、外部比较策略、稳定排序和比较器契约
updated: 2026-07-23
minutes: 6
level: 基础
prerequisites: [collections/set-comparison]
next: [collections/immutable-collections]
---

# Comparable 和 Comparator 有什么区别？

## 先说结论

> Comparable 由类自身实现 `compareTo`，定义唯一的自然顺序；Comparator 是独立策略，可以为同一类型提供多种排序方式。业务类型不便修改或存在多种排序规则时优先使用 Comparator。

比较器返回负数、零、正数分别表示小于、等于、大于，不应该用两个整数直接相减，因为可能溢出。

## 正确写法

使用 `Comparator.comparing`、`thenComparing` 和 `nullsFirst/nullsLast` 组合规则，可读性和边界处理更好。比较关系应满足反对称、传递和一致性，否则排序算法和 TreeSet 可能表现异常。

## 一段完整比较器

```java
Comparator<Employee> byDepartmentAndSalary =
    Comparator.comparing(Employee::department,
                         Comparator.nullsLast(String::compareTo))
              .thenComparing(Employee::salary, Comparator.reverseOrder())
              .thenComparingLong(Employee::id);
```

它先按部门升序且 null 放最后，再按工资降序，最后用唯一 ID 打破平局。最后的稳定唯一字段对分页、TreeSet 去重和可重复测试结果都很重要。

基本类型字段优先使用 `comparingInt`、`comparingLong`、`comparingDouble`，避免每次比较都装箱。昂贵的派生值不要在比较器中反复计算，可以先做 Schwartzian transform 式预计算或缓存排序键。

## 比较契约

一个正确比较器至少满足：

- 反对称：`sign(compare(a,b)) == -sign(compare(b,a))`。
- 传递：a > b 且 b > c，则 a > c。
- 相等一致：compare(a,b) 为 0 时，与 a 等价的比较结果应和 b 一致。
- 最好与 equals 一致，若不一致要在文档中明确。

违反传递性不仅结果“顺序奇怪”，排序实现还可能抛出 `Comparison method violates its general contract`。

## 为什么不能直接相减

```java
// 错误：可能整数溢出
(a, b) -> a.getScore() - b.getScore()

// 正确
Comparator.comparingInt(Player::getScore)
```

当 a 是 Integer.MAX_VALUE、b 是负数时，相减可能溢出为负值，颠倒大小关系。浮点数还要考虑 NaN、正负零，使用 `Double.compare` 更安全。

## 稳定排序是什么意思

稳定排序会保持“比较结果为 0”的元素原始相对顺序。Java 对对象列表的排序提供稳定性，但 PriorityQueue 和 TreeSet 的语义不同。若业务要求确定性输出，不应只依赖输入恰好稳定，最好添加明确 tiebreaker。

## 自然顺序设计

只有类型存在公认且长期稳定的唯一自然顺序时才实现 Comparable，例如日期按时间。员工可能按姓名、工号、入职时间或绩效排序，没有唯一答案，更适合提供多个命名 Comparator。

## 集合影响

TreeSet 和 TreeMap 以比较结果为 0 判断键是否重复。比较器若只比较姓名，两个 id 不同但同名的对象可能只保留一个，因此比较字段必须符合目标集合的唯一性语义。

## 容易踩坑的地方

排序稳定性由算法和 API 契约决定，不是 Comparator 自己保证。比较器与 `equals` 不一致虽然语法允许，但容易让有序集合行为违背直觉。

## 常见问题

### 追问：如何按多个字段排序？

先确定主排序字段，再通过 `thenComparing` 添加次级字段，并明确每个字段的升降序与 null 位置。

### 追问：reversed 应该放在哪里？

`comparing(...).reversed()` 会反转截至当前的整个比较器；只想反转某个字段时，把该字段自己的 Comparator 设为 reverseOrder，再 thenComparing 其他字段。

### 追问：Comparator 可以序列化吗？

只有比较器对象及捕获内容可序列化时才可能安全序列化。协议中保存比较器通常不是好设计，建议保存稳定排序规则标识并在接收端重建。

### 追问：TreeMap 使用的比较器可以后改吗？

不能原地替换。树结构按创建时规则组织；需要新规则应创建新 TreeMap 并重新插入所有数据。
