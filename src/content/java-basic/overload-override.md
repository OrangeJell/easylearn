---
title: 方法重载和重写有什么区别？
category: Java基础
categorySlug: java-basic
categoryOrder: 1
order: 8
description: 理解编译期重载选择、运行期动态绑定以及重写的类型约束
updated: 2026-07-23
minutes: 6
level: 基础
prerequisites: [java-basic/interface-abstract-class]
next: [java-basic/pass-by-value]
---

# 方法重载和重写有什么区别？

## 先说结论

> 重载发生在同一个类型体系中，方法名相同但参数列表不同，编译器根据引用的静态类型和实参选择方法；重写发生在父子类之间，子类提供相同签名的实例方法，运行期根据对象实际类型动态分派。

仅修改返回类型不能构成重载。重写可以使用协变返回类型，访问权限不能更严格，抛出的受检异常范围不能比父方法更宽。

## 关键机制

重载候选可能涉及精确匹配、基本类型提升、装箱和可变参数，复杂组合容易产生歧义。重写依赖虚方法调用；`static` 方法属于类，只会被隐藏，`private` 方法对子类不可见。

## 规则对比

| 维度 | 重载 Overload | 重写 Override |
| --- | --- | --- |
| 决定时机 | 编译期 | 运行期 |
| 发生位置 | 同类或继承体系都可形成候选 | 父子类实例方法之间 |
| 参数列表 | 必须不同 | 必须相同 |
| 返回类型 | 不参与重载区分 | 相同或协变子类型 |
| 访问权限 | 独立决定 | 不能比父方法更严格 |
| 受检异常 | 独立决定 | 不能扩大父方法声明范围 |

## 重载决议示例

```java
void print(long value) {}
void print(Integer value) {}
void print(int... values) {}

print(1); // int 基本类型提升为 long
```

编译器不会简单地“随便找一个能转的”。常见优先级可概括为精确匹配、基本类型拓宽、装箱/拆箱、可变参数，但泛型、继承和 null 会让候选更复杂。公共 API 应避免让调用者依赖微妙规则。

```java
void handle(String value) {}
void handle(Integer value) {}

// handle(null); // 编译失败：两个候选都适用且互不更具体
```

## 动态绑定示例

```java
class Parent {
    Number value() { return 1; }
    static String type() { return "parent"; }
}

class Child extends Parent {
    @Override Integer value() { return 2; }
    static String type() { return "child"; }
}

Parent ref = new Child();
ref.value(); // Child.value，实例方法动态分派
ref.type();  // Parent.type，静态方法按引用类型解析
```

协变返回让子类返回更具体的类型。编译器处理泛型重写时还可能生成桥接方法，以维持类型擦除后的多态契约；反射扫描方法时可能看到 `isBridge()` 为 true 的合成方法。

## API 设计建议

同名重载应该具有一致含义和一致失败语义，例如 `of(String)` 与 `of(Path)` 都创建同一种值。布尔参数、相邻数字类型和 null 容易让重载难懂，复杂配置更适合建造者或不同方法名。

## 实际用时要注意什么

重载应保持语义一致，例如不同参数形式都表示同一操作。重写始终加 `@Override`，让编译器发现拼写或签名错误；构造器中避免调用可重写方法，以免子类状态尚未初始化。

## 容易踩坑的地方

字段访问没有运行时多态，取决于引用声明类型。返回值不参与普通重载决议，所以不能定义两个仅返回类型不同的方法。

## 常见问题

### 追问：null 传给多个重载方法会怎样？

编译器选择更具体的参数类型；若两个候选互不为子类型，例如 `String` 与 `Integer`，调用会产生编译歧义，需要显式强转。

### 追问：构造方法可以重载或重写吗？

构造器可以通过不同参数列表重载，但不会被继承，因此不能重写。子类构造器只是在第一步显式或隐式调用父类构造器。

### 追问：final 方法和抽象方法有什么关系？

final 禁止子类重写，abstract 要求子类提供实现，同一方法不能同时满足两种互斥语义。private 方法也不能被子类重写。

### 追问：方法参数的泛型不同能构成重载吗？

`method(List<String>)` 与 `method(List<Integer>)` 擦除后签名相同，不能同时声明。泛型 API 设计必须考虑类型擦除后的 JVM 方法描述符。
