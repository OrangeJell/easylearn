import{proof as p}from'../content-depth/profile.mjs'

export const javaBasicProofs={
  'java-basic/string-immutable':p([['java.lang.String','value、coder、hash 字段及 equals/hashCode 实现'],['java.lang.invoke.StringConcatFactory','JDK 9+ invokedynamic 字符串拼接策略']],'java',`var text = new StringBuilder(64);
for (int i = 0; i < 100_000; i++) text.append(i);
String result = text.toString();`,'用 JFR 的 Object Allocation in New TLAB 对比循环加号与预估容量 StringBuilder；固定输入和预热轮次，确认分配下降而结果一致。',[['10 万次数字拼接','记录总分配字节','分配量增加 5 倍以上','先检查中间 String 与数组扩容'],['字符串池条目','只监控受控字面量/枚举','随用户输入持续增长','停止无界 intern'],['缓存键命中率','应与业务基线稳定','发布后突降','检查键内容、编码和可变来源']],['把循环拼接改为单个 Builder 并预估容量','移除无界 intern，保留明确枚举集合','冻结键对象与字符集并回放失败样本']),
  'java-basic/equals-hashcode':p([['java.lang.Object','equals/hashCode 默认身份语义'],['java.util.HashMap#putVal/getNode','哈希、桶定位、equals 确认顺序']],'java',`record OrderKey(long tenantId, String orderNo) {}
Set<OrderKey> seen = new HashSet<>();
assert !seen.add(new OrderKey(1, "A-100"));`,'生成 100 万个键，分别使用恒定 hashCode 与 record 默认实现，比较桶冲突、put/get P99 和去重结果；测试必须包含字段修改后的查找。',[['相等对象样本','hashCode 必须完全相同','出现任意不一致','阻止上线并补契约测试'],['百万键装载因子','默认 0.75 下容量约 2^21','大量桶树化','检查哈希离散度'],['重复订单率','唯一键口径应为 0','出现非零','对照 equals 字段和数据库唯一键']],['同时重写 equals/hashCode 并加入 EqualsVerifier 类测试','把可变键替换为不可变 record','父子类相等改为组合或统一 canEqual 规则']),
  'java-basic/generics':p([['javap -v Signature','观察泛型签名与擦除后描述符'],['java.lang.reflect.Type','ParameterizedType、TypeVariable 的运行期元数据']],'java',`static <T> void copy(List<? extends T> src, List<? super T> dst) {
  dst.addAll(src);
}`,'编译泛型实现并用 javap -c -v 查看 checkcast 与 bridge 方法；再故意通过原始类型制造 heap pollution，记录异常真正发生的位置。',[['编译告警','-Xlint:unchecked 应为 0','出现 unchecked','定位原始类型边界'],['调用处强转','公共 API 目标为 0','数量持续增加','重新表达类型关系'],['bridge 方法','与重写层次匹配','意外增加','检查擦除后签名冲突']],['启用 -Xlint:all 并把告警当构建失败','用 TypeToken/Class 显式携带运行期类型','隔离遗留原始类型并在边界校验元素']),
  'java-basic/exception-handling':p([['java.lang.Throwable','cause、suppressed、stackTrace 保存方式'],['java.lang.AutoCloseable','try-with-resources 逆序关闭契约']],'java',`try (var in = Files.newInputStream(path)) {
  return in.readAllBytes();
} catch (IOException e) {
  throw new ImportException("读取失败: " + path, e);
}`,'构造“业务读取失败+close 失败”资源，断言主异常与 getSuppressed；再在接口边界验证错误码、HTTP 状态和日志只记录一次。',[['非预期异常率','按接口保持稳定基线','5 分钟翻倍','关联发布与输入类型'],['重复堆栈数','同一 requestId 通常 1 次','每层都打印','收敛到边界日志'],['结果未知操作','必须有请求号可查询','被标成确定失败','暂停自动重试']],['把吞异常改为保留 cause 的语义转换','关闭中间层重复 ERROR 日志','结果未知状态进入查询/对账而非直接重试']),
  'java-basic/reflection-annotations':p([['java.lang.Class#getDeclaredMethods','声明成员扫描和访问边界'],['java.lang.invoke.MethodHandles','Lookup 与 MethodHandle 的类型安全调用']],'java',`private static final ClassValue<List<Method>> HANDLERS = new ClassValue<>() {
  protected List<Method> computeValue(Class<?> type) { return scan(type); }
};`,'用 JMH 对比每次 getDeclaredMethods、缓存 Method 和 MethodHandle；分别记录冷启动扫描与稳态调用，不能混为一个平均值。',[['冷启动扫描','应用预算内一次完成','超过启动预算 20%','缓存元数据或编译期生成'],['稳态反射调用','不应成为 Top 热点','CPU 占比超过 5%','切换 MethodHandle/生成代码'],['非法访问数','生产目标为 0','JDK 升级后出现','修复模块 opens 或去私有反射']],['把扫描移到启动期并用 ClassValue 缓存','为可实例化类型建立白名单','高频路径用 MethodHandle 或生成代码替换']),
  'java-basic/serialization':p([['java.io.ObjectInputFilter','原生反序列化类与尺寸过滤'],['com.google.protobuf.UnknownFieldSet','Protobuf 未知字段兼容保留']],'java',`var filter = ObjectInputFilter.Config.createFilter(
    "maxdepth=20;maxrefs=10000;java.base/*;com.acme.dto.*;!*"
);`,'准备旧版、新版和含未知字段三组消息，执行双向兼容测试；同时生成超深对象图和超大数组验证过滤器在分配前拒绝。',[['报文 P99 大小','小于 Broker/网关上限 50%','接近上限 80%','拆消息或改紧凑协议'],['解码 P99','低于端到端预算 10%','超过预算 20%','定位字段与分配'],['兼容失败数','发布前为 0','灰度出现任意失败','停止扩量并回滚 Schema']],['拒绝 Java 原生序列化外部输入','Schema 兼容检查加入 CI','设置报文、深度、引用数和类型白名单']),
  'java-basic/interface-abstract-class':p([['java.util.AbstractList','骨架实现如何复用最小原语'],['java.util.ServiceLoader','接口作为插件发现边界']],'java',`interface PaymentChannel { Receipt pay(Command cmd); }
final class PaymentService {
  PaymentService(PaymentChannel channel, RiskPolicy risk) { }
}`,'用一个新增渠道验证扩展：若需要修改基类多个 if 或空实现无关方法，记录为接口隔离失败；再用替身实现运行契约测试。',[['实现类空方法比例','目标为 0','出现空实现/Unsupported','拆分能力接口'],['基类条件分支','不应随子类线性增长','每加实现都改基类','改为组合策略'],['契约测试通过率','所有实现 100%','某实现失败','阻止注册该实现']],['把胖接口拆成支付、退款、查询能力','共享流程移到编排器而非可变基类','为所有实现复用同一组契约测试']),
  'java-basic/overload-override':p([['javap invokevirtual/invokestatic','区分运行期虚分派与静态调用'],['java.lang.Class#getMethods','桥接、继承与重写后的可见方法']],'java',`static void print(Object x) { }
static void print(String x) { }
Object value = "text";
print(value); // 编译期选择 print(Object)`,'编译包含 null、装箱、可变参数和父类静态类型的调用矩阵，用 javap 确认描述符；升级 API 前跑二进制兼容检查。',[['重载候选数','同语义控制在少量','超过 5 个且类型接近','改不同方法名/参数对象'],['null 歧义编译数','目标为 0','新增重载后出现','撤回或改变签名'],['重写契约测试','子类全部通过','异常/前置条件变严','修复里氏替换']],['语义不同的重载改为明确方法名','公共 API 新增重载前跑源码兼容测试','多变行为提取策略而非加继承层']),
  'java-basic/pass-by-value':p([['JVM Spec 2.6 Frames','局部变量表与操作数栈槽位'],['javap astore/aload','观察引用值复制和形参重新赋值']],'java',`static void replace(User user) { user = new User("new"); }
static void mutate(User user) { user.rename("new"); }`,'在调用前后记录 System.identityHashCode 与字段值，分别验证 replace 和 mutate；并发场景再检查共享可变对象是否存在数据竞争。',[['调用方引用身份','replace 前后应相同','意外替换来自返回值/容器','追踪赋值点'],['对象字段变化','仅 mutate 可见','非预期字段改变','检查别名共享'],['共享引用线程数','单所有者最佳','多线程无同步','改不可变或加所有权']],['需要替换时显式返回新对象','跨线程传递不可变 DTO','消除隐藏修改并在 API 名称表达副作用']),
  'java-basic/autoboxing-integer-cache':p([['java.lang.Integer#valueOf','IntegerCache 范围与复用'],['javap invokestatic/intValue','观察装箱、拆箱插入点']],'java',`Integer a = 127, b = 127;
Integer c = 128, d = 128;
assert a == b;
assert !c.equals(null) && c.equals(d);`,'编译数值比较、三元表达式和集合流操作，使用 javap 定位 valueOf/intValue；JFR 对比 Integer 流与 IntStream 的分配。',[['包装类分配率','非热点路径可忽略','进入分配 Top 10','改基本类型流/数组'],['拆箱 NPE','目标为 0','出现任意样本','在边界定义 null 语义'],['引用比较扫描','业务代码目标为 0','Integer 使用 ==','替换 equals/数值比较']],['禁止包装数值用 == 做业务判断','可空数值在边界显式校验','高频计算改用基本类型专用 API'])
}
