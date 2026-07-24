---
title: String 为什么被 final 修饰且不可变？
category: Java基础
categorySlug: java-basic
categoryOrder: 1
order: 1
description: 从 final、常量池、哈希缓存和线程安全理解 String
updated: 2026-07-23
minutes: 4
level: 基础
next: [java-basic/equals-hashcode]
related: [java-basic/generics]
---

# String 为什么被 final 修饰且不可变？

## 先说结论

> String 类被 final 修饰是为了禁止继承和篡改行为；String 对象不可变，是因为内部数据不对外暴露，所有看似修改的方法都会返回新对象。

需要区分两个概念：`final class String` 表示 String 不能被继承；字符串不可变来自类的整体封装设计，并不只是因为某个字段加了 final。

## 为什么设计成不可变对象？

### 1. 字符串常量池可以安全复用

多个引用可能指向常量池中的同一个字符串。如果字符串可以修改，一个引用的操作会影响所有共享者，常量池也就失去了意义。

### 2. 适合作为 HashMap 的键

String 会缓存哈希值。内容不可变意味着哈希值稳定，放入 HashMap 后不会因为内容变化而找不到原来的桶。

### 3. 天然线程安全

不可变对象没有写操作，多个线程可以安全共享同一个 String 实例，不需要额外加锁。

### 4. 提升安全性

类名、文件路径、网络地址和数据库连接参数经常使用字符串传递。不可变可以防止参数在校验后被修改。

## final 到底保证了什么？

final 引用保证引用不能重新指向另一个对象，并不自动保证对象内部状态不可变。

```java
final List<String> list = new ArrayList<>();
list.add("Java");              // 合法：对象内部可以修改
// list = new ArrayList<>();   // 非法：引用不能重新赋值
```

因此 String 的不可变性来自：类不能继承、内部字段私有、没有暴露修改方法，并且修改操作返回新对象。

## String、StringBuilder 与 StringBuffer

| 类型 | 是否可变 | 线程安全 | 典型场景 |
| --- | --- | --- | --- |
| String | 不可变 | 是 | 少量拼接、常量、Map 键 |
| StringBuilder | 可变 | 否 | 单线程大量拼接 |
| StringBuffer | 可变 | 是 | 多线程共享拼接对象 |

## 常见问题

### 追问：StringBuilder 与 StringBuffer 怎么选？

单线程局部拼接优先 StringBuilder；StringBuffer 方法带同步但通常不应靠它解决复杂并发逻辑。固定少量字面量拼接交给编译器即可。

### 追问：new String("abc") 创建几个对象？

不能脱离常量池状态机械回答。字面量对应的池对象可能在类加载阶段已存在，执行 `new` 会明确创建一个新的堆对象。
