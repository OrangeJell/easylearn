import{proof as p}from'../content-depth/profile.mjs'
const q=(a,s,e,n,x)=>p(a,'sql',s,e,n,x)
export const mysqlProofs={
  'mysql/btree-index':q([['storage/innobase/btr','B+Tree 页搜索与分裂实现'],['EXPLAIN ANALYZE','实际扫描、回表与节点耗时']],`CREATE INDEX idx_order_tenant_status_time
ON orders(tenant_id, status, created_at, id);`,'构造均匀与状态偏斜两组百万行数据，对比联合索引列顺序、覆盖与回表；必须记录 rows examined。',[['扫描/返回','理想接近 1','>100','索引边界差'],['回表次数','覆盖查询为 0','高选择性仍大量回表','补覆盖列'],['索引/数据体积','按写预算','索引总量>数据','删冗余']],['按真实谓词重排联合索引','消除隐式类型转换','删除前用 invisible index 灰度']),
  'mysql/transactions-mvcc':q([['storage/innobase/read/read0read.cc','Read View 可见性判断'],['SHOW ENGINE INNODB STATUS','History List Length 与事务']],`SELECT * FROM information_schema.innodb_trx
ORDER BY trx_started;`,'保持一个长 RR 快照同时持续更新，观察 undo 历史、版本链读耗时和 Purge 恢复。',[['最长事务','在线请求秒级','>60s 示例','长快照'],['History List','稳态可回落','持续单调涨','Purge 被阻'],['版本链读取','接近当前版本','读延迟随时间涨','undo 链过长']],['终止异常长事务','报表拆短批次/副本','监控 trx_started 和 History List']),
  'mysql/locks-deadlock':q([['performance_schema.data_locks','当前锁对象与模式'],['SHOW ENGINE INNODB STATUS','LATEST DETECTED DEADLOCK 图']],`SELECT * FROM performance_schema.data_lock_waits;
SELECT * FROM performance_schema.data_locks;`,'两个事务反序更新相同 ID，复现死锁；加排序与索引后循环并发 10 万次比较死锁率。',[['事务 P99','低于接口预算','秒级','持锁过长'],['死锁率','低且可重试','发布后翻倍','顺序变化'],['锁定/返回行','接近业务行数','数量级放大','缺索引']],['按主键排序更新','远程调用移出事务','完整事务有界退避重试']),
  'mysql/redo-undo-binlog':q([['storage/innobase/log','redo 写入、checkpoint'],['performance_schema.log_status','LSN 与 binlog 状态']],`SET GLOBAL innodb_flush_log_at_trx_commit = 1;
SET GLOBAL sync_binlog = 1;`,'故障注入分别发生在 redo prepare、binlog flush、commit 后，重启核对事务、binlog 与副本结果。',[['checkpoint age','低于日志容量安全线','持续逼近上限','刷脏跟不上'],['binlog fsync P99','稳定','磁盘抖动尖峰','提交延迟'],['undo history','可回落','持续增长','长事务']],['核心库使用双 1 持久化','监控 checkpoint age','跨系统事件使用 Outbox']),
  'mysql/replication-high-availability':q([['performance_schema.replication_applier_status_by_worker','并行回放与错误'],['SHOW REPLICA STATUS','接收/执行位点与 GTID']],`CHANGE REPLICATION SOURCE TO SOURCE_AUTO_POSITION = 1;
SET GLOBAL rpl_semi_sync_source_enabled = ON;`,'注入主库宕机、网络分区和大事务，记录副本 GTID 差、选主、fencing 与业务恢复时间。',[['GTID 差','切换候选为 0','存在未应用事务','不晋升'],['RTO','小于业务目标','超过演练线','自动化不足'],['applier lag','稳态秒级内','持续增长','热点/大事务']],['先 fencing 旧主','按 GTID/健康选副本','切换后逐表/事件核对']),
  'mysql/sql-execution-explain':q([['sql/join_optimizer','连接顺序和成本选择'],['EXPLAIN ANALYZE FORMAT=TREE','估算与实际逐节点对比']],`EXPLAIN ANALYZE
SELECT id FROM orders
WHERE tenant_id=? AND status=? ORDER BY created_at DESC LIMIT 50;`,'用常见值与极端偏斜参数分别执行，比较 estimated rows/actual rows 与 chosen plan。',[['估算偏差','<10倍示例','>100倍','统计失真'],['扫描/返回','接近 1','>100','访问路径差'],['节点耗时占比','主耗时可解释','排序/回表>80%','定向优化']],['更新统计/直方图','减少读取列与行','Hint 仅临时且设撤销条件']),
  'mysql/slow-sql-troubleshooting':q([['performance_schema.events_statements_summary_by_digest','按指纹聚合总成本'],['sys.statement_analysis','扫描、延迟和临时表视图']],`SELECT DIGEST_TEXT, COUNT_STAR, SUM_TIMER_WAIT, SUM_ROWS_EXAMINED
FROM performance_schema.events_statements_summary_by_digest
ORDER BY SUM_TIMER_WAIT DESC LIMIT 20;`,'同时注入慢 SQL 与连接池等待，拆分客户端等待、锁等待和执行时间，避免误把排队当 SQL 慢。',[['总耗时贡献','按指纹排序','Top1>30%','优先治理'],['连接等待','<执行时间 10%','超过执行','池/下游饱和'],['临时磁盘表','低比例','突增','排序聚合溢写']],['先按总成本而非单次最慢排序','隔离报表连接池','真实参数回放后灰度']),
  'mysql/deep-pagination':q([['handler_read_next','顺序扫描行计数'],['EXPLAIN ANALYZE','offset 丢弃行的真实工作量']],`SELECT id, created_at FROM orders
WHERE (created_at,id) < (?,?)
ORDER BY created_at DESC,id DESC LIMIT 100;`,'对 offset 0/10万/100万与游标分页画延迟曲线，并在并发插入下核对重复遗漏。',[['扫描/返回','游标接近 1','offset 线性上涨','改游标'],['单页 P99','各页稳定','随页码增长','深分页'],['重复遗漏','稳定游标为 0','出现非零','排序不唯一']],['使用复合唯一游标','全量导出改异步检查点','限制 max page/offset']),
  'mysql/sharding':q([['ShardingSphere route context','路由单元与广播 SQL'],['information_schema.tables','各分片行数/体积偏斜']],`shardingColumn: user_id
algorithmExpression: ds_$->{user_id % 16}.orders_$->{user_id % 32}`,'回放用户侧与商家侧 Top 查询，统计单片/跨片比例；制造超级用户验证热点和扩容迁移。',[['跨片请求','核心路径<5%示例','持续>20%','分片键不匹配'],['最大/平均 QPS','<1.5','>2','数据热点'],['迁移差异','切读前 0','任意非零','禁止切换']],['跨片读建异构索引','热点租户单独路由','迁移双写带版本并核对']),
  'mysql/table-design-guide':q([['information_schema.columns/statistics','字段与索引实际定义'],['information_schema.innodb_tablespaces','表和索引空间']],`CREATE TABLE orders (
 id BIGINT PRIMARY KEY, order_no VARCHAR(32) NOT NULL,
 UNIQUE KEY uk_order_no(order_no)
) ENGINE=InnoDB;`,'生成生产分布数据，测平均/P99 行宽、索引体积、插入吞吐和在线 DDL 时间，而不是空表评审。',[['索引/数据比','按读写目标','>1.5示例','索引过多/过宽'],['唯一冲突','与业务重复一致','无约束却重复','补唯一键'],['DDL 锁等待','灰度预算内','阻塞写入','改 online/分批']],['稳定字段类型化','不变量落唯一/外键约束','DDL 先影子表/灰度演练'])
}
