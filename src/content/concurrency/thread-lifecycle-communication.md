---
title: Java 线程有哪些状态？线程间如何通信？
category: Java多线程
categorySlug: concurrency
categoryOrder: 3
order: 4
description: 理解线程状态转换以及 wait、notify、join 和中断的协作方式
updated: 2026-07-23
minutes: 44
level: 基础
prerequisites: [concurrency/thread-pool]
next: [concurrency/cas-aba]
---

# Java 线程有哪些状态？线程间如何通信？

## 面试考察点

- 是否掌握 Java 的六种线程状态及转换条件。
- 能否区分 `wait`、`sleep`、`join` 与中断。
- 是否会用条件循环避免虚假唤醒。

## 核心答案

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

## 常见误区

调用 `start()` 才会启动新线程，直接调用 `run()` 只是当前线程的普通方法调用。`notify` 也不会立即释放锁，只有同步块退出后等待线程才可能继续。

## 高频追问与参考回答

### 追问：为什么更推荐 BlockingQueue？

它把条件等待、唤醒、容量和可见性封装在明确 API 中，比手写 wait/notify 更不容易遗漏边界，并能自然表达生产消费与背压。

### 追问：调用 interrupt 后线程一定立即停止吗？

不一定。正在计算的线程只会设置中断标记，代码需要自行检查；可中断阻塞方法通常抛异常。无法响应中断的第三方调用还需要超时、隔离和进程级恢复策略。

### 追问：notify 能保证唤醒指定线程吗？

不能。它从该对象等待集里任选一个线程，调用方无法指定；有多个条件时应使用不同 Condition，或使用 notifyAll 后由每个线程重新判断条件。

### 追问：线程状态一直是 RUNNABLE 但接口很慢意味着什么？

可能是 CPU 密集循环、JNI/系统调用、忙等或线程在运行队列中等待 CPU。需结合 CPU 火焰图、系统负载和栈帧判断。

## 总结

回答时把状态、锁等待、条件等待和协作式中断串起来，并强调优先使用高层并发工具。

<!-- depth-standard:start -->
## 机制全景图

下面把「Java 线程有哪些状态？线程间如何通信？」从输入到结果压缩成一条可复述的主链路。面试时先用图建立全局坐标，再进入局部实现，能避免只背零散结论。

```mermaid
flowchart LR
    A["创建线程对象"]
    A --> B["start 进入 RUNNABLE"]
    B --> C["竞争锁或等待条件"]
    C --> D["被通知后重新竞争"]
    D --> E["完成任务进入 TERMINATED"]
```

## 完整链路：从输入到结果

沿着「创建线程对象 → start 进入 RUNNABLE → 竞争锁或等待条件 → 被通知后重新竞争 → 完成任务进入 TERMINATED」观察输入、状态与输出，下面每个阶段都对应一个可以在源码、日志或系统表中验证的位置。

### 1. 创建线程对象

NEW 线程尚未启动，同一 Thread 实例只能成功 start 一次。

### 2. start 进入 RUNNABLE

Java 的 RUNNABLE 同时涵盖操作系统可运行与正在运行，不能仅据此判断是否占用 CPU。

### 3. 竞争锁或等待条件

BLOCKED 等待 monitor，WAITING/TIMED_WAITING 常来自 wait、join、park、sleep 等不同机制。

### 4. 被通知后重新竞争

notify/unpark 只是让线程有资格继续，条件必须在循环中重新检查，且共享状态要受同一同步规则保护。

### 5. 完成任务进入 TERMINATED

run 正常返回或抛出未捕获异常后进入 TERMINATED，线程对象不能重启，应重新创建任务或交给执行器。

## 源码与实现定位

| 入口 | 阅读重点 |
| --- | --- |
| java.lang.Thread.State | 六种 JVM 线程状态 |
| ObjectMonitor/LockSupport | wait/notify 与 park/unpark 差异 |

源码或系统表应按上表顺序追踪：先确认入口实际走到哪条路径，再用运行时数据验证，而不是仅凭类名或配置推测。

## 参数配置与可复现实验

```java
synchronized (queue) {
  while (queue.isEmpty()) queue.wait();
  task = queue.remove();
}
```

启动两个消费者和一个生产者，制造伪唤醒/竞争；用 jstack 区分 BLOCKED、WAITING 和 TIMED_WAITING。

## 验证步骤与预期结果

### 1. 固定输入和基线

先在没有故障注入的环境执行上述配置，固定数据规模、并发度、运行时版本和预热时间。以「等待线程数」为主基线，记录值应满足「与空闲消费者一致」；同时保存 各线程状态数量、等待持续时间，使后续变化能够回到同一时间轴比较。

### 2. 从实现入口确认路径

在「java.lang.Thread.State」确认请求确实进入「六种 JVM 线程状态」对应的实现，再沿「ObjectMonitor/LockSupport」观察「wait/notify 与 park/unpark 差异」。如果入口路径都未命中，就不应继续调整下游参数，而应先检查调用条件、版本或路由是否与假设一致。

### 3. 注入本文特有的失败模式

优先复现「用 if 代替 while 等待条件」，并把单一变量逐级放大，直到「等待线程数」越过「请求堆积仍 WAITING」。随后再分别验证「持锁 sleep 导致其他线程无法推进」和「混用 wait 与 park 却没有统一状态协议」，三类故障分开执行，避免多个变量同时变化而无法归因。

### 4. 执行止损和根因修复

第一轮只应用「if wait 改 while」，确认它能控制影响范围；第二轮应用「通知与状态修改放同一锁」，验证核心链路恢复；最后落实「优先 BlockingQueue/CountDownLatch」，消除同类问题再次出现的条件。每一步都保留变更前后数据，不用“感觉变快了”替代测量。

### 5. 通过退出条件

实验只有同时满足三项才算通过：「等待线程数」回到「与空闲消费者一致」、「BLOCKED P99」回到「接近 0」、「通知到运行」回到「受调度但稳定」，并且业务结果差异为零。若性能恢复但结果不一致，仍应视为失败；若指标恢复后很快再次越线，则说明只完成了临时止损，没有消除根因。

## 量化基线

| 指标 | 样例基线/口径 | 风险线 | 结论 |
| --- | --- | --- | --- |
| 等待线程数 | 与空闲消费者一致 | 请求堆积仍 WAITING | 通知/条件错误 |
| BLOCKED P99 | 接近 0 | 持续上升 | 锁竞争 |
| 通知到运行 | 受调度但稳定 | 长尾秒级 | 锁未释放/线程饥饿 |

这些数值是实验口径或示例告警线，不是可复制到所有系统的固定答案；上线阈值应由本系统稳态、峰值和故障演练共同确定。

## 事故复盘：消费者被通知后仍然读取空队列

代码用 if 判断队列为空后 wait，被唤醒时未重新检查条件，多个消费者竞争后其中一个拿走任务，另一个继续执行并失败。改为 while 条件循环，并在同一锁下修改队列和发送通知后才正确。

| 失败模式 | 首要证据 | 第一处置动作 |
| --- | --- | --- |
| 用 if 代替 while 等待条件 | 各线程状态数量 | if wait 改 while |
| 持锁 sleep 导致其他线程无法推进 | 等待持续时间 | 通知与状态修改放同一锁 |
| 混用 wait 与 park 却没有统一状态协议 | 通知到真正运行延迟 | 优先 BlockingQueue/CountDownLatch |

## 发布与回滚检查点

- **发布前**：确认「java.lang.Thread.State」对应实现和上述配置在目标版本仍然有效，并保存「等待线程数」基线。
- **灰度中**：同时观察 各线程状态数量、等待持续时间、通知到真正运行延迟；任一指标越过表中风险线，就停止继续扩量。
- **回滚时**：先执行「if wait 改 while」控制影响，再回退代码或参数；涉及持久状态时必须额外核对结果差异。
- **发布后**：至少覆盖一个完整峰值周期，确认「用 if 代替 while 等待条件」没有再次出现，才关闭变更观察窗口。

## 方案对比与选型

| 方案 | 更适合的场景 | 主要收益 | 代价与边界 |
| --- | --- | --- | --- |
| wait/notify | 同一 monitor 下的底层条件协作 | 无需额外类 | 易丢通知，单条件表达困难 |
| Condition | 显式锁且有多个等待条件 | 条件队列清晰、支持超时中断 | 必须严格持锁调用 |
| BlockingQueue/同步器 | 标准生产消费或阶段协作 | 高层语义、安全成熟 | 需要选择容量与一致性语义 |

选型至少带上 并发线程数、临界区长度、阻塞比例和任务到达速率，并用上面的量化基线验证；未知数据应明确为待测假设。

## 设计边界与工程取舍

> 线程通信的核心不是“唤醒动作”，而是共享条件、状态修改与可见性的统一协议；能用高层并发工具时不要手写通知。

工程落地遵循：先建立 happens-before 与所有权边界，再谈吞吐和无锁优化。回答时直接引用「java.lang.Thread.State」、配置实验和事故数据，比复述固定模板更有说服力。
<!-- depth-standard:end -->
