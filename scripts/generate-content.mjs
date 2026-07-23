import{createHash}from'node:crypto'
import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs'
import{dirname,join,relative,resolve}from'node:path'
import{fileURLToPath}from'node:url'
import{projectQuestionPrompts}from'./practice-scenarios.mjs'

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const contentRoot=join(project,'src/content')
const generatedRoot=join(project,'src/generated')
const publicRoot=join(project,'public')

function filesUnder(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesUnder(join(dir,entry.name)):entry.name.endsWith('.md')?[join(dir,entry.name)]:[])}
function parseList(value=''){
  const text=value.trim().replace(/^\[/,'').replace(/\]$/,'')
  if(!text)return[]
  return text.split(',').map(item=>item.trim().replace(/^['"]|['"]$/g,'')).filter(Boolean)
}
function plainMarkdown(value){return value.replace(/```[\s\S]*?```/g,' ').replace(/`([^`]+)`/g,'$1').replace(/!\[[^\]]*]\([^)]*\)/g,' ').replace(/\[([^\]]+)]\([^)]*\)/g,'$1').replace(/<[^>]+>/g,' ').replace(/[#>*_|~-]/g,' ').replace(/\s+/g,' ').trim()}

function markdownSections(source){
  const sections=[]
  let current
  for(const line of source.split('\n')){
    const heading=line.match(/^##\s+(.+)$/)
    if(heading){current={title:heading[1].trim(),lines:[]};sections.push(current);continue}
    if(current)current.lines.push(line)
  }
  return sections
}
function readableMarkdown(value){
  return value
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/```[\s\S]*?```/g,' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g,' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g,'$1')
    .replace(/`([^`]+)`/g,'$1')
    .replace(/^#{1,6}\s+/gm,'')
    .replace(/^\s*>\s?/gm,'')
    .replace(/^\s*[-*+]\s+/gm,'')
    .replace(/^\s*\d+[.)]\s+/gm,'')
    .replace(/^\s*\|(.+)\|\s*$/gm,(_,row)=>{
      const cells=row.split('|').map(cell=>cell.trim()).filter(Boolean)
      if(cells.every(cell=>/^:?-{3,}:?$/.test(cell)))return' '
      return`${cells.join('：')}。`
    })
    .replace(/^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)*\s*\|?\s*$/gm,' ')
    .replace(/\|/g,'；')
    .replace(/[*_~]/g,'')
    .replace(/\s+/g,' ')
    .replace(/入口：阅读重点。\s*/g,'')
    .replace(/失败模式：首要证据：第一处置动作。\s*/g,'')
    .replace(/指标：样例基线\/口径：风险线：结论。\s*/g,'')
    .replace(/下面每个阶段都对应一个可以在源码、日志或系统表中验证的位置。/g,'这些阶段都可以从日志、指标或源码里验证。')
    .replace(/源码或系统表应按上表顺序追踪：先确认入口实际走到哪条路径，再用运行时数据验证，而不是仅凭类名或配置推测。/g,'我会先确认请求实际走到了哪条路径，再用运行数据验证，不会只看类名或配置猜测。')
    .trim()
}
function sentenceLimit(value,max=330){
  if(value.length<=max)return value
  const sentences=value.match(/[^。！？；]+[。！？；]?/g)||[value]
  let output=''
  for(const sentence of sentences){
    if(output.length+sentence.length>max&&output.length>=Math.floor(max*.58))break
    output+=sentence
  }
  return(output||value.slice(0,max)).trim()
}
function sectionBy(sections,matcher){return sections.find(section=>matcher(section.title))}
function sectionText(section,max=330){return sentenceLimit(readableMarkdown((section?.lines||[]).join('\n')),max)}
function bulletPoints(section){
  return(section?.lines||[]).filter(line=>/^\s*[-*+]\s+/.test(line)).map(line=>readableMarkdown(line.replace(/^\s*[-*+]\s+/,''))).filter(Boolean)
}
const designQuestionRefs=new Set([
  'mysql/table-design-guide','mysql/sharding','redis/cluster-sharding',
  'clickhouse/partition-order-primary-key','clickhouse/distributed-table','clickhouse/write-optimization',
  'kafka/partition-planning','elasticsearch/mapping-query','elasticsearch/shard-replica','elasticsearch/index-lifecycle',
  'architecture/cache-consistency','architecture/idempotency','architecture/flash-sale-system-design',
  'architecture/config-distribution-gray-release','architecture/distributed-transaction','architecture/rate-limiting',
  'architecture/distributed-id','architecture/delayed-task','architecture/observability'
])
function practiceType(sourceRef,prompt){
  if(/突然|异常|故障|宕机|卡住|变慢|抖动|堆积|丢失|死锁|OOM|读不到|大面积超时|延迟升高|内存快满/.test(prompt))return'incident'
  if(designQuestionRefs.has(sourceRef)||/让你设计|如何设计|怎么设计/.test(prompt))return'design'
  if(/你们|项目里|接入|升级|迁移|为什么用|为什么引入|做过哪些/.test(prompt))return'project'
  return'mechanism'
}
function mermaidNodes(source){
  const diagram=source.match(/```mermaid\s*\n([\s\S]*?)```/)?.[1]||''
  const labels=[]
  const pattern=/\b[A-Za-z][\w]*\s*(?:\[\("([^"]+)"\)\]|\["([^"]+)"\]|\{"([^"]+)"\}|\("([^"]+)"\))/g
  let match
  while((match=pattern.exec(diagram))){
    const label=match[1]||match[2]||match[3]||match[4]
    if(label&&!labels.includes(label))labels.push(label)
  }
  return labels.slice(0,5)
}
function questionDiagram(type,source){
  if(!['design','incident'].includes(type))return undefined
  const extracted=mermaidNodes(source)
  const fallback=type==='design'
    ?['明确目标与约束','估算容量与峰值','设计核心数据链路','处理一致性与容灾','压测上线与扩容']
    :['确认影响范围','限流隔离止损','收集指标和日志','修复根因','灰度恢复']
  return{kind:type==='design'?'flow':'timeline',title:type==='design'?'方案主链路':'排查与恢复时间线',nodes:extracted.length>=4?extracted:fallback}
}
function followUpQuestions(article,sections){
  const block=sectionBy(sections,title=>title==='高频追问与参考回答')||sectionBy(sections,title=>title==='高频追问')
  const groups=[]
  let current
  for(const line of block?.lines||[]){
    const heading=line.match(/^###\s+(.+)$/)
    if(heading){current={prompt:heading[1].replace(/^追问(?:\s*\d+)?[：:]?\s*/,''),lines:[]};groups.push(current);continue}
    if(current)current.lines.push(line)
  }
  const boundary=sectionText(sectionBy(sections,title=>title.includes('设计边界')||title.includes('实践边界')),230)
  const validation=sectionText(sectionBy(sections,title=>title.includes('验证步骤')),230)
  return groups.slice(0,4).map((group,index)=>{
    const direct=sectionText({lines:group.lines},280)||article.description
    const answer=[`这个追问我会先给结论：${direct}`]
    if(boundary)answer.push(`落到项目里，我还会特别注意这个边界：${boundary}`)
    if(validation)answer.push(`最后我会用数据验证，而不是只确认代码能跑：${validation}`)
    const points=(direct.match(/[^。！？；]+[。！？；]?/g)||[direct]).map(item=>item.replace(/[。！？；]$/,'').trim()).filter(Boolean).slice(0,3)
    return{
      id:`${article.categorySlug}-${article.slug}-follow-up-${index+1}`,
      weight:Math.max(1,groups.length-index),
      prompt:group.prompt,
      durationMinutes:2,
      answer,
      keyPoints:points.length?points:[article.description],
      relatedArticles:[`${article.categorySlug}/${article.slug}`,...article.related].slice(0,3)
    }
  })
}
function practiceQuestion(article,source){
  const sections=markdownSections(source)
  const sourceRef=`${article.categorySlug}/${article.slug}`
  const prompt=projectQuestionPrompts[sourceRef]
  if(!prompt)throw new Error(`缺少项目型面试题: ${sourceRef}`)
  const type=practiceType(sourceRef,prompt)
  const parts={
    core:sectionText(sectionBy(sections,title=>/核心答案|一句话回答/.test(title)),220),
    chain:sectionText(sectionBy(sections,title=>title.includes('完整链路')),220),
    source:sectionText(sectionBy(sections,title=>title.includes('源码与实现')),130),
    config:sectionText(sectionBy(sections,title=>title.includes('参数配置')),220),
    validation:sectionText(sectionBy(sections,title=>title.includes('验证步骤')),170),
    incident:sectionText(sectionBy(sections,title=>title.startsWith('事故复盘')),180),
    boundary:sectionText(sectionBy(sections,title=>title.includes('设计边界')||title.includes('方案对比')),210)
  }
  const plans={
    project:[
      ['我会先交代项目背景和选型结论',()=>`${article.description}。${parts.core}`],
      ['具体落地时，我会沿着实际调用链来讲',()=>`${parts.chain} ${parts.source}`],
      ['参数和容量不能靠默认值，我会结合业务量来定',()=>parts.config],
      ['效果要用数据证明，线上问题也要能闭环',()=>`${parts.validation} ${parts.incident}`],
      ['最后我会主动说明这个方案不适合什么场景',()=>parts.boundary]
    ],
    incident:[
      ['我会先确认影响范围，同时控制故障继续放大',()=>`${article.description}。${parts.core}`],
      ['止损之后，我会按请求链路建立证据，而不是凭经验猜',()=>`${parts.chain} ${parts.source}`],
      ['定位时我最关注这些参数、指标和容量关系',()=>parts.config],
      ['找到根因后先做最小修复，再用同样的流量验证',()=>`${parts.incident} ${parts.validation}`],
      ['恢复阶段要逐步放量，最后把监控和边界补齐',()=>parts.boundary]
    ],
    design:[
      ['我不会直接画架构图，会先确认目标、规模和一致性要求',()=>`${article.description}。${parts.core}`],
      ['容量有了以后，再把入口、核心处理和数据落点串起来',()=>`${parts.chain} ${parts.source}`],
      ['关键参数要从峰值流量和资源上限反推',()=>parts.config],
      ['正常链路之外，还要设计失败补偿和可验证的恢复流程',()=>`${parts.incident} ${parts.validation}`],
      ['最后再讲扩容、成本和方案边界',()=>parts.boundary]
    ],
    mechanism:[
      ['我先给结论，再说明它在项目里解决什么问题',()=>`${article.description}。${parts.core}`],
      ['核心机制我会按一次真实执行过程来讲',()=>parts.chain],
      ['实现细节只抓关键入口，不会整段背源码',()=>parts.source],
      ['放到生产使用时，我会关注参数和验证数据',()=>`${parts.config} ${parts.validation}`],
      ['最后补充常见误区和使用边界',()=>`${parts.incident} ${parts.boundary}`]
    ]
  }
  const specs=plans[type]
  const fallback=sections.filter(section=>!/参考资料|高频追问|机制全景图/.test(section.title)).map(section=>sectionText(section,320)).filter(text=>text.length>45)
  const used=new Set()
  const answer=specs.map(([label,read])=>{
    let text=read()
    while((!text||text.length<35)&&fallback.length)text=fallback.shift()
    text=text||article.description
    const normalized=text.replace(/^[：:；;\s]+/,'')
    const key=normalized.slice(0,80)
    if(used.has(key)){const replacement=fallback.find(item=>!used.has(item.slice(0,80)));if(replacement)text=replacement}
    used.add(text.slice(0,80))
    return`${label}。${text}`
  })
  const pointSection=sectionBy(sections,title=>/核心考点清单|面试考察点/.test(title))
  const keyPoints=bulletPoints(pointSection).slice(0,5)
  const shortLead={project:'这个问题我会先说项目结论：',incident:'我会先控制影响，再按证据定位：',design:'我会先定目标和容量，再拆核心链路：',mechanism:'先说结论：'}[type]
  return{
    id:`article-${article.categorySlug}-${article.slug}`,
    sourceRef,
    category:article.category,
    difficulty:article.level,
    durationMinutes:3,
    type,
    prompt,
    shortAnswer:`${shortLead}${sentenceLimit(parts.core||article.description,150)}`,
    answer,
    keyPoints:keyPoints.length?keyPoints:[article.description],
    relatedArticles:[`${article.categorySlug}/${article.slug}`,...article.prerequisites,...article.related,...article.next].filter((item,index,list)=>list.indexOf(item)===index).slice(0,4),
    diagram:questionDiagram(type,source),
    followUps:followUpQuestions(article,sections)
  }
}

const articles=[]
const search=[]
const practice=[]
for(const file of filesUnder(contentRoot)){
  const raw=readFileSync(file,'utf8')
  const front=raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if(!front)throw new Error(`Markdown 缺少 Front Matter: ${relative(project,file)}`)
  const meta={}
  for(const line of front[1].split('\n')){
    const colon=line.indexOf(':')
    if(colon>0)meta[line.slice(0,colon).trim()]=line.slice(colon+1).trim().replace(/^['"]|['"]$/g,'')
  }
  const relativeFile=relative(contentRoot,file).replaceAll('\\','/').replace(/\.md$/,'')
  const slug=relativeFile.split('/').at(-1)
  const source=raw.slice(front[0].length)
  const article={
    category:meta.category,categorySlug:meta.categorySlug,categoryOrder:Number(meta.categoryOrder||999),
    slug,order:Number(meta.order||999),title:meta.title,description:meta.description,updated:meta.updated,
    minutes:Number(meta.minutes),level:meta.level,file:relativeFile,
    prerequisites:parseList(meta.prerequisites),related:parseList(meta.related),next:parseList(meta.next)
  }
  articles.push(article)
  search.push({path:`${article.categorySlug}/${slug}`,title:article.title,description:article.description,category:article.category,body:plainMarkdown(source)})
  practice.push(practiceQuestion(article,source))
}
articles.sort((a,b)=>a.categoryOrder-b.categoryOrder||a.order-b.order||a.title.localeCompare(b.title,'zh-CN'))
const articleOrder=new Map(articles.map((article,index)=>[`${article.categorySlug}/${article.slug}`,index]))
practice.sort((a,b)=>articleOrder.get(a.sourceRef)-articleOrder.get(b.sourceRef))
if(new Set(practice.map(question=>question.prompt)).size!==practice.length)throw new Error('项目型面试题存在重复题干')
for(const question of practice){
  if(question.answer.length!==5||question.answer.join('').length<580)throw new Error(`三分钟回答内容不足: ${question.sourceRef}`)
  if(question.followUps.length<2)throw new Error(`候选追问不足: ${question.sourceRef}`)
}
const seen=new Set()
for(const article of articles){const path=`${article.categorySlug}/${article.slug}`;if(seen.has(path))throw new Error(`重复文章路由: ${path}`);seen.add(path)}
for(const question of practice){
  for(const reference of question.relatedArticles)if(!seen.has(reference))throw new Error(`题目关联了不存在的文章: ${question.sourceRef} -> ${reference}`)
}
const typeCounts=Object.fromEntries(['project','incident','design','mechanism'].map(type=>[type,practice.filter(question=>question.type===type).length]))
for(const[type,count]of Object.entries(typeCounts))if(count<8)throw new Error(`题型数量不足: ${type}=${count}`)

const publicPracticeRoot=join(publicRoot,'practice')
const publicQuestionRoot=join(publicPracticeRoot,'questions')
mkdirSync(generatedRoot,{recursive:true});mkdirSync(publicRoot,{recursive:true});mkdirSync(publicQuestionRoot,{recursive:true})
const manifest=JSON.stringify(articles,null,2)+'\n'
const searchIndex=JSON.stringify({version:createHash('sha256').update(JSON.stringify(search)).digest('hex').slice(0,12),articles:search})
writeFileSync(join(generatedRoot,'articles.json'),manifest)
const practiceIndex=practice.map(({answer,keyPoints,followUps,diagram,shortAnswer,relatedArticles,...summary})=>summary)
const practiceVersion=createHash('sha256').update(JSON.stringify(practice)).digest('hex').slice(0,12)
const practiceIndexPayload={version:practiceVersion,questions:practiceIndex}
writeFileSync(join(generatedRoot,'practice-index.json'),JSON.stringify(practiceIndexPayload,null,2)+'\n')
writeFileSync(join(publicPracticeRoot,'index.json'),JSON.stringify(practiceIndexPayload))
for(const question of practice)writeFileSync(join(publicQuestionRoot,`${question.id}.json`),JSON.stringify(question))
writeFileSync(join(publicRoot,'search-index.json'),searchIndex)
console.log(`内容清单已生成：${articles.length} 篇文章，${practice.length} 道题（项目 ${typeCounts.project} / 故障 ${typeCounts.incident} / 设计 ${typeCounts.design} / 原理 ${typeCounts.mechanism}），搜索索引 ${Buffer.byteLength(searchIndex)} bytes。`)
