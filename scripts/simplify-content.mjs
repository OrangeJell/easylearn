import{readdirSync,readFileSync,writeFileSync}from'node:fs'

const contentRoot=new URL('../src/content/',import.meta.url)
const depthStart='<!-- depth-standard:start -->'
const depthEnd='<!-- depth-standard:end -->'
const openingSummaries={
  'jvm/gc-guide.md':'JVM 垃圾回收主要解决两个问题：哪些对象已经没用了，以及怎样回收更划算。理解可达性分析、分代假设和不同收集器的停顿取舍，基本就抓住了 GC 的主线。',
  'mysql/locks-deadlock.md':'InnoDB 的锁要结合隔离级别、索引和 SQL 的实际访问范围来看。排查死锁时，先找互相等待的事务和加锁顺序，再通过缩短事务、补索引或统一访问顺序解决。',
  'mysql/redo-undo-binlog.md':'Redo Log 负责崩溃恢复，Undo Log 负责回滚和历史版本，Binlog 负责复制与增量恢复。三者分工不同，事务提交时又需要配合，才能兼顾数据库内部恢复和 Server 层日志一致。',
  'mysql/replication-high-availability.md':'MySQL 复制靠 Binlog 把主库变更传到副本，高可用则是在复制之上补上故障判断、主从切换和客户端重连。复制并不等于零延迟，切换也不等于零丢失。',
  'mysql/sql-execution-explain.md':'一条 SQL 会经过连接、解析、优化和执行。分析 EXPLAIN 时，重点看实际访问了多少数据、用了什么索引、连接顺序是否合理，而不是只盯着某一个字段背结论。',
  'mysql/transactions-mvcc.md':'MVCC 通过 Undo 版本链和 Read View 让普通查询尽量少加锁；真正修改数据或执行锁定读时，仍要靠记录锁、间隙锁等机制。RC 和 RR 的主要差别之一，是 Read View 的创建时机。'
}

function markdownFiles(root){
  return readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?markdownFiles(new URL(`${entry.name}/`,root)):entry.name.endsWith('.md')?[new URL(entry.name,root)]:[])
}

function removeSection(source,heading){
  const escaped=heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  return source.replace(new RegExp(`\\n## ${escaped}\\n[\\s\\S]*?(?=\\n## |$)`,'g'),'')
}

let changed=0
for(const file of markdownFiles(contentRoot)){
  const original=readFileSync(file,'utf8')
  let source=original
  const ref=file.pathname.split('/src/content/')[1]

  const start=source.indexOf(depthStart)
  if(start>=0){
    const end=source.indexOf(depthEnd,start)
    if(end<0)throw new Error(`内容深化标记不完整: ${file.pathname}`)
    source=(source.slice(0,start)+source.slice(end+depthEnd.length)).trimEnd()+'\n'
  }

  for(const heading of['面试考察点','面试要点','核心考点清单','总结','小结']){
    source=removeSection(source,heading)
  }

  if(source.includes('\n## 高频追问\n')&&source.includes('\n## 高频追问与参考回答\n')){
    source=removeSection(source,'高频追问')
  }

  source=source
    .replace(/^## (?:一句话回答|核心答案|结论先行)$/gm,'## 先说结论')
    .replace(/^## (?:什么是幂等|先纠正一个说法|优化的核心思路|两种锁怎么选|Mapping 决定数据如何索引|为什么需要泛型|先定义可靠性目标)$/gm,'## 先说结论')
    .replace(/^## 高频追问与参考回答$/gm,'## 常见问题')
    .replace(/^## 常见误区$/gm,'## 容易踩坑的地方')
    .replace(/^## 实践边界$/gm,'## 实际用时要注意什么')
    .replace(/^## 工程边界$/gm,'## 落地时要注意什么')
    .replace(/^## 正确用法$/gm,'## 可以怎么用')
    .replace(/^## 面试回答建议$/gm,'## 怎么讲更清楚')
    .replace(/^## 面试回答框架$/gm,'## 先说处理思路')
    .replace(/^## 面试案例回答模板$/gm,'## 用一个容量例子串起来')
    .replace(/^## 一个面试案例模板$/gm,'## 看一个排查例子')
    .replace(/^## 一个可用于面试的线上案例$/gm,'## 先看一个线上案例')
    .replace(/^## 一个面试回答示例$/gm,'## 用一个例子串起来')
    .replace(/> \*\*一句话回答：\*\*/g,'> ')
    .replace(/\n{3,}/g,'\n\n')
    .trimEnd()+'\n'

  if(openingSummaries[ref]&&!/^## 先说结论$/m.test(source)){
    source=source.replace(/^(# .+)$/m,`$1\n\n## 先说结论\n\n${openingSummaries[ref]}`)
  }

  const body=source.replace(/^---\n[\s\S]*?\n---\n/,'')
  const minutes=Math.max(3,Math.ceil(Buffer.byteLength(body)/750))
  source=source.replace(/^minutes:\s*\d+$/m,`minutes: ${minutes}`)

  if(source!==original){writeFileSync(file,source);changed++}
}

console.log(`文章已精简：${changed} 篇更新。`)
