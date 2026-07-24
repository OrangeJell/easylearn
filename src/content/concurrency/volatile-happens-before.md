---
title: volatile 如何保证可见性和有序性？
category: Java多线程
categorySlug: concurrency
categoryOrder: 3
order: 2
description: 从 JMM、happens-before 和内存屏障理解 volatile
updated: 2026-07-23
minutes: 4
level: 进阶
---

# volatile 如何保证可见性和有序性？

## 先说结论

> 对 volatile 变量的写入 happens-before 后续对该变量的读取，编译器和处理器不能随意重排跨越 volatile 访问的操作；但一次读改写仍然可能被多个线程交错执行，所以不保证复合操作原子性。

```java
private volatile boolean started;

void start() { started = true; }
void awaitStart() {
    while (!started) { /* 等待 */ }
}
```

一个线程写入 `started` 后，另一个线程最终能够观察到新值。volatile 适合状态标志、配置刷新和发布不可变对象引用等场景。

## 三个并发性质

### 可见性

一个线程修改共享变量后，其他线程能够读取到修改结果。volatile 建立了针对该变量的同步关系。

### 有序性

编译器和处理器可能对不影响单线程结果的指令重排。volatile 访问具有更强的排序约束，可阻止部分重排导致的跨线程观察异常。

### 原子性

`i++` 包含读、加一、写回三个步骤。即使 `i` 是 volatile，多个线程仍可能读到同一个旧值，最后互相覆盖，所以结果不一定正确。

## volatile 与 synchronized 的区别

volatile 不提供互斥锁，适合一个线程写、多个线程读的简单状态；synchronized 同时提供互斥、可见性和有序性，适合保护不变量和多步临界区。需要计数、扣库存等复合操作时，应使用锁或原子类。

## 容易踩坑的地方

- volatile 不是“轻量级 synchronized”的完全替代品。
- volatile 只能保证对同一个变量的特殊内存语义，不会自动保护关联字段。
- 看到 `volatile` 并不能推断业务逻辑整体线程安全。

## 参考资料

- [Java Language Specification 17.4 Memory Model](https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html)
- [Java Language Specification 8.3.1.4 volatile Fields](https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html)

## 常见问题

### 追问：双重检查单例为什么需要 volatile？

对象创建可抽象为分配、初始化、发布引用。volatile 防止引用在初始化完成前被其他线程观察，并建立正确可见性。

### 追问：volatile 数组能保证元素更新可见吗？

只保证数组引用本身的 volatile 读写。直接修改元素不是对该引用的写，元素并发访问仍需原子数组、锁等机制。
