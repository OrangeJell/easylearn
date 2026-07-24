---
title: Java 异常体系与最佳实践是什么？
category: Java基础
categorySlug: java-basic
categoryOrder: 1
order: 4
description: 区分 Error、受检异常和运行时异常，并掌握异常设计与资源释放
updated: 2026-07-23
minutes: 7
level: 基础
prerequisites: [java-basic/equals-hashcode]
next: [java-basic/reflection-annotations]
---

# Java 异常体系与最佳实践是什么？

## 先说结论

> `Error` 通常表示应用难以恢复的 JVM 级问题；`Exception` 表示程序可处理的异常，其中 `RuntimeException` 无需强制捕获。异常应在有能力处理的边界捕获，否则继续抛出并保留根因。

业务校验失败可以使用有明确语义的业务异常；数据库、网络等底层异常通常应转换为当前层能理解的异常，但必须把原异常作为 `cause`。

## 关键机制

`finally` 通常会执行，但进程被强制终止等场景除外。try-with-resources 会按声明的逆序关闭实现 `AutoCloseable` 的资源；关闭时产生的异常会成为 suppressed exception，不会覆盖主异常。

## 异常体系怎么记

| 类型 | 是否要求显式处理 | 典型示例 | 通常怎么应对 |
| --- | --- | --- | --- |
| `Error` | 否 | `OutOfMemoryError`、`StackOverflowError` | 保存现场、止损并修复运行环境或程序根因 |
| 受检异常 | 是 | `IOException`、`SQLException` | 恢复、转换，或继续声明抛出 |
| 运行时异常 | 否 | `NullPointerException`、`IllegalArgumentException` | 修复代码缺陷或在边界返回业务错误 |

受检与非受检只描述编译器是否强制处理，不代表异常是否严重。参数非法可以是运行时异常，短暂网络失败可能是受检异常，也可能被框架转换为运行时异常；选型要看调用方是否真的有恢复动作。

## try-with-resources 的执行顺序

```java
try (InputStream in = Files.newInputStream(path);
     BufferedInputStream buffer = new BufferedInputStream(in)) {
    return buffer.readAllBytes();
}
```

资源按声明顺序创建，按逆序关闭，所以先关闭 `buffer`，再关闭 `in`。如果读取和关闭同时失败，读取异常是主异常，关闭异常可通过 `getSuppressed()` 查看。这比手写 finally 更不容易出现“关闭异常覆盖业务异常”的问题。

## 分层转换与异常链

基础设施层不应把所有实现细节直接泄漏到控制器，也不应丢掉原始原因。可以在边界进行语义转换：

```java
try {
    repository.save(order);
} catch (SQLException e) {
    throw new OrderPersistenceException("保存订单失败: " + order.id(), e);
}
```

转换后的异常说明当前业务动作，`cause` 保留 SQLState、驱动堆栈等诊断信息。日志通常在请求、消息消费或定时任务等最外层统一记录一次；中间层只有在能增加有效上下文时才记录。

## 线上设计案例

假设支付接口调用下游超时：网络超时不是“支付失败”的充分证据，因为下游可能已经扣款但响应丢失。此时异常模型应表达“结果未知”，返回可查询的操作号，通过幂等查询或对账确认，而不是捕获超时后直接重试一次并告诉用户失败。

这个案例说明异常不是纯语法问题，它还承载业务状态：失败、可重试、结果未知、需要人工处理应有不同错误码和恢复动作。

## 实际用时要注意什么

- 不用异常代替普通条件分支。
- 不捕获宽泛的 `Exception` 后静默忽略。
- 日志只在能够补充业务上下文的边界记录，避免每层重复打印。
- 对外接口返回稳定错误码，不直接暴露内部堆栈。

## 容易踩坑的地方

在 `finally` 中 `return` 会压制 try 或 catch 中的返回值与异常，应避免这样写。捕获异常后只打印一句消息也会丢失类型、调用栈和根因。

## 常见问题

### 追问：受检异常一定比运行时异常好吗？

不一定。调用方有明确恢复动作时受检异常有价值；如果所有调用方只能终止请求或统一转换，强制逐层声明反而增加噪声。

### 追问：finally 和 return 的执行顺序是什么？

返回表达式会先求值并暂存，然后执行 finally，最后返回暂存结果。finally 中若再次 return，会覆盖原返回值并压制异常，因此代码规范通常禁止在 finally 返回。

### 追问：捕获 Throwable 可以防止进程崩溃吗？

不应该这样设计。它还会捕获多数 Error，其中一些意味着 JVM 已不可靠或资源已耗尽。任务框架可在最外层捕获以记录现场，但应区分错误类型并决定隔离、重启或退出。

### 追问：业务异常需要打印完整堆栈吗？

预期内的校验失败通常记录结构化错误码和关键上下文即可；非预期异常需要堆栈。所有 4xx 都打印 ERROR 堆栈会制造告警噪声并增加日志成本。
