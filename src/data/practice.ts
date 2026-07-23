import curatedPracticeMetaJson from'./curated-practice-meta.json'

export type PracticeQuestionType='project'|'incident'|'design'|'mechanism'
export type PracticeDiagram={kind:'flow'|'timeline';title:string;nodes:string[]}
export type PracticeQuestion={
  id:string
  sourceRef?:string
  category?:string
  difficulty?:string
  durationMinutes?:number
  type?:PracticeQuestionType
  weight?:number
  prompt:string
  shortAnswer?:string
  answer:string[]
  keyPoints:string[]
  relatedArticles:string[]
  diagram?:PracticeDiagram
  followUps?:PracticeQuestion[]
}
export type PracticeQuestionSummary=Pick<PracticeQuestion,'id'|'sourceRef'|'category'|'difficulty'|'durationMinutes'|'type'|'prompt'>
type CuratedPracticeMeta=Pick<PracticeQuestion,'id'|'sourceRef'|'durationMinutes'|'type'|'prompt'|'shortAnswer'|'diagram'>
const curatedPracticeMeta=curatedPracticeMetaJson as CuratedPracticeMeta[]

export const practiceQuestion:PracticeQuestion={
  id:'latency-thread-pool-incident',
  sourceRef:'architecture/observability',
  category:'综合排障',
  difficulty:'高级',
  durationMinutes:5,
  prompt:'线上接口 P99 从 200ms 上升到 5 秒，服务器 CPU 不高，但线程池队列持续增长，数据库连接池也逐渐被占满。你会如何定位和处理？',
  answer:[
    '我会先给一个判断：CPU 不高、线程池队列上涨、数据库连接逐渐占满，典型特征不是算力不足，而是大量线程阻塞在 I/O 或资源获取上。线程池队列是压力积压的位置，不一定是根因；数据库连接池占满也可能是慢 SQL、锁等待或下游超时带来的结果。因此我不会一上来扩线程、扩队列或重启，而是先止住流量放大，再按时间线拆解一次请求。',
    '第一步是确认故障边界。我会对比变更时间、流量、错误码和依赖状态：问题是所有接口还是单个接口，是所有实例还是一个可用区，是突增还是缓慢恶化。至少拉取故障前后 30 分钟的 QPS、P50/P95/P99、超时率、实例数、GC、线程数和发布记录。如果只有某个接口异常，就按 URI、租户或参数进一步拆分；如果只有部分实例异常，要比较连接池配置、流量权重和机器资源。先缩小范围能避免在全局指标里平均掉真正的问题。',
    '第二步是把 5 秒分段。我会在同一个 traceId 下记录 taskSubmit、taskStart、connectionRequest、connectionAcquired、sqlStart、sqlEnd、rpcStart、rpcEnd。taskStart 减 taskSubmit 是线程池排队时间，拿连接前后的差值是连接池等待，SQL 起止是数据库执行，下游起止是 RPC 耗时。没有链路追踪时也可以临时打印采样结构化日志，并把线程池 activeCount、queueSize、rejectCount，HikariCP 的 active、idle、pending、acquire time，以及数据库慢日志按分钟对齐。只看接口总耗时无法区分排队和执行，平均值也不够，必须比较高分位。',
    '第三步是验证容量关系。假设线程池 200 个工作线程、数据库连接池 50，慢 SQL 从 50ms 上升到 1 秒，那么数据库理论吞吐会从大约每秒 1000 次掉到 50 次。此时 150 个线程会持续等待连接，入口还按原速率提交任务，队列必然增长。直接把最大线程数从 200 调到 500，不会增加那 50 个连接或数据库 IOPS，只会增加等待者、内存占用和超时后的重试。队列也不能设成几万，因为大队列只会把过载隐藏几分钟，最终让用户收到已经没有业务价值的迟到响应。',
    '第四步是先止损。我会对异常接口限流或按租户隔离，关闭没有抖动的自动重试，对非核心查询返回降级结果；同时设置分层超时，例如入口 2 秒、内部 RPC 800ms、连接获取 200ms，保证下游超时早于上游。线程池使用有界队列和可观测拒绝策略，让过载快速暴露。如果确认数据库被单条异常 SQL 或锁等待拖住，可以终止异常会话、临时摘掉问题功能，或者把只读流量切到健康副本，但每个动作都要记录影响范围和回滚条件。',
    '第五步是根据证据修根因。如果 SQL duration 高，就看 EXPLAIN ANALYZE、扫描行数、临时表、排序和锁等待；如果 connection acquire 高而 SQL 并不慢，要检查连接泄漏、事务范围过大和连接池是否与实例数共同超过数据库上限；如果线程快照都卡在同一个 HTTP 客户端，就检查下游超时、连接复用和 DNS。一个常见事故是报表查询漏了租户条件，单次扫描从 2 万行变成 800 万行，SQL 用时从 40ms 到 3 秒，随后连接池 60 个连接占满，线程池队列在两分钟内涨到 5000。真正的修复是终止查询、补条件和索引，而不是扩 500 个线程。',
    '最后是受控恢复和复盘。下游恢复后不能一次性排空队列，我会先丢弃超过业务截止时间的查询任务，对支付、订单等不可丢任务按稳定业务 ID 核对状态，再以低于数据库稳定吞吐的速率排空，并给实时流量预留容量。每档放量观察 P99、pending connection、queueSize 和 rejectCount 是否同步下降。事后补充分段耗时直方图、连接等待告警、队列时效指标和容量压测，让告警在用户 P99 到 5 秒之前触发。面试收尾我会强调：先分段量化，再止损，找到最窄资源，最后受控恢复。'
  ],
  keyPoints:['先确定故障范围并对齐变更时间线','用阶段时间戳拆分排队、连接等待、SQL 与 RPC','用线程数、连接数和服务时间验证容量关系','先限流降级止损，再按证据修复最窄资源','恢复时清理过期任务并按稳定吞吐排空'],
  relatedArticles:['concurrency/thread-pool','mysql/slow-sql-troubleshooting','architecture/observability','architecture/resilience'],
  followUps:[
    {
      id:'why-not-expand-thread-pool',
      prompt:'为什么不能直接把线程池最大线程数调大？',
      answer:[
        '因为线程池扩大的是并发请求数，不是系统的真实处理能力。假设数据库连接池只有 50 个连接，原来 100 个工作线程已经有一半在等连接，再扩到 300，只会多出 200 个等待者。它们还会占用内存、持有请求上下文，并带来更多调度和超时重试，数据库收到的瞬时压力也会更大。',
        '我通常把有界线程池和有界队列当成容量保护装置。队列长度应该由可接受的排队时间和稳定吞吐量反推，例如系统稳定处理 500 次每秒、最多允许排队 200ms，那么队列初始值大约只能容纳 100 个任务，而不是随手设成几万。容量不足时应该快速拒绝、降级或限流，让问题暴露在入口，不能靠大队列把故障延迟几分钟后再集中爆发。'
      ],
      keyPoints:['工作线程数量不等于下游容量','大队列会把过载变成更晚发生的雪崩','拒绝与降级是容量边界的一部分'],
      relatedArticles:['concurrency/thread-pool','architecture/rate-limiting','architecture/resilience'],
      followUps:[
        {
          id:'estimate-thread-pool-size',
          prompt:'线程池大小应该怎么估算？',
          answer:[
            '常见的 N×(1+等待时间/计算时间) 只能作为压测前的起点。CPU 密集任务可以从 CPU 核数附近开始；I/O 密集任务能放大一些，但最终上限要同时受数据库连接数、下游限额、内存和目标 P99 约束。比如一个实例分到 40 个数据库连接，就不应该因为公式算出 160 个线程，便允许 160 个任务同时进入数据库阶段。',
            '实际落地时我会固定请求模型逐档压测，观察吞吐何时不再增长，而 P99、连接等待或上下文切换开始陡升，把拐点前留出 20% 到 30% 余量作为生产值。还要区分接口使用独立线程池，避免报表类慢任务占满公共池，拖住登录、下单这类核心请求。'
          ],
          keyPoints:['公式只给初始值，压测拐点才决定生产值','连接数、下游配额常比 CPU 更早成为硬上限','不同延迟和优先级的任务需要隔离'],
          relatedArticles:['concurrency/thread-pool','architecture/rate-limiting']
        },
        {
          id:'virtual-threads-capacity',
          prompt:'换成虚拟线程，是不是就不用控制并发了？',
          answer:[
            '不是。虚拟线程主要降低“一个等待中的线程”所占的内存和调度成本，让同步阻塞代码可以承载更多并发，但它不会增加数据库连接、磁盘 IOPS 或下游接口配额。十万个虚拟线程同时查询只有 100 个连接的数据库，瓶颈仍然是那 100 个连接，只是等待者更便宜了。',
            '因此使用虚拟线程后，我仍会在数据库、外部 API 等稀缺资源前加信号量或限流器，并保留超时和熔断。还要通过 JFR 检查 synchronized、native 调用造成的载体线程固定问题。虚拟线程改变的是并发实现成本，不改变系统容量守恒。'
          ],
          keyPoints:['虚拟线程优化等待成本，不创造下游资源','稀缺资源前仍要有明确并发上限','需要关注载体线程固定和观测方式变化'],
          relatedArticles:['concurrency/virtual-threads','architecture/resilience']
        }
      ]
    },
    {
      id:'queue-or-database-time',
      prompt:'怎样判断时间主要花在线程池排队，还是数据库执行？',
      answer:[
        '最直接的方法是在同一条请求上打四组时间戳：任务提交和开始执行的差值是线程池排队时间；申请连接和拿到连接的差值是连接池等待；SQL 发出到返回是数据库执行；剩余部分再看业务计算和下游调用。把这些阶段做成直方图，比较 P50、P95、P99，而不是只看平均值。',
        '如果 executor.queue.delay 很高、连接获取很快，瓶颈在工作线程之前；如果 connection.acquire 很高，说明连接池已经饱和；如果两者都低但 SQL duration 高，就去看执行计划、扫描行数、锁等待和数据库负载。实际事故里它们可能串联放大，所以我还会用同一 traceId 对齐时间，避免把后果误当成根因。'
      ],
      keyPoints:['用阶段时间戳直接归因','连接获取等待与 SQL 执行耗时必须分开','关注高分位，并通过同一请求对齐指标'],
      relatedArticles:['architecture/observability','mysql/slow-sql-troubleshooting','concurrency/thread-pool'],
      followUps:[
        {
          id:'diagnose-without-tracing',
          prompt:'系统没有接入分布式链路追踪时怎么办？',
          answer:[
            '没有链路追踪也能先建立证据链。我会在同一分钟内对齐线程池队列和活跃线程、连接池 pending 和 acquire time、数据库慢日志与锁等待，再连续抓两到三次线程快照。如果大量业务线程都停在 getConnection，连接池是直接堵点；如果都在同一个 SQL 驱动调用，再去数据库侧找对应语句和等待事件。',
            '对单个接口可以临时增加带 requestId 的结构化耗时日志，记录 queueMs、connectionMs、sqlMs 和 downstreamMs，控制采样率并在故障后下线，避免日志本身造成压力。这些数据足以完成首次归因；事后再把高价值阶段沉淀成指标和 trace span，而不是等观测平台建完才开始排查。'
          ],
          keyPoints:['按统一时间轴拼接线程、连接池和数据库证据','线程快照要连续抓取，单张快照容易误判','临时分段日志用于止血，稳定指标用于长期治理'],
          relatedArticles:['architecture/observability','mysql/slow-sql-troubleshooting']
        }
      ]
    },
    {
      id:'drain-backlog-after-recovery',
      prompt:'下游已经恢复，但线程池里还有大量积压任务，应该怎么处理？',
      answer:[
        '我不会一次性放行。先按业务截止时间清理已经没有价值的任务，例如用户早已超时离开的查询；对支付、订单这类不能丢的任务则保留稳定业务键，先核对下游是否已经处理。然后给积压流量单独设置较低并发，以低于下游稳定吞吐的速率排空，同时给实时新请求预留容量。',
        '恢复过程分档放量，例如每 5 分钟提升 10% 到 20%，每档都观察下游 P99、错误率、连接池等待和积压下降速度；任一指标反弹就回退。还要关闭自动重试风暴或增加带抖动的退避，否则旧任务、实时流量和重试流量会形成第二次冲击。'
      ],
      keyPoints:['先区分过期任务和不可丢任务','积压与实时流量分池、分配额处理','按下游稳定吞吐渐进放量'],
      relatedArticles:['architecture/resilience','kafka/message-backlog-troubleshooting'],
      followUps:[
        {
          id:'retry-idempotency',
          prompt:'积压任务重试时，如何避免重复写入？',
          answer:[
            '重试必须复用第一次请求的稳定业务 ID，不能每次生成新 ID。服务端先以业务 ID 查询处理记录，数据库再用唯一索引做最后一道并发防线；插入冲突时读取已有结果并返回，而不是把冲突当未知错误继续重试。状态更新可以带版本号或明确的状态机条件，防止旧请求覆盖新状态。',
            '如果还要同时写数据库和发消息，我会用本地事务加 outbox 表，由后台可靠投递，并让消费端也以事件 ID 去重。幂等记录要设置符合业务追溯周期的保留时间。这样即使客户端超时、任务重复入队或消费者重平衡，重复执行也会收敛到同一个业务结果。'
          ],
          keyPoints:['重试复用稳定业务 ID','唯一约束负责并发下的最终兜底','数据库与消息双写用 outbox 和消费端去重'],
          relatedArticles:['architecture/idempotency','kafka/duplicate-consumption-idempotency']
        }
      ]
    }
  ]
}

export function flattenQuestions(root:PracticeQuestion):PracticeQuestion[]{
  return[root,...(root.followUps||[]).flatMap(flattenQuestions)]
}

const threadPoolQuestion:PracticeQuestion={
  id:'thread-pool-execute-flow',
  sourceRef:'concurrency/thread-pool',
  category:'并发编程',
  difficulty:'中高级',
  durationMinutes:5,
  prompt:'ThreadPoolExecutor 的核心参数如何配合？一个任务提交后会经过哪些判断？',
  answer:[
    '我会先用一句话概括：ThreadPoolExecutor 不是简单的线程复用工具，而是由线程数、队列和拒绝策略组成的并发容量控制器。核心参数包括 corePoolSize、maximumPoolSize、keepAliveTime、workQueue、threadFactory 和 rejectedExecutionHandler。理解它们最关键的不是背定义，而是把一次 execute 调用按源码顺序讲清楚，并说明每个分支对吞吐、延迟和内存有什么影响。',
    '任务提交后，第一步读取 ctl。ctl 的高位表示运行状态，低位记录工作线程数。如果 workerCount 小于 corePoolSize，线程池会调用 addWorker(command, true)，直接创建核心线程并把当前任务作为 firstTask；即使此时存在空闲核心线程，规则仍然按线程数判断。addWorker 内部会再次校验运行状态并通过 CAS 增加 workerCount，成功后构造 Worker、加入 workers 集合并启动线程。这里的双重检查是为了处理 shutdown 与提交并发发生的情况。',
    '如果核心线程已经达到上限，第二步调用 workQueue.offer(command) 尝试入队。入队成功并不代表任务一定会执行，所以源码会重新检查线程池状态：如果入队后线程池已经 shutdown，就尝试 remove 任务并拒绝；如果线程池仍在运行但 workerCount 为 0，会创建一个没有 firstTask 的工作线程负责消费队列。这个 recheck 很重要，它避免任务成功进入队列却永远无人执行。工作线程最终在 runWorker 中循环调用 getTask，从队列取任务，并在 beforeExecute、afterExecute 钩子之间执行。',
    '如果队列已满，第三步才调用 addWorker(command, false)，把线程数从 corePoolSize 扩到 maximumPoolSize；连最大线程也无法创建时才触发拒绝策略。因此 maximumPoolSize 是否有意义取决于队列。使用无界 LinkedBlockingQueue 时 offer 几乎不会失败，线程通常只会达到 corePoolSize，最大线程形同虚设；SynchronousQueue 不存储任务，每次提交都要直接交给工作线程，更容易扩到 maximumPoolSize；有界 ArrayBlockingQueue 则让排队容量和扩容阈值都明确。',
    '参数估算不能只套公式。CPU 密集型可以从 CPU 核数附近开始，I/O 密集型常用 N×(1+等待时间/计算时间) 作为初值，但生产上还受数据库连接、下游并发配额、内存和目标 P99 约束。例如 8 核实例中任务计算 10ms、等待数据库 40ms，公式得到约 40 个线程；但实例只有 24 个数据库连接，那么允许 40 个任务同时进入数据库只会制造等待。我的做法是设置初值后逐档压测，找到吞吐不再增长而 P99、连接等待或上下文切换开始陡升的拐点，再保留 20% 到 30% 余量。',
    '队列容量应由允许排队时间反推，而不是凭感觉设大。假设稳定吞吐是每秒 500 个任务，业务只允许额外排队 200ms，初始队列容量大约是 100。队列过小会在短暂毛刺下频繁拒绝，过大则把过载变成高延迟和内存积压。拒绝策略也必须匹配业务：AbortPolicy 让调用方明确失败；CallerRunsPolicy 用提交线程执行形成反压，但不能阻塞关键 I/O 线程；Discard 类策略只适合允许丢失且有独立统计的任务。核心业务通常会自定义策略，记录线程池名、队列长度和拒绝数，再快速失败、降级或进入可靠队列。',
    'keepAliveTime 默认回收超过核心数的空闲线程，开启 allowCoreThreadTimeOut 后核心线程也能回收；prestartAllCoreThreads 可以避免冷启动时首批任务承担建线程成本。工程上我还会用自定义 threadFactory 设置业务线程名、异常处理器和统一上下文，按依赖与延迟目标拆池，避免慢报表占满公共池拖住下单。监控至少包括 activeCount、poolSize、largestPoolSize、queueSize、taskCount、completedTaskCount、rejectCount 和任务排队时间。收尾时我会强调：参数不是越大越好，线程池的价值是把并发限制在系统和下游真正能承受的范围内。'
  ],
  keyPoints:['按源码顺序说明核心线程、入队、最大线程和拒绝','理解入队后的二次状态检查与 Worker 执行循环','队列类型决定 maximumPoolSize 是否真正生效','线程数和队列容量需要由容量约束与压测共同确定','隔离、拒绝、命名和监控都是线程池设计的一部分'],
  relatedArticles:['concurrency/thread-pool','concurrency/completable-future','architecture/rate-limiting'],
  followUps:[
    {
      id:'thread-pool-factory-risk',
      prompt:'为什么生产环境通常不建议直接使用 Executors 的快捷工厂方法？',
      answer:[
        '问题不在工厂方法本身，而在它隐藏了容量边界。newFixedThreadPool 使用近似无界的 LinkedBlockingQueue，流量高于处理能力时任务会持续堆积，最终可能 OOM；newCachedThreadPool 的最大线程数接近无限，遇到慢下游时可能快速创建大量线程。',
        '更稳妥的做法是直接构造 ThreadPoolExecutor，显式写出核心线程、最大线程、有界队列、线程工厂和拒绝策略。线程名要带业务前缀，拒绝时要有指标和日志，这样容量假设能被代码审查，也方便事故定位。'
      ],
      keyPoints:['无界队列会隐藏过载并积累内存风险','近乎无限的线程会放大下游故障','容量参数和拒绝行为应显式可观测'],
      relatedArticles:['concurrency/thread-pool','architecture/resilience'],
      followUps:[
        {
          id:'thread-pool-queue-choice',
          prompt:'ArrayBlockingQueue 和 LinkedBlockingQueue 应该怎么选？',
          answer:['ArrayBlockingQueue 内存连续、容量固定，行为更容易预测；LinkedBlockingQueue 节点分配更多，但生产消费并发下锁竞争模式不同。我通常先根据允许排队时间反推容量，再通过压测比较吞吐和 GC，而不是只按数据结构名称选择。无论选哪种，都不会把容量留成无界。'],
          keyPoints:['先确定容量边界，再比较实现差异','同时观察延迟、吞吐与 GC','生产队列必须有界'],
          relatedArticles:['concurrency/thread-pool','collections/queue-deque-priorityqueue']
        }
      ]
    },
    {
      id:'thread-pool-rejection',
      prompt:'四种内置拒绝策略分别适合什么情况？',
      answer:[
        'AbortPolicy 直接抛异常，适合必须让调用方感知失败的核心链路；CallerRunsPolicy 让提交线程执行任务，可以自然反压，但如果提交线程是 Web I/O 线程也可能拖慢入口；DiscardPolicy 静默丢弃，只适合允许损失且有独立统计的任务；DiscardOldestPolicy 丢弃队头再重试，容易破坏顺序和时效，实际使用要非常谨慎。',
        '多数业务我更倾向自定义策略：记录线程池名、队列长度和拒绝计数，再根据任务类型快速失败、降级或写入可靠队列。拒绝是过载保护的一部分，不能只打一条日志然后吞掉。'
      ],
      keyPoints:['拒绝策略必须匹配任务能否丢失','CallerRuns 是反压，不是通用兜底','自定义策略应同时完成观测与降级'],
      relatedArticles:['concurrency/thread-pool','architecture/resilience']
    },
    {
      id:'thread-pool-isolation',
      prompt:'为什么不同业务最好不要共用一个公共线程池？',
      answer:['共用线程池会让慢报表、批处理等低优先级任务占满线程和队列，登录、下单等核心请求即使自身很快也只能排队。按依赖和延迟目标拆池，可以把故障限制在局部，并分别设置容量、超时和拒绝策略。拆池不是越多越好，还要控制线程总量并统一监控。'],
      keyPoints:['公共池容易产生队头阻塞','隔离边界应跟随依赖和服务等级','拆池后仍需控制进程线程总量'],
      relatedArticles:['concurrency/thread-pool','architecture/resilience']
    }
  ]
}

const oomQuestion:PracticeQuestion={
  id:'jvm-oom-troubleshooting',
  sourceRef:'jvm/production-oom-troubleshooting',
  category:'JVM',
  difficulty:'高级',
  durationMinutes:5,
  prompt:'线上 Java 进程发生 OOM，你会如何判断是哪块内存出了问题并完成定位？',
  answer:[
    '我处理 OOM 的原则是先保护业务、再保留现场、最后按内存区域分流，不能看到 OOM 就只调大 Xmx。先确认还有多少健康副本，必要时摘流故障实例并限制入口，避免所有副本在抓 dump 时一起停顿。同步记录故障时间、Pod 和节点、JVM 参数、应用版本、流量变化与最近发布。能保留进程就暂时不要重启；必须重启时，也要先保存 GC 日志、容器事件、线程数、RSS 和错误文件。',
    '第一步看异常类型，因为不同文本指向不同资源。Java heap space 表示堆无法分配对象；GC overhead limit exceeded 表示大量时间用于 GC 但回收很少；Metaspace 指向类元数据；Direct buffer memory 指向直接缓冲区限制；unable to create new native thread 可能是线程数、进程 pid 限制或本地内存不足；requested array size exceeds VM limit 则可能是异常数组长度。还有一种情况没有 Java OOM，只看到退出码 137，这通常要先查容器或操作系统 OOM Kill。',
    '如果是堆 OOM，我会把 GC 日志和 heap dump 结合分析。先看老年代在多次 Full GC 后是否回落：基线随时间阶梯式上涨更像泄漏，随流量上涨但能回落更像容量不足。用 MAT 或同类工具查看 Histogram、Dominator Tree、Retained Size 和到 GC Root 的路径。Shallow Size 只表示对象自身大小，Retained Size 才表示释放该对象后能回收的总量。重点看数量异常的集合、缓存、ThreadLocal、监听器和按请求保存的上下文，并用两份不同时间的 dump 做增量对比，避免把正常大对象误判为泄漏。',
    '一个典型案例是导出任务把查询结果放进 static ConcurrentHashMap，key 是 taskId，成功路径删除，异常路径没有删除。故障前老年代 Full GC 后稳定在 1.2GB，随后每小时上涨 300MB，dump 里 78% 的 retained heap 被这个 Map 支配，引用链直接指向静态字段。修复不是简单把 4GB 堆改成 8GB，而是给任务状态设置生命周期、finally 清理和容量上限，再用压测确认 Full GC 后基线稳定。若对象都符合正常请求且堆在高峰确实不足，才考虑调整 Xmx、对象生命周期或横向扩容。',
    '如果是 Metaspace，我会比较 loadedClassCount、unloadedClassCount 和类加载器数量，检查热部署、动态代理、脚本引擎或 CGLIB 是否不断生成类。大量类由本应被回收的自定义 ClassLoader 持有，通常是类加载器泄漏。如果是 Direct buffer memory，则对比 JVM 堆、进程 RSS、BufferPool direct 指标和 MaxDirectMemorySize，必要时用 Native Memory Tracking 的 baseline/diff 查看 reserved 与 committed。Netty 场景还要检查 ByteBuf 是否 release、池化分配器指标和泄漏检测日志。',
    '如果是 unable to create native thread，我会同时看线程数、线程快照、-Xss、容器 pids.max、ulimit -u 和剩余本地内存。比如 3000 个线程、每线程栈 1MB，理论栈空间就可能接近 3GB，还没算堆、元空间和直接内存。大量线程同名且卡在同一调用，往往来自线程池无界扩张或每请求建线程。对于退出码 137，要比较容器 memory limit 与进程总 RSS，因为容器限制约束的是堆、线程栈、元空间、代码缓存、直接内存和 native 库的总和，Xmx 只覆盖其中一部分。',
    '取证动作本身也有风险。大堆 dump 会触发停顿和大量磁盘 I/O，所以先确认磁盘空间，优先在摘流实例执行；不能 dump 时先用 GC 日志、jcmd GC.class_histogram、JFR 和持续采样缩小范围。修复后我会用同样的流量和数据规模复现，验证 Full GC 后基线、RSS、线程数或类数量真正回落，并补上 HeapDumpOnOutOfMemoryError、错误文件路径、GC 日志轮转、容器内存告警和非堆分项指标。完整回答的重点是：按 OOM 类型选证据，区分泄漏与容量，再验证修复闭环。'
  ],
  keyPoints:['先摘流保护业务并保存故障时间线与现场','根据异常文本区分堆、元空间、直接内存、线程和系统 Kill','结合 GC 基线、Retained Size 与引用链判断堆问题','用 NMT、RSS、线程数和类加载指标分析非堆资源','修复后按原流量复现并验证内存能够回落'],
  relatedArticles:['jvm/production-oom-troubleshooting','jvm/runtime-data-area','jvm/production-memory-sizing'],
  followUps:[
    {
      id:'oom-process-killed',
      prompt:'进程被系统直接 Kill，没有留下 Java OOM 日志怎么办？',
      answer:[
        '这通常要先排查容器或操作系统 OOM Kill。查看 Pod 的 lastState、退出码 137、节点事件和内核日志，再把进程 RSS 与容器 memory limit 对齐。如果堆上限只有 2GB，但容器 3GB 仍被杀，差额可能来自直接内存、线程栈、元空间、代码缓存和 native 库。',
        '后续会打开 Native Memory Tracking 或补充进程级 RSS、direct buffer、线程数指标，并给容器预留非堆余量。仅把 Xmx 调小可能暂时避免 Kill，但必须找到堆外增长来源。'
      ],
      keyPoints:['退出码 137 优先检查系统 OOM Kill','容器限制约束的是总 RSS，不只是 Java 堆','用 NMT 和分项指标还原非堆内存'],
      relatedArticles:['jvm/production-oom-troubleshooting','jvm/production-memory-sizing'],
      followUps:[
        {
          id:'nmt-production-cost',
          prompt:'NMT 可以一直在生产环境开启吗？',
          answer:['NMT 的 summary 模式通常有可接受的性能和内存开销，适合长期保留；detail 模式提供更细的调用点信息，但开销更高，应先在压测环境评估并按排障窗口开启。关键是建立基线后做差异比较，而不是只看故障时的一张快照。'],
          keyPoints:['summary 与 detail 的开销不同','生产启用前需要压测评估','基线差异比单点数字更有价值'],
          relatedArticles:['jvm/production-oom-troubleshooting']
        }
      ]
    },
    {
      id:'oom-dump-risk',
      prompt:'Heap dump 会不会把线上服务拖垮？',
      answer:['可能。大堆转储会产生停顿、磁盘写入和额外 I/O，磁盘空间不足还可能引发二次故障。我会先确认磁盘容量和副本健康，优先在摘流后的实例执行；无法摘流时先用直方图、GC 日志和持续采样缩小范围，再选择低峰获取 dump。'],
      keyPoints:['转储前检查磁盘和服务副本','优先摘流实例保留现场','轻量证据可以先缩小排查范围'],
      relatedArticles:['jvm/production-oom-troubleshooting','jvm/gc-tuning']
    },
    {
      id:'oom-leak-or-capacity',
      prompt:'怎么区分内存泄漏和正常的容量不足？',
      answer:['我会观察多次 Full GC 后的老年代基线。如果流量稳定时基线持续阶梯式上涨且无法回落，通常更像泄漏；如果对象组成符合业务数据、基线随请求量升降且在扩容或降低并发后恢复，更像容量不足。两份不同时间的 dump 对比对象数量和引用链，比单份快照可靠。'],
      keyPoints:['观察 Full GC 后基线趋势','结合流量判断对象是否符合业务规模','使用多时间点快照做增量对比'],
      relatedArticles:['jvm/production-oom-troubleshooting','jvm/gc-guide']
    }
  ]
}

const mysqlIndexQuestion:PracticeQuestion={
  id:'mysql-index-not-used',
  sourceRef:'mysql/btree-index',
  category:'MySQL',
  difficulty:'中高级',
  durationMinutes:5,
  prompt:'MySQL 明明建了索引，查询为什么仍可能走全表扫描？你会怎么分析？',
  answer:[
    '我会先纠正一个常见表述：建了索引但走全表扫描，不一定叫“索引失效”。MySQL 优化器做的是成本选择，如果走二级索引要扫描大量记录并随机回表，而全表顺序扫描更便宜，它主动选择 ALL 可能是正确结果。因此排查目标不是强迫查询使用某个索引，而是确认 SQL 语义、数据分布、成本估算和实际执行之间哪里不一致。',
    '第一步要拿到完整上下文：SQL 和真实绑定参数、表结构、SHOW INDEX、数据量与分布、慢日志里的 rows_examined 和 lock_time，以及当前版本。随后使用 EXPLAIN FORMAT=JSON 看估算成本，MySQL 8.0.18 以上优先用 EXPLAIN ANALYZE 看实际执行。重点关注 type、possible_keys、key、key_len、rows、filtered 和 Extra，并对比每个算子的 estimated rows 与 actual rows。仅看到 key 为 NULL 还不够，要知道它为什么认为全表更便宜。生产执行 EXPLAIN ANALYZE 会真实运行 SQL，更新或删除语句需要特别谨慎。',
    '第二步检查 SQL 写法。常见问题包括没有满足联合索引最左前缀，在索引列上使用 DATE(create_time)、LOWER(name) 等函数，varchar 列与数字参数比较触发隐式类型转换，两个表关联列的字符集或排序规则不同，LIKE 以百分号开头，以及 OR 分支中存在无法使用索引的条件。例如 phone 是 varchar，但条件写 phone=13800138000，优化器可能对列逐行转数字，原有字符串有序性无法直接定位。修复方式是让参数类型与列一致，或建立真正匹配查询表达式的函数索引，而不是盲目加同一个普通索引。',
    '第三步看选择性和回表成本。假设 1000 万行订单表中 status 只有 4 个值，查询 status=\'PAID\' 返回 300 万行，即使 status 有索引，走二级索引也要访问 300 万个叶子项并按主键回表，随机 I/O 很可能比全表扫描贵。若业务只需要最近 100 条，可以建立 status、created_at、id 的联合索引，让条件过滤和排序一起完成，并通过覆盖列减少回表。但不能把 SELECT * 所有列都塞入索引，索引越宽，占用空间、写放大和缓冲池压力越大。',
    '第四步分析联合索引。字段顺序应由稳定查询模式决定，通常把必选等值条件放前面，再放范围或排序字段，并考虑覆盖。例如查询 tenant_id=? AND status=? AND created_at>? ORDER BY created_at LIMIT 50，可以考虑 tenant_id,status,created_at。tenant_id 区分度可能不高，但它是每次查询的固定隔离条件，仍适合放首列。遇到范围条件后，后续列通常不能继续缩小 B+Tree 扫描区间，但可能通过 Index Condition Pushdown 在存储引擎层过滤，也可能因覆盖索引避免回表，所以不能简单说后续列“完全失效”。',
    '第五步核对统计信息。如果 EXPLAIN 估算扫描 100 行而 EXPLAIN ANALYZE 实际是 20 万行，优化器很可能被过期统计或数据倾斜误导。可以先 ANALYZE TABLE 更新统计，必要时为倾斜列创建 histogram，并检查 innodb_stats_persistent 和采样页数。一个真实模式是新租户只有几百行，头部租户有几千万行，同一条 tenant_id 参数化 SQL 对不同租户的最优计划并不相同。此时除了统计信息，还可能需要拆分查询、冷热分离或针对头部租户改变索引设计。',
    '线上止损时可以在经过真实参数验证后临时使用 Force Index，但必须监控 rows_examined、P99 和计划变化，并安排移除。它会把今天的成本判断固化，数据增长或版本升级后可能阻止优化器选择更好的计划。最终验证要比较优化前后的 actual rows、loops、执行时间、回表次数和写入成本，而不只是看“key 有值”。面试收尾我会总结：先证明全表扫描是不是错误选择，再从 SQL 写法、选择性、联合索引、统计信息和回表成本逐层定位。'
  ],
  keyPoints:['先区分索引不可用与优化器主动选择全表扫描','用真实参数和 EXPLAIN ANALYZE 对比估算与实际','检查函数、隐式转换、LIKE 与关联列类型','联合索引同时考虑等值、范围、排序和覆盖','统计信息、数据倾斜与回表成本决定最终计划'],
  relatedArticles:['mysql/btree-index','mysql/sql-execution-explain','mysql/slow-sql-troubleshooting'],
  followUps:[
    {
      id:'mysql-composite-index-order',
      prompt:'设计联合索引时，字段顺序应该如何确定？',
      answer:[
        '先看稳定的查询模式，而不是机械地把区分度最高的字段放最左。通常把等值条件放前面，范围条件放后面，再考虑 ORDER BY、GROUP BY 和覆盖列，让一个索引完成尽可能多的过滤与排序。',
        '还要评估写入成本和索引复用度。例如 tenant_id 区分度不高，但所有查询都必须按租户隔离，它仍可能应该放在首列。最终用真实数据分布和 EXPLAIN ANALYZE 验证。'
      ],
      keyPoints:['字段顺序由查询模式决定','等值、范围、排序和覆盖要整体权衡','使用真实数据验证而非只看区分度'],
      relatedArticles:['mysql/btree-index','mysql/sql-execution-explain'],
      followUps:[
        {
          id:'mysql-range-index',
          prompt:'联合索引遇到范围条件后，后面的列一定失效吗？',
          answer:['不能简单说“失效”。后续列通常不能继续缩小 B+Tree 的扫描区间，但 MySQL 仍可能通过 Index Condition Pushdown 在存储引擎层过滤，覆盖索引也可能避免回表。要看 key_len、used_key_parts 和实际扫描行数，区分“定位范围”与“索引内过滤”。'],
          keyPoints:['范围定位与索引内过滤是两回事','ICP 可能继续使用后续列过滤','以执行计划和扫描数据为准'],
          relatedArticles:['mysql/btree-index','mysql/sql-execution-explain']
        }
      ]
    },
    {
      id:'mysql-implicit-conversion',
      prompt:'隐式类型转换为什么可能导致索引失效？',
      answer:['当比较两侧类型不同，MySQL 可能对索引列做转换。例如 varchar 列与数字常量比较时，列值可能被逐行转成数字，原有字符串有序性无法直接用于定位。应让参数类型和列类型一致，并检查字符集、排序规则不同造成的转换。预编译参数的绑定类型也需要核对。'],
      keyPoints:['对索引列计算会破坏原有有序定位','参数类型应与列定义一致','字符集和排序规则也会触发转换'],
      relatedArticles:['mysql/btree-index','mysql/slow-sql-troubleshooting']
    },
    {
      id:'mysql-force-index',
      prompt:'什么情况下可以使用 Force Index？',
      answer:['它适合统计信息异常或优化器短期误判时应急止损，并且必须用真实参数验证收益、监控扫描行数。长期方案仍应修复统计信息、SQL 或索引，因为数据分布和版本升级后，强制计划可能阻止优化器选择更好的索引。'],
      keyPoints:['仅作为经过验证的短期止损','上线后监控计划和扫描行数','长期修复成本估算或索引设计'],
      relatedArticles:['mysql/sql-execution-explain','mysql/slow-sql-troubleshooting']
    }
  ]
}

const cacheConsistencyQuestion:PracticeQuestion={
  id:'redis-cache-consistency',
  sourceRef:'redis/cache-consistency',
  category:'Redis',
  difficulty:'高级',
  durationMinutes:5,
  prompt:'更新数据库和缓存时，如何尽量保证数据一致性？为什么通常选择先更新数据库再删除缓存？',
  answer:[
    '我会先明确一致性目标。数据库和 Redis 是两个独立系统，两次普通写操作没有共同事务，所以“任何时刻绝对一致”通常做不到。多数缓存场景追求的是数据库作为权威数据源、缓存最终一致，并把脏数据窗口控制在业务能接受的范围内。如果库存扣减、余额等场景要求读取结果立即正确，就不应该让普通缓存承担最终判定，应该直接读数据库、使用带版本的状态机，或重新设计一致性边界。',
    '常用方案是 Cache Aside。读流程先查缓存，命中直接返回；未命中时查数据库并把结果写入缓存。写流程先在数据库事务中完成更新，事务提交成功后删除缓存，而不是直接更新缓存。选择删除有三个原因：第一，缓存值可能由多张表计算，写请求不一定有完整数据；第二，并发更新缓存可能发生后写数据库的请求先写缓存，造成顺序倒置；第三，很多写入后的数据并不会立刻读取，直接更新会做无效计算。删除让下一次读取从权威数据库重建。',
    '为什么不先删缓存再更新数据库？假设缓存原值是 A。写线程先删除缓存，还没提交数据库；此时读线程缓存未命中，从数据库读到旧值 A，并把 A 回填；随后写线程把数据库改成 B。最终数据库是 B，缓存却长期保持 A，直到 TTL 到期。先更新数据库再删除缓存也有一个很窄的竞争：读线程在更新提交前读到 A，写线程提交 B 并删缓存，读线程随后回填 A。但这要求读数据库和回填的窗口跨过完整写事务，概率通常更低，还能通过回填前版本校验或短 TTL 进一步收敛。',
    '先更新数据库再删缓存的主要工程问题是删除失败。不能只在请求线程里重试三次，因为进程在事务提交后崩溃，重试状态就丢了。更可靠的做法有两类：一种是在同一数据库事务中写 outbox 事件，由后台任务投递缓存失效消息；另一种是订阅 binlog，把数据变更转换成删除事件。消费者以业务 key 幂等删除 Redis，失败使用指数退避进入重试队列，超过阈值进入死信并告警。删除操作天然幂等，因此比携带新值更新缓存更能容忍重复和乱序。',
    '如果同一个 key 连续从版本 10 更新到 11、12，单纯收到多次删除消息，乱序通常没有问题；但如果消息携带值回写缓存，版本 11 的消息晚到就可能覆盖 12。此时必须按业务 key 分区保证局部顺序，或让消息携带数据库版本，只接受更高版本。缓存键也建议包含版本或命名空间，批量结构变更时可以切换版本而不是扫描删除全部 key。TTL 仍然需要设置，但它只是最后兜底，不能把 30 分钟脏数据窗口解释成一致性方案。',
    '还要处理缓存未命中时的并发回源。热点 key 过期后，几千个请求可能同时查询数据库。可以使用互斥重建，只让一个请求回源，其余短暂等待；或者保存逻辑过期时间，返回可接受的旧值并由单个后台任务刷新。锁必须有超时和 owner 校验，回源还要设置并发上限。对于不存在的数据，可以缓存短 TTL 的空值或使用布隆过滤器，但要防止误判和缓存穿透攻击。这样一致性方案才不会在缓存失效时演变成数据库雪崩。',
    '举个数字化例子：商品详情 QPS 2 万，数据库只能稳定承受每秒 800 次查询。更新接口提交数据库后写入 outbox，P99 在 150ms 内完成缓存删除；监控要求 outbox 未投递数量低于 100、事件延迟低于 1 秒。热点 key 使用逻辑过期，每次只允许一个刷新任务，旧值最多保留 3 秒。出现消费者停滞时，业务明确接受最多 5 秒旧详情，但下单价格仍回数据库校验。收尾我会强调：数据库是权威源，先提交数据库再可靠失效缓存，用幂等事件、版本、TTL 和回源保护一起控制不一致窗口。'
  ],
  keyPoints:['先定义强一致还是可量化的最终一致','Cache Aside 写流程采用数据库提交后删除缓存','用并发时序解释先删缓存的旧值回填风险','通过 outbox 或 binlog 可靠重试删除事件','结合版本、TTL 和热点回源保护形成完整闭环'],
  relatedArticles:['redis/cache-consistency','architecture/cache-consistency','architecture/idempotency'],
  followUps:[
    {
      id:'cache-delete-failure',
      prompt:'数据库提交成功，但删除缓存失败了怎么办？',
      answer:[
        '不能只在请求线程里重试几次，因为进程崩溃后重试状态会丢。可以在同一个数据库事务中写 outbox 事件，后台投递删除缓存；或者订阅 binlog，把数据变更转换为失效事件。消费者按业务键幂等删除，失败进入带退避的重试队列和死信告警。',
        '缓存 TTL 是最后防线而不是主方案。还要监控事件延迟和重试堆积，因为系统表面可用时，缓存一致性链路可能已经停止。'
      ],
      keyPoints:['可靠事件必须和数据库提交建立关系','删除操作天然适合幂等重试','监控事件延迟而不只监控调用错误'],
      relatedArticles:['redis/cache-consistency','architecture/cache-consistency','kafka/reliability'],
      followUps:[
        {
          id:'cache-event-order',
          prompt:'同一个 key 连续更新，失效消息乱序怎么办？',
          answer:['单纯删除缓存时乱序影响通常较小，因为多次删除是幂等的；如果事件携带新值更新缓存，就必须按业务 key 分区保证顺序，或携带数据库版本号，只接受更高版本。相比更新缓存，失效缓存对消息重复和乱序更宽容。'],
          keyPoints:['删除比更新更能容忍乱序','按业务 key 分区可维护局部顺序','版本号可以阻止旧事件覆盖新值'],
          relatedArticles:['redis/cache-consistency','kafka/message-ordering']
        }
      ]
    },
    {
      id:'cache-double-delete',
      prompt:'延迟双删能彻底解决缓存一致性问题吗？',
      answer:['不能。第二次删除的延迟很难覆盖所有读请求、主从复制和网络抖动时间，进程宕机也可能让第二次删除不执行。它可以作为某些低成本场景的补偿，但更可靠的方式是用事务事件或 binlog 驱动失效，并监控消费延迟。'],
      keyPoints:['固定延迟无法覆盖所有并发时序','进程故障会丢失第二次删除','可靠变更事件比定时猜测更稳定'],
      relatedArticles:['redis/cache-consistency','architecture/cache-consistency']
    },
    {
      id:'cache-hot-key-rebuild',
      prompt:'热点 key 失效时如何避免大量请求同时回源？',
      answer:['可以用互斥重建，只允许一个请求查询数据库并回填，其余请求短暂等待或返回旧值；也可以使用逻辑过期，由后台线程异步刷新。无论哪种都要限制回源并发并给锁设置超时，避免缓存问题演变成数据库雪崩。'],
      keyPoints:['限制同一 key 的回源并发','按业务容忍度选择等待或返回旧值','锁超时与降级必须成对设计'],
      relatedArticles:['redis/cache-problems','redis/hot-key-big-key','redis/distributed-lock']
    }
  ]
}

const kafkaReliabilityQuestion:PracticeQuestion={
  id:'kafka-message-reliability',
  category:'Kafka',
  difficulty:'中高级',
  prompt:'Kafka 如何保证消息尽量不丢？生产者、Broker 和消费者分别要做什么？',
  answer:[
    '这题要按链路分三段。生产者开启幂等，使用 acks=all，并设置合理的重试与 delivery.timeout.ms，异步发送必须处理回调失败；有顺序要求时还要控制同一 key 的分区和飞行请求。Broker 侧使用足够的副本数，设置 min.insync.replicas，避免在 ISR 不足时仍接受写入，并禁用不安全的 leader 选举。',
    '消费者要在业务处理成功后再提交位点，关闭或谨慎使用自动提交。先处理后提交会带来至少一次语义，所以数据库写入要用业务唯一键、去重表或状态机保证幂等。还要监控发送失败、ISR 收缩、UnderReplicatedPartitions、消费延迟和重试堆积。Kafka 的可靠性是端到端配置与业务幂等共同实现的，不是单个 acks 参数。'
  ],
  keyPoints:['生产、存储、消费三个阶段分别建立保障','acks=all 必须和副本及 ISR 配置配合','至少一次消费最终依赖业务幂等'],
  relatedArticles:['kafka/message-loss-prevention','kafka/reliability','kafka/duplicate-consumption-idempotency'],
  followUps:[
    {
      id:'kafka-acks-all',
      prompt:'acks=all 是否意味着消息绝对不会丢？',
      answer:[
        '不意味着。acks=all 表示 ISR 中的副本确认后才成功，但如果 min.insync.replicas=1，实际可能只有 leader 一个副本确认；如果允许 unclean leader election，落后的副本也可能被选为 leader。生产者还可能忽略回调失败，或者在超时后误判发送结果。',
        '因此要组合 replication.factor、min.insync.replicas、unclean.leader.election.enable、生产者重试和错误处理，并监控 ISR。可靠性来自一组互相约束的配置。'
      ],
      keyPoints:['acks=all 的强度取决于 ISR 下限','不安全选主可能丢失已确认消息','客户端必须处理最终发送结果'],
      relatedArticles:['kafka/message-loss-prevention','kafka/isr-leader-election'],
      followUps:[
        {
          id:'kafka-min-isr',
          prompt:'三副本主题的 min.insync.replicas 通常为什么设为 2？',
          answer:['设为 2 可以在容忍一个副本故障的同时，要求至少两个同步副本确认写入。如果只剩一个 ISR，Broker 会拒绝 acks=all 的写入，用可用性换取不在单副本状态继续积累风险。具体值仍要结合跨机架部署和业务可用性目标。'],
          keyPoints:['两份同步数据后才确认','单副本时主动拒绝写入','副本必须跨故障域部署'],
          relatedArticles:['kafka/reliability','kafka/isr-leader-election']
        }
      ]
    },
    {
      id:'kafka-offset-timing',
      prompt:'消费位点应该在业务处理前提交还是处理后提交？',
      answer:['处理前提交可能在业务失败或进程崩溃时永久丢消息；处理后提交不会丢，但崩溃恢复后可能重复消费。因此通常选择处理成功后提交，再通过幂等消化重复。批量消费时还要明确失败记录如何重试，不能因为一条失败就错误提交整个批次。'],
      keyPoints:['处理前提交偏向至多一次','处理后提交形成至少一次','批量位点必须与失败重试边界一致'],
      relatedArticles:['kafka/message-loss-prevention','kafka/duplicate-consumption-idempotency']
    },
    {
      id:'kafka-idempotent-producer',
      prompt:'生产者幂等能解决消费者重复处理吗？',
      answer:['不能。生产者幂等主要避免同一生产会话因网络重试在分区内写入重复记录，无法阻止消费者在处理成功但提交位点前崩溃后再次读取。消费者仍需使用业务唯一键、去重记录或幂等状态更新。'],
      keyPoints:['生产者幂等只覆盖发送重试','位点提交窗口仍会造成重复消费','端到端幂等必须落实到业务结果'],
      relatedArticles:['kafka/duplicate-consumption-idempotency','kafka/transactions-exactly-once']
    }
  ]
}

function compactParagraph(value:string,max=180){
  if(value.length<=max)return value
  const sentences=value.match(/[^。！？；]+[。！？；]?/g)||[value]
  let output=''
  for(const sentence of sentences){
    if(output.length+sentence.length>max&&output.length>=Math.floor(max*.58))break
    output+=sentence
  }
  return(output||value.slice(0,max)).trim()
}
function compactCuratedQuestion(question:PracticeQuestion):PracticeQuestion{
  const selected=question.answer.length>5?[question.answer[0],question.answer[2],question.answer[3],question.answer[5],question.answer[6]]:question.answer
  const extra=curatedPracticeMeta.find(meta=>meta.sourceRef===question.sourceRef)
  return{...question,...extra,durationMinutes:3,answer:selected.map(paragraph=>compactParagraph(paragraph))}
}

export const curatedQuestions:PracticeQuestion[]=[
  practiceQuestion,
  threadPoolQuestion,
  oomQuestion,
  mysqlIndexQuestion,
  cacheConsistencyQuestion
].map(compactCuratedQuestion)

export function mergePracticeIndex(generated:PracticeQuestionSummary[]){
  const curatedByRef=new Map(curatedQuestions.map(question=>[question.sourceRef,question]))
  return generated.map(summary=>{
    const curated=curatedByRef.get(summary.sourceRef)
    return curated?{id:curated.id,sourceRef:curated.sourceRef,category:curated.category,difficulty:curated.difficulty,durationMinutes:curated.durationMinutes,type:curated.type,prompt:curated.prompt}:summary
  })
}
export const curatedQuestionById=(id:string)=>curatedQuestions.find(question=>question.id===id)
