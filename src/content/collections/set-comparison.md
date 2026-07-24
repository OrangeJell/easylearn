---
title: HashSet、LinkedHashSet 和 TreeSet 有什么区别？
category: Java集合
categorySlug: collections
categoryOrder: 2
order: 4
description: 比较三种 Set 的去重依据、顺序、复杂度和适用场景
updated: 2026-07-23
minutes: 6
level: 基础
prerequisites: [collections/hashmap]
next: [collections/comparable-comparator]
---

# HashSet、LinkedHashSet 和 TreeSet 有什么区别？

## 先说结论

> HashSet 基于 HashMap，平均增删查接近 O(1) 且不保证顺序；LinkedHashSet 额外维护链表，保留插入顺序；TreeSet 基于红黑树，元素按自然顺序或比较器排序，操作复杂度 O(log n)。

HashSet 和 LinkedHashSet 主要通过 `hashCode` 定位、`equals` 判等；TreeSet 用 `compareTo` 或 `Comparator` 的结果是否为 0 判断重复。

## 选择原则

只要求去重时优先 HashSet；需要稳定输出插入顺序时选择 LinkedHashSet；需要有序遍历、范围查询或邻近元素查找时使用 TreeSet。

## 底层结构与复杂度

| 实现 | 底层结构 | contains/add/remove | 顺序 | 额外成本 |
| --- | --- | --- | --- | --- |
| HashSet | HashMap 的键 | 平均 O(1) | 无契约 | 桶数组与节点 |
| LinkedHashSet | HashMap + 双向链表 | 平均 O(1) | 插入顺序 | 每节点额外前后指针 |
| TreeSet | TreeMap 红黑树 | O(log n) | 比较器顺序 | 树旋转和比较成本 |

HashSet 实际把元素存为 HashMap 的 key，value 使用共享占位对象。LinkedHashSet 通过维护访问链保证稳定迭代，因此比 HashSet 多占一些内存，但非常适合“去重且保留输入顺序”。

## TreeSet 的导航能力

TreeSet 不只是排序输出，还实现 `NavigableSet`：

```java
NavigableSet<Integer> scores = new TreeSet<>(List.of(60, 75, 80, 90));
scores.floor(78);       // 75，小于等于目标的最大值
scores.ceiling(78);     // 80，大于等于目标的最小值
scores.subSet(70, true, 90, false); // [75, 80]
```

排行榜分段、时间范围、规则阈值等需要邻近或区间操作时，这些能力比“放入 HashSet 后每次排序”更自然。

## 可变键为什么危险

```java
Set<User> users = new HashSet<>();
User user = new User(1L, "old@example.com");
users.add(user);
user.setEmail("new@example.com"); // 若 email 参与 equals/hashCode
users.remove(user);               // 可能找不到原桶
```

TreeSet 也有类似问题：若对象加入后修改参与比较的字段，树的物理位置不会自动调整，集合顺序和查找都会失真。集合元素最好使用不可变唯一键，更新排序字段时先删除旧元素再重新加入。

## 去重规则是业务契约

按用户 ID 去重、按邮箱去重和按“姓名 + 生日”去重是不同业务含义。不要为了放入 Set 临时重写实体 equals；更明确的做法是构造去重键、使用 `Map<Key, Value>`，或给 TreeSet 传入局部 Comparator。

## 契约要求

放入 HashSet 的对象在集合生命周期内不应修改参与哈希的字段。TreeSet 的比较规则最好与 `equals` 一致，否则可能出现“equals 不同但集合认为重复”的现象。

## 容易踩坑的地方

HashSet 的遍历顺序即使在一次运行中看似稳定，也不是公开契约。TreeSet 不是依靠哈希，因此修复 `hashCode` 不会改变它的去重结果。

## 常见问题

### 追问：三种 Set 如何处理 null？

HashSet 和 LinkedHashSet 通常允许一个 null；TreeSet 使用自然排序时通常不能比较 null，自定义比较器是否支持取决于比较规则。

### 追问：LinkedHashSet 如何实现稳定顺序？

除了哈希桶，它还把所有节点连接成双向链表；迭代沿链表进行。删除需要同时维护哈希结构和链表链接。

### 追问：如何对一批对象按 ID 去重并保留第一次出现？

用 LinkedHashMap 的 ID 作为键并 `putIfAbsent`，最后取 values；这比只用 Set 更容易同时保留原对象和明确去重字段。

### 追问：TreeSet 的 compare 返回 0 有什么后果？

集合认为新元素与已有元素是同一个键，`add` 返回 false，不会同时保存。比较器必须包含业务唯一性需要的全部字段。
