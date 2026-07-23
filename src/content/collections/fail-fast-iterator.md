---
title: fail-fast 和 fail-safe 迭代器有什么区别？
category: Java集合
categorySlug: collections
categoryOrder: 2
order: 5
description: 理解结构修改检测、弱一致遍历以及并发修改异常的正确处理方式
updated: 2026-07-23
minutes: 41
level: 基础
prerequisites: [collections/arraylist-linkedlist]
next: [collections/copy-on-write-arraylist]
---

# fail-fast 和 fail-safe 迭代器有什么区别？

## 面试考察点

- 是否理解 `modCount` 与结构修改检测。
- 能否区分并发容器的快照或弱一致遍历。
- 是否知道 `ConcurrentModificationException` 不是并发安全机制。

## 核心答案

> ArrayList、HashMap 等普通集合的迭代器通常是 fail-fast：迭代器记录预期修改次数，发现集合被非迭代器路径结构性修改时尽快抛出异常。并发容器通常提供快照或弱一致迭代，不抛该异常但也不承诺强一致快照。

“fail-safe”不是 Java 集合 API 的正式术语，面试中应进一步说明具体容器到底是复制快照还是弱一致读取。

## 关键机制

结构修改通常指改变元素数量或桶结构，替换某个已有位置的值未必触发检测。修改次数检查是尽力而为，不能依赖它发现所有竞态。

## modCount 如何工作

创建 ArrayList 迭代器时，它把集合当前 `modCount` 保存为 `expectedModCount`。每次 `next`、`remove` 等操作都会检查二者：

```java
if (modCount != expectedModCount) {
    throw new ConcurrentModificationException();
}
```

通过迭代器自己的 `remove` 删除后，迭代器会同步更新 expectedModCount，所以这是合法路径。直接调用原集合 `remove` 只改变 modCount，下一次迭代检查就会失败。

这不是完整并发检测协议：计数通常不是 volatile，溢出、竞态和检查时机都可能让异常没有立即出现。Java 文档明确不保证用它判断程序线程安全。

## 三种遍历一致性

| 类型 | 代表容器 | 遍历期间修改后的观察 |
| --- | --- | --- |
| fail-fast | ArrayList、HashMap | 尽力抛出并发修改异常 |
| 快照 | CopyOnWriteArrayList | 始终读取创建迭代器时的数组 |
| 弱一致 | ConcurrentHashMap、ConcurrentLinkedQueue | 可看到部分后续变化，不重复或损坏容器结构 |

“弱一致”不等于随机错误，而是容器定义了在不冻结全局状态的前提下可安全遍历。具体是否能看到新增或删除，要以对应类型文档为准。

## 正确删除示例

```java
Iterator<Order> iterator = orders.iterator();
while (iterator.hasNext()) {
    if (iterator.next().expired()) {
        iterator.remove();
    }
}

// 表达简单过滤时更清楚
orders.removeIf(Order::expired);
```

Stream 管道中也不要同时修改来源集合。需要转换时收集到新集合；需要并发消费时使用队列或先建立稳定快照。

## 线上常见问题

一个定时任务遍历普通 HashMap，另一个请求线程更新它，偶尔抛出异常只是表象。即使改成捕获异常重试，也可能读取不一致数据或无限重试。正确修复是明确共享状态所有权：加锁、换并发容器、不可变快照原子替换，或让单线程负责所有更新。

## 正确修改方式

单线程遍历删除使用 `Iterator.remove()` 或 `removeIf()`。多线程共享数据应选择合适并发容器并设计一致性语义，而不是捕获异常后重试。

## 常见误区

即使只有一个线程，在增强 for 循环里直接调用集合的 `remove` 也可能抛异常；原因是修改路径绕过了当前迭代器，并非一定存在多线程。

## 高频追问与参考回答

### 追问：CopyOnWriteArrayList 迭代时能看到新增元素吗？

不能。迭代器持有创建时的数组快照，后续写入复制到新数组，不影响当前迭代过程。

### 追问：为什么修改 list.set(i, value) 不一定抛异常？

它通常不改变集合结构和元素数量，因此不递增 modCount。但迭代器读到旧值还是新值不能作为线程安全保证。

### 追问：ConcurrentHashMap 遍历会重复同一个元素吗？

它提供弱一致迭代，不抛并发修改异常，也不会因为并发更新破坏内部结构。对变化的精确观察边界应以 JDK 契约为准，业务不能把遍历结果当原子快照。

### 追问：如何获得并发 Map 的一致快照？

ConcurrentHashMap 没有免费全局快照。可以在外部停止写入或持有统一锁后复制；也可以让写线程发布版本化不可变 Map，以更高写成本换稳定读取。

## 总结

fail-fast 用于尽早暴露错误，快照和弱一致遍历用于可用性；二者都不能替代业务层的一致性设计。

<!-- depth-standard:start -->
## 机制全景图

下面把「fail-fast 和 fail-safe 迭代器有什么区别？」从输入到结果压缩成一条可复述的主链路。面试时先用图建立全局坐标，再进入局部实现，能避免只背零散结论。

```mermaid
flowchart LR
    A["创建迭代器并记录版本"]
    A --> B["读取下一个元素"]
    B --> C["比较结构修改计数"]
    C --> D["发现不一致抛异常"]
    D --> E["通过迭代器安全删除"]
```

## 完整链路：从输入到结果

沿着「创建迭代器并记录版本 → 读取下一个元素 → 比较结构修改计数 → 发现不一致抛异常 → 通过迭代器安全删除」观察输入、状态与输出，下面每个阶段都对应一个可以在源码、日志或系统表中验证的位置。

### 1. 创建迭代器并记录版本

迭代器创建时保存集合 modCount，只有结构性修改通常会递增该计数。

### 2. 读取下一个元素

next 不只是返回元素，还检查当前位置、边界与预期版本。

### 3. 比较结构修改计数

集合被其他路径结构修改后，expectedModCount 与 modCount 不同，尽力抛出 ConcurrentModificationException。

### 4. 发现不一致抛异常

fail-fast 是缺陷探测机制而非并发保证，竞态下不承诺百分之百检测，也不能用捕获异常恢复业务。

### 5. 通过迭代器安全删除

Iterator.remove 会同步更新集合与迭代器版本，因此是单线程遍历删除的合法方式。

## 源码与实现定位

| 入口 | 阅读重点 |
| --- | --- |
| java.util.ArrayList.Itr#checkForComodification | expectedModCount 与 modCount |
| java.util.Collection#removeIf | 迭代协议内批量删除 |

源码或系统表应按上表顺序追踪：先确认入口实际走到哪条路径，再用运行时数据验证，而不是仅凭类名或配置推测。

## 参数配置与可复现实验

```java
for (Iterator<Order> it = orders.iterator(); it.hasNext();) {
  if (expired(it.next())) it.remove();
}
```

分别在增强 for、Iterator.remove、removeIf 与并发写下执行删除，记录结果和异常；证明异常不是可靠并发检测。

## 验证步骤与预期结果

### 1. 固定输入和基线

先在没有故障注入的环境执行上述配置，固定数据规模、并发度、运行时版本和预热时间。以「modCount 差异」为主基线，记录值应满足「合法迭代始终一致」；同时保存 并发修改异常堆栈、集合修改来源，使后续变化能够回到同一时间轴比较。

### 2. 从实现入口确认路径

在「java.util.ArrayList.Itr#checkForComodification」确认请求确实进入「expectedModCount 与 modCount」对应的实现，再沿「java.util.Collection#removeIf」观察「迭代协议内批量删除」。如果入口路径都未命中，就不应继续调整下游参数，而应先检查调用条件、版本或路由是否与假设一致。

### 3. 注入本文特有的失败模式

优先复现「把 fail-fast 当成线程安全机制」，并把单一变量逐级放大，直到「modCount 差异」越过「直接集合修改后不一致」。随后再分别验证「捕获异常后从头重试造成活锁」和「只修改元素字段却误判为结构修改」，三类故障分开执行，避免多个变量同时变化而无法归因。

### 4. 执行止损和根因修复

第一轮只应用「单线程删除用 removeIf/Iterator.remove」，确认它能控制影响范围；第二轮应用「并发读取选快照或并发集合」，验证核心链路恢复；最后落实「删除 catch-and-retry 反模式」，消除同类问题再次出现的条件。每一步都保留变更前后数据，不用“感觉变快了”替代测量。

### 5. 通过退出条件

实验只有同时满足三项才算通过：「modCount 差异」回到「合法迭代始终一致」、「重试次数」回到「目标为 0」、「快照陈旧窗口」回到「由业务明确」，并且业务结果差异为零。若性能恢复但结果不一致，仍应视为失败；若指标恢复后很快再次越线，则说明只完成了临时止损，没有消除根因。

## 量化基线

| 指标 | 样例基线/口径 | 风险线 | 结论 |
| --- | --- | --- | --- |
| modCount 差异 | 合法迭代始终一致 | 直接集合修改后不一致 | 改迭代器 API |
| 重试次数 | 目标为 0 | catch 后循环重试 | 重新设计同步 |
| 快照陈旧窗口 | 由业务明确 | 超过容忍时间 | 缩短复制/换并发结构 |

这些数值是实验口径或示例告警线，不是可复制到所有系统的固定答案；上线阈值应由本系统稳态、峰值和故障演练共同确定。

## 事故复盘：过滤列表时偶发 ConcurrentModificationException

代码在增强 for 中直接调用 list.remove，修改了集合版本但迭代器不知道。单线程场景改用 removeIf 或 Iterator.remove；并发场景则重新定义快照、锁或并发集合语义，而不是 catch 后重跑。

| 失败模式 | 首要证据 | 第一处置动作 |
| --- | --- | --- |
| 把 fail-fast 当成线程安全机制 | 并发修改异常堆栈 | 单线程删除用 removeIf/Iterator.remove |
| 捕获异常后从头重试造成活锁 | 集合修改来源 | 并发读取选快照或并发集合 |
| 只修改元素字段却误判为结构修改 | 重试次数 | 删除 catch-and-retry 反模式 |

## 发布与回滚检查点

- **发布前**：确认「java.util.ArrayList.Itr#checkForComodification」对应实现和上述配置在目标版本仍然有效，并保存「modCount 差异」基线。
- **灰度中**：同时观察 并发修改异常堆栈、集合修改来源、重试次数；任一指标越过表中风险线，就停止继续扩量。
- **回滚时**：先执行「单线程删除用 removeIf/Iterator.remove」控制影响，再回退代码或参数；涉及持久状态时必须额外核对结果差异。
- **发布后**：至少覆盖一个完整峰值周期，确认「把 fail-fast 当成线程安全机制」没有再次出现，才关闭变更观察窗口。

## 方案对比与选型

| 方案 | 更适合的场景 | 主要收益 | 代价与边界 |
| --- | --- | --- | --- |
| Iterator.remove/removeIf | 单线程遍历期间删除 | 遵守迭代协议、代码清晰 | 复杂复合修改仍需谨慎 |
| 复制快照后遍历 | 读视图可稍旧且集合规模可控 | 遍历不受后续写影响 | 复制内存与一致性延迟 |
| 并发集合弱一致迭代 | 并发读写且允许看到部分更新 | 不抛 fail-fast、无需全局锁 | 视图不是固定时点快照 |

选型至少带上 元素数量、读写比例、遍历方式、并发度和内存预算，并用上面的量化基线验证；未知数据应明确为待测假设。

## 设计边界与工程取舍

> ConcurrentModificationException 的目标是尽早暴露错误使用，不是可靠的业务检测协议；真正并发访问必须选择明确的同步或快照策略。

工程落地遵循：先保证数据结构语义正确，再依据访问模式选择实现。回答时直接引用「java.util.ArrayList.Itr#checkForComodification」、配置实验和事故数据，比复述固定模板更有说服力。
<!-- depth-standard:end -->
