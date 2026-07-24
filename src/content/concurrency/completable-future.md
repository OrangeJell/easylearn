---
title: CompletableFuture 如何实现异步任务编排？
category: Java多线程
categorySlug: concurrency
categoryOrder: 3
order: 7
description: 掌握异步转换、任务组合、异常处理和线程池隔离
updated: 2026-07-23
minutes: 7
level: 进阶
prerequisites: [concurrency/thread-pool]
next: [concurrency/deadlock]
---

# CompletableFuture 如何实现异步任务编排？

## 先说结论

> CompletableFuture 用阶段组成异步数据流：`thenApply` 转换结果，`thenCompose` 串联返回 Future 的依赖任务，`thenCombine` 合并两个独立结果。生产环境应传入隔离的线程池，并为外部调用设置超时和降级。

不带 `Async` 的后续阶段可能由完成前一阶段的线程执行；带 `Async` 的版本会提交到指定执行器，二者影响线程上下文和调度开销。

## 异常处理

`exceptionally` 用于异常恢复，`handle` 同时处理成功与失败，`whenComplete` 适合观察结果但通常不改变它。最终 `join()` 会把异常包装为非受检的 CompletionException，`get()` 则声明受检异常。

## 常用编排语义

| API | 输入与输出 | 适用关系 |
| --- | --- | --- |
| `thenApply` | T -> U | 同步转换已有结果 |
| `thenCompose` | T -> Future<U> | 串联依赖的异步调用，避免 Future 嵌套 |
| `thenCombine` | Future<T> + Future<U> -> V | 两个独立任务完成后合并 |
| `allOf` | 多个 Future -> Future<Void> | 等待一批任务全部结束 |
| `anyOf` | 多个 Future -> Future<Object> | 取最先完成结果，需处理取消其余任务 |

理解数据依赖比背 API 更重要。A 的结果是 B 的输入时使用 compose；A、B 可以同时开始且最终需要合并时使用 combine；把两者写成串行 thenApply 会无谓增加总延迟。

## 一个聚合接口示例

```java
CompletableFuture<User> user = supplyAsync(() -> userClient.get(userId), ioPool);
CompletableFuture<List<Order>> orders = supplyAsync(() -> orderClient.list(userId), ioPool);

CompletableFuture<Profile> profile = user.thenCombine(orders,
    (u, os) -> new Profile(u, os));

Profile result = profile.orTimeout(300, TimeUnit.MILLISECONDS)
    .exceptionally(error -> Profile.degraded(userId))
    .join();
```

这里的降级应只覆盖可接受的依赖失败；如果用户身份是授权前提，就不能返回一个伪造成功的 Profile。超时也不代表远程调用一定停止，客户端、服务端和资源池仍需有自己的超时与取消策略。

## 执行器隔离

不指定 executor 的 `supplyAsync` 通常使用 commonPool。把阻塞 HTTP、数据库、文件 I/O 放入 commonPool，可能与其他库任务相互干扰。应根据任务性质划分：CPU 密集池大小接近可用核心数，I/O 池按下游连接、等待时间和背压策略估算，并使用有界队列和拒绝策略。

后续阶段不带 Async 时，会在完成前一阶段的线程执行。这有助于减少切换，但若回调中做长耗时操作，会占住 I/O 回调或线程池工作线程。长任务应显式切换到合适的 executor。

## 超时、取消与资源泄漏

`orTimeout` 让 Future 以异常结束，`completeOnTimeout` 提供默认结果，但两者不会神奇地取消已经发出的网络请求。调用库应支持请求级超时，任务内部应响应中断或取消，连接池要能归还连接。否则表面超时后，后台仍堆积慢调用。

## 避免线程池饥饿

最危险的写法是在同一个有限线程池任务中调用另一个同池任务的 `join`。当所有线程都等待尚未调度的子任务时，系统形成饥饿死锁。用组合 API 让依赖以回调形式衔接，或将阻塞任务隔离到不同池。

## 实际用时要注意什么

并行调用前先确认下游容量，不能把串行循环机械改成大量异步任务。对 CPU 和阻塞 I/O 使用不同执行器，设置队列、超时和监控；取消 Future 也未必能中止已发出的远程请求。

## 容易踩坑的地方

在同一个小线程池的任务中阻塞等待依赖任务，可能造成线程饥饿死锁。异步也不会让单个任务更快，它优化的是等待期间的线程利用率和独立任务并行度。

## 常见问题

### 追问：allOf 为什么拿不到结果列表？

`allOf` 只表示一组任务全部完成，完成后需要从原 Future 列表逐个读取结果，并统一处理其中任一任务失败的策略。

### 追问：thenApply 和 thenCompose 最常见的区别是什么？

回调返回普通值用 thenApply；回调返回另一个 CompletableFuture 用 thenCompose 来扁平化。前者误用会得到 `CompletableFuture<CompletableFuture<T>>`。

### 追问：exceptionally 能处理取消吗？

取消会使 Future 以 CancellationException 结束，通常可被异常处理阶段观察到。但业务是否应降级、传播取消或补偿，要根据调用语义决定。

### 追问：如何保留 traceId？

不要假定 ThreadLocal 自动跨异步阶段传播。可显式传递上下文、使用框架提供的任务装饰器，或在每个阶段创建带上下文的日志作用域。
