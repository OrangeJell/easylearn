import{proof as p}from'../content-depth/profile.mjs'

export const collectionProofs={
  'collections/arraylist-linkedlist':p([['java.util.ArrayList','grow、fastRemove 与数组移动'],['java.util.LinkedList','Node、node(index) 从头尾查找']],'java',`var list = new ArrayList<Order>(100_000);
for (Order order : source) list.add(order);`,'用 JMH 分别测试随机 get、中间插入、尾部追加和增强 for；数据量固定 1k/100k/1m，配合 JFR 记录 Node 分配。',[['10 万次随机 get','ArrayList 应明显更快','LinkedList 呈 O(n²)','禁止按索引遍历链表'],['每元素额外对象','ArrayList 仅引用槽','LinkedList Node 数=元素数','评估堆与 GC'],['扩容次数','预估容量后接近 0','多次复制大数组','传入合理 initialCapacity']],['把索引循环改为迭代器','普通队列改用 ArrayDeque','批量装载前按可知规模预分配']),
  'collections/hashmap':p([['java.util.HashMap#putVal','桶插入、树化和 resize 触发'],['java.util.HashMap#resize','低位/高位拆分迁移']],'java',`int expected = 1_000_000;
int capacity = (int) Math.ceil(expected / 0.75d);
Map<Key, Value> map = new HashMap<>(capacity);`,'用 100 万个均匀键、低位重复键和常量哈希键压测，记录 get/put P99、树桶数量和扩容前后分配峰值。',[['装载因子','默认 0.75','size 超阈值触发 resize','预估容量'],['树化阈值','链长达到 8 且容量>=64','热点桶频繁树化','修复 hashCode'],['resize 峰值','应不进入请求 P99','复制与 GC 同时上升','启动/批量阶段完成扩容']],['修复键哈希而非依赖树化兜底','键字段设为不可变','按预计元素数和装载因子计算容量']),
  'collections/concurrenthashmap':p([['ConcurrentHashMap#putVal','空桶 CAS 与桶首 synchronized'],['ConcurrentHashMap#transfer','ForwardingNode 与并行扩容']],'java',`counts.computeIfAbsent(key, k -> new LongAdder()).increment();`,'以 1、8、64 线程压测均匀键和单热键；比较 get+put、compute 与 LongAdder，记录吞吐和桶锁等待。',[['热键占比','应接近业务分布','单键超过 20% 写入','拆分计数或 LongAdder'],['compute 时长','微秒级纯内存','包含 I/O/阻塞','移出回调'],['扩容协助时间','稳态接近 0','请求线程大量 transfer','预估 initialCapacity']],['复合更新改为 compute/merge/putIfAbsent','回调中禁止远程调用','热点计数使用分段累加后汇总']),
  'collections/set-comparison':p([['java.util.HashSet','内部 HashMap PRESENT 占位'],['java.util.TreeMap#put','compare=0 决定键等价']],'java',`Set<Tag> ordered = new LinkedHashSet<>();
ordered.addAll(input);
List<Tag> output = List.copyOf(ordered);`,'同一批含重复与同排序值数据分别装入三种 Set，核对元素数、遍历顺序、contains 延迟和内存。',[['去重后数量','等于业务唯一键数','TreeSet 少于 HashSet','检查 comparator=0'],['顺序稳定性','LinkedHashSet 重放一致','HashSet 升级后变化','不要依赖未承诺顺序'],['单元素字节','按实现测量','链表/树开销超预算','换适合结构']],['排序唯一性与 equals 口径对齐','需要顺序时显式选 LinkedHashSet','元素入 Set 后禁止修改判重字段']),
  'collections/queue-deque-priorityqueue':p([['java.util.ArrayDeque','head/tail 环形数组'],['java.util.PriorityQueue#siftUp/siftDown','二叉堆调整']],'java',`record Task(long dueAt, long sequence) {}
var q = new PriorityQueue<Task>(Comparator.comparingLong(Task::dueAt)
    .thenComparingLong(Task::sequence));`,'构造相同优先级任务验证稳定性，再以不同队列容量压测生产消费；记录队长、阻塞时间和内存。',[['队列深度','稳态围绕低水位','持续单调增长','消费能力不足'],['队头等待','小于业务延迟 SLO','超过 SLO 50%','限流或扩容'],['同优先级顺序','由 sequence 确定','每次运行不同','补唯一次序']],['无界队列改为有界并定义拒绝','优先级比较加入唯一序号','生产消费使用 BlockingQueue 而非手写等待']),
  'collections/copy-on-write-arraylist':p([['CopyOnWriteArrayList#add','加锁、Arrays.copyOf、setArray'],['COWIterator','构造时固定 snapshot 引用']],'java',`var next = new ArrayList<Listener>(loaded);
listeners.clear();
listeners.addAll(next);`,'列表规模从 10 到 100k，分别逐个 add 与单次 addAll；JFR 记录复制数组字节和旧快照晋升。',[['单次写复制字节','约等于数组引用大小','每秒复制超过堆 5%','改批量快照'],['读写比','建议远高于 1000:1','持续写入','换锁/不可变引用'],['旧快照存活','短迭代周期','进入老年代','排查长生命周期迭代器']],['逐项更新改为构建后一次发布','限制监听器列表规模','写频率升高时切换读写锁或不可变引用']),
  'collections/fail-fast-iterator':p([['java.util.ArrayList.Itr#checkForComodification','expectedModCount 与 modCount'],['java.util.Collection#removeIf','迭代协议内批量删除']],'java',`for (Iterator<Order> it = orders.iterator(); it.hasNext();) {
  if (expired(it.next())) it.remove();
}`,'分别在增强 for、Iterator.remove、removeIf 与并发写下执行删除，记录结果和异常；证明异常不是可靠并发检测。',[['modCount 差异','合法迭代始终一致','直接集合修改后不一致','改迭代器 API'],['重试次数','目标为 0','catch 后循环重试','重新设计同步'],['快照陈旧窗口','由业务明确','超过容忍时间','缩短复制/换并发结构']],['单线程删除用 removeIf/Iterator.remove','并发读取选快照或并发集合','删除 catch-and-retry 反模式']),
  'collections/immutable-collections':p([['java.util.ImmutableCollections','List.of/Map.of 紧凑实现'],['java.util.List#copyOf','不可变实例复用与浅拷贝']],'java',`Map<String, Rule> snapshot = Map.copyOf(nextRules);
CURRENT.set(snapshot);`,'构造原 Map 后创建 unmodifiableMap 与 copyOf，继续修改原 Map，验证视图和快照差异；再修改元素内部字段验证浅不可变。',[['快照版本','内容哈希与版本一一对应','同版本内容变化','仍共享可变底层'],['复制耗时','只在配置更新发生','进入请求热点','移动到发布路径'],['非法修改异常','调用方目标为 0','频繁捕获 UOE','修复 API 契约']],['发布 Map.copyOf 新快照','元素改为不可变值对象','用 AtomicReference/volatile 一次替换版本']),
  'collections/comparable-comparator':p([['java.util.Comparator','comparing/thenComparing/nullsFirst'],['java.util.TimSort','比较器契约异常检测']],'java',`Comparator<Order> byPrice = Comparator.comparing(Order::price)
    .thenComparing(Order::id);`,'生成极值、null、相等主键和随机三元组，验证反对称与传递；对相减式比较器加入溢出样本。',[['传递性随机测试','10 万组三元组零失败','任意失败','阻止上线'],['compare=0 比例','符合业务重复率','异常偏高','补次键/唯一键'],['排序比较次数','约 n log n','昂贵计算放大','预计算排序键']],['禁止用减法返回比较结果','添加唯一次键保持确定顺序','Comparator 加属性测试']),
  'collections/concurrent-collections':p([['java.util.concurrent 包','按 Map/Queue/Deque/SkipList 选择'],['BlockingQueue#put/take','容量、条件等待和中断']],'java',`if (inflight.putIfAbsent(taskId, STARTED) == null) {
  executor.execute(() -> process(taskId));
}`,'按真实读写比压测 ConcurrentHashMap、同步包装与快照；队列测试必须让消费者故意变慢，验证背压和拒绝。',[['队列容量','按峰值恢复窗口计算','无界或持续满载','限流/降级'],['原子 API 冲突','应随热键可解释','contains+put 重复','改 putIfAbsent'],['回调阻塞时间','纯内存短操作','出现远程延迟','移出映射回调']],['把检查再执行折叠为原子 API','所有生产队列设置容量','跨键不变量改锁或单所有者'])
}
