---
title: Java 反射和注解的原理与使用场景是什么？
category: Java基础
categorySlug: java-basic
categoryOrder: 1
order: 5
description: 理解 Class 元数据、反射调用、注解保留策略及框架中的典型应用
updated: 2026-07-23
minutes: 7
level: 进阶
prerequisites: [java-basic/generics]
next: [java-basic/serialization]
---

# Java 反射和注解的原理与使用场景是什么？

## 先说结论

> 反射让程序在运行期读取类型信息并操作构造器、字段和方法；注解负责声明元数据，只有 `RUNTIME` 注解才能通过运行时反射读取。Spring 的依赖注入、ORM 映射和测试框架都大量使用二者。

获取 `Class` 可以使用类字面量、实例的 `getClass()` 或 `Class.forName()`；后者还可能触发类初始化，不能把三种方式完全等同。

## 关键机制

注解本身不执行逻辑，需要编译器、注解处理器或运行时框架读取。反射调用要做访问检查、参数封装和动态分派，JVM 可以优化热点路径，但通常仍不如直接调用直观。

## 从 Class 对象到方法调用

每个由特定类加载器定义的运行时类型对应一个 `Class<?>` 对象。反射操作通常经历四步：定位类型、读取成员、检查访问权限、执行调用。

```java
Class<?> type = Class.forName("com.example.PaymentService");
Constructor<?> constructor = type.getDeclaredConstructor(Gateway.class);
Object service = constructor.newInstance(gateway);
Method method = type.getMethod("pay", Order.class);
PayResult result = (PayResult) method.invoke(service, order);
```

`Method.invoke` 抛出的目标方法异常会包装在 `InvocationTargetException` 中，诊断时要继续读取 `getCause()`。框架通常不会每次请求重新查找 Method，而是在启动扫描后缓存可执行元数据。

## 注解的完整生命周期

| 保留策略 | 保留到哪里 | 常见用途 |
| --- | --- | --- |
| `SOURCE` | 只在源码 | 静态检查、代码生成提示 |
| `CLASS` | 写入 class，运行时默认不可见 | 字节码处理、构建工具 |
| `RUNTIME` | 运行时可反射读取 | 依赖注入、路由、ORM、测试 |

还要配合 `@Target` 限定注解位置，使用 `@Repeatable` 支持同一位置重复声明。`@Inherited` 只影响类级注解沿父类查找，不会让接口注解或方法注解自动继承。

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Audit {
    String action();
}
```

这个注解只有声明作用。真正的审计逻辑可能由代理拦截方法、读取 `action`，再在调用前后写事件；没有处理器时，它不会产生任何业务行为。

## 框架如何使用反射

Spring 启动时扫描 Bean 定义，解析构造器与注解，创建对象后再通过代理实现事务、缓存等横切逻辑；ORM 根据字段或访问器元数据完成列映射；JUnit 扫描测试注解并调用方法。成熟框架还会结合字节码生成、MethodHandle 或缓存降低重复反射成本。

这也解释了为什么反射异常常在应用启动期暴露：缺失构造器、循环依赖、错误注解值或模块未开放，都会在元数据解析和实例化阶段失败。

## MethodHandle 与反射怎么选

MethodHandle 是更接近 JVM 调用模型的类型化句柄，适合动态语言实现和高频动态调用，也更利于内联优化；普通业务框架用反射 API 更直观。二者都不应绕过清晰的接口设计，性能差异要通过目标 JDK 和实际调用形态测量。

## 实际用时要注意什么

- 优先缓存扫描结果，避免请求路径反复遍历类信息。
- 模块化 Java 中还要考虑包是否 `opens` 给反射调用方。
- 能用明确接口解决的问题，不应为了“通用”滥用反射。

## 容易踩坑的地方

`setAccessible(true)` 不是跨版本的万能开关，强封装、模块边界和安全策略都可能阻止访问。注解也不会自动继承，只有满足 `@Inherited` 等特定条件时类级注解才会沿继承链查找。

## 常见问题

### 追问：反射一定很慢吗？

单次调用通常比直接调用开销大，但是否构成瓶颈取决于频率。框架常通过缓存元数据、生成字节码或方法句柄降低成本，应先测量再优化。

### 追问：getMethods 和 getDeclaredMethods 有什么区别？

前者返回当前类及父类型的 public 方法，后者返回当前类声明的所有可见性方法，但不包含继承成员。选错 API 常导致框架漏扫或重复处理。

### 追问：Class.forName 和 ClassLoader.loadClass 一样吗？

通常不一样。`Class.forName` 的常用重载会初始化类，`loadClass` 通常只完成加载；需要精确控制时可使用带 initialize 参数的重载。

### 追问：为什么 Java 17 后反射访问内部字段更容易失败？

模块强封装限制了对未开放包的深反射。解决方式是使用公开 API、在模块声明中开放必要包，或由启动参数做最小范围开放，而不是依赖非法访问警告。
