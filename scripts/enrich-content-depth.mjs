import{readFileSync,readdirSync,statSync,writeFileSync}from'node:fs'
import{dirname,join,relative,resolve}from'node:path'
import{fileURLToPath}from'node:url'
import{profiles}from'./content-depth/index.mjs'
import{proofs}from'./content-proof/index.mjs'

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const contentRoot=join(project,'src/content')
const START='<!-- depth-standard:start -->'
const END='<!-- depth-standard:end -->'
const today='2026-07-23'

const guides={
  'java-basic':{load:'对象创建率、调用频次、输入规模和 API 边界',guard:'优先保证语言语义、类型契约和向后兼容，再讨论微小性能收益',observe:'分配速率、异常分布、热点调用栈和业务错误码'},
  collections:{load:'元素数量、读写比例、遍历方式、并发度和内存预算',guard:'先保证数据结构语义正确，再依据访问模式选择实现',observe:'集合尺寸、扩容次数、冲突率、锁等待和 GC 压力'},
  concurrency:{load:'并发线程数、临界区长度、阻塞比例和任务到达速率',guard:'先建立 happens-before 与所有权边界，再谈吞吐和无锁优化',observe:'线程状态、队列长度、锁竞争、上下文切换和尾延迟'},
  jvm:{load:'堆与非堆容量、对象分配速率、存活率和停顿目标',guard:'以可观测证据驱动参数调整，避免脱离业务负载套用参数模板',observe:'GC 日志、JFR、线程栈、堆转储和操作系统资源'},
  mysql:{load:'数据规模、选择性、读写比、事务长度和峰值并发',guard:'正确性由约束和事务兜底，性能优化必须用执行计划与测量验证',observe:'执行计划、慢日志、锁等待、Buffer Pool 命中率和复制延迟'},
  redis:{load:'Key 数量、Value 大小、命令复杂度、热点分布和过期速率',guard:'Redis 是高性能数据结构服务，不应被当成没有容量边界的黑盒',observe:'命令延迟、内存碎片、热 Key、阻塞事件和主从复制偏移'},
  clickhouse:{load:'日增量、分区规模、查询并发、扫描行数和压缩比',guard:'以数据布局减少扫描，以批量写入减少小 Part，避免照搬行存思路',observe:'system.query_log、system.parts、读行数、内存峰值和后台合并'},
  kafka:{load:'消息速率、峰值带宽、分区数、消息大小和积压恢复时间',guard:'可靠性来自生产、Broker、消费和业务幂等的完整闭环',observe:'生产延迟、ISR、UnderReplicatedPartitions、Consumer Lag 和失败重试'},
  elasticsearch:{load:'文档规模、分片数、字段基数、查询并发和写入速率',guard:'先设计 Mapping 与分片，再优化查询；任何调优都要控制扫描与内存放大',observe:'慢日志、Profile、线程池拒绝、段数量、堆使用和集群状态'},
  architecture:{load:'峰值流量、数据规模、依赖容量、一致性目标和故障预算',guard:'先定义 SLO 与不变量，再通过限流、隔离、异步和补偿保护核心链路',observe:'RED 指标、队列积压、状态差异、容量水位和业务成功率'}
}

function markdownFiles(dir){
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?markdownFiles(join(dir,entry.name)):entry.name.endsWith('.md')?[join(dir,entry.name)]:[])
}

function cleanGenerated(source){
  const start=source.indexOf(START),end=source.indexOf(END)
  if(start<0&&end<0)return source.trimEnd()+'\n'
  if(start<0||end<start)throw new Error('内容深化标记不完整')
  return(source.slice(0,start)+source.slice(end+END.length)).trimEnd()+'\n'
}

function diagram(profile){
  const ids=['A','B','C','D','E','F']
  const lines=['flowchart LR']
  profile.flow.forEach((label,index)=>{
    const safe=label.replaceAll('"',"'")
    if(index===0)lines.push(`    ${ids[index]}["${safe}"]`)
    else lines.push(`    ${ids[index-1]} --> ${ids[index]}["${safe}"]`)
  })
  return`\n\`\`\`mermaid\n${lines.join('\n')}\n\`\`\`\n`
}

function renderStages(profile){
  return profile.flow.map((label,index)=>`### ${index+1}. ${label}\n\n${profile.facts[index]}`).join('\n\n')
}

function renderTable(profile){
  return`| 方案 | 更适合的场景 | 主要收益 | 代价与边界 |\n| --- | --- | --- | --- |\n${profile.options.map(row=>`| ${row.join(' | ')} |`).join('\n')}`
}

function renderEvidence(profile,proof){
  const anchors=proof.anchors.map(row=>`| ${row.join(' | ')} |`).join('\n')
  const numbers=proof.numbers.map(row=>`| ${row.join(' | ')} |`).join('\n')
  const incidents=profile.risks.slice(0,3).map((risk,index)=>`| ${risk} | ${profile.signals[index]||profile.signals[0]} | ${proof.actions[index]} |`).join('\n')
  return`## 源码与实现定位

| 入口 | 阅读重点 |
| --- | --- |
${anchors}

源码或系统表应按上表顺序追踪：先确认入口实际走到哪条路径，再用运行时数据验证，而不是仅凭类名或配置推测。

## 参数配置与可复现实验

\`\`\`${proof.language}
${proof.snippet}
\`\`\`

${proof.experiment}

## 验证步骤与预期结果

### 1. 固定输入和基线

先在没有故障注入的环境执行上述配置，固定数据规模、并发度、运行时版本和预热时间。以「${proof.numbers[0][0]}」为主基线，记录值应满足「${proof.numbers[0][1]}」；同时保存 ${profile.signals.slice(0,2).join('、')}，使后续变化能够回到同一时间轴比较。

### 2. 从实现入口确认路径

在「${proof.anchors[0][0]}」确认请求确实进入「${proof.anchors[0][1]}」对应的实现，再沿「${proof.anchors[1][0]}」观察「${proof.anchors[1][1]}」。如果入口路径都未命中，就不应继续调整下游参数，而应先检查调用条件、版本或路由是否与假设一致。

### 3. 注入本文特有的失败模式

优先复现「${profile.risks[0]}」，并把单一变量逐级放大，直到「${proof.numbers[0][0]}」越过「${proof.numbers[0][2]}」。随后再分别验证「${profile.risks[1]}」和「${profile.risks[2]}」，三类故障分开执行，避免多个变量同时变化而无法归因。

### 4. 执行止损和根因修复

第一轮只应用「${proof.actions[0]}」，确认它能控制影响范围；第二轮应用「${proof.actions[1]}」，验证核心链路恢复；最后落实「${proof.actions[2]}」，消除同类问题再次出现的条件。每一步都保留变更前后数据，不用“感觉变快了”替代测量。

### 5. 通过退出条件

实验只有同时满足三项才算通过：${proof.numbers.map(row=>`「${row[0]}」回到「${row[1]}」`).join('、')}，并且业务结果差异为零。若性能恢复但结果不一致，仍应视为失败；若指标恢复后很快再次越线，则说明只完成了临时止损，没有消除根因。

## 量化基线

| 指标 | 样例基线/口径 | 风险线 | 结论 |
| --- | --- | --- | --- |
${numbers}

这些数值是实验口径或示例告警线，不是可复制到所有系统的固定答案；上线阈值应由本系统稳态、峰值和故障演练共同确定。

## 事故复盘：${profile.caseTitle}

${profile.caseText}

| 失败模式 | 首要证据 | 第一处置动作 |
| --- | --- | --- |
${incidents}

## 发布与回滚检查点

- **发布前**：确认「${proof.anchors[0][0]}」对应实现和上述配置在目标版本仍然有效，并保存「${proof.numbers[0][0]}」基线。
- **灰度中**：同时观察 ${profile.signals.slice(0,3).join('、')}；任一指标越过表中风险线，就停止继续扩量。
- **回滚时**：先执行「${proof.actions[0]}」控制影响，再回退代码或参数；涉及持久状态时必须额外核对结果差异。
- **发布后**：至少覆盖一个完整峰值周期，确认「${profile.risks[0]}」没有再次出现，才关闭变更观察窗口。`
}

function renderFull(profile,proof,guide,title,includeDiagram){
  const visual=includeDiagram?`\n## 机制全景图\n\n下面把「${title}」从输入到结果压缩成一条可复述的主链路。面试时先用图建立全局坐标，再进入局部实现，能避免只背零散结论。\n${diagram(profile)}`:''
  return`${START}${visual}
## 完整链路：从输入到结果

沿着「${profile.flow.join(' → ')}」观察输入、状态与输出，下面每个阶段都对应一个可以在源码、日志或系统表中验证的位置。

${renderStages(profile)}

${renderEvidence(profile,proof)}

## 方案对比与选型

${renderTable(profile)}

选型至少带上 ${guide.load}，并用上面的量化基线验证；未知数据应明确为待测假设。

## 设计边界与工程取舍

> ${profile.boundary}

工程落地遵循：${guide.guard}。回答时直接引用「${proof.anchors[0][0]}」、配置实验和事故数据，比复述固定模板更有说服力。
${END}\n`
}

function renderEvidenceOnly(profile,proof,title,includeDiagram){
  const visual=includeDiagram?`\n## 机制全景图\n\n「${title}」的实现链路如下，节点可与后面的源码和运行证据逐一对应。\n${diagram(profile)}`:''
  return`${START}${visual}\n${renderEvidence(profile,proof)}\n\n## 设计边界与工程取舍\n\n> ${profile.boundary}\n${END}\n`
}

let changed=0,fullCount=0,evidenceCount=0
for(const file of markdownFiles(contentRoot)){
  const ref=relative(contentRoot,file).replaceAll('\\','/').replace(/\.md$/,'')
  let source=cleanGenerated(readFileSync(file,'utf8'))
  const profile=profiles[ref],proof=proofs[ref],hasDiagram=/^```mermaid$/m.test(source),bytes=Buffer.byteLength(source)
  if(!profile||!proof)throw new Error(`缺少逐篇内容配置: ${ref}`)
  const title=source.match(/^title:\s*(.+)$/m)?.[1]?.trim()||ref
  const categorySlug=source.match(/^categorySlug:\s*(.+)$/m)?.[1]?.trim()
  const guide=guides[categorySlug]
  if(!guide)throw new Error(`未知分类: ${categorySlug}`)
  let block=''
  if(bytes<10_000){block=renderFull(profile,proof,guide,title,!hasDiagram);fullCount++}
  else{block=renderEvidenceOnly(profile,proof,title,!hasDiagram);evidenceCount++}
  let next=source.trimEnd()+(block?`\n\n${block}`:'\n')
  next=next.replace(/^updated:\s*.+$/m,`updated: ${today}`)
  const minutes=Math.max(Number(next.match(/^minutes:\s*(\d+)/m)?.[1]||0),Math.ceil(Buffer.byteLength(next)/340))
  next=next.replace(/^minutes:\s*\d+$/m,`minutes: ${minutes}`)
  if(next!==readFileSync(file,'utf8')){writeFileSync(file,next);changed++}
}

console.log(`第二轮内容已生成：${changed} 篇更新，${fullCount} 篇机制深化，${evidenceCount} 篇证据补强。`)
