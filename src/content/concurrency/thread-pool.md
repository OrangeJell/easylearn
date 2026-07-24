---
title: Java 线程池有几种创建方式？
category: Java多线程
categorySlug: concurrency
categoryOrder: 3
order: 1
description: 从 execute 流程、队列策略到生产配置
updated: 2026-07-23
minutes: 6
level: 进阶
---

# Java 线程池有几种创建方式？

## 先说结论

> Java 可以通过 Executors 工厂方法、ThreadPoolExecutor、ScheduledThreadPoolExecutor 和 ForkJoinPool 创建不同类型的执行器；生产环境通常推荐手动构造 ThreadPoolExecutor，明确资源边界。

## execute 的执行流程

提交任务后，ThreadPoolExecutor 会按顺序判断：

1. 当前线程数小于 `corePoolSize`：创建核心线程执行任务，即使已有核心线程空闲。
2. 核心线程已达到上限：尝试将任务放入 `workQueue`。
3. 队列放不下且线程数小于 `maximumPoolSize`：创建非核心线程。
4. 队列已满且线程数达到最大值：调用拒绝策略。

这意味着线程池不会一开始就把线程创建到最大值，队列容量会影响何时开始扩容。

## 七个核心参数

| 参数 | 作用 | 配置关注点 |
| --- | --- | --- |
| `corePoolSize` | 常驻核心线程数 | 任务的稳定处理能力 |
| `maximumPoolSize` | 最大线程数 | 峰值并发和下游承载 |
| `keepAliveTime` | 非核心线程空闲存活时间 | 峰值后的资源回收 |
| `workQueue` | 保存等待任务 | 有界、容量、顺序 |
| `threadFactory` | 创建和命名线程 | 线程名、优先级、异常处理 |
| `handler` | 任务无法接收时的处理器 | 失败、降级或反压策略 |

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    8, 16, 60, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(1000),
    new NamedThreadFactory("order-worker"),
    new ThreadPoolExecutor.CallerRunsPolicy()
);
```

## 队列策略如何影响线程池？

`SynchronousQueue` 不保存任务，适合直接移交，但可能造成线程快速增长；无界 `LinkedBlockingQueue` 会让任务持续排队，通常使最大线程数几乎不起作用；有界队列能给系统建立明确的内存和延迟上限，更适合核心业务。

队列不是越大越好。队列过大可能掩盖消费速度不足，最终带来更长延迟；队列过小又可能频繁触发拒绝。应该结合任务耗时、请求峰值和下游容量压测。

## 拒绝策略

- `AbortPolicy`：抛出异常，适合必须让调用方感知失败的任务。
- `CallerRunsPolicy`：由提交任务的线程执行，形成自然反压。
- `DiscardPolicy`：静默丢弃，只适用于明确允许丢失的任务。
- `DiscardOldestPolicy`：丢弃队头任务后重试，适合旧任务价值较低的场景。

## 线程数怎么设置？

CPU 密集型任务通常从接近 CPU 核数开始；IO 密集型任务可以更高，但不能只套公式。应观察 CPU 使用率、上下文切换、队列长度、任务等待时间、拒绝次数和下游 RT。

线程池还应配置有意义的线程名、统一异常处理和关闭流程。应用停止时调用 `shutdown()`，必要时在超时后调用 `shutdownNow()`，不要让工作线程无限期存活。

## Executors 为什么要谨慎？

工厂方法适合快速原型，但固定线程池和单线程池默认使用近似无界队列，缓存线程池的最大线程数也非常大。生产环境如果不明确边界，任务堆积或突发流量可能耗尽内存或线程资源。

## 参考资料

- [Oracle Java SE 21 ThreadPoolExecutor API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [Oracle Java Concurrency Utilities](https://docs.oracle.com/en/java/javase/21/core/java-concurrency.html)

## 常见问题

### 追问：CPU 密集与 IO 密集线程数如何设置？

CPU 密集通常接近核数，IO 密集可根据等待时间比例适当增加。公式只是起点，最终要用生产任务模型压测，并观察 CPU、队列和下游容量。

### 追问：execute 和 submit 有什么区别？

`execute` 接收 Runnable，异常通常交给线程的未捕获异常处理器；`submit` 返回 Future，任务异常会封装在 Future 中，若从不 `get` 容易被忽略。
