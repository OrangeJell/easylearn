import{proof as p}from'../content-depth/profile.mjs'
const q=(a,s,e,m,x,l='text')=>p(a,l,s,e,[[m,'记录活动/稳态基线','超过容量或 SLO','触发降级'],['端到端 P99','小于预算','突破预算','停止扩量'],['状态差异','0','任意非零','补偿并对账']],x)
export const architectureProofs={
 'architecture/cache-consistency':q([['数据库 commit/binlog','事实版本'],['缓存 value.source_version','旧值识别']],`UPDATE entity ...; COMMIT; DELETE cache:key;`,'固定慢回填、删缓存失败和乱序 CDC，测最大陈旧窗口。','缓存/源版本差',['提交后删并可靠重试','回填带版本条件','强一致读绕缓存']),
 'architecture/idempotency':q([['数据库 UNIQUE(idempotency_key)','并发最终裁决'],['请求状态机','PROCESSING/SUCCESS/FAILED_UNKNOWN']],`INSERT INTO request_log(request_id,status) VALUES (?, 'PROCESSING');`,'在登记前后、业务提交后、返回前 kill，重放同一 key 核对结果。','幂等冲突率',['业务意图生成稳定 key','记录与业务同事务','处理中超时用租约接管'],'sql'),
 'architecture/rate-limiting':q([['网关限流决策日志','维度、规则、结果'],['下游连接/线程水位','真实保护对象']],`rate=5000/s; burst=1000; max_concurrency=300`,'阶跃流量与慢请求分别压测 QPS、并发、加权成本三种限制。','放行/拒绝',['按下游可持续能力设阈值','限 QPS 同时限并发','限流器故障保守降级']),
 'architecture/resilience':q([['Resilience4j CircuitBreaker events','状态与窗口'],['调用链 retry_count','重试放大']],`timeout=300ms; maxAttempts=2; waitDuration=50ms; failureRateThreshold=50%`,'让下游延迟、错误、恢复逐段变化，验证超时、熔断、半开和渐进恢复。','重试放大倍数',['总预算逐级递减','只重试幂等瞬时错误','隔离池与下游容量对齐']),
 'architecture/delayed-task':q([['task 状态表+due_at 索引','持久时间索引'],['租约 owner/lease_until','重复领取恢复']],`UPDATE task SET owner=?,lease_until=? WHERE id=? AND status='READY' AND due_at<=NOW();`,'在领取、执行、提交、ack 各点崩溃，核对至少一次与幂等。','到期到执行延迟',['业务与任务同事务/Outbox','租约超时可接管','失败分类退避+死信'],'sql'),
 'architecture/distributed-id':q([['worker_id 租约表','节点号唯一'],['数据库 UNIQUE(id)','最终碰撞裁决']],`id=(timestamp<<22)|(workerId<<12)|sequence`,'模拟时钟回拨、同 workerId 和单毫秒序列耗尽，统计停发/冲突。','生成失败率',['workerId 租约+启动检测','回拨切逻辑时钟/隔离','存储保留唯一约束']),
 'architecture/distributed-transaction':q([['transaction/outbox 状态表','全局步骤证据'],['补偿流水 UNIQUE(tx_id,step)','幂等补偿']],`BEGIN; UPDATE orders ...; INSERT INTO outbox(tx_id,event) ...; COMMIT;`,'每个步骤前后故障注入，验证重试、补偿、悬挂和对账终态。','状态超时数',['每步持久状态机','补偿也幂等','超时扫描+人工终态'],'sql'),
 'architecture/observability':q([['OpenTelemetry semantic conventions','Trace/Metric 属性'],['SLO burn-rate rule','用户影响告警']],`http.server.request.duration{service,route,status}
trace_id/request_id/tenant_id/release_version`,'注入单租户错误、慢依赖和发布回归，验证能从告警到 Trace 再到日志。','错误 Trace 完整率',['错误与长尾优先采样','限制高基数标签','告警带 owner/runbook/release']),
 'architecture/flash-sale-system-design':q([['Redis Lua/Stream','预扣与待投递证据'],['订单 UNIQUE(request_id)','最终不超卖裁决']],`peak=1_000_000QPS; stock=10_000; db_write=3_000/s; queue>=success_peak`,'阶跃百万请求并注入 Redis、MQ、消费者和关单故障，按 request_id 对账。','各层淘汰率',['失败请求尽早结束','预扣+事件可恢复记录','数据库唯一/条件更新收口']),
 'architecture/config-distribution-gray-release':q([['不可变 config version/diff','审计与回滚'],['客户端 applied_version','收敛证据']],`version=20260723.42; canary=1%; guard=error_rate<1%; autoRollback=true`,'发布非法值、断线客户端和灰度指标恶化，测收敛与回滚。','版本收敛率',['Schema/领域校验','快照原子替换','稳定灰度+业务守护'])
}
