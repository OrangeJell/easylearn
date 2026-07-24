import{answer,md}from'./shared.mjs'

export default{
  'jvm/runtime-data-area':answer(
    'Xmx 只限制 Java 堆，进程 RSS 还包括元空间、线程栈、直接内存、代码缓存、GC 结构和本地库。',
    md(
      '我会先区分监控里的 6GB 是 RSS 还是容器 working set，再把 JVM 内存拆开。3GB 堆之外，几百个线程乘以 `-Xss` 可能占几百 MB；Netty/NIO 有直接内存；类和类加载器占元空间；JIT 有 code cache，GC 还有 remembered set 等本地结构。glibc arena 和 mmap 文件也会体现在进程内存里。',
      '',
      '线上会开启可控级别的 Native Memory Tracking，然后看：',
      '',
      '```text',
      'jcmd <pid> VM.native_memory summary',
      'jcmd <pid> GC.heap_info',
      'jcmd <pid> Thread.print',
      '```',
      '',
      '再结合线程数、直接内存指标、`pmap` 和容器 memory.stat 对账。若 NMT 解释不了持续增长，重点查 JNI、本地库和分配器碎片。',
      '',
      '容量配置不会让 `Xmx` 顶到容器上限。要给这些堆外部分和流量波动留明确余量，否则堆还没 OOM，容器就会被 OOMKill。'
    )
  ),
  'jvm/gc-guide':answer(
    '收集器按业务延迟目标、堆大小和吞吐选择；对常规服务我会先用 G1 建基线，大堆且停顿要求严格时再评估 ZGC。',
    md(
      '例如 4~16GB 堆、接口希望 P99 稳定在几百毫秒内，我会先用 JDK 默认的 G1，减少自定义参数。几十 GB 以上堆且业务对停顿极敏感，会在同样流量下评估 ZGC，但也接受它更高的并发 CPU 和内存开销。离线吞吐任务则可能更关心总处理时间，而不是每次停顿。',
      '',
      '业务侧我主要看 **GC 是否真的影响用户请求**：',
      '',
      '- 停顿时间和接口 P99 是否同一时刻抬升；',
      '- 分配速率、Young GC 频率和晋升速率；',
      '- Old 区占用趋势、Mixed/Full GC 次数；',
      '- GC CPU 占比和应用有效吞吐。',
      '',
      '选型会用生产流量回放和故障场景验证，观察发布后预热、流量峰值和大对象分配。只拿平均暂停或网上一组参数做决定，通常会忽略本业务对象生命周期。'
    )
  ),
  'jvm/production-oom-troubleshooting':answer(
    'OOM 处理中先保护整体服务并保留证据，再按堆、直接内存、元空间或本地内存分类定位；不能让所有实例同时导出大 dump。',
    md(
      '告警后会立即把问题实例从流量池摘下，保留一两个现场实例，其他实例扩容或限流承接流量。先看异常类型、容器是否 OOMKilled、堆占用、GC、线程数和进程 RSS。只有磁盘和停顿风险可接受时，才在单个现场实例获取 heap dump；其余实例用 `jcmd GC.class_histogram`、NMT 或 JFR 做轻量取证。',
      '',
      '不同类型走不同证据：',
      '',
      '- `Java heap space`：看 dominator、retained size 和对象到 GC Root 的引用链；',
      '- `Direct buffer memory`：查 Netty 池、未释放 buffer 和 `MaxDirectMemorySize`；',
      '- `Metaspace`：看类数量和 `VM.classloader_stats`，重点找无法回收的类加载器；',
      '- 容器被杀但堆不高：对账线程栈、本地库、文件映射和分配器。',
      '',
      '修复要回到增长来源：无界缓存加容量和过期、监听器解除引用、批处理改流式。单纯加堆只能延后下一次事故。'
    ),
    {pitfallsMarkdown:md(
      '- **所有 Pod 同时 `-XX:+HeapDumpOnOutOfMemoryError`。** 可能瞬间打满共享磁盘。',
      '- **OOM 后立即重启且不留指标。** 服务恢复了，但根因也消失了。',
      '- **只看浅对象大小。** 真正需要看对象保留的整棵引用图。'
    )}
  ),
  'jvm/production-memory-sizing':answer(
    '8GB 容器不会把 8GB 都给堆；我会从线程、直接内存和安全余量倒推，初始通常把 Xmx 放在 3.5~4.5GB 再压测校正。',
    md(
      '一个常规 Web 服务可以先按这份预算起步：堆 4GB，元空间上限 512MB 左右，直接内存按网络框架和缓冲需求设 512MB~1GB，code cache 与 JVM 本地结构预留几百 MB，再给线程栈和 native 分配留下至少 20% 容器余量。',
      '',
      '线程栈不是越大越安全。假设 500 个平台线程、`-Xss1m`，理论保留空间就可到 500MB；调用栈不深时会评估 512KB，但必须跑递归和框架最深链路测试。Netty 服务会显式监控 direct memory，不能只设置 Xmx。',
      '',
      '我会让 `Xms` 与 `Xmx` 是否相等取决于部署方式：延迟敏感、资源独占时可以相等；弹性容器则看启动和内存承诺策略。最终用峰值流量观察堆稳定占用、GC 后余量、RSS、线程数和 OOMKill 风险。',
      '',
      '> 这不是固定公式。同样 4 核 8GB，网关、Netty 服务和批处理任务的堆外与线程模型完全不同。'
    )
  ),
  'jvm/class-loading':answer(
    '类从字节码到可用要经历加载、验证、准备、解析和初始化；项目事故多发生在依赖不一致、静态初始化和类加载器边界。',
    md(
      '第一次主动使用类时，类加载器找到字节码并创建 `Class`；验证阶段检查格式和类型安全；准备阶段给静态字段分配空间并设默认值；解析把符号引用变成直接引用；初始化才执行静态字段赋值和 `<clinit>`。对象 `new` 还会继续分配内存、设零值、执行构造器。',
      '',
      '这套流程对排障有直接帮助。`ClassNotFoundException` 是主动加载没找到类，`NoClassDefFoundError` 可能是依赖缺失，也可能这个类之前初始化失败；静态块访问配置或远程资源失败后，后续使用只会继续报类无法初始化。',
      '',
      '我会用 `-Xlog:class+load=info` 或 JFR 看类由哪个加载器、从哪个 jar 加载，检查依赖树和第一条初始化异常。静态初始化只做确定、轻量的事情，网络调用和复杂业务放到可重试、可观测的启动组件里。'
    )
  ),
  'jvm/classloader-delegation':answer(
    'NoSuchMethodError 基本意味着编译时和运行时看到的类版本不同，先找“这个类到底从哪个 jar、哪个加载器来”，再谈排包。',
    md(
      '我会拿异常里的类名和方法描述符，先用依赖树确认编译版本，再在运行实例执行类加载日志或查看 protection domain，找到实际 jar。插件系统还要看宿主和插件各自的 ClassLoader；同名类由不同加载器加载，在 JVM 看来就是不同类型。',
      '',
      '```text',
      '-Xlog:class+load=info',
      'jcmd <pid> VM.classloaders',
      'javap -classpath suspect.jar -p package.ClassName',
      '```',
      '',
      '短期修复是统一版本、排除传递依赖，或对第三方冲突包做 shading。长期会给插件定义稳定 SPI，让共享接口由父加载器加载，插件私有依赖走隔离加载器，避免把宿主内部类暴露成协议。',
      '',
      '我不会靠反复调整 jar 顺序碰运气；那只会让当前环境加载到“刚好能跑”的版本，下次构建顺序变化还会复发。'
    ),
    {problemAnalysisMarkdown:md(
      '`NoSuchMethodError` 发生在链接或调用阶段：类本身找到了，但运行时版本没有调用方字节码要求的方法。它和业务代码抛出的异常不同，try/catch 重试通常没有意义。'
    )}
  ),
  'jvm/object-allocation':answer(
    'Young GC 频繁先看每秒分配了什么、从哪条调用链产生，再判断是正常高吞吐还是可以消掉的对象洪峰。',
    md(
      '我会把接口 RT、吞吐、allocation rate 和 GC 日志对齐，再用 JFR 的 Object Allocation in New TLAB / Outside TLAB 找出分配热点。常见来源是大结果一次映射成多层 DTO、日志字符串提前拼接、正则和 JSON 临时对象、循环里的装箱。',
      '',
      '优化顺序通常是：减少不必要字段和中间集合，改成流式处理；把循环中重复创建的格式化器或解析器移出热路径；避免无意义装箱；大数组和大对象单独关注 humongous allocation。',
      '',
      '我不会一看到分配多就做对象池。短命小对象由 TLAB 分配很快，池化反而增加生命周期、同步和内存泄漏风险。也不会先调大 Young 区掩盖问题，因为暂停时间和晋升可能一起变差。',
      '',
      '改完用相同吞吐比较 MB/s 分配率、Young GC 次数、暂停总时间和接口 P99，确认不是用更多 CPU 换了更少 GC。'
    )
  ),
  'jvm/gc-tuning':answer(
    'GC 调优先建立“流量—分配—堆占用—暂停—RT”基线，先修对象生命周期，再一次只改一个参数。',
    md(
      '确认尖刺和 GC 时间重合后，我会从 GC 日志与 JFR 看是哪类事件：Young GC 太频繁、Mixed 回收跟不上、Full GC、humongous allocation，还是并发标记抢 CPU。还会比较 GC 前后 Old 区，如果每次回收后基线持续上升，更像泄漏或缓存无界。',
      '',
      '处理顺序不会从复制网上参数开始：',
      '',
      '1. 找分配热点和异常晋升，先改代码、批量大小或缓存；',
      '2. 检查堆是否过小或容器没有 native 余量；',
      '3. 再根据目标调整暂停目标、并发线程或区域相关参数；',
      '4. 用同一流量回放，并包含发布预热和峰值阶段。',
      '',
      '每次只改一类变量，比较 P99、GC CPU、吞吐、Old 占用和 Full GC。平均暂停下降但 CPU 打满、业务吞吐变低，不算调优成功。'
    ),
    {pitfallsMarkdown:md(
      '- **只盯单次最大停顿。** 频繁小停顿和并发 GC 抢 CPU 同样会推高尾延迟。',
      '- **把堆越调越大。** 容器 native 余量不足时会从 JVM OOM 变成直接 OOMKill。',
      '- **一次改十个参数。** 指标好了也不知道是哪一项生效，回滚困难。'
    )}
  ),
  'jvm/stack-metaspace-errors':answer(
    'StackOverflowError 看单线程调用栈，Metaspace OOM 看类和类加载器；两者都不能只靠把上限调大。',
    md(
      'StackOverflowError 出现时先保留异常线程完整栈。重复的方法通常能直接暴露无限递归、双向 `toString/equals` 或递归解析；如果只是合法深调用，再结合最大深度评估改迭代还是调整 `-Xss`。盲目增大 Xss 会让每个线程占更多地址空间。',
      '',
      'Metaspace OOM 则看类数量是否持续增长：',
      '',
      '```text',
      'jcmd <pid> VM.classloader_stats',
      'jcmd <pid> GC.class_histogram',
      '```',
      '',
      '热部署、脚本引擎、动态代理和插件反复创建 ClassLoader，但旧加载器仍被线程、ThreadLocal、静态集合引用，是常见根因。heap dump 里会沿 ClassLoader 的引用链找谁阻止回收。',
      '',
      '止损可以适当扩容或重启实例，但修复分别是消除递归/控制深度，以及释放类加载器相关引用、复用生成类。'
    )
  ),
  'jvm/jit-compiler':answer(
    '发布后先慢后快可能是类加载、JIT 编译和缓存预热共同作用，必须分别取证，不能只凭现象认定是 JIT。',
    md(
      '新实例刚接流量时，热点方法还在解释执行或低层编译，分支画像和调用点信息也没积累；随后 C1/C2 编译完成，内联等优化生效，延迟就会下降。与此同时连接池、DNS、本地缓存和远端 TLS 也在预热，所以要拆开看。',
      '',
      '我会用 JFR 的 Compilation、Code Cache、Class Loading 事件，必要时开启 `-Xlog:jit+compilation`，把编译时间与接口延迟对齐。若有 deoptimization 或 code cache 接近满，也会出现运行一段时间后再次抖动。',
      '',
      '处理上会在健康检查放量前执行有代表性的轻量预热，按比例逐步接流量，并保持足够的滚动发布重叠实例。CDS 可以降低类加载成本，但不会拿全量生产写请求做预热。',
      '',
      '> 关闭 JIT 会让曲线变平，却通常把稳定态性能变得更差。目标是控制预热过程，不是消灭编译。'
    )
  )
}
