import{proof as p}from'../content-depth/profile.mjs'
const q=(a,s,e,m,x)=>p(a,'json',s,e,[[m,'记录稳态基线','超过基线2倍','按实现入口定位'],['P99','小于业务预算','突破预算','停止扩量'],['结果差异','0','任意非零','回滚并重建']],x)
export const elasticsearchProofs={
 'elasticsearch/inverted-index':q([['org.apache.lucene.index','Terms/Postings/Segment'],['_analyze/_termvectors','Token 与词项证据']],`POST products/_analyze
{"field":"title","text":"Java并发编程"}`,'对同一语料比较 keyword、中文 Analyzer 和 ngram 的词项数、召回与索引体积。','零结果率',['固定索引/查询 Analyzer','text+keyword 多字段','词典变更走重建']),
 'elasticsearch/mapping-query':q([['MapperService','Mapping 合并与字段类型'],['_field_caps','跨索引字段能力']],`PUT _index_template/orders
{"template":{"mappings":{"dynamic":"strict","properties":{"order_id":{"type":"keyword"}}}}}`,'写入数字、前导零、数组对象和未知字段，验证 strict 模板与 nested 语义。','mapping 冲突',['核心字段显式 Mapping','限制 total_fields','类型变化新索引+alias']),
 'elasticsearch/near-real-time':q([['InternalEngine#refresh','Searcher 切换'],['_segments/_stats','Segment 与 refresh']],`PUT products/_settings
{"index.refresh_interval":"1s"}`,'写后分别 GET、search、refresh=wait_for，测可见延迟和小 Segment 数。','segment 数',['读自己写用 GET','少量关键写 wait_for','禁止常规 refresh=true']),
 'elasticsearch/shard-replica':q([['OperationRouting','routing 到分片'],['_cat/shards/_cluster/allocation/explain','分片与恢复']],`GET _cat/shards?v&h=index,shard,prirep,state,store,node`,'按 5/20/100 分片回放相同数据与并发，比较扇出、堆和恢复时间。','每请求分片数',['按目标 10-50GB 分片验证','副本跨故障域','治理小分片']),
 'elasticsearch/write-search-process':q([['TransportShardBulkAction','主分片写复制'],['QueryPhase/FetchPhase','候选合并与取文档']],`GET orders/_search
{"size":50,"_source":["id","status"],"query":{"term":{"tenant_id":"7"}}}`,'逐级增加 size/分片/_source 字段，记录 query/fetch 和协调内存。','协调节点内存',['限制 size 与返回字段','减少无关分片','深读用 PIT+search_after']),
 'elasticsearch/deep-pagination':q([['SearchAfterBuilder','sort 游标解析'],['PointInTimeBuilder','固定 Searcher 视图']],`POST logs/_pit?keep_alive=2m
{"size":100,"pit":{"id":"..."},"sort":[{"ts":"desc"},{"_shard_doc":"desc"}]}`,'并发 refresh 下遍历十万文档，核对重复遗漏并统计每页成本。','每页 scanned/returned',['排序加入唯一 tie-breaker','整次遍历复用 PIT','全量导出异步化']),
 'elasticsearch/index-lifecycle':q([['_ilm/explain','当前 phase/action/step'],['_cat/indices/_cat/shards','滚动后的大小']],`PUT _ilm/policy/logs
{"policy":{"phases":{"hot":{"actions":{"rollover":{"max_primary_shard_size":"40gb"}}},"delete":{"min_age":"30d","actions":{"delete":{}}}}}}`,'加速时间演练 rollover→warm→delete，故意破坏 alias 验证告警。','ILM failed step',['按大小滚动','对卡住 step 告警','force merge 错峰限并发']),
 'elasticsearch/data-consistency':q([['InternalEngine#planIndexingAsPrimary','seq_no/primary_term 裁决'],['_seq_no/_primary_term','乐观锁令牌']],`PUT products/_doc/42?if_seq_no=17&if_primary_term=3
{"status":"ONLINE"}`,'乱序重放 v1/v3/v2 和删除墓碑，验证旧版本被拒绝。','version conflict',['外部事件带单调版本','删除保留墓碑版本','周期源库对账']),
 'elasticsearch/cluster-election':q([['Coordinator/CoordinationState','term、投票与发布'],['_cluster/pending_tasks','控制面积压']],`GET _cluster/state/master_node,metadata
GET _cluster/pending_tasks`,'暂停 Master、断网和制造长 GC，记录选举与 Cluster State 发布时间。','pending tasks',['3 个专用 Master 跨域','initial_master_nodes 仅首次','先稳控制面再恢复分片']),
 'elasticsearch/performance-troubleshooting':q([['_nodes/hot_threads/_tasks','CPU 与运行任务'],['profile API/slowlog','算子与慢查询证据']],`GET orders/_search
{"profile":true,"query":{"bool":{"filter":[{"term":{"tenant_id":"7"}}]}}}`,'同一查询在单次与混合并发下采集 read docs、heap、拒绝和 query/fetch。','read docs/result',['先减少扫描和扇出','Profile 仅受控样本','按 workload 隔离并发'])
}
