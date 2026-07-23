import{existsSync,mkdirSync,readFileSync,writeFileSync}from'node:fs'
import{dirname,join,resolve}from'node:path'
import{fileURLToPath}from'node:url'
import{marked}from'marked'

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const dist=join(project,'dist'),contentRoot=join(project,'src/content')
const manifest=JSON.parse(readFileSync(join(project,'src/generated/articles.json'),'utf8'))
const curatedPracticeMeta=JSON.parse(readFileSync(join(project,'src/data/curated-practice-meta.json'),'utf8'))
const template=readFileSync(join(dist,'index.html'),'utf8')

function configuredSiteUrl(){
  if(process.env.SITE_URL)return process.env.SITE_URL
  for(const name of['.env.local','.env']){
    const file=join(project,name);if(!existsSync(file))continue
    const value=readFileSync(file,'utf8').match(/^SITE_URL\s*=\s*['"]?([^'"\s]+)['"]?\s*$/m)?.[1]
    if(value)return value
  }
}
const hostedBuild=process.env.CF_PAGES==='1'||process.env.VERCEL==='1'||process.env.NETLIFY==='true'
const configuredUrl=configuredSiteUrl()
if(hostedBuild&&!configuredUrl)throw new Error('线上构建必须配置 SITE_URL，例如 https://java.example.com')
let parsedSiteUrl
try{parsedSiteUrl=new URL(configuredUrl||'http://localhost:4173')}catch{throw new Error(`SITE_URL 不是合法地址: ${configuredUrl}`)}
if(parsedSiteUrl.pathname!=='/'||parsedSiteUrl.search||parsedSiteUrl.hash)throw new Error('SITE_URL 只能包含协议和域名，不能包含路径、查询参数或锚点')
if(hostedBuild&&parsedSiteUrl.protocol!=='https:')throw new Error('线上 SITE_URL 必须使用 https://')
const siteUrl=parsedSiteUrl.origin

function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function escapeXml(value=''){return escapeHtml(value)}
function plainText(value=''){return String(value).replace(/[`*_>#\[\]]/g,'').replace(/\s+/g,' ').trim()}
function concise(value='',max=170){const text=plainText(value);return text.length<=max?text:`${text.slice(0,max-1).trim()}…`}
function schemaJson(value){return JSON.stringify(value).replace(/</g,'\\u003c')}
function seoHead({title,description,path,type='website',schema}){
  const canonical=`${siteUrl}${path}`
  return`<link rel="canonical" href="${canonical}"><meta property="og:type" content="${type}"><meta property="og:locale" content="zh_CN"><meta property="og:site_name" content="Java 知识库"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${canonical}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><script type="application/ld+json">${schemaJson(schema)}</script>`
}
function pageHtml({title,description,path,type,schema,body=''}){
  let html=template.replace(/<title>[\s\S]*?<\/title>/,`<title>${escapeHtml(title)} | Java 知识库</title>`).replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${escapeHtml(description)}">`)
  html=html.replace('</head>',`${seoHead({title,description,path,type,schema})}</head>`)
  if(body)html=html.replace('<div id="app"></div>',`<div id="app">${body}</div>`)
  return html
}
function shellHeader(){return`<header class="top"><a class="brand" href="/"><span>J</span><b>Java 知识库</b></a><nav><a href="/knowledge/java-basic/string-immutable">Java 八股文</a><a href="/practice">刷题</a></nav></header>`}
function renderArticle(article){
  const raw=readFileSync(join(contentRoot,`${article.file}.md`),'utf8')
  const source=raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n/,'').replace(/^#\s+.+\n+/,'')
  return`<div class="prerender-shell">${shellHeader()}<div class="layout"><main class="article"><div class="breadcrumb">八股文 / ${escapeHtml(article.category)} / <span>${escapeHtml(article.title)}</span></div><h1>${escapeHtml(article.title)}</h1><div class="meta"><span>最后编辑于 ${escapeHtml(article.updated)}</span><span>阅读约 ${article.minutes} 分钟</span><span>${escapeHtml(article.level)}</span></div><section class="answer-card"><small>一句话回答</small><p>${escapeHtml(article.description)}</p></section><div class="article-body">${marked.parse(source)}</div></main></div></div>`
}
function renderPracticeLanding(questionCount){
  return`<div class="prerender-shell">${shellHeader()}<main class="practice-page"><header class="practice-toolbar"><div class="practice-title"><small>JAVA INTERVIEW</small><h1>高频面试题</h1></div></header><section class="practice-workspace"><article class="question-node depth-0"><div class="question-head"><small>项目实战 · 故障排查 · 系统设计</small><h1>从 ${questionCount} 道高频问题中随机开始</h1></div><p>每道题提供口语化参考回答、递进追问和关联知识文章。</p><a class="reveal-answer" href="/practice/${escapeHtml(questionRoutes[0]?.id||'')}">开始刷题</a></article></section></main></div>`
}
function renderDiagram(diagram){
  if(!diagram?.nodes?.length)return''
  const nodes=diagram.nodes.map((node,index)=>`${index?'<span>→</span>':''}<div class="diagram-node"><i>${String(index+1).padStart(2,'0')}</i><b>${escapeHtml(node)}</b></div>`).join('')
  return`<section class="question-diagram ${escapeHtml(diagram.kind||'flow')}"><header><span>${escapeHtml(diagram.title||'方案主链路')}</span><small>从目标到落地</small></header><div class="diagram-track">${nodes}</div></section>`
}
function renderPracticeQuestion(question){
  const paragraphs=(question.answer||[]).slice(0,5).map((paragraph,index)=>`<div class="answer-paragraph"><span>${String(index+1).padStart(2,'0')}</span><p>${escapeHtml(paragraph)}</p></div>`).join('')
  const related=(question.relatedArticles||[]).slice(0,4).map(reference=>{const article=articleByRef.get(reference);return article?`<a href="/knowledge/${escapeHtml(reference)}"><b>${escapeHtml(article.title)}</b><i>↗</i></a>`:''}).join('')
  return`<div class="prerender-shell">${shellHeader()}<main class="practice-page"><header class="practice-toolbar"><div class="practice-title"><small>JAVA INTERVIEW</small><h1>高频面试题</h1></div></header><section class="practice-workspace"><article class="question-node depth-0"><div class="question-head"><div class="question-meta"><span>${escapeHtml(question.category||'综合')}</span><span>${escapeHtml(question.difficulty||'进阶')}</span><span>约 ${question.durationMinutes||3} 分钟</span></div><h1>${escapeHtml(question.prompt)}</h1></div><section class="question-reveal-content"><div class="spoken-answer"><header class="answer-heading"><span>参考回答</span><small>约 3 分钟 · 口语表达</small></header>${question.shortAnswer?`<div class="quick-answer"><small>先说结论</small><p>${escapeHtml(question.shortAnswer)}</p></div>`:''}<div class="answer-copy long">${paragraphs}</div>${renderDiagram(question.diagram)}</div>${related?`<nav class="question-related" aria-label="相关知识点"><span>关联知识</span>${related}</nav>`:''}</section></article></section></main></div>`
}

const latestUpdated=manifest.map(article=>article.updated).sort().at(-1)
const articleByRef=new Map(manifest.map(article=>[`${article.categorySlug}/${article.slug}`,article]))
const homeTitle='Java 面试知识库'
const homeDescription='系统整理 Java、MySQL、Redis、Kafka、Elasticsearch、ClickHouse、JVM 与架构高频面试知识。'
writeFileSync(join(dist,'index.html'),pageHtml({title:homeTitle,description:homeDescription,path:'/',schema:{'@context':'https://schema.org','@type':'WebSite',name:'Java 知识库',url:`${siteUrl}/`,description:homeDescription,inLanguage:'zh-CN'}}))

for(const article of manifest){
  const path=`/knowledge/${article.categorySlug}/${article.slug}`
  const schema={'@context':'https://schema.org','@type':'TechArticle',headline:article.title,description:article.description,dateModified:article.updated,inLanguage:'zh-CN',mainEntityOfPage:`${siteUrl}${path}`,author:{'@type':'Organization',name:'Java 知识库'}}
  const html=pageHtml({title:article.title,description:article.description,path,type:'article',schema,body:renderArticle(article)})
  const output=join(dist,'knowledge',article.categorySlug,article.slug,'index.html');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,html)
}

const practicePayload=JSON.parse(readFileSync(join(dist,'practice/index.json'),'utf8'))
const curatedByRef=new Map(curatedPracticeMeta.map(question=>[question.sourceRef,question]))
const questionRoutes=practicePayload.questions.map(summary=>{
  const detail=JSON.parse(readFileSync(join(dist,'practice/questions',`${summary.id}.json`),'utf8'))
  const curated=curatedByRef.get(summary.sourceRef)
  return curated?{...detail,...curated,answer:[curated.shortAnswer]}:detail
})
const practiceDescription='随机练习贴近项目、生产故障和系统设计的 Java 高频面试题，展开三分钟口语化回答并继续追问。'
const practiceSchema={'@context':'https://schema.org','@type':'CollectionPage',name:'高频面试题',description:practiceDescription,url:`${siteUrl}/practice`,inLanguage:'zh-CN'}
const practiceOutput=join(dist,'practice','index.html');mkdirSync(dirname(practiceOutput),{recursive:true});writeFileSync(practiceOutput,pageHtml({title:'高频面试题',description:practiceDescription,path:'/practice',schema:practiceSchema,body:renderPracticeLanding(questionRoutes.length)}))
for(const question of questionRoutes){
  const path=`/practice/${question.id}`
  const description=concise(question.shortAnswer||question.answer?.[0]||question.prompt)
  const answerText=plainText(question.shortAnswer||question.answer?.join('\n')||'')
  const schema={'@context':'https://schema.org','@type':'QAPage',mainEntity:{'@type':'Question',name:question.prompt,acceptedAnswer:{'@type':'Answer',text:answerText}}}
  const output=join(dist,'practice',question.id,'index.html');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,pageHtml({title:question.prompt,description,path,type:'article',schema,body:renderPracticeQuestion(question)}))
}

const sitemapEntries=[
  {path:'/',updated:latestUpdated},
  {path:'/practice',updated:latestUpdated},
  ...manifest.map(article=>({path:`/knowledge/${article.categorySlug}/${article.slug}`,updated:article.updated})),
  ...questionRoutes.map(question=>({path:`/practice/${question.id}`,updated:articleByRef.get(question.sourceRef)?.updated||latestUpdated}))
]
const urls=sitemapEntries.map(entry=>`  <url><loc>${escapeXml(`${siteUrl}${entry.path}`)}</loc><lastmod>${escapeXml(entry.updated)}</lastmod></url>`).join('\n')
writeFileSync(join(dist,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
writeFileSync(join(dist,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`)
const cleanRoutes=sitemapEntries.map(entry=>entry.path).filter(path=>path!=='/')
const redirects=cleanRoutes.map(path=>`${path} ${path}/index.html 200`).join('\n')
writeFileSync(join(dist,'_redirects'),`# Exact rewrites preserve prerendered SEO and never intercept JSON assets.\n${redirects}\n`)
const notFound=template.replace(/<title>[\s\S]*?<\/title>/,'<title>页面不存在 | Java 知识库</title>').replace('</head>','<meta name="robots" content="noindex,follow"></head>')
writeFileSync(join(dist,'404.html'),notFound)
console.log(`静态页面已生成：${manifest.length} 篇文章，${questionRoutes.length} 道题，${cleanRoutes.length} 条精确路由，站点地址 ${siteUrl}`)
