---
title: synchronized、ReentrantLock 与 AQS 原理
category: Java多线程
categorySlug: concurrency
categoryOrder: 3
order: 3
description: 理解监视器锁、显式锁、可重入、公平性以及 AQS 同步队列
updated: 2026-07-23
minutes: 4
level: 进阶
---

# synchronized、ReentrantLock 与 AQS 原理

## 先说结论

普通互斥同步优先使用 `synchronized`，语法简单且能自动释放锁。需要可中断获取、超时尝试、公平锁或多个条件队列时，使用 `ReentrantLock`。

```java
lock.lock();
try {
    updateState();
} finally {
    lock.unlock();
}
```

显式锁必须在 `finally` 中释放，否则异常会造成永久占锁。

## synchronized 锁住了什么

- 实例同步方法锁当前对象。
- 静态同步方法锁对应的 `Class` 对象。
- 同步代码块锁括号中指定的对象。

进入同步块不仅提供互斥，还建立 happens-before 关系：一次解锁先行发生于后续对同一监视器的加锁，因此锁内写入对后续持锁线程可见。

## 可重入与公平性

可重入表示线程持有锁时，可以再次获得同一把锁，内部会维护持有次数。`synchronized` 和 `ReentrantLock` 都可重入。

公平锁倾向于让等待时间最长的线程先获得锁，可以减少饥饿，但会降低吞吐量。非公平锁允许刚到达的线程竞争，减少线程切换，通常性能更高。公平也不等于绝对调度顺序。

## AQS 的核心模型

`AbstractQueuedSynchronizer` 使用一个 `state` 状态值和一个等待队列构建同步器。线程先通过 CAS 尝试修改状态；失败后包装为节点进入队列，并在合适时机被前驱节点唤醒。

独占模式同一时刻只允许一个线程成功，共享模式允许多个线程通过。`ReentrantLock`、`Semaphore`、`CountDownLatch` 等都基于 AQS，但对 `state` 的解释不同。

## Condition 条件队列

`Condition` 类似 `wait/notify`，但一把锁可以创建多个条件队列，让等待原因更加明确。

```java
while (queue.isEmpty()) {
    notEmpty.await();
}
var value = queue.remove();
notFull.signal();
```

条件判断必须使用 `while`，因为线程被唤醒后条件可能已被其他线程改变，也需要防御虚假唤醒。

## 常见并发问题

死锁通常满足互斥、占有且等待、不可剥夺和循环等待四个条件。工程上可以通过统一加锁顺序、缩小锁范围、使用 `tryLock` 超时和避免锁内慢 IO 降低风险。

锁粒度过大会限制并发，过小会增加协调复杂度。优化前应通过线程 dump、指标和压测确认竞争热点，不要仅凭感觉拆锁。

## 常见问题

### 追问：公平锁一定公平吗？

公平锁倾向按等待顺序获取，但线程调度仍受操作系统影响；它减少饥饿却增加切换，吞吐通常低于非公平锁。

### 追问：sleep 和 wait 有何区别？

`sleep` 是 Thread 的时间等待且不释放已持有锁；`wait` 必须在监视器内调用，会释放该监视器并等待通知。
