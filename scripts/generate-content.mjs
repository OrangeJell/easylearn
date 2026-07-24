import{createHash}from'node:crypto'
import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs'
import{dirname,join,relative,resolve}from'node:path'
import{fileURLToPath}from'node:url'
import{marked}from'marked'
import{projectQuestionPrompts}from'./practice-scenarios.mjs'
import{practiceAnswerOverrides}from'./practice-answers/index.mjs'
import{practiceFollowUpOverrides}from'./practice-followups/index.mjs'

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
function normalizedText(value){return plainMarkdown(value).replace(/[^\p{L}\p{N}]+/gu,'')}
function bigrams(value){
  const text=normalizedText(value),items=new Set()
  for(let index=0;index<text.length-1;index++)items.add(text.slice(index,index+2))
  return items
}
function openingOverlap(shortAnswer,answerHtml){
  const firstParagraph=answerHtml.match(/<p>([\s\S]*?)<\/p>/)?.[1]||''
  const summary=bigrams(shortAnswer),opening=bigrams(firstParagraph)
  let shared=0
  for(const item of summary)if(opening.has(item))shared++
  return shared/Math.max(1,Math.min(summary.size,opening.size))
}

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
function renderFollowUps(sourceRef,items=[],path=[]){
  return items.map((item,index)=>{
    const position=[...path,index+1]
    const answerHtml=String(marked.parse(item.answerMarkdown))
    const plainAnswer=plainMarkdown(item.answerMarkdown)
    return{
      id:`article-${sourceRef.replace('/','-')}-follow-up-${position.join('-')}`,
      prompt:item.prompt,
      durationMinutes:Math.min(2,Math.max(1,Math.ceil(plainAnswer.length/300))),
      answer:[plainAnswer],
      answerHtml,
      keyPoints:item.keyPoints||[],
      relatedArticles:[],
      followUps:renderFollowUps(sourceRef,item.followUps||[],position)
    }
  })
}

const promptReferences=Object.keys(projectQuestionPrompts)
const missingAnswerReferences=promptReferences.filter(reference=>!practiceAnswerOverrides[reference])
const unknownAnswerReferences=Object.keys(practiceAnswerOverrides).filter(reference=>!projectQuestionPrompts[reference])
const missingFollowUpReferences=promptReferences.filter(reference=>!practiceFollowUpOverrides[reference])
const unknownFollowUpReferences=Object.keys(practiceFollowUpOverrides).filter(reference=>!projectQuestionPrompts[reference])
if(missingAnswerReferences.length)throw new Error(`缺少逐题回答: ${missingAnswerReferences.join(', ')}`)
if(unknownAnswerReferences.length)throw new Error(`逐题回答引用了不存在的问题: ${unknownAnswerReferences.join(', ')}`)
if(missingFollowUpReferences.length)throw new Error(`缺少逐题追问: ${missingFollowUpReferences.join(', ')}`)
if(unknownFollowUpReferences.length)throw new Error(`逐题追问引用了不存在的问题: ${unknownFollowUpReferences.join(', ')}`)

function practiceQuestion(article,source){
  const sections=markdownSections(source)
  const sourceRef=`${article.categorySlug}/${article.slug}`
  const prompt=projectQuestionPrompts[sourceRef]
  if(!prompt)throw new Error(`缺少项目型面试题: ${sourceRef}`)
  const type=practiceType(sourceRef,prompt)
  const generated={
    id:`article-${article.categorySlug}-${article.slug}`,
    sourceRef,
    category:article.category,
    difficulty:article.level,
    durationMinutes:1,
    type,
    prompt,
    answer:[],
    keyPoints:[],
    relatedArticles:[`${article.categorySlug}/${article.slug}`,...article.prerequisites,...article.related,...article.next].filter((item,index,list)=>list.indexOf(item)===index).slice(0,4),
    diagram:questionDiagram(type,source),
    followUps:renderFollowUps(sourceRef,practiceFollowUpOverrides[sourceRef])
  }
  const override=practiceAnswerOverrides[sourceRef]
  const{answerMarkdown,problemAnalysisMarkdown,pitfallsMarkdown,...overrideData}=override
  const answerHtml=String(marked.parse(answerMarkdown))
  const plainAnswer=plainMarkdown(answerMarkdown)
  const durationMinutes=Math.min(2,Math.max(1,Math.ceil(plainMarkdown(answerHtml).length/340)))
  return{
    ...generated,...overrideData,
    durationMinutes,answer:[plainAnswer],answerHtml,
    ...(problemAnalysisMarkdown?{problemAnalysisHtml:String(marked.parse(problemAnalysisMarkdown))}:{}),
    ...(pitfallsMarkdown?{pitfallsHtml:String(marked.parse(pitfallsMarkdown))}:{})
  }
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
const answerOpenings=new Map()
for(const question of practice){
  if(question.durationMinutes<1||question.durationMinutes>2)throw new Error(`回答时长不在 1-2 分钟: ${question.sourceRef}`)
  if(question.answer.length<1||question.answer.length>4||question.answer.join('').length<35)throw new Error(`回答内容长度不合适: ${question.sourceRef}`)
  if(!question.answerHtml)throw new Error(`缺少逐题富文本回答: ${question.sourceRef}`)
  const richAnswerText=plainMarkdown(question.answerHtml)
  if(richAnswerText.length<160)throw new Error(`逐题回答过短: ${question.sourceRef}`)
  const opening=richAnswerText.slice(0,28)
  if(answerOpenings.has(opening))throw new Error(`逐题回答开头重复: ${question.sourceRef} / ${answerOpenings.get(opening)}`)
  answerOpenings.set(opening,question.sourceRef)
  if(!question.shortAnswer||question.shortAnswer.length<28||question.shortAnswer.length>150)throw new Error(`逐题结论长度不合适: ${question.sourceRef}`)
  if(openingOverlap(question.shortAnswer,question.answerHtml)>.48)throw new Error(`我的判断与正文开头重复: ${question.sourceRef}`)
}
const followUpPrompts=new Map(),rootFollowUpCounts=new Set()
const followUpOpenings=new Map()
let followUpCount=0,nestedFollowUpCount=0,maxFollowUpDepth=0
function verifyFollowUps(question,items,depth=1){
  if(!items.length&&depth===1)throw new Error(`缺少逐题追问: ${question.sourceRef}`)
  for(const item of items){
    followUpCount++
    if(depth>1)nestedFollowUpCount++
    maxFollowUpDepth=Math.max(maxFollowUpDepth,depth)
    if(!item.prompt||item.prompt.length<12)throw new Error(`追问题干过短: ${question.sourceRef} -> ${item.prompt}`)
    if(/^(什么是|请解释|介绍一下|说说|谈谈|有哪些)/.test(item.prompt))throw new Error(`追问仍是纯概念提问: ${question.sourceRef} -> ${item.prompt}`)
    if(followUpPrompts.has(item.prompt))throw new Error(`追问题干重复: ${question.sourceRef} / ${followUpPrompts.get(item.prompt)} -> ${item.prompt}`)
    followUpPrompts.set(item.prompt,question.sourceRef)
    const answerText=plainMarkdown(item.answerHtml||'')
    if(answerText.length<70)throw new Error(`追问回答过短: ${question.sourceRef} -> ${item.prompt}`)
    if(!item.answerHtml||!item.answer.length)throw new Error(`追问缺少独立富文本回答: ${question.sourceRef} -> ${item.prompt}`)
    const answerOpening=answerText.slice(0,36)
    if(followUpOpenings.has(answerOpening))throw new Error(`追问回答开头重复: ${question.sourceRef} / ${followUpOpenings.get(answerOpening)}`)
    followUpOpenings.set(answerOpening,question.sourceRef)
    verifyFollowUps(question,item.followUps||[],depth+1)
  }
}
for(const question of practice){rootFollowUpCounts.add(question.followUps.length);verifyFollowUps(question,question.followUps)}
if(rootFollowUpCounts.size<3)throw new Error(`追问数量过于机械: ${[...rootFollowUpCounts].join(', ')}`)
if(nestedFollowUpCount<30||maxFollowUpDepth<2)throw new Error(`嵌套追问不足: nested=${nestedFollowUpCount}, depth=${maxFollowUpDepth}`)
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
const practiceIndex=practice.map(({answer,answerHtml,keyPoints,problemAnalysis,problemAnalysisHtml,pitfalls,pitfallsHtml,followUps,diagram,shortAnswer,relatedArticles,...summary})=>summary)
const practiceVersion=createHash('sha256').update(JSON.stringify(practice)).digest('hex').slice(0,12)
const practiceIndexPayload={version:practiceVersion,questions:practiceIndex}
writeFileSync(join(generatedRoot,'practice-index.json'),JSON.stringify(practiceIndexPayload,null,2)+'\n')
writeFileSync(join(publicPracticeRoot,'index.json'),JSON.stringify(practiceIndexPayload))
for(const question of practice)writeFileSync(join(publicQuestionRoot,`${question.id}.json`),JSON.stringify(question))
writeFileSync(join(publicRoot,'search-index.json'),searchIndex)
console.log(`内容清单已生成：${articles.length} 篇文章，${practice.length} 道独立回答（项目 ${typeCounts.project} / 故障 ${typeCounts.incident} / 设计 ${typeCounts.design} / 原理 ${typeCounts.mechanism}），搜索索引 ${Buffer.byteLength(searchIndex)} bytes。`)
