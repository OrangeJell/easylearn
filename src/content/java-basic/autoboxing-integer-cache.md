---
title: 自动装箱、拆箱和 Integer 缓存有哪些坑？
category: Java基础
categorySlug: java-basic
categoryOrder: 1
order: 10
description: 理解包装类型转换、对象缓存、空指针和数值比较的正确方式
updated: 2026-07-23
minutes: 6
level: 基础
prerequisites: [java-basic/equals-hashcode]
related: [java-basic/string-immutable]
---

# 自动装箱、拆箱和 Integer 缓存有哪些坑？

## 先说结论

> 自动装箱通常转换为 `Integer.valueOf(int)`，拆箱转换为 `intValue()`。`Integer` 默认缓存 -128 到 127，因此缓存范围内的装箱对象可能相同，但 `==` 比较对象身份，数值比较应使用 `equals` 或先拆箱。

包装类型为 `null` 时自动拆箱会抛出 `NullPointerException`，这在条件判断、算术运算和三元表达式中很容易被忽略。

## 关键机制

`Integer.valueOf` 会复用缓存对象，而显式 `new Integer` 总是创建新对象。不同包装类型的 `equals` 通常要求类型也相同，例如 `Integer(1)` 不等于 `Long(1)`。

## 编译器实际做了什么

```java
Integer boxed = 100; // Integer.valueOf(100)
int raw = boxed;     // boxed.intValue()
boxed++;             // 拆箱、加一、再装箱，并非修改原对象
```

包装类是不可变对象，`boxed++` 会让变量指向新的 Integer。若 boxed 为 null，异常发生在调用 `intValue()` 的拆箱阶段，堆栈有时只指向一行普通算术表达式。

## 缓存与比较示例

```java
Integer a = 127;
Integer b = 127;
Integer c = 128;
Integer d = 128;

System.out.println(a == b); // 常见实现中为 true
System.out.println(c == d); // 常见实现中为 false
System.out.println(c.equals(d)); // true
```

这个例子只能用于说明对象身份，不应写成依赖缓存的业务判断。Boolean、Byte、Short、Character、Long 等包装类也有各自缓存规则，范围和实现细节不能混记成统一契约。

## 隐式拆箱的高风险位置

```java
Map<String, Integer> counts = new HashMap<>();
if (counts.get("paid") > 0) { // 键不存在时拆箱 null
    // ...
}
```

应使用 `getOrDefault`、显式 null 判断或把“未设置”和“零”设计成不同状态。条件表达式也要谨慎：

```java
Integer value = condition ? nullableInteger : 0;
```

由于数值类型推断，这类表达式可能对 nullableInteger 拆箱。不要只看目标变量是 Integer 就假定整个过程没有拆箱。

## 性能与数据建模

一百万个 `Integer` 不仅保存数值，还包含对象头、引用数组和对齐成本，内存远大于 `int[]`。高频计算、计数器和大规模数值数据优先使用基本类型或专用原始类型集合；普通 DTO、泛型集合和允许 null 的数据库字段才使用包装类型。

金额和精确小数不应因为“避免装箱”就改用 double，应优先正确性，使用整数最小货币单位或 BigDecimal，并明确舍入规则。

## 实际用时要注意什么

- DTO 和数据库字段允许空值时，计算前先明确空值语义。
- 高频数值循环使用基本类型，减少对象分配与 GC 压力。
- 集合泛型只能使用包装类型，但读取后可显式转换为基本类型处理。

## 容易踩坑的地方

不能依赖缓存范围推断 `==` 结果，缓存大小还可能受实现和配置影响。三元表达式也可能触发数值提升和拆箱，导致意外空指针。

## 常见问题

### 追问：Integer 和 int 用 == 比较会怎样？

通常会把 Integer 拆箱成 int 后进行数值比较；如果 Integer 为 null，拆箱阶段会抛出空指针异常。

### 追问：new Integer(127) 和 Integer.valueOf(127) 相同吗？

前者明确创建新对象且构造器已不推荐使用，后者可以复用缓存。数值相等应使用 equals 或拆箱，不能根据创建方式使用 `==`。

### 追问：为什么 Integer.equals(Long) 为 false？

包装类 equals 通常要求运行时类型相同再比较值，以保持对称和明确语义。跨数值类型比较应先转换到共同且不会丢精度的表示。

### 追问：AtomicInteger 会触发装箱吗？

其核心更新 API 接受并返回 int，通常不需要 Integer 对象；但把结果放入 `List<Integer>`、作为 Object 传递或进入泛型 API 时仍会装箱。
