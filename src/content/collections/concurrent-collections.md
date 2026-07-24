---
title: 同步集合和并发集合有什么区别？
category: Java集合
categorySlug: collections
categoryOrder: 2
order: 8
description: 比较同步包装器与并发容器的锁粒度、迭代语义和复合操作
updated: 2026-07-23
minutes: 6
level: 进阶
prerequisites: [collections/concurrenthashmap]
next: [collections/immutable-collections]
---

# 同步集合和并发集合有什么区别？

## 先说结论

> 同步包装器通常用一把互斥锁保护普通集合的单个方法，结构简单但竞争较大；并发集合针对访问模式设计，使用分段、CAS、写时复制或无锁算法提升并发度，并提供 `putIfAbsent`、`compute` 等原子操作。

常见选择包括 ConcurrentHashMap、CopyOnWriteArrayList、ConcurrentLinkedQueue 和各种 BlockingQueue，它们的一致性与阻塞语义并不相同。

## 关键差异

同步包装器遍历时通常要求调用方手动持有包装器的锁；并发集合的迭代器多为快照或弱一致。即使单个方法同步，`if (!list.contains(x)) list.add(x)` 仍需在同一锁内执行。

## 常见容器选型表

| 需求 | 常用容器 | 核心语义 |
| --- | --- | --- |
| 高并发按键读写 | ConcurrentHashMap | 弱一致遍历、按键原子复合操作 |
| 读极多写极少的短列表 | CopyOnWriteArrayList | 写时复制、快照迭代 |
| 非阻塞 FIFO | ConcurrentLinkedQueue | CAS 链式队列，不提供容量背压 |
| 生产消费与背压 | ArrayBlockingQueue | 有界、可阻塞、容量明确 |
| 延时任务 | DelayQueue | 元素到期后才能取出，无界 |
| 优先级阻塞任务 | PriorityBlockingQueue | 按优先级取出，但默认无界 |

“线程安全集合”范围很大，是否阻塞、是否有界、迭代看什么、复合操作是否原子都不同，不能只根据类名带 Concurrent 就替换。

## 同步包装器的正确遍历

```java
List<String> list = Collections.synchronizedList(new ArrayList<>());

synchronized (list) {
    for (String value : list) {
        consume(value);
    }
}
```

包装器的迭代器本身没有额外加锁，调用方要锁住返回的包装器对象。若锁住原始底层 ArrayList 或另一个对象，就无法与包装器方法互斥。

## 复合操作与跨键约束

```java
map.compute(accountId, (id, balance) -> balance - amount);
```

这可以原子更新一个键，但“从 A 扣款同时给 B 加款”涉及两个键，ConcurrentHashMap 没有跨键事务。可以按稳定顺序锁住账户、使用数据库事务，或通过单线程状态机串行处理。

同理，线程安全 List 的 `size()` 后 `get(size - 1)` 也不是一个原子动作，两个调用之间列表可能改变。API 是否线程安全必须落到完整业务操作上分析。

## 任务队列案例

日志异步写入若使用无界 ConcurrentLinkedQueue，磁盘变慢时生产者继续灌入，最终内存耗尽。改为有界 BlockingQueue 后，还必须定义满队列策略：阻塞业务线程、丢弃低级日志、同步降级写入，还是采样；容器只提供机制，业务必须决定取舍。

## 性能验证

并发容器性能取决于读写比例、键分布、对象大小和 CPU 核数。基准要包含热点键、真实临界区和竞争度，使用 JMH 或压测观察吞吐与 P99，不能用单线程循环推断并发表现。

## 选择原则

低并发且需要简单互斥可用同步包装器；高并发 Map 使用 ConcurrentHashMap；读多写少列表可评估 CopyOnWriteArrayList；需要背压和线程协作选择有界 BlockingQueue。

## 容易踩坑的地方

并发容器不是“完全无锁”，也不会自动保证跨多个键或多个容器的业务原子性。错误的数据结构选择可能只是把锁竞争换成内存或重试成本。

## 常见问题

### 追问：Vector 为什么很少推荐？

它对单个方法做同步，接口老旧且复合操作仍需额外协调。新代码通常按实际语义选择普通集合加明确锁，或专用并发容器。

### 追问：ConcurrentLinkedQueue 为什么不能做背压？

它是无界非阻塞队列，offer 通常不会因容量失败。消费者跟不上时元素持续堆积，必须在外部计数限流，或直接选择有界 BlockingQueue。

### 追问：并发容器能放可变对象吗？

可以，但容器只保护自身结构和引用发布。对象内部字段仍需不可变、锁、volatile 或其他同步保证。

### 追问：何时普通集合加锁更合适？

需要跨多个集合维持复杂不变量、竞争不高且临界区明确时，一把清晰的锁往往比组合多个并发容器更容易证明正确。
