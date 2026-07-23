import{proof as p}from'../content-depth/profile.mjs'
const q=(a,l,s,e,n,x)=>p(a,l,s,e,n,x)
export const redisProofs={
  'redis/why-fast':q([['src/server.c processCommand','命令分派入口'],['src/ae.c','事件循环与文件事件']], 'shell',`redis-cli --latency-history
redis-cli SLOWLOG GET 20`,'用相同连接分别测试单命令、pipeline 与一个 O(n) 大命令，观察吞吐和其他客户端尾延迟。',[['event loop lag','亚毫秒基线','>10ms','阻塞命令'],['slowlog','核心命令为空','出现 O(n)','拆分/限制'],['输出缓冲','低水位','持续增长','慢客户端']],['大集合改 SCAN/分批','设置 slowlog 告警','限制客户端缓冲与请求大小']),
  'redis/data-structures-use-cases':q([['src/t_hash.c/t_zset.c','Hash/ZSet 编码与命令'],['OBJECT ENCODING/MEMORY USAGE','实际编码与字节']], 'shell',`OBJECT ENCODING key
MEMORY USAGE key SAMPLES 10`, '对相同业务数据使用 Hash、JSON String、ZSet，比较字节、命令时延与超过编码阈值后的突变。',[['Value P99','<业务上限','>1MB示例','Big Key'],['成员数','有生命周期上限','持续无界','拆窗口'],['编码转换点','容量测试覆盖','生产突变','调模型/阈值']],['按访问模式换结构','Key 加版本与 TTL','大集合按时间/租户拆分']),
  'redis/expiration-eviction':q([['src/expire.c','activeExpireCycle 主动过期'],['INFO stats/memory','expired_keys、evicted_keys']], 'shell',`CONFIG SET maxmemory 4gb
CONFIG SET maxmemory-policy allkeys-lfu`, '写入 100 万个同秒 TTL 与带 20% 抖动 TTL，对比过期 CPU、延迟和回源峰值；再压满内存验证淘汰语义。',[['expired/s','应平滑','整点尖峰','TTL 集中'],['evicted_keys','非缓存实例为 0','持续增长','容量不足'],['回源 QPS','受闸门限制','接近全量','雪崩']],['TTL 加随机抖动','状态数据用 noeviction 独立实例','回源加并发闸门']),
  'redis/cache-problems':q([['redis.call + Lua','热点重建锁原子操作'],['INFO keyspace/commandstats','命中与回源证据']], 'lua',`if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', 3000) then
  return 1
end
return 0`, '同时让 1000 请求命中不存在 Key、单热点过期和全量过期三种场景，分别量化数据库放大。',[['回源放大','热点≈1个重建者','接近请求数','击穿'],['空值命中','攻击 Key 被拦截','DB 仍高','穿透'],['TTL 分布','均匀','同秒集中','雪崩']],['热点 singleflight/互斥重建','空值/布隆过滤器','缓存故障时限回源并降级']),
  'redis/distributed-lock':q([['SET NX PX','原子获取与租期'],['EVAL compare-and-delete','只释放自己的锁']], 'lua',`if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`, '注入超过租期的 STW、网络分区和释放重试；资源端记录 fencing token，验证旧持有者被拒绝。',[['持锁 P99','<租期 30%','接近租期','双持有风险'],['续期失败','目标 0','出现','停止副作用'],['旧 token 拒绝','演练可见','资源端不校验','补 fencing']],['唯一 value+Lua 释放','关键写携带 fencing token','临界区缩短且租期按 P99 设置']),
  'redis/persistence-high-availability':q([['src/rdb.c/aof.c','快照、AOF 与重写'],['INFO persistence/replication','fork、fsync、复制偏移']], 'shell',`CONFIG SET appendonly yes
CONFIG SET appendfsync everysec
CONFIG SET repl-backlog-size 256mb`, '分别 kill -9 主库、断开副本超出 backlog、在高写入时 BGSAVE，测 RPO、RTO 与 COW 内存。',[['fork COW','<容器余量','RSS逼近limit','快照风险'],['复制偏移差','故障目标内','超 backlog','全量同步'],['aof delayed fsync','0 或偶发','持续增长','磁盘抖动']],['为 fork 预留内存','backlog 覆盖最长断线窗口','明确 Redis 是否可从事实源重建']),
  'redis/hot-key-big-key':q([['redis-cli --hotkeys','LFU 策略下热点采样'],['MEMORY USAGE/SCAN','体积与成员定位']], 'shell',`redis-cli --bigkeys
redis-cli --memkeys
redis-cli MEMORY USAGE app:config`, '复制生产 Key 大小分布，用本地缓存、分桶和 UNLINK 分别验证带宽、阻塞和一致性。',[['单Key QPS','<分片能力 10%','>30%','热 Key'],['Value P99','<100KB示例','>1MB','Big Key'],['DEL 阻塞','不可见','>10ms','改 UNLINK']],['热读加版本化本地缓存','大集合按维度拆分','删除使用 UNLINK/分批']),
  'redis/cache-consistency':q([['MONITOR/应用事件仅测试使用','写删顺序证据'],['Key 版本字段/CDC offset','拒绝旧回填']], 'lua',`local version = tonumber(redis.call('HGET', KEYS[1], 'version') or '-1')
if tonumber(ARGV[1]) >= version then return redis.call('HSET', KEYS[1], 'version', ARGV[1], 'data', ARGV[2]) end`, '固定“慢查询回填旧值”和“删除失败”调度，验证版本写、Outbox 重试与最大陈旧时间。',[['版本差','稳态 0','持续非零','同步故障'],['删除重试','快速清空','单调积压','消息链路'],['陈旧窗口','<业务上限','越界','TTL/补偿失效']],['提交后删除并可靠重试','回填携带版本','强一致操作绕过缓存']),
  'redis/cluster-sharding':q([['src/cluster.c keyHashSlot','CRC16 与 hash tag'],['CLUSTER SLOTS/SHARDS','槽位、节点与迁移状态']], 'shell',`redis-cli --cluster check host:6379
redis-cli CLUSTER SHARDS`, '统计每槽 Key/QPS，迁移含 Big Key 的槽并注入 MOVED/ASK，验证客户端拓扑刷新和延迟。',[['最大/平均槽QPS','<2','>3','槽热点'],['重定向率','稳态接近0','持续增长','拓扑缓存旧'],['迁移 P99','预算内','Big Key 长尾','先拆 Key']],['移除全局 hash tag','客户端正确处理 MOVED/ASK','迁移前治理 Big Key']),
  'redis/transactions-lua-pipeline':q([['src/multi.c','MULTI/EXEC/WATCH 执行'],['src/script_lua.c','脚本原子执行与超时']], 'lua',`if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', 86400)
redis.call('DECRBY', KEYS[2], ARGV[2]); return 1`, '在响应丢失后重发 Pipeline、事务和幂等 Lua，比较余额/库存最终值；制造 WATCH 高冲突。',[['脚本 P99','<1ms示例','>5ms','阻塞实例'],['WATCH abort','低个位数','>20%','冲突风暴'],['批次字节','受缓冲预算','MB级','拆批']],['需要原子的读改写用短 Lua','Pipeline 重试带业务幂等键','WATCH 有界退避'])
}
