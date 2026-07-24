---
title: Java 线程有哪些状态？线程间如何通信？
category: Java多线程
categorySlug: concurrency
categoryOrder: 3
order: 4
description: 理解线程状态转换以及 wait、notify、join 和中断的协作方式
updated: 2026-07-23
minutes: 8
level: 基础
prerequisites: [concurrency/thread-pool]
next: [concurrency/cas-aba]
---

# Java 线程有哪些状态？线程间如何通信？

## 先说结论

> Java 线程有 NEW、RUNNABLE、BLOCKED、WAITING、TIMED_WAITING 和 TERMINATED 六种状态。线程协作可以使用监视器的 wait/notify、Lock 的 Condition、join、中断标记以及并发工具类；生产代码通常优先高层并发组件。

Java 的 RUNNABLE 同时包含操作系统层面的就绪和运行。BLOCKED 表示等待进入 `synchronized`，WAITING 则可能在等待通知、join 或同步器信号。

## 关键机制

`wait` 必须在持有对应监视器时调用，并会释放该锁；`sleep` 不要求持锁，也不会主动释放已持有的锁。`notify` 只唤醒一个等待者，`notifyAll` 唤醒全部等待者重新竞争。

## 六种状态如何区分

| 状态 | 含义 | 常见触发 |
| --- | --- | --- |
| NEW | 已创建，尚未启动 | `new Thread(...)` |
| RUNNABLE | 可以被 JVM 调度运行 | 执行计算、等待 OS 调度、部分本地 I/O |
| BLOCKED | 等待进入监视器锁 | 竞争 `synchronized` |
| WAITING | 无限期等待其他线程动作 | `Object.wait()`、`Thread.join()`、`LockSupport.park()` |
| TIMED_WAITING | 有时限等待 | `sleep`、带超时 wait/join/park |
| TERMINATED | run 方法结束 | 正常返回或未捕获异常退出 |

JVM 的状态不是操作系统线程状态的逐字映射。例如 Java 的 RUNNABLE 可能实际正在运行，也可能已就绪等待 CPU；排查时要结合线程栈、CPU、锁拥有者和 I/O 指标，而不能仅凭状态下结论。

## 正确的条件等待代码

```java
class BoundedBuffer<T> {
    private final Queue<T> queue = new ArrayDeque<>();
    private final int capacity;

    synchronized void put(T item) throws InterruptedException {
        while (queue.size() == capacity) {
            wait();
        }
        queue.add(item);
        notifyAll();
    }

    synchronized T take() throws InterruptedException {
        while (queue.isEmpty()) {
            wait();
        }
        T item = queue.remove();
        notifyAll();
        return item;
    }
}
```

必须使用 while 而不是 if：线程可能虚假唤醒，也可能在被 notifyAll 唤醒后，条件已被其他竞争者再次改变。`notifyAll` 虽会造成额外竞争，但在存在多个不同等待条件时更不容易发生“唤醒了错误线程后所有人继续等待”的死锁。

## wait、sleep、join、park 对比

| API | 是否释放已持有监视器 | 需要什么前提 | 主要用途 |
| --- | --- | --- | --- |
| wait | 是 | 持有对应对象监视器 | 等待业务条件变化 |
| sleep | 否 | 无 | 暂停当前线程一段时间 |
| join | 调用方等待目标线程结束 | 目标线程对象 | 等待线程生命周期结束 |
| park | 不强制关联监视器 | 无 | 同步器底层阻塞与许可机制 |

不要用 `Thread.sleep` 轮询另一个线程是否完成，既浪费延迟又难以及时取消；可用 Future、CountDownLatch、CompletableFuture 或条件变量表达明确依赖。

## 中断的正确处理

中断不是强制杀线程，而是一面协作标记。阻塞在 wait、sleep、join 等可中断方法上的线程会收到 InterruptedException，并清除中断标记；捕获后应继续抛出，或在无法抛出的接口中恢复：

```java
catch (InterruptedException e) {
    Thread.currentThread().interrupt();
    return;
}
```

吞掉中断会让线程池关闭、超时取消和应用停机无法及时生效。CPU 密集循环也要主动检查 `isInterrupted()` 并尽快退出。

## 线上排查路径

线程池请求堆积时，先看活跃线程是否 BLOCKED 在同一锁、WAITING 在队列、TIMED_WAITING 在不合理 sleep，还是 RUNNABLE 但 CPU 已满。连续抓取多份线程转储比单份更有价值：同一栈帧长时间不变才说明真正卡住。

## 正确协作

等待条件要写成 `while (!condition) wait()`，被唤醒后重新检查条件。中断是协作式取消信号，捕获 `InterruptedException` 后应向上抛出或恢复中断状态，不能静默吞掉。

## 容易踩坑的地方

调用 `start()` 才会启动新线程，直接调用 `run()` 只是当前线程的普通方法调用。`notify` 也不会立即释放锁，只有同步块退出后等待线程才可能继续。

## 常见问题

### 追问：为什么更推荐 BlockingQueue？

它把条件等待、唤醒、容量和可见性封装在明确 API 中，比手写 wait/notify 更不容易遗漏边界，并能自然表达生产消费与背压。

### 追问：调用 interrupt 后线程一定立即停止吗？

不一定。正在计算的线程只会设置中断标记，代码需要自行检查；可中断阻塞方法通常抛异常。无法响应中断的第三方调用还需要超时、隔离和进程级恢复策略。

### 追问：notify 能保证唤醒指定线程吗？

不能。它从该对象等待集里任选一个线程，调用方无法指定；有多个条件时应使用不同 Condition，或使用 notifyAll 后由每个线程重新判断条件。

### 追问：线程状态一直是 RUNNABLE 但接口很慢意味着什么？

可能是 CPU 密集循环、JNI/系统调用、忙等或线程在运行队列中等待 CPU。需结合 CPU 火焰图、系统负载和栈帧判断。
