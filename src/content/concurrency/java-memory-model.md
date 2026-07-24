---
title: Java 内存模型和 happens-before 规则是什么？
category: Java多线程
categorySlug: concurrency
categoryOrder: 3
order: 9
description: 从原子性、可见性、有序性和安全发布理解并发正确性
updated: 2026-07-23
minutes: 7
level: 进阶
prerequisites: [concurrency/volatile-happens-before]
next: [concurrency/virtual-threads]
---

# Java 内存模型和 happens-before 规则是什么？

## 先说结论

> Java 内存模型规定线程如何通过内存交互，以及哪些执行结果是合法的。happens-before 是可见性与顺序保证：如果 A happens-before B，则 A 的结果对 B 可见，且 A 在逻辑顺序上先于 B。

常见规则包括程序次序、监视器解锁先于后续加锁、volatile 写先于后续读、线程 `start` 前操作先于新线程、线程内操作先于其他线程成功 `join` 返回，以及传递性。

## 三个核心问题

原子性表示操作不可被观察到中间状态；可见性表示一个线程写入能被另一个线程看到；有序性限制编译器和处理器重排对程序结果的影响。`volatile` 解决可见性和特定顺序，不保证 `count++` 原子。

## 常用 happens-before 规则表

| 规则 | 保证的关系 | 常见用途 |
| --- | --- | --- |
| 程序次序 | 单线程前面操作先于后面操作 | 保持单线程语义 |
| 监视器锁 | unlock 先于后续同锁 lock | synchronized 临界区发布 |
| volatile | 写先于后续对同变量读 | 状态标记、不可变快照引用 |
| 线程启动 | start 前操作先于新线程动作 | 初始化后启动工作线程 |
| 线程终止 | 线程动作先于 join 返回 | 等待任务结果后读取 |
| 传递性 | A->B 且 B->C，则 A->C | 组合并发推理 |

这套规则是语言规范的推理工具，不要求开发者手写内存屏障。JVM 会在不同 CPU 上生成恰当屏障或利用硬件已有顺序，保证程序满足规则。

## 可见性错误示例

```java
class Worker {
    private boolean running = true;

    void loop() {
        while (running) {
            // JIT 可能把读取提升或缓存，另一个线程的写入不一定可见
        }
    }

    void stop() { running = false; }
}
```

把 running 声明为 volatile 后，stop 的写 happens-before loop 后续读取，循环才能按 JMM 规则看到停止信号。若循环还要同时读取多个字段，单独给每个字段加 volatile 可能看到组合状态不一致，应把它们封装为不可变配置对象并原子替换引用。

## 为什么 count++ 不安全

`count++` 包含读取、加法、写回至少三步。volatile 只能让每次读写可见，两个线程仍可能读到同一个旧值并写回相同的新值。需要 AtomicInteger、LongAdder 或锁来保证复合更新的原子性。

## final 字段与安全构造

正确构造的对象中，final 字段在构造器结束后有额外的可见性保证。但若构造器中把 `this` 发布到全局、启动线程或注册回调，其他线程仍可能在构造完成前观察到对象，破坏安全发布。

```java
class BadListener {
    final int port;
    BadListener(EventBus bus) {
        bus.register(this); // this 过早逃逸
        this.port = 8080;
    }
}
```

应先完成构造，再由工厂或装配层发布对象。不可变对象加正确发布是最容易推理的并发模型之一。

## 双重检查单例的正确形态

```java
private static volatile Service instance;

static Service getInstance() {
    if (instance == null) {
        synchronized (Service.class) {
            if (instance == null) {
                instance = new Service();
            }
        }
    }
    return instance;
}
```

没有 volatile 时，对象内存分配、构造和引用赋值允许被观察到危险重排，其他线程可能拿到还未完成构造的对象。更简单的替代通常是静态内部类、枚举单例或依赖注入容器。

## 安全发布

对象应通过锁、volatile 引用、静态初始化、并发容器或正确构造的 final 字段规则发布。构造期间让 `this` 逃逸，其他线程可能看到未完整初始化的状态。

## 容易踩坑的地方

happens-before 不是实际时钟上的先后，也不要求禁止所有重排；只要不破坏规范允许的观察结果，JVM 仍可优化。单线程测试稳定不能证明不存在数据竞争。

## 常见问题

### 追问：双重检查单例为什么要 volatile？

它既保证实例引用可见，也阻止对象初始化与引用发布发生危险重排，避免其他线程拿到尚未正确构造的对象。

### 追问：synchronized 是否同时保证三性？

进入和退出同一监视器建立可见性与顺序，临界区使受保护代码的执行互斥，因此可用于复合操作的原子性。前提是所有访问都遵守同一把锁。

### 追问：线程安全的单例一定需要 volatile 吗？

不一定。类初始化、枚举和完全同步访问都能保证安全发布。volatile 是双重检查写法所需的关键条件，而不是所有单例的必选项。

### 追问：为什么在 x86 上不加 volatile 经常也“没问题”？

某些硬件顺序较强、测试时机偶然有利，但 JMM 允许的重排和编译器优化仍可能出错。并发正确性必须基于规范保证，不基于某一机器上的偶然现象。
