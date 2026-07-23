import{proof as p}from'../content-depth/profile.mjs'
const q=(a,s,e,n,x)=>p(a,'text',s,e,n,x),N=(m,r)=>[[m,'记录分区基线','超过基线 2 倍',r],['P99 延迟','小于业务预算','突破预算',r],['端到端差异','0','任意非零','停止并对账']],X=(a,b,c)=>[a,b,c]
export const kafkaProofs={
 'kafka/consumer-group':q([['ConsumerGroupCoordinator','组状态与位点'],['kafka-consumer-groups.sh','成员、分配和 Lag']],`kafka-consumer-groups.sh --bootstrap-server broker:9092 --describe --group orders`,'滚动发布与扩缩容，比较 eager/cooperative 的停顿和分区迁移。',N('rebalance 次数','组不稳定'),X('CooperativeStickyAssignor','static membership','处理时长匹配 poll interval')),
 'kafka/reliability':q([['ReplicaManager','Leader 写与 ISR'],['kafka-topics.sh --describe','副本/ISR 分布']],`acks=all
enable.idempotence=true
min.insync.replicas=2`, '依次杀 Leader、落后副本和断网络，核对已确认消息。',N('UnderReplicatedPartitions','副本不健康'),X('acks=all+min ISR','禁用 unclean election','消费后提交位点')),
 'kafka/duplicate-consumption-idempotency':q([['ConsumerCoordinator','offset 提交'],['数据库唯一业务键','最终副作用裁决']],`UNIQUE(event_id, event_type)`, '在业务提交后、offset 提交前 kill 消费者，验证重放只返回旧结果。',N('幂等冲突','重复投递'),X('最终写唯一约束','记录处理中/成功状态','保留期覆盖最大回放')),
 'kafka/message-backlog-troubleshooting':q([['records-lag-max','分区最大积压'],['consumer-fetch-manager-metrics','拉取与消费速率']],`catch_up_seconds = lag / (consume_rate - produce_rate)`, '制造热分区、毒消息和慢数据库，分别验证追赶公式。',N('净消费速率','无法追赶'),X('先恢复正净速率','隔离毒消息','扩容不超过分区/下游容量')),
 'kafka/isr-leader-election':q([['KafkaController/QuorumController','分区选举'],['kafka-metadata-quorum.sh','控制器仲裁状态']],`unclean.leader.election.enable=false`, '整 Broker/机架故障，测选举、不可用时间和已确认数据。',N('ISR shrink','副本落后'),X('副本跨故障域','监控 ISR 收缩','核心 Topic 禁不干净选主')),
 'kafka/message-ordering':q([['DefaultPartitioner/UniformStickyPartitioner','Key 到分区'],['ProducerStateManager','幂等序列号']],`key=order_id
enable.idempotence=true
max.in.flight.requests.per.connection=5`, '扩分区前后发送同 Key 并让消费者并行处理，核对 version。',N('旧版本拒绝','乱序'),X('同实体稳定 Key','消费按 Key 串行','最终写用版本条件')),
 'kafka/partition-planning':q([['kafka-log-dirs.sh','分区字节分布'],['BrokerTopicMetrics','分区吞吐']],`partitions >= max(target_produce/single_partition_produce, target_consume/single_partition_consume)`, '用真实消息大小、压缩与 acks 测单分区上限，再注入单 Broker 故障。',N('最大/平均分区流量','倾斜'),X('按实测规划并留故障余量','顺序 Topic 扩容前迁移','Leader 均衡')),
 'kafka/transactions-exactly-once':q([['TransactionCoordinator','事务状态与 marker'],['ProducerStateManager','PID/epoch fencing']],`isolation.level=read_committed
processing.guarantee=exactly_once_v2`, '在 sendOffsetsToTransaction 前后 kill 进程，核对输入位点与输出原子性。',N('transaction abort','事务失败'),X('稳定唯一 transactional.id','事务时长小于 timeout','外部数据库仍做幂等')),
 'kafka/zero-copy':q([['FileRecords#writeTo','transferTo/sendfile 路径'],['BrokerTopicMetrics','BytesOut 与 CPU']],`batch.size=65536
linger.ms=5
compression.type=zstd`, '同吞吐对比明文/TLS、小批/大批，记录 Broker CPU 与系统调用。',N('CPU/MB','复制/加密成本'),X('以批量摊薄调用','TLS 单独容量评估','避免 Broker 内容重编码')),
 'kafka/message-loss-prevention':q([['Outbox 表/binlog','业务提交到事件证据'],['Producer/Replica/Consumer 指标','端到端确认']],`acks=all; enable.idempotence=true; min.insync.replicas=2`, '在数据库提交、发送、Broker 确认、业务提交各窗口 kill 进程并按 event_id 对账。',N('Outbox 未投递','发送窗口'),X('事务 Outbox/CDC','生产端 all+幂等','消费唯一约束+对账'))
}
