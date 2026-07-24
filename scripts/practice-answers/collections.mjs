import{answer,md}from'./shared.mjs'

export default{
  'collections/hashmap':answer(
    '几十万条聚合可以用 HashMap，但要先估算去重后的键数、对象大小和请求并发；内存预算不够时应改成分批或下推聚合。',
    md(
      '我不会看到“几十万”就直接 new 一个 `HashMap`。先估算最终有多少个 key，而不是输入多少行；再用压测或 JOL 看 key、value、Node 和对象本身的占用。假设 30 万个聚合项每项连同对象开销约 100B，一个请求就接近 30MB，并发 20 个已经可能把堆顶满。',
      '',
      '确认内存可接受后，会按预估键数设置初始容量，避免多次扩容：',
      '',
      '```java',
      'int capacity = (int) Math.ceil(expectedKeys / 0.75d);',
      'Map<Long, Summary> result = new HashMap<>(capacity);',
      '```',
      '',
      'key 要有稳定、分布正常的 `hashCode`。聚合值尽量原地累计，别为每条输入创建新的临时对象。如果 key 是基本类型且场景很热，可以评估 primitive map，减少装箱。',
      '',
      '如果预算不够，我会优先让数据库按键聚合、按分区流式处理，或者把请求改成异步任务，而不是单纯加大 `-Xmx`。最后用真实基数和并发观察堆峰值、分配速率与 GC，而不是只测单次接口耗时。'
    ),
    {problemAnalysisMarkdown:md(
      '这题的关键不是 HashMap 的红黑树阈值，而是 **一次请求的内存乘以并发数**。容量、冲突和扩容只是一部分，key/value 对象、装箱、输入列表是否同时驻留，往往才是主要占用。'
    )}
  ),
  'collections/arraylist-linkedlist':answer(
    '这种订单批处理我通常仍选 ArrayList；遍历是主操作，而 LinkedList 的节点分配和缓存不友好，理论上的中间 O(1) 插入很少真正成立。',
    md(
      '要先问“中间插入”是怎么找到位置的。如果每次按下标找第 N 个元素，`LinkedList` 光定位就要 O(n)，随后虽然改指针快，整体仍然慢；而订单批处理通常大量顺序遍历，`ArrayList` 连续存储、CPU cache 友好，实际性能更稳定。',
      '',
      '我会选 `ArrayList`，并尽量改变算法而不是换容器：先收集新增项，最后一次合并或排序；删除用 `removeIf` 或写入新列表；已知数量时预设容量。这样避免在大列表中反复搬移。',
      '',
      '`LinkedList` 只有在已经持有节点位置、频繁做两端操作等少数场景才可能有价值。做队列或栈我也更常用 `ArrayDeque`，它没有每个节点的对象开销。',
      '',
      '最终会用接近真实订单量和插入比例做 JMH 或链路压测，因为“数组插入 O(n)、链表 O(1)”这个结论忽略了定位、分配和缓存命中。'
    )
  ),
  'collections/concurrenthashmap':answer(
    'ConcurrentHashMap 适合并发读写和单 key 原子更新，但它不是带过期、容量控制和加载保护的完整缓存。',
    md(
      '我们会用它保存生命周期明确、规模可控的本地路由表，或者做短周期并发统计。读取通常不加全局锁，更新通过 CAS 和桶级同步控制竞争；计数会用 `compute`、`merge`，热点统计则用 `LongAdder`，避免“先 get 再 put”这种复合操作丢更新。',
      '',
      '```java',
      'counts.computeIfAbsent(key, ignored -> new LongAdder()).increment();',
      '```',
      '',
      '`computeIfAbsent` 的加载函数不能做慢 RPC，也不能递归修改同一个 key，否则会把竞争和故障放大。多个 key 之间的一致性它也保证不了，这时需要显式锁、不可变快照或重新设计状态边界。',
      '',
      '如果需求包含 TTL、最大容量、淘汰、刷新和防缓存击穿，我会直接用 Caffeine，而不是在 ConcurrentHashMap 外再拼一套定时清理。上线后重点看 key 数、命中率、加载耗时和堆占用。'
    ),
    {pitfallsMarkdown:md(
      '- **线程安全等于所有操作都原子。** `containsKey` 后再 `put` 仍然有竞态。',
      '- **在计算函数里调用慢下游。** 同 key 请求会排队，故障时很容易拖垮线程。',
      '- **当成无限缓存。** 没有容量和过期策略，最终会变成堆内存问题。'
    )}
  ),
  'collections/set-comparison':answer(
    '去重、保留原顺序和按规则排序不是一个 Set 同时完成的三个开关，先明确最终输出语义，再组合最合适的数据结构。',
    md(
      '如果要求“第一次出现的顺序保留，同时去重”，直接用 `LinkedHashSet`。如果最终只关心排序后的唯一结果，可以用带 Comparator 的 `TreeSet`，但要非常小心：Comparator 返回 0 就会被认为是同一个元素，它表达的是去重规则，不只是显示顺序。',
      '',
      '运营常见需求其实是：按订单号去重，保留一条记录，然后按金额或时间展示。我不会用一个 TreeSet 硬做，而是先用明确业务键放进 `LinkedHashMap<OrderKey, Order>`，决定重复时保留第一条还是最后一条，再把 values 放进 List 排序。',
      '',
      '```java',
      'Map<OrderKey, Order> unique = new LinkedHashMap<>();',
      'orders.forEach(o -> unique.putIfAbsent(keyOf(o), o));',
      'List<Order> result = new ArrayList<>(unique.values());',
      'result.sort(orderComparator);',
      '```',
      '',
      '这样去重语义和排序语义分开，需求变化时不会互相影响。'
    )
  ),
  'collections/fail-fast-iterator':answer(
    'ConcurrentModificationException 说明遍历期间集合结构被非预期修改，它是快速暴露 bug 的机制，不是线程安全保证。',
    md(
      '我会从堆栈找到正在遍历的集合和修改位置，确认是同一个线程在 for-each 里直接 `remove`，还是另一个线程同时写。单线程删除可以改用 `Iterator.remove()`、`removeIf`，或者遍历后统一处理；不要在 enhanced for 中直接改原集合。',
      '',
      '如果是并发读写，先确定需要什么一致性。配置快照允许读到旧版本，可以用不可变集合原子替换；任务交接用并发队列；必须在一组元素上维持不变量时，仍然要加锁。',
      '',
      '换成 `ConcurrentHashMap` 或 `CopyOnWriteArrayList` 只会改变迭代语义：前者是弱一致，后者遍历旧快照，都不保证你“刚写的数据这次一定看到”。因此修复前会先写清业务对遍历结果的要求，而不是只消灭异常。'
    ),
    {pitfallsMarkdown:md(
      '- **捕获异常后继续循环。** 集合状态和本次结果已经不可相信。',
      '- **认为没抛异常就线程安全。** fail-fast 是尽力检测，不是并发协议。',
      '- **直接换并发集合。** 弱一致或快照语义可能让业务得到过期结果。'
    )}
  ),
  'collections/copy-on-write-arraylist':answer(
    '监听器列表小、读取极多、注册极少时我会用 CopyOnWriteArrayList；写频繁或元素很多时不会用。',
    md(
      '配置监听器和事件订阅者很符合它的典型场景：发布事件时只读一个稳定数组，不加锁；注册或注销监听器时复制整份数组，再原子替换。遍历中的线程继续看旧快照，因此不会抛并发修改异常，也不会看到半次更新。',
      '',
      '它的代价也很明确：每次写都是 O(n) 复制，写入瞬间新旧数组同时占内存，而且新注册的监听器不保证被当前这轮遍历看到。列表有几万个元素或动态订阅很频繁时，这个成本不可接受。',
      '',
      '我会先看三个指标：列表大小、每秒写次数、是否允许一次旧快照。如果不满足读多写少，会改成带锁的普通列表、按 key 分组的并发结构，或者让订阅变更串行化。',
      '',
      '> `CopyOnWriteArrayList` 解决的是遍历与修改的并发，不会替你处理监听器重复注册、执行超时和异常隔离。'
    )
  ),
  'collections/queue-deque-priorityqueue':answer(
    '任务排队、最近访问和优先级调度的约束不同，我会分别选有界阻塞队列、ArrayDeque 和带明确并发控制的优先队列。',
    md(
      '后台任务排队首先要解决背压，我会用有界 `ArrayBlockingQueue` 或有容量的 `LinkedBlockingQueue`，队列满时明确阻塞、降级还是拒绝，绝不会用无界队列把流量尖峰变成 OOM。',
      '',
      '最近访问记录需要两端加入和淘汰，单线程或加锁环境下用 `ArrayDeque`；如果还要按 key 去重，通常是 `HashMap + 双向链表`，直接采用成熟的 LRU 缓存实现更稳妥。',
      '',
      '`PriorityQueue` 适合按优先级取最小/最大元素，但它不是线程安全的，也不保证同优先级稳定顺序。我会把提交序号作为第二排序键；并发场景用 `PriorityBlockingQueue`，同时增加老化或配额，避免低优先级任务永远饿死。定时任务则优先 `DelayQueue` 或调度线程池，不拿普通优先队列轮询时间。'
    )
  ),
  'collections/concurrent-collections':answer(
    '选加锁还是并发集合，关键看业务操作的原子边界：单 key 更新可用并发集合，多步不变量仍需要锁或重新建模。',
    md(
      '我会先把共享操作写出来，而不是从类名开始选。例如“给某个用户计数”可以用 `ConcurrentHashMap.compute`；“库存从 A 集合移到 B 集合且总量不变”跨了两个容器，换两个并发集合也不能保证原子性。',
      '',
      '实际选择大致是：',
      '',
      '- 线程间传递任务，用 `BlockingQueue`，顺便获得背压；',
      '- 单 key 查改，用 ConcurrentHashMap 的原子 API；',
      '- 读多写极少且允许旧快照，用 CopyOnWrite；',
      '- 多步操作必须一起成功，用同一把边界清楚的锁，或把状态封装到单线程执行器。',
      '',
      '锁的范围按业务不变量定，不按整个方法图省事。上线前会用并发测试验证丢更新、重复消费和死锁，并监控锁等待、队列长度，而不是只跑功能单测。'
    )
  ),
  'collections/comparable-comparator':answer(
    '动态排序要把运营输入映射成白名单 Comparator，并始终补一个唯一稳定的兜底键，避免翻页时顺序漂移。',
    md(
      '我不会让前端传字段名后直接反射排序。服务端维护可用规则，例如金额、创建时间、优先级，每个规则明确升降序和 null 放前还是放后，再用 `thenComparing` 组合。最后一定补 `orderId`，否则两笔金额和时间相同的订单每次顺序可能不同。',
      '',
      '```java',
      'Comparator<Order> comparator =',
      '    Comparator.comparing(Order::amount, nullsLast(naturalOrder()))',
      '      .reversed()',
      '      .thenComparing(Order::createdAt)',
      '      .thenComparingLong(Order::id);',
      '```',
      '',
      '比较数字不会写 `a - b`，它可能溢出；字符串是否忽略大小写、金额币种是否一致也要在规则里说清。',
      '',
      '如果数据来自数据库，我会把同样的排序规则下推到 SQL，并让游标包含全部排序键。Java 内存排序只适合已经有界的小结果集，不能把几十万订单拉回服务再排。'
    ),
    {pitfallsMarkdown:md(
      '- **Comparator 对同一对元素给出矛盾结果。** TreeSet、排序算法都会出现不可预测行为。',
      '- **没有唯一兜底键。** 分页期间相同值记录会重复或遗漏。',
      '- **把用户字段名直接拼进 SQL。** 应映射白名单，不能把排序功能变成注入入口。'
    )}
  ),
  'collections/immutable-collections':answer(
    '配置热更新不要在原 Map 上逐项修改，而是完整构建并校验新快照，最后用一次原子引用切换。',
    md(
      '我会把当前配置放在 `AtomicReference<ConfigSnapshot>` 或 `volatile` 引用里。更新线程拉取新版本后，在私有对象中完成解析、默认值补齐、跨字段校验和依赖预热；全部成功后再一次 `set`。业务线程每次请求只读取一次引用，所以要么看到旧版本，要么看到完整新版本。',
      '',
      '```java',
      'ConfigSnapshot next = loadAndValidate(version);',
      'current.set(next);',
      '```',
      '',
      '快照必须深度不可变。外层 `unmodifiableMap` 但 value 还能修改，依然会让读线程看到半状态。发布后我会保留版本号、校验摘要和上一版本，指标异常时能立即切回。',
      '',
      '如果配置切换还要建立连接或加载大文件，这些慢操作都在交换引用之前完成；旧资源不能立即关闭，要等正在使用旧快照的请求结束，或者做引用计数和延迟回收。'
    ),
    {problemAnalysisMarkdown:md(
      '这里要保证的是 **整份配置的一致可见性**，不是每个 Map 操作线程安全。把 `HashMap` 换成 `ConcurrentHashMap` 只能保证单次 put 安全，业务线程仍可能读到“新开关 + 旧阈值”的混合版本。'
    )}
  )
}
