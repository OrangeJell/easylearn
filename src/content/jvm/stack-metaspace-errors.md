---
title: StackOverflowError 和 Metaspace OOM 如何排查？
category: JVM
categorySlug: jvm
categoryOrder: 4
order: 9
description: 区分栈溢出、元空间耗尽的典型原因、证据和治理方式
updated: 2026-07-23
minutes: 6
level: 进阶
prerequisites: [jvm/runtime-data-area, jvm/production-oom-troubleshooting]
next: [jvm/jit-compiler]
---

# StackOverflowError 和 Metaspace OOM 如何排查？

## 先说结论

> StackOverflowError 通常来自无限递归、递归层数过深或单栈帧过大，应从重复调用栈找终止条件和调用环。Metaspace OOM 表示类元数据无法继续分配，常见原因是动态生成大量类、类加载器泄漏或上限过小。

线程过多更常表现为无法创建本地线程或进程内存耗尽，不应和单个线程的 StackOverflowError 混为一谈。

## 排查栈溢出

保留完整异常栈，观察是否有固定方法序列反复出现。修复优先消除递归环、改为迭代或限制输入深度；盲目增大 `-Xss` 会增加每线程内存预算并降低可创建线程数。

## 常见错误类型对照

| 现象 | 典型异常/日志 | 首先关注 |
| --- | --- | --- |
| 单线程递归过深 | `StackOverflowError` | 重复方法序列、输入深度、终止条件 |
| 线程太多 | `unable to create native thread` | 线程数、Xss、进程/容器限制 |
| 类元数据耗尽 | `OutOfMemoryError: Metaspace` | 类数量、ClassLoader 生命周期、动态生成 |
| 堆对象过多 | `OutOfMemoryError: Java heap space` | 堆转储、对象引用链、缓存与队列 |

先区分错误类型能避免完全错误的参数调整。例如把 StackOverflowError 当 heap OOM 调大 Xmx 通常毫无帮助。

## 递归问题的系统处理

递归可能来自树遍历，也可能来自 `toString`、序列化、AOP 代理互相调用或 equals/hashCode 循环。异常栈中重复的两三个方法常是最强线索。对可控输入设置最大嵌套层数；对图结构增加 visited 集合；对大树遍历用显式 Deque 改写为迭代。

```java
Deque<Node> stack = new ArrayDeque<>();
stack.push(root);
while (!stack.isEmpty()) {
    Node node = stack.pop();
    visit(node);
    node.children().forEach(stack::push);
}
```

迭代不一定更优雅，但它把调用深度从线程栈转移到可显式控制的数据结构，便于设置容量、取消和监控。

## 元空间泄漏案例

运行时生成代理类本身不必然泄漏。危险在于每次热更新都创建新的 ClassLoader，旧加载器却被全局线程、JDBC Driver、静态单例、MBean、Timer 或 ThreadLocal 引用。Metaspace 随部署次数阶梯增长，Full GC 后也无法下降，是典型信号。

排查时比较不同时间点的 ClassLoader 实例数和已加载类数量，抓 Heap Dump 查看旧加载器的 GC Root。修复要断开引用链并停止旧线程，而不是只调用卸载或增大 MaxMetaspaceSize。

## 参数调整的边界

`-Xss` 要结合最大线程数算总预算；`MaxMetaspaceSize` 可作为保护上限和告警触发点，但太小会提前失败，太大可能掩盖泄漏直到容器被 OOM kill。任何参数调整后都要通过压力或多轮热部署验证曲线是否收敛。

## 排查元空间

检查已加载类数量、类加载趋势和 class loader 统计，使用类直方图、JFR 或堆转储寻找持有旧加载器的引用。热部署、脚本引擎、代理生成和缓存未清理都是高风险位置。

## 容易踩坑的地方

Metaspace 使用本地内存，但类加载器对象仍在堆上；只提高 `MaxMetaspaceSize` 可能延迟故障而不解决加载器泄漏。类卸载通常还依赖对应加载器不可达和 GC 条件。

## 常见问题

### 追问：为什么加大 Xss 不是首选？

它只让更深调用暂时可运行，无法修复无限递归，而且会放大每个线程的内存占用，应先确认调用深度是否合理。

### 追问：StackOverflowError 能被 catch 后继续运行吗？

技术上可捕获 Error，但栈空间已接近耗尽，继续在同一调用链做复杂恢复不可靠。应在最外层记录现场并终止当前请求或任务，根治递归原因。

### 追问：为什么动态代理会增加 Metaspace？

代理框架可能为每种代理形态生成新类定义，类元数据保存在元空间。正常复用加载器和代理定义时增长应受控，反复创建加载器或无限变化签名会持续增长。

### 追问：类卸载时是否会立即归还操作系统内存？

类元数据可被回收，但 JVM 可能保留已申请的本地内存供后续复用，进程 RSS 不一定立即等比例下降。判断泄漏看趋势和可达性，而非单次 RSS。
