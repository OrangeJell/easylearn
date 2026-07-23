import{proof as p}from'../content-depth/profile.mjs'
const j=(a,s,e,n,x)=>p(a,'java',s,e,n,x)
export const concurrencyProofs={
  'concurrency/thread-pool':j([['ThreadPoolExecutor#execute','核心线程→队列→最大线程→拒绝'],['ThreadPoolExecutor#getTask','取任务、超时回收和 worker 生命周期']],`new ThreadPoolExecutor(16, 32, 60, SECONDS,
  new ArrayBlockingQueue<>(500), factory,
  new ThreadPoolExecutor.AbortPolicy());`,'按 Little 定律用到达率×服务时间估算在途量，再注入 5 倍峰值与慢下游，观察拒绝是否早于连接池耗尽。',[['队列等待 P99','<端到端预算 20%','超过 50%','任务已过期'],['active/max','稳态留 30% 余量','持续 100%','线程不足或下游慢'],['拒绝率','平时 0、峰值可控','无告警增长','过载未反馈']],['有界队列+显式拒绝','分离 CPU 与阻塞任务池','线程数受下游连接数约束']),
  'concurrency/volatile-happens-before':j([['JLS 17.4.5','volatile 写读的 happens-before'],['VarHandle acquire/release','比 volatile 更细的访问模式']],`final class ConfigHolder {
  private volatile Config current;
  void publish(Config next) { current = next; }
}`,'用 jcstress 编写发布测试，错误版本先写 ready 再写 data，正确版本发布不可变对象；统计禁止结果是否出现。',[['jcstress forbidden','必须 0','出现 1 次即失败','缺同步边'],['旧配置窗口','一次 volatile 读后为 0','跨调用混读','未固定快照'],['volatile 写频率','低频发布','成为 CPU 热点','模型选错']],['把多字段封装为不可变快照一次发布','读方法只读取一次 volatile 引用','计数器改 Atomic/LongAdder']),
  'concurrency/locks-aqs':j([['AbstractQueuedSynchronizer#acquire','tryAcquire、入队与 park'],['AbstractQueuedSynchronizer#release','state 释放与 unparkSuccessor']],`lock.lockInterruptibly();
try { update(); }
finally { lock.unlock(); }`,'用 JFR Java Monitor Blocked/Thread Park 对比公平与非公平锁；注入中断、超时和取消验证队列可前进。',[['持锁 P99','短于 1ms 示例基线','超过请求预算 10%','临界区过大'],['AQS 队列长度','稳态接近 0','持续增长','竞争饱和'],['park 次数','与冲突一致','无流量仍高','唤醒风暴']],['I/O 移出锁内','必须 finally 解锁','自定义同步器补取消/中断测试']),
  'concurrency/thread-lifecycle-communication':j([['java.lang.Thread.State','六种 JVM 线程状态'],['ObjectMonitor/LockSupport','wait/notify 与 park/unpark 差异']],`synchronized (queue) {
  while (queue.isEmpty()) queue.wait();
  task = queue.remove();
}`,'启动两个消费者和一个生产者，制造伪唤醒/竞争；用 jstack 区分 BLOCKED、WAITING 和 TIMED_WAITING。',[['等待线程数','与空闲消费者一致','请求堆积仍 WAITING','通知/条件错误'],['BLOCKED P99','接近 0','持续上升','锁竞争'],['通知到运行','受调度但稳定','长尾秒级','锁未释放/线程饥饿']],['if wait 改 while','通知与状态修改放同一锁','优先 BlockingQueue/CountDownLatch']),
  'concurrency/cas-aba':j([['VarHandle#compareAndSet','原子比较交换与内存语义'],['AtomicStampedReference','引用+版本戳双字段 CAS']],`AtomicStampedReference<Node> top = new AtomicStampedReference<>(null, 0);
int[] stamp = new int[1];
Node current = top.get(stamp);`,'构造 T1 暂停、T2 A→B→A 的确定调度，比较普通 AtomicReference 与带戳版本；高冲突下测 CAS 失败率。',[['CAS 失败率','<10% 示例','>30%','自旋成本过高'],['单次自旋数','少量重试','无上限增长','加退避/锁'],['版本回绕','生命周期内不可达','接近上限','扩大版本或不复用节点']],['副作用移出 CAS 更新函数','ABA 敏感结构加版本戳','高冲突改锁/分段']),
  'concurrency/completable-future':j([['CompletableFuture#uniApply/uniCompose','阶段完成与依赖触发'],['ForkJoinPool.commonPool','默认异步执行器及阻塞风险']],`try (var pool = Executors.newFixedThreadPool(32)) {
  return CompletableFuture.supplyAsync(client::load, pool)
      .orTimeout(300, MILLISECONDS);
}`,'注入一个 2s 下游，验证 Future 超时后底层连接是否仍占用；记录各阶段线程名、队列和取消结果。',[['阶段 P99','各自受子预算约束','总和超过入口','预算失配'],['超时后存活任务','目标 0 或有界','持续增加','底层未取消'],['执行器队列','稳态低水位','单调增长','异步积压']],['独立有界执行器','客户端超时与 Future 超时同时设置','异常保留根因而非转 null']),
  'concurrency/threadlocal':j([['ThreadLocal$ThreadLocalMap','弱 Key、强 Value 与 stale entry'],['ThreadLocal#remove','清除当前线程槽位']],`scope.set(context);
try { chain.doFilter(request, response); }
finally { scope.remove(); }`,'单线程池依次处理两个租户请求，第一请求故意异常；断言第二请求读不到旧上下文，并用堆转储检查 Value 保留。',[['请求后残留','目标 0','任一非空','缺 finally remove'],['Value P99 大小','仅小上下文','持有 MB 对象','改显式存储'],['串号事件','目标 0','任意出现','立即下线污染实例']],['入口统一 scope/finally','核心业务依赖显式传参','异步使用框架上下文传播']),
  'concurrency/deadlock':j([['ThreadMXBean#findDeadlockedThreads','JVM 可拥有同步器死锁检测'],['jcmd Thread.print -l','锁拥有者与等待者现场']],`long first = Math.min(fromId, toId);
long second = Math.max(fromId, toId);
lock(first); lock(second);`,'用 CountDownLatch 固定两个线程反向拿锁，确认检测器识别；修复后循环 10 万次并注入 tryLock 超时。',[['死锁线程数','必须 0','>0','立即摘流量'],['锁等待 P99','低于事务预算','持续增长','锁顺序/长事务'],['超时重试率','低个位数','形成风暴','退避和限次']],['全局排序加锁','锁内禁止远程 I/O','超时后完整回滚并幂等重试']),
  'concurrency/java-memory-model':j([['JLS 17.4','内存动作、同步顺序与 happens-before'],['HotSpot OrderAccess/VarHandle','屏障在 JVM 的实现入口']],`private static volatile Holder instance;
static Holder get() {
  Holder h = instance;
  if (h == null) synchronized (Holder.class) { if ((h = instance) == null) instance = h = new Holder(); }
  return h;
}`,'用 jcstress 验证安全发布、this 逸出和消息传递；不要用 sleep 证明正确，必须枚举允许/禁止结果。',[['forbidden outcome','必须 0','出现即数据竞争','补同步'],['锁竞争','与写频率匹配','读路径也竞争','改安全发布'],['默认值观察','必须 0','出现 0/null','构造逸出']],['不可变对象通过 volatile/final 发布','消除构造期间 this 逸出','用同步器替代时间等待']),
  'concurrency/virtual-threads':j([['java.lang.VirtualThread','mount/unmount 与 continuation'],['JFR VirtualThreadPinned','载体线程被固定事件']],`try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
  semaphore.acquire();
  try { return executor.submit(client::load).get(); }
  finally { semaphore.release(); }
}`,'以 1万并发阻塞任务压测，分别限制/不限数据库许可；开启 jdk.tracePinnedThreads 或 JFR 检查 synchronized 内阻塞。',[['虚拟线程数','可高但受内存预算','持续不回落','任务泄漏'],['pinned 时长','接近 0','P99 超 10ms','锁/native 阻塞'],['连接等待','低于请求预算','连接池饱和','加 Semaphore/限流']],['保留下游并发许可','synchronized 阻塞段改显式锁/移出','限制 ThreadLocal 大对象'])
}
