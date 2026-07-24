import{answer,md}from'./shared.mjs'

export default{
  'elasticsearch/inverted-index':answer(
    '我们用 ES 做多字段检索、相关性和组合筛选，MySQL 保留权威数据；不是所有模糊查询都值得引入搜索集群。',
    md(
      '例如商品搜索要按中文名称召回，再按品牌、类目、价格筛选和相关性排序。ES 的倒排索引把词映射到文档，查询不必对每行做 `%keyword%`；列式 doc values 又适合筛选、聚合和排序。MySQL BTree 对前缀和精确查询很好，但前导模糊、分词和相关性不是它的强项。',
      '',
      '数据链路会让 MySQL 做 source of truth，通过 outbox/binlog 事件异步更新 ES。搜索结果拿到商品 ID 后，关键价格和库存会回权威服务校验，接受搜索索引有秒级延迟。',
      '',
      '我不会把订单点查或简单状态筛选也搬到 ES。一个正确联合索引能解决、数据量不大、又要求事务一致时，MySQL 更简单可靠。',
      '',
      '引入 ES 后要承担 mapping、分片、重建索引、乱序消息和集群容量，因此收益必须来自真实搜索需求，而不是“SQL 慢”三个字。'
    )
  ),
  'elasticsearch/mapping-query':answer(
    '商品搜索的 Mapping 要把全文检索与精确筛选分开：文本用合适分词，品牌类目用 keyword，价格与时间用数值和日期。',
    md(
      '商品名称我会做 multi-field：`name` 用中文分词参与召回，`name.keyword` 用于精确匹配或排序；品牌、类目、状态用 `keyword`，价格用整数分，创建时间用 `date`。动态字段会限制或关闭，避免脏数据制造 mapping explosion。',
      '',
      '```json',
      '"name": {',
      '  "type": "text",',
      '  "analyzer": "ik_max_word",',
      '  "fields": { "keyword": { "type": "keyword" } }',
      '}',
      '```',
      '',
      '查询用 `bool`：全文词放 `must`/`should` 参与评分，品牌、类目、上下架和价格放 `filter`，避免无意义算分；排序先明确是相关性、销量还是价格，并补 `_id` 或业务 ID 做稳定游标。',
      '',
      '上线前拿真实搜索词验证分词、召回率、零结果率和延迟。分析器改变通常要新建索引重建数据，通过 alias 灰度切换，不能直接在原字段上修改。'
    ),
    {pitfallsMarkdown:md(
      '- **所有字符串都设 text。** 聚合和精确筛选会出问题。',
      '- **所有条件都放 must。** 不需要评分的条件应放 filter。',
      '- **直接信任动态 mapping。** 日期、数字和字段数量可能失控。'
    )}
  ),
  'elasticsearch/performance-troubleshooting':answer(
    'ES P99 暴涨要按查询协调、分片执行、JVM 与磁盘逐层拆，先找是所有请求慢还是某类查询、某个节点或某个分片慢。',
    md(
      '我会从慢日志和 APM 找到具体 query、索引、参数与命中分片，比较 took、并发和扫描范围。查询侧重点看深分页、高基数聚合、脚本、wildcard、返回字段过大，以及是否一次打了太多分片。用 profile 只对代表性查询低流量分析，不能全量开启。',
      '',
      '节点侧看 search thread pool queue/reject、CPU、heap、GC、磁盘延迟、page cache 和 segment 数。若只有一个节点慢，查 shard 倾斜、热点或磁盘；全节点 GC 抖动，可能是大聚合、fielddata 或堆压力；磁盘 await 高则继续查 merge、recovery 和快照任务。',
      '',
      '止损会限制问题查询、缩小时间范围、暂停离线聚合，必要时取消长查询。修复可能是改 mapping/query、减少分片、预聚合、增加 doc values 合理字段或调整数据布局。',
      '',
      '验证时比较 P99、查询队列、拒绝、GC、磁盘和每请求涉及分片数，不能只看平均 took。'
    ),
    {problemAnalysisMarkdown:md(
      'ES 查询是 scatter-gather：协调节点把请求发到多个分片，再合并结果。**最慢分片决定尾延迟**，所以排查必须下钻到节点和分片，集群平均值很容易掩盖问题。'
    )}
  ),
  'elasticsearch/shard-replica':answer(
    '十亿文档的主分片数要从未来数据量、目标 shard 大小、节点数和恢复时间估算，副本数再按可用性和查询吞吐决定。',
    md(
      '我会先估算压缩后总大小而不是只看文档数。假设主数据约 2TB，希望单 shard 30~50GB，初始需要约 40~70 个主分片，再结合数据节点数让主分片均匀分布，并压测索引与查询。日志类数据更适合 data stream + rollover，让每个 backing index 的 shard 保持目标大小。',
      '',
      '副本通常至少 1，保证单节点故障后仍可查询，也能增加搜索并行资源，但写入和存储成本会成倍增加。节点和副本必须跨故障域分配。',
      '',
      '分片过多会让 cluster state、heap、文件句柄、segment、查询 fan-out 和恢复开销上升；大量 1GB 小 shard 往往比少量合理 shard 更差。分片过大则迁移和恢复时间长。',
      '',
      '我会通过 rollover、ILM 和定期 shrink/迁移管理生命周期，而不是为十年后容量一次创建几百个空主分片。'
    )
  ),
  'elasticsearch/cluster-election':answer(
    '节点频繁离线和选主先查网络、GC、磁盘与 cluster state 发布延迟；现代 ES 重点是法定多数和 master 稳定性，不沿用旧式脑裂参数口诀。',
    md(
      '我会对齐 master 日志、节点离开原因、选举 term、GC、网络丢包和磁盘。若 master 因长 GC 无法响应，其他节点会认为它离开；cluster state 很大或更新过频时，发布确认慢也会造成不稳定。',
      '',
      '检查专用 master-eligible 节点是否为 3 个或 5 个、跨故障域部署，发现机制和地址是否稳定。只有少数派分区时，法定多数应阻止它继续形成新 master；不要在网络分区时手工把两边都强行启动成独立集群。',
      '',
      'cluster state 过大常见来源是索引/分片过多、动态字段爆炸、alias 和模板膨胀。会控制新建索引频率、字段数和 shard，总结 pending tasks 与 state 大小。',
      '',
      '止损时先稳定网络和 master，不在集群反复选举期间做大规模 reroute。恢复后演练单 master 和单故障域下线，验证仍有多数派。'
    ),
    {pitfallsMarkdown:md(
      '- **仍背诵 `minimum_master_nodes`。** 新版本已由协调子系统自动管理投票配置。',
      '- **选举抖动时继续批量建索引。** 会进一步放大 cluster state 压力。',
      '- **把所有节点都设 master eligible。** 大集群里反而增加管理和选举复杂度。'
    )}
  ),
  'elasticsearch/write-search-process':answer(
    '写入成功后不能立刻搜索，通常是因为文档已进 translog 和内存缓冲，但还没 refresh 成新的可搜索 segment。',
    md(
      '协调节点根据 routing 找到主分片，主分片校验并写入内存 buffer 和 translog，再复制到副本，满足确认条件后返回。此时按 `_id` 的实时 GET 可以从内部状态拿到新文档，但普通 search 依赖已打开的 segment reader。',
      '',
      'refresh 会把内存中的新 segment 发布给搜索，默认周期通常约一秒，所以 ES 是近实时，不是每次写完都立即可搜。flush 则和 translog、持久化及 segment 提交相关，不能把 refresh 和 flush 混为一谈。',
      '',
      '如果业务只在少量关键写后必须搜索到，可以使用 `refresh=wait_for` 等待下一次 refresh；不会每条写都 `refresh=true`，那会制造大量小 segment、增加 merge 和查询成本。批量导入时反而会临时放大 refresh interval，完成后再恢复。',
      '',
      '设计接口时，写后立即展示可直接使用写入返回的数据或按 ID GET，不必强迫搜索链路变成强实时。'
    )
  ),
  'elasticsearch/deep-pagination':answer(
    '十万页我会拒绝继续放大 from+size；交互翻页用 search_after，批量导出用 PIT 加 search_after 或异步任务。',
    md(
      '`from=999980&size=20` 会让每个相关分片都收集并排序前一百万条候选，再由协调节点合并和丢弃，CPU 与内存成本随页深增长。把 max result window 调大只是允许更贵的查询。',
      '',
      '用户连续翻页时，排序必须稳定并包含唯一兜底键：',
      '',
      '```json',
      '"sort": [',
      '  { "created_at": "desc" },',
      '  { "order_id": "desc" }',
      '],',
      '"search_after": ["2026-07-24T10:00:00Z", 912345]',
      '"size": 20',
      '```',
      '',
      '为了翻页期间视图稳定，会配合 PIT，并控制 keep_alive。用户若要任意跳到第十万页，产品上更合理的是增加筛选、按时间定位或异步导出，而不是承诺随机深跳。',
      '',
      '旧 scroll 适合批处理语义但会保持搜索上下文；新导出更倾向 PIT + search_after，并限制并发与总量。'
    )
  ),
  'elasticsearch/near-real-time':answer(
    '商品修改后 1 秒内可搜索，本质是 refresh SLA；通过合理 refresh interval、写入链路监控和少量 wait_for 满足，不对每条写强制刷新。',
    md(
      '我会先把“可搜索”定义清楚：数据库提交到事件发出、消费者写 ES、ES refresh 三段总和都要在一秒内，不能只调 ES。链路会记录业务版本和各阶段时间，监控端到端 indexing lag。',
      '',
      '普通高吞吐写入保持约 1 秒 refresh interval 即可；管理后台更新后必须立即验证的少量请求，可以使用 `refresh=wait_for`，等待下一轮刷新。`refresh=true` 每条都创建可见小 segment，会增加 merge 与查询压力，不会全局使用。',
      '',
      '大批量导入时可暂时增加 refresh interval，导入完成主动 refresh 后再恢复；副本和写入批次也要纳入吞吐测试。',
      '',
      '如果业务要求的是结算价格立即正确，我不会依赖搜索结果，结算仍回 MySQL/价格服务校验。搜索一秒可见和交易强一致是两个不同目标。'
    )
  ),
  'elasticsearch/data-consistency':answer(
    'MySQL 做权威源，ES 通过带版本的可靠事件更新；消费端拒绝旧版本，失败可重试并由对账任务修复。',
    md(
      '更新商品时不做“数据库提交后同步调用 ES”这种双写，因为任一边失败都可能不一致。会把商品变更和 outbox 放同一本地事务，或订阅 binlog，事件带 `productId`、`version` 和完整可索引快照。',
      '',
      'ES 文档保存同一版本。消费者收到事件时只允许新版本覆盖旧版本，乱序的 v4 在 v5 之后到达会被拒绝；重复 v5 幂等。删除使用 tombstone 事件，也带版本，避免旧更新把已删除商品重新写回来。',
      '',
      '失败事件进入重试和死信，告警必须包含业务 ID。后台对账按更新时间分片比较 MySQL 与 ES 的版本/摘要，发现差异后从 MySQL 重建文档。',
      '',
      '索引重建时写入新索引，追平增量后校验数量和抽样，再原子切 alias。整个方案接受短暂延迟，但保证最终可证明地收敛。'
    ),
    {pitfallsMarkdown:md(
      '- **用消息到达顺序代替业务版本。** 重试和多分区会让旧消息覆盖新数据。',
      '- **只做重试，没有死信和对账。** 永久失败会悄悄积累。',
      '- **删除不带版本。** 迟到更新可能让文档复活。'
    )}
  ),
  'elasticsearch/index-lifecycle':answer(
    '每天几百 GB 的日志用 data stream/rollover 控制 shard 大小，再按 hot-warm-cold-delete 生命周期迁移与删除。',
    md(
      '我不会固定“每天一个索引”后就结束。写入速率变化时每天索引可能过大或产生小 shard，更稳妥是 rollover：当主 shard 达到目标大小、文档数或年龄就滚动新 backing index。分片数按单 shard 30~50GB 等目标和节点吞吐压测决定。',
      '',
      'ILM 可以设计为：',
      '',
      '- Hot：最近 3 天，快速磁盘，持续写入和高频查询；',
      '- Warm：3~30 天，只读，forcemerge/shrink 后迁到容量型节点；',
      '- Cold/Frozen：低频历史，使用更便宜存储或 searchable snapshot；',
      '- Delete：超过合规保留期删除整个索引。',
      '',
      '迁移前确认查询 SLA、恢复时间和合规要求。删除按索引完成，不逐文档 delete。监控 rollover 是否执行、shard 大小、迁移失败、磁盘水位和 snapshot 成功率。',
      '',
      '> 冷热分层不是只贴 node attribute。查询路由、快照仓库、容量水位和故障恢复都要实际演练。'
    )
  )
}
