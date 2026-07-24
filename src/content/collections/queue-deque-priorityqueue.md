---
title: Queue、Deque 和 PriorityQueue 应该怎么用？
category: Java集合
categorySlug: collections
categoryOrder: 2
order: 7
description: 掌握队列与双端队列 API、堆结构及优先队列的复杂度和边界
updated: 2026-07-23
minutes: 6
level: 基础
prerequisites: [collections/arraylist-linkedlist]
next: [collections/comparable-comparator]
---

# Queue、Deque 和 PriorityQueue 应该怎么用？

## 先说结论

> Queue 表示先进先出语义，Deque 支持两端插入删除并可替代旧的 Stack；PriorityQueue 基于二叉堆，每次能以 O(1) 查看最小或最大优先级元素，插入和删除堆顶为 O(log n)。

`add/remove/element` 失败时抛异常，`offer/poll/peek` 返回布尔值或 null；在容量受限和业务循环中通常优先使用后一组。

## 关键机制

PriorityQueue 的数组只满足父节点优先级不低于子节点，并非排序数组。遍历结果不保证顺序，要按优先级取出必须反复 `poll`，但这会消费队列。

## Queue API 两套语义

| 操作 | 失败抛异常 | 失败返回特殊值 |
| --- | --- | --- |
| 插入 | `add(e)` | `offer(e)` |
| 删除队头 | `remove()` | `poll()` |
| 查看队头 | `element()` | `peek()` |

对无界普通队列，add 和 offer 看起来差不多；对有界 BlockingQueue，offer 能通过 false、超时或阻塞版本明确表达容量不足，适合背压处理。

## ArrayDeque 为什么通用

ArrayDeque 使用循环数组维护头尾索引，两端增删摊销 O(1)，缓存局部性通常优于链表。它既能表达队列：

```java
Deque<Task> queue = new ArrayDeque<>();
queue.offerLast(task);
Task next = queue.pollFirst();
```

也能表达栈：

```java
Deque<Node> stack = new ArrayDeque<>();
stack.push(root);       // 等价于 addFirst
Node node = stack.pop();
```

方法名应和语义一致，队列代码使用 offer/poll，栈代码使用 push/pop，避免同一个 Deque 中混搭方向导致错误。

## PriorityQueue 的堆结构

最小堆中，索引 i 的子节点通常位于 `2i + 1` 和 `2i + 2`。插入把元素放到数组末尾并向上调整，删除堆顶后用末尾元素填补再向下调整，所以插入和 poll 都是 O(log n)，peek 是 O(1)。

```java
PriorityQueue<Job> jobs = new PriorityQueue<>(
    Comparator.comparingInt(Job::priority)
              .thenComparing(Job::createdAt)
);
```

比较器必须在元素进入队列后保持稳定。若修改 priority，堆不会自动重排；应删除再插入，或放入不可变调度条目。

## BlockingQueue 与背压

ArrayBlockingQueue 容量固定且数组连续；LinkedBlockingQueue 可设容量但默认很大；SynchronousQueue 不存元素，每次交付都要与消费者直接配对。线程池队列选择会决定系统是排队、扩线程还是拒绝任务。

有界队列能把过载变成可观察的 offer 失败或等待，而无界队列可能把问题推迟成延迟持续增长和 OOM。

## 选择原则

普通 FIFO 使用 ArrayDeque；两端操作或单调队列也用 Deque；任务调度、Top K 和多路归并适合 PriorityQueue；生产者消费者阻塞协调应选择 `BlockingQueue`。

## 容易踩坑的地方

ArrayDeque 不允许 null，因为 null 被 API 用作“没有元素”的信号。PriorityQueue 默认也不是线程安全容器，并发场景可考虑 PriorityBlockingQueue。

## 常见问题

### 追问：为什么推荐 ArrayDeque 替代 Stack？

Stack 继承 Vector，API 和同步设计较旧；ArrayDeque 的栈语义更明确，通常局部使用时性能也更合适。

### 追问：PriorityQueue 如何求 Top K？

维护容量为 K 的最小堆，遍历元素时大于堆顶才替换；最终堆中保留最大 K 个，复杂度 O(n log K)，比全量排序 O(n log n) 更适合 K 很小的情况。

### 追问：PriorityQueue 允许 null 吗？

不允许，因为 null 也被队列 API 用作“没有元素”的返回信号，且无法自然参与比较。

### 追问：SynchronousQueue 的容量是多少？

逻辑容量为 0，不保存任务。put 必须等待 take 配对，适合直接移交，但突发流量下必须由线程上限和拒绝策略保护。
