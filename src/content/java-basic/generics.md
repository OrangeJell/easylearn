---
title: Java 泛型、类型擦除与通配符详解
category: Java基础
categorySlug: java-basic
categoryOrder: 1
order: 3
description: 掌握泛型类、泛型方法、类型擦除以及 extends 和 super 的使用边界
updated: 2026-07-23
minutes: 5
level: 进阶
---

# Java 泛型、类型擦除与通配符详解

## 先说结论

泛型把“类型是否正确”的检查提前到编译期，减少强制类型转换，也让容器和算法可以复用。`List<String>` 明确表达列表只能保存字符串，读取元素时不再需要手动转换。

```java
List<String> names = new ArrayList<>();
names.add("Java");
String name = names.get(0);
```

## 泛型类与泛型方法

泛型类的类型参数作用于整个实例；泛型方法在返回值前单独声明类型参数，它与类是否为泛型无关。

```java
class Box<T> {
    private T value;
    void set(T value) { this.value = value; }
    T get() { return value; }
}

static <T> T first(List<T> list) {
    return list.get(0);
}
```

## 类型擦除

Java 泛型主要在编译期工作。编译后，未指定上界的 `T` 通常被擦除为 `Object`，指定了上界则擦除为上界类型；编译器会插入必要的类型转换和桥接方法。

这带来几个限制：

- 不能直接 `new T()`，因为运行时不知道 `T` 的具体类型。
- 不能创建 `new T[10]`。
- 不能使用 `obj instanceof List<String>`。
- `List<String>` 和 `List<Integer>` 运行时通常是同一个 `Class`。

## 为什么泛型是不变的

即使 `Integer` 是 `Number` 的子类，`List<Integer>` 也不是 `List<Number>` 的子类。否则便可以通过 `List<Number>` 向其中放入 `Double`，破坏原列表的类型安全。

## extends 与 super

`? extends T` 表示某个未知的 `T` 子类型，适合读取；`? super T` 表示某个未知的 `T` 父类型，适合写入。记忆规则是 **PECS：Producer Extends，Consumer Super**。

```java
double sum(List<? extends Number> values) {
    double result = 0;
    for (Number value : values) result += value.doubleValue();
    return result;
}

void addDefaults(List<? super Integer> values) {
    values.add(0);
    values.add(1);
}
```

对于 `List<? extends Number>`，可以安全读取为 `Number`，但不能写入具体数字；对于 `List<? super Integer>`，可以写入 `Integer`，读取时只能确定为 `Object`。

## 容易混淆的地方

1. 泛型擦除不等于运行时完全没有类型信息，字段和方法签名的泛型信息仍可通过反射读取。
2. 泛型数组危险是因为数组协变且运行时检查元素类型，而泛型在编译期擦除。
3. 静态成员属于类，不能直接使用类级别的类型参数。
4. 原始类型 `List` 会绕过部分编译期检查，应避免使用。

## 常见问题

### 追问：为什么不能 new T() 或 new T[]？

擦除后运行时不知道 T 的确切类型，无法选择构造器或创建带正确运行时元素类型的数组。可传入 `Class<T>`、工厂函数，或使用集合替代泛型数组。

### 追问：`?` 和 `T` 有什么区别？

`T` 是可在同一声明中多次关联的命名类型参数；`?` 表示某个未知类型，适合表达使用边界，但不能把两处独立通配符假定为同一类型。
