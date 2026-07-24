import{createHash}from'node:crypto'
import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs'
import{dirname,join,relative,resolve}from'node:path'
import{fileURLToPath}from'node:url'
import{marked}from'marked'
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
      if(cells.length===3&&/^(参数|配置|指标|方案|类型|场景|组件|阶段|维度|对比项)$/.test(cells[0]))return' '
      if(cells.length===3)return`${cells[0]}：${cells[1]}，配置时关注${cells[2]}。`
      if(cells.length===2)return`${cells[0]}：${cells[1]}。`
      return`${cells.join('，')}。`
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
    if(output.length+sentence.length>max){
      if(output.length>=Math.floor(max*.58))break
      const clauses=sentence.match(/[^，,；;]+[，,；;]?/g)||[sentence]
      for(const clause of clauses){
        if(output.length+clause.length>max)break
        output+=clause
      }
      break
    }
    output+=sentence
  }
  return(output||value.slice(0,max)).trim().replace(/[，,；;：:\s]+$/,'。')
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
  if(extracted.length<4)return undefined
  return{kind:type==='design'?'flow':'timeline',title:type==='design'?'方案主链路':'排查与恢复时间线',nodes:extracted}
}
function followUpQuestions(article,sections){
  const block=sections.find(section=>section.title==='常见问题'&&section.lines.some(line=>/^###\s+/.test(line)))||sectionBy(sections,title=>title==='高频追问')
  const groups=[]
  let current
  for(const line of block?.lines||[]){
    const heading=line.match(/^###\s+(.+)$/)
    if(heading){current={prompt:heading[1].replace(/^追问(?:\s*\d+)?[：:]?\s*/,''),lines:[]};groups.push(current);continue}
    if(current)current.lines.push(line)
  }
  return groups.slice(0,4).map((group,index)=>{
    const direct=sectionText({lines:group.lines},260)||article.description
    const points=bulletPoints({lines:group.lines}).slice(0,3)
    return{
      id:`${article.categorySlug}-${article.slug}-follow-up-${index+1}`,
      weight:Math.max(1,groups.length-index),
      prompt:group.prompt,
      durationMinutes:1,
      answer:[direct],
      keyPoints:points,
      relatedArticles:[`${article.categorySlug}/${article.slug}`,...article.related].slice(0,3)
    }
  })
}

const sectionMatchers={
  project:/项目|生产|实践|配置|参数|选型|使用|流程|链路|实现|优化|案例|监控/,
  incident:/排查|定位|故障|异常|现象|止损|恢复|验证|问题|监控|确认|现场|取证|类型|分析/,
  design:/架构|设计|流程|链路|容量|一致性|可靠|补偿|方案|治理|保护/,
  mechanism:/原理|机制|流程|结构|实现|源码|为什么|区别|执行|工作|核心/
}
function promptAffinity(title,prompt){
  const normalizedTitle=title.toLowerCase().replace(/\s+/g,'')
  const normalizedPrompt=prompt.toLowerCase().replace(/\s+/g,'')
  const chunks=normalizedTitle.match(/[a-z][a-z0-9+.#-]*|[\u4e00-\u9fff]{2,}/g)||[]
  let hits=0
  for(const chunk of chunks){
    if(/^[a-z]/.test(chunk)){if(chunk.length>=2&&normalizedPrompt.includes(chunk))hits++;continue}
    for(let index=0;index<chunk.length-1;index++)if(normalizedPrompt.includes(chunk.slice(index,index+2))){hits++;break}
  }
  return Math.min(hits,2)*3
}
function answerSections(sections,type,prompt){
  const candidates=sections.map((section,index)=>{
    const text=sectionText(section,140)
    let score=sectionMatchers[type].test(section.title)?6:0
    if(/流程|原理|机制|结构|实现|排查|设计|配置|选择|区别|实践|场景/.test(section.title))score+=2
    if(/案例/.test(section.title))score+=type==='incident'?1:2
    if(/故障|风险|注意|踩坑/.test(section.title))score+=type==='incident'?3:1
    if(type==='incident'&&/第[一二三四五六七八九]步|确认|止损|保存现场|取证/.test(section.title))score+=8
    score+=promptAffinity(section.title,prompt)
    return{index,text,score}
  }).filter(({text},index)=>text.length>=35&&!/先说结论|常见问题|参考资料/.test(sections[index].title))
  candidates.sort((a,b)=>b.score-a.score||a.index-b.index)
  const selected=[]
  let length=0
  for(const candidate of candidates){
    if(selected.some(item=>item.text.slice(0,70)===candidate.text.slice(0,70)))continue
    selected.push(candidate);length+=candidate.text.length
    if(length>=180||selected.length>=3)break
  }
  return selected.sort((a,b)=>a.index-b.index).map(item=>item.text)
}

const practiceOverrides={
  'java-basic/string-immutable':{
    durationMinutes:1,
    prompt:'为什么 String 要设计成不可变？在项目里有什么用？',
    shortAnswer:'String 创建后内容就不再改变。这样常量池能安全复用，做 Map Key 时哈希稳定，多线程共享也更省心。',
    answer:[
      '这里先分清两个概念：final 只表示 String 不能被继承，并不自动等于不可变。',
      'String 真正做的是把内部数据藏好，也不提供原地修改内容的方法。像 replace、substring 这些看起来在“修改”字符串的操作，其实都会返回一个新对象。',
      '放到项目里，它的价值就是稳定：字符串池可以安全复用，放进 HashMap 后哈希值不会突然变化，多个线程共用也不用担心内容被改。',
      '少量拼接直接用 String 就行；循环里反复拼接时换成 StringBuilder，少创建一些临时对象。'
    ],
    keyPoints:['final 不等于不可变','不可变让复用、哈希和并发共享更安全','大量拼接使用 StringBuilder'],
    followUps:[
      {
        id:'java-basic-string-immutable-follow-up-1',weight:2,prompt:'String 真的是绝对不能改吗？',durationMinutes:1,
        answer:[
          '正常写 Java 时，把 String 当成不可变对象就可以。replace、substring、concat 这类方法都不会修改原对象，而是返回新字符串。',
          '确实可以用反射或 Unsafe 绕过封装，但那已经破坏了 String 的正常语义，业务代码不应该依赖这种做法。'
        ],
        keyPoints:['常规 API 下不可变','非常规手段不属于正常使用方式'],relatedArticles:['java-basic/string-immutable']
      },
      {
        id:'java-basic-string-immutable-follow-up-2',weight:1,prompt:'new String("abc") 创建几个对象？',durationMinutes:1,
        answer:[
          '这题不要直接背“两个对象”。能创建几个，要看常量池里原来有没有 "abc"。',
          '执行 new String("abc") 时，new 一定会创建一个新的堆对象；字面量对应的常量池对象是不是这时才创建，则取决于它之前是否已经存在。'
        ],
        keyPoints:['new 一定创建堆对象','常量池对象取决于已有状态'],relatedArticles:['java-basic/string-immutable']
      }
    ]
  }
}

function practiceQuestion(article,source){
  const sections=markdownSections(source)
  const sourceRef=`${article.categorySlug}/${article.slug}`
  const prompt=projectQuestionPrompts[sourceRef]
  if(!prompt)throw new Error(`缺少项目型面试题: ${sourceRef}`)
  const type=practiceType(sourceRef,prompt)
  const core=sectionText(sectionBy(sections,title=>title==='先说结论'),140)||article.description
  const answer=answerSections(sections,type,prompt)
  const pointSection=sectionBy(sections,title=>title==='先说结论')
  const keyPoints=bulletPoints(pointSection).slice(0,4)
  const generated={
    id:`article-${article.categorySlug}-${article.slug}`,
    sourceRef,
    category:article.category,
    difficulty:article.level,
    durationMinutes:1,
    type,
    prompt,
    shortAnswer:core,
    answer:answer.length?answer:[core],
    keyPoints,
    relatedArticles:[`${article.categorySlug}/${article.slug}`,...article.prerequisites,...article.related,...article.next].filter((item,index,list)=>list.indexOf(item)===index).slice(0,4),
    diagram:questionDiagram(type,source),
    followUps:followUpQuestions(article,sections)
  }
  return practiceOverrides[sourceRef]?{...generated,...practiceOverrides[sourceRef]}:generated
}

const articles=[]
const search=[]
const practice=[]
const publicArticleRoot=join(publicRoot,'articles')
mkdirSync(publicArticleRoot,{recursive:true})
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
  const rendered=String(marked.parse(source.replace(/^#\s+.+\n+/,'')))
  const contentVersion=createHash('sha256').update(rendered).digest('hex').slice(0,12)
  const article={
    category:meta.category,categorySlug:meta.categorySlug,categoryOrder:Number(meta.categoryOrder||999),
    slug,order:Number(meta.order||999),title:meta.title,description:meta.description,updated:meta.updated,
    minutes:Number(meta.minutes),level:meta.level,file:relativeFile,contentVersion,
    headings:markdownSections(source).map(section=>section.title),
    prerequisites:parseList(meta.prerequisites),related:parseList(meta.related),next:parseList(meta.next)
  }
  const articleOutput=join(publicArticleRoot,article.categorySlug,`${slug}.html`)
  mkdirSync(dirname(articleOutput),{recursive:true});writeFileSync(articleOutput,rendered)
  articles.push(article)
  search.push({path:`${article.categorySlug}/${slug}`,title:article.title,description:article.description,category:article.category,body:plainMarkdown(source)})
  practice.push(practiceQuestion(article,source))
}
articles.sort((a,b)=>a.categoryOrder-b.categoryOrder||a.order-b.order||a.title.localeCompare(b.title,'zh-CN'))
const articleOrder=new Map(articles.map((article,index)=>[`${article.categorySlug}/${article.slug}`,index]))
practice.sort((a,b)=>articleOrder.get(a.sourceRef)-articleOrder.get(b.sourceRef))
if(new Set(practice.map(question=>question.prompt)).size!==practice.length)throw new Error('项目型面试题存在重复题干')
for(const question of practice){
  if(question.durationMinutes!==1)throw new Error(`回答时长不是 1 分钟: ${question.sourceRef}`)
  if(question.answer.length<1||question.answer.length>4||question.answer.join('').length<35)throw new Error(`回答内容长度不合适: ${question.sourceRef}`)
  if(question.answer.some(paragraph=>/我会先|具体落地|形成闭环|最后补充|这个追问我会/.test(paragraph)))throw new Error(`回答仍包含模板话术: ${question.sourceRef}`)
  if(question.followUps.some(followUp=>followUp.durationMinutes!==1||!followUp.answer.length))throw new Error(`追问内容不合适: ${question.sourceRef}`)
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
writeFileSync(join(generatedRoot,'article-links.json'),JSON.stringify(articles.map(({categorySlug,slug,title,file})=>({categorySlug,slug,title,file})),null,2)+'\n')
writeFileSync(join(generatedRoot,'home-articles.json'),JSON.stringify(articles.map(({category,categorySlug,slug,title,description,minutes,level})=>({category,categorySlug,slug,title,description,minutes,level})),null,2)+'\n')
const practiceIndex=practice.map(({answer,keyPoints,followUps,diagram,shortAnswer,relatedArticles,...summary})=>summary)
const practiceVersion=createHash('sha256').update(JSON.stringify(practice)).digest('hex').slice(0,12)
const practiceIndexPayload={version:practiceVersion,questions:practiceIndex}
writeFileSync(join(generatedRoot,'practice-index.json'),JSON.stringify(practiceIndexPayload,null,2)+'\n')
writeFileSync(join(publicPracticeRoot,'index.json'),JSON.stringify(practiceIndexPayload))
for(const question of practice)writeFileSync(join(publicQuestionRoot,`${question.id}.json`),JSON.stringify(question))
writeFileSync(join(publicRoot,'search-index.json'),searchIndex)
console.log(`内容清单已生成：${articles.length} 篇文章，${practice.length} 道题（项目 ${typeCounts.project} / 故障 ${typeCounts.incident} / 设计 ${typeCounts.design} / 原理 ${typeCounts.mechanism}），搜索索引 ${Buffer.byteLength(searchIndex)} bytes。`)
