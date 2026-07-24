<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {articleByRef,articles,articlePath,categories,loadArticleHtml,prefetchArticle,type Article,type SearchEntry} from '../catalog'

const route=useRoute(),router=useRouter()
const query=ref(''),catalogOpen=ref(false),outlineOpen=ref(false),activeHeading=ref('')
const expanded=ref(new Set<string>()),readingProgress=ref(0),showBackTop=ref(false)
const searchInput=ref<HTMLInputElement>(),searchFocused=ref(false)
const searchHistory=ref<string[]>([]),searchIndex=ref<SearchEntry[]>([]),searchLoading=ref(false)
const html=ref(''),articleLoading=ref(true),articleError=ref('')
let revealObserver:IntersectionObserver|undefined,restoringProgress=true,searchBlurTimer:number|undefined,restoreTimer:number|undefined,prefetchTimer:number|undefined,navigateFromLink=false,contentRequest=0

const article=computed(()=>articles.find(a=>a.slug===route.params.slug&&a.categorySlug===route.params.category)||articles[0])
const allHeadings=computed(()=>article.value.headings.map((title,index)=>({id:`section-${index}`,title,index})))
const outline=computed(()=>{
  const items=allHeadings.value
  if(items.length<=7)return items
  const broad=/(?:结论|目标|总体|原理|流程|模型|设计|怎么|如何|选择|对比|排查|优化|故障|案例|建议|边界|问题|踩坑)/
  const candidates=items.filter((item,index)=>index>0&&index<items.length-1&&broad.test(item.title))
  const chosen=new Set<number>([0,items.length-1])
  const addEvenly=(pool:typeof items,count:number)=>{
    if(!pool.length||count<=0)return
    if(count===1){chosen.add(pool[Math.floor(pool.length/2)].index);return}
    for(let i=0;i<count;i++)chosen.add(pool[Math.round(i*(pool.length-1)/(count-1))].index)
  }
  addEvenly(candidates,Math.min(5,candidates.length))
  if(chosen.size<7)addEvenly(items.filter(item=>!chosen.has(item.index)),7-chosen.size)
  return items.filter(item=>chosen.has(item.index)).slice(0,7)
})
const index=computed(()=>articles.findIndex(a=>a.slug===article.value.slug&&a.categorySlug===article.value.categorySlug))
const previous=computed(()=>articles[index.value-1]),next=computed(()=>articles[index.value+1])

function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))}
function escapeRegExp(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function highlightText(value:string){
  const safe=escapeHtml(value),term=query.value.trim()
  return term?safe.replace(new RegExp(`(${escapeRegExp(term)})`,'ig'),'<mark>$1</mark>'):safe
}
function makeSnippet(entry:SearchEntry){
  const text=entry.body,term=query.value.trim().toLowerCase(),at=text.toLowerCase().indexOf(term)
  const start=Math.max(0,at<0?0:at-42),end=Math.min(text.length,(at<0?0:at)+term.length+78)
  return`${start?'…':''}${text.slice(start,end)}${end<text.length?'…':''}`
}
const searchResults=computed(()=>{
  const term=query.value.trim().toLowerCase()
  if(!term)return[]
  return searchIndex.value.map(entry=>{
    const item=articleByRef(entry.path)
    if(!item)return null
    const title=entry.title.toLowerCase(),description=entry.description.toLowerCase(),body=entry.body.toLowerCase()
    const score=title.includes(term)?4:description.includes(term)?3:entry.category.toLowerCase().includes(term)?2:body.includes(term)?1:0
    return score?{item,score,snippet:makeSnippet(entry)}:null
  }).filter((x):x is {item:Article;score:number;snippet:string}=>Boolean(x)).sort((a,b)=>b.score-a.score||a.item.order-b.item.order)
})

async function ensureSearchIndex(){
  if(searchIndex.value.length||searchLoading.value)return
  searchLoading.value=true
  try{const response=await fetch('/search-index.json');if(!response.ok)throw new Error('搜索索引加载失败');searchIndex.value=(await response.json()).articles}
  finally{searchLoading.value=false}
}

const related=computed(()=>{
  const explicit:Array<{item:Article;label:string}>=[]
  const addRefs=(refs:string[],label:string)=>refs.forEach(reference=>{const item=articleByRef(reference);if(item&&item.slug!==article.value.slug&&!explicit.some(x=>x.item.file===item.file))explicit.push({item,label})})
  addRefs(article.value.prerequisites,'前置知识');addRefs(article.value.next,'进阶阅读');addRefs(article.value.related,'相关推荐')
  if(explicit.length)return explicit.slice(0,3)
  const same=articles.filter(a=>a.category===article.value.category&&a.slug!==article.value.slug)
  const before=same.filter(a=>a.order<article.value.order).sort((a,b)=>b.order-a.order)[0]
  const after=same.filter(a=>a.order>article.value.order).sort((a,b)=>a.order-b.order).slice(0,2)
  const output:Array<{item:Article;label:string}>=[]
  if(before)output.push({item:before,label:'前置知识'})
  after.forEach((item,i)=>output.push({item,label:i?'继续深入':'进阶阅读'}))
  same.filter(item=>!output.some(x=>x.item.slug===item.slug)).slice(0,3-output.length).forEach(item=>output.push({item,label:'同专题'}))
  return output
})

function rememberSearch(){
  const term=query.value.trim()
  if(!term)return
  searchHistory.value=[term,...searchHistory.value.filter(x=>x!==term)].slice(0,6)
  localStorage.setItem('knowledge-search-history',JSON.stringify(searchHistory.value))
}
function useHistory(term:string){query.value=term;searchInput.value?.focus()}
function clearHistory(){searchHistory.value=[];localStorage.removeItem('knowledge-search-history')}
function focusSearch(){if(searchBlurTimer)window.clearTimeout(searchBlurTimer);searchFocused.value=true;void ensureSearchIndex()}
function deferSearchBlur(){searchBlurTimer=window.setTimeout(()=>searchFocused.value=false,120)}
function go(path:string){
  rememberSearch();catalogOpen.value=false;outlineOpen.value=false
  if(path===route.path){navigateFromLink=false;backToTop();return}
  navigateFromLink=true;router.push(path)
}
function goFirstResult(){const first=searchResults.value[0];if(first)go(articlePath(first.item))}
function toggleCategory(category:string){const next=new Set(expanded.value);next.has(category)?next.delete(category):next.add(category);expanded.value=next}
function closeLayers(){catalogOpen.value=false;outlineOpen.value=false}
function updateDocumentSeo(target:Article){
  document.title=`${target.title} | Java 知识库`
  const upsertMeta=(attribute:'name'|'property',key:string,value:string)=>{let element=document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);if(!element){element=document.createElement('meta');element.setAttribute(attribute,key);document.head.appendChild(element)}element.content=value}
  upsertMeta('name','description',target.description);upsertMeta('property','og:title',target.title);upsertMeta('property','og:description',target.description);upsertMeta('property','og:type','article');upsertMeta('property','og:url',location.href)
  let canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical)}canonical.href=`${location.origin}${articlePath(target)}`
  let script=document.head.querySelector<HTMLScriptElement>('#article-structured-data');if(!script){script=document.createElement('script');script.id='article-structured-data';script.type='application/ld+json';document.head.appendChild(script)}
  script.text=JSON.stringify({'@context':'https://schema.org','@type':'TechArticle',headline:target.title,description:target.description,dateModified:target.updated,inLanguage:'zh-CN'})
}
function handleShortcut(event:KeyboardEvent){
  const target=event.target as HTMLElement
  if(event.key==='/'&&!['INPUT','TEXTAREA'].includes(target.tagName)){event.preventDefault();catalogOpen.value=innerWidth<=720;nextTick(()=>searchInput.value?.focus())}
  if(event.key==='Escape'){closeLayers();searchInput.value?.blur()}
}

const progressKey=()=>`reading-progress:${article.value.categorySlug}/${article.value.slug}`
function updateReading(){
  let currentIndex=0
  document.querySelectorAll<HTMLElement>('.article-body h2').forEach((h,index)=>{if(h.getBoundingClientRect().top<150)currentIndex=index})
  activeHeading.value=[...outline.value].reverse().find(item=>item.index<=currentIndex)?.id||outline.value[0]?.id||''
  const articleEl=document.querySelector<HTMLElement>('.article')
  if(!articleEl)return
  const distance=Math.max(1,articleEl.scrollHeight-window.innerHeight+120)
  readingProgress.value=Math.min(100,Math.max(0,Math.round((window.scrollY-articleEl.offsetTop+90)/distance*100)))
  showBackTop.value=window.scrollY>260
  if(!restoringProgress)localStorage.setItem(progressKey(),String(window.scrollY))
}
function backToTop(){window.scrollTo({top:0,behavior:'smooth'})}
function scrollToSection(id:string){
  const target=document.getElementById(id)
  if(!target)return
  if(restoreTimer)window.clearTimeout(restoreTimer);restoringProgress=false
  target.scrollIntoView({behavior:'smooth',block:'start'});activeHeading.value=id;outlineOpen.value=false
  history.replaceState(history.state,'',`${route.path}#${id}`)
}

function tokenized(source:string,regex:RegExp,classify:(match:RegExpExecArray)=>string){
  let result='',last=0,match:RegExpExecArray|null
  regex.lastIndex=0
  while((match=regex.exec(source))){result+=escapeHtml(source.slice(last,match.index));result+=`<span class="tok-${classify(match)}">${escapeHtml(match[0])}</span>`;last=regex.lastIndex}
  return result+escapeHtml(source.slice(last))
}
function highlightCode(code:HTMLElement,language:string){
  const source=code.textContent||''
  if(language==='java')code.innerHTML=tokenized(source,/(\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[A-Za-z_]\w*|\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|record|return|sealed|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|var|void|volatile|while|yield|null|true|false)\b|\b\d+(?:\.\d+)?[fFdDlL]?\b)/g,m=>m[0].startsWith('/')?'comment':m[0].startsWith('"')||m[0].startsWith("'")?'string':m[0].startsWith('@')?'meta':/^\d/.test(m[0])?'number':'keyword')
  else if(language==='sql')code.innerHTML=tokenized(source,/(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|`[^`]+`|\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|NULL|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|KEY|PRIMARY|UNIQUE|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|BEGIN|COMMIT|ROLLBACK|EXPLAIN|ANALYZE|IN|EXISTS|BETWEEN|LIKE|IS|ASC|DESC)\b|\b\d+(?:\.\d+)?\b)/gi,m=>m[0].startsWith('--')||m[0].startsWith('/*')?'comment':m[0].startsWith("'")?'string':m[0].startsWith('`')?'meta':/^\d/.test(m[0])?'number':'keyword')
  else if(language==='json')code.innerHTML=tokenized(source,/("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/gi,m=>m[0].startsWith('"')?(source.slice(m.index+m[0].length).trimStart().startsWith(':')?'property':'string'):/^(true|false|null)$/i.test(m[0])?'keyword':'number')
  else if(['shell','bash','sh'].includes(language))code.innerHTML=tokenized(source,/(#[^\n]*|"(?:\\.|[^"\\])*"|'[^']*'|\$\{?\w+\}?|\b(?:if|then|else|elif|fi|for|while|in|do|done|case|esac|function|export|local|return|exit|sudo|cd|echo|curl|grep|sed|awk|find|git|npm|java)\b|\b\d+\b)/g,m=>m[0].startsWith('#')?'comment':m[0].startsWith('"')||m[0].startsWith("'")?'string':m[0].startsWith('$')?'variable':/^\d/.test(m[0])?'number':'keyword')
  code.classList.add('code-highlighted')
}

function renderFlowDiagram(source:string){
  const container=document.createElement('div'),direction=/^\s*flowchart\s+LR/m.test(source)?'horizontal':'vertical'
  container.className=`flow-diagram ${direction}`;container.setAttribute('role','img');container.setAttribute('aria-label','文章流程图')
  const nodes=new Map<string,{label:string;kind:'process'|'decision'|'store'}>(),pattern=/\b([A-Za-z][\w]*)\s*(?:\[\("([^"]+)"\)\]|\["([^"]+)"\]|\{"([^"]+)"\}|\("([^"]+)"\))/g
  let match:RegExpExecArray|null
  while((match=pattern.exec(source))){
    if(nodes.has(match[1]))continue
    const kind=match[4]?'decision':match[2]||match[5]?'store':'process'
    nodes.set(match[1],{label:match[2]||match[3]||match[4]||match[5],kind})
  }
  const edges:Array<{from:string;to:string;label:string}>=[]
  source.split('\n').forEach(line=>{
    if(!line.includes('-->'))return
    const ids=(line.match(/\b[A-Za-z][\w]*\b/g)||[]).filter(id=>nodes.has(id))
    if(ids.length<2)return
    const label=line.match(/-->\s*\|"?([^"|]+)"?\|/)?.[1]?.trim()||''
    edges.push({from:ids[0],to:ids.at(-1)!,label})
  })
  const head=document.createElement('div');head.className='flow-diagram-head';head.innerHTML=`<span>机制图解</span><small>${nodes.size} 个节点 · ${edges.length} 条关系</small>`;container.appendChild(head)
  const track=document.createElement('div');track.className=`flow-track ${direction}`;container.appendChild(track)
  ;[...nodes.values()].forEach((item,index)=>{
    const node=document.createElement('div');node.className=`flow-node ${item.kind}`;node.innerHTML=`<small>${String(index+1).padStart(2,'0')}</small><span>${escapeHtml(item.label)}</span>`;track.appendChild(node)
    if(index<nodes.size-1){const arrow=document.createElement('span');arrow.className='flow-arrow';arrow.textContent=direction==='horizontal'?'→':'↓';track.appendChild(arrow)}
  })
  const hasBranches=edges.some(edge=>edge.label)||[...nodes.keys()].some(id=>edges.filter(edge=>edge.from===id).length>1)
  if(hasBranches){
    const relations=document.createElement('div');relations.className='flow-relations'
    edges.forEach(edge=>{
      const relation=document.createElement('div'),from=nodes.get(edge.from)?.label||edge.from,to=nodes.get(edge.to)?.label||edge.to
      relation.innerHTML=`<span>${escapeHtml(from)}</span><i>${edge.label?escapeHtml(edge.label):'流转'}</i><b>→</b><span>${escapeHtml(to)}</span>`;relations.appendChild(relation)
    })
    container.appendChild(relations)
  }
  return container
}

function setupReveal(){
  revealObserver?.disconnect()
  const targets=document.querySelectorAll<HTMLElement>('.article-body > h2,.article-body > h3,.article-body > p,.article-body > blockquote,.article-body > pre,.article-body > table,.article-body > ul,.article-body > ol')
  if(!('IntersectionObserver' in window)){targets.forEach(el=>el.classList.add('is-visible'));return}
  revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver?.unobserve(entry.target)}}),{rootMargin:'0px 0px -7% 0px',threshold:.03})
  targets.forEach(el=>{el.classList.add('reveal-item');revealObserver?.observe(el)})
}
function scheduleAdjacentPrefetch(){
  const connection=(navigator as Navigator&{connection?:{saveData?:boolean;effectiveType?:string}}).connection
  if(connection?.saveData||/2g/.test(connection?.effectiveType||''))return
  if(prefetchTimer)window.clearTimeout(prefetchTimer)
  prefetchTimer=window.setTimeout(()=>{prefetchArticle(previous.value);prefetchArticle(next.value)},1200)
}
async function enhance(){
  await nextTick()
  document.querySelectorAll<HTMLElement>('.article-body h2').forEach((h,i)=>h.id=`section-${i}`)
  document.querySelectorAll<HTMLElement>('.article-body pre').forEach(pre=>{
    const code=pre.querySelector<HTMLElement>('code'),language=(code?.className.match(/language-([\w-]+)/)?.[1]||'text').toLowerCase()
    pre.dataset.language=({java:'JAVA',sql:'SQL',json:'JSON',shell:'SHELL',bash:'SHELL',sh:'SHELL',text:'TEXT'} as Record<string,string>)[language]||language.toUpperCase()
    if(code&&['java','sql','json','shell','bash','sh'].includes(language))highlightCode(code,language)
    if(pre.querySelector('button'))return
    const btn=document.createElement('button');btn.className='copy-code';btn.textContent='复制'
    btn.onclick=async()=>{await navigator.clipboard.writeText(code?.textContent||'');btn.classList.add('success');btn.textContent='✓ 已复制';setTimeout(()=>{btn.classList.remove('success');btn.textContent='复制'},1400)}
    pre.appendChild(btn)
  })
  document.querySelectorAll<HTMLElement>('.article-body pre code.language-mermaid').forEach(code=>code.closest('pre')?.replaceWith(renderFlowDiagram(code.textContent||'')))
  setupReveal()
  const shouldStartAtTop=navigateFromLink
  const saved=shouldStartAtTop?0:Number(localStorage.getItem(progressKey())||0)
  navigateFromLink=false
  requestAnimationFrame(()=>requestAnimationFrame(()=>{restoreTimer=window.setTimeout(()=>{window.scrollTo({top:saved>100?saved:0});restoringProgress=false;updateReading()},100)}))
}

watch(query,value=>{if(value.trim())void ensureSearchIndex()})
watch(()=>`${route.params.category}/${route.params.slug}`,async()=>{
  const request=++contentRequest,target=article.value
  if(prefetchTimer)window.clearTimeout(prefetchTimer)
  updateDocumentSeo(target)
  restoringProgress=true;expanded.value=new Set([...expanded.value,target.category]);articleLoading.value=true;articleError.value='';html.value=''
  try{
    const loaded=await loadArticleHtml(target)
    if(request!==contentRequest)return
    html.value=loaded;articleLoading.value=false
    await enhance();scheduleAdjacentPrefetch()
  }catch(error){if(request===contentRequest){articleLoading.value=false;articleError.value=error instanceof Error?error.message:'文章加载失败'}}
},{immediate:true})
onMounted(()=>{
  history.scrollRestoration='manual';window.addEventListener('scroll',updateReading,{passive:true});window.addEventListener('keydown',handleShortcut)
  try{searchHistory.value=JSON.parse(localStorage.getItem('knowledge-search-history')||'[]')}catch{searchHistory.value=[]}
})
onBeforeUnmount(()=>{window.removeEventListener('scroll',updateReading);window.removeEventListener('keydown',handleShortcut);if(searchBlurTimer)window.clearTimeout(searchBlurTimer);if(restoreTimer)window.clearTimeout(restoreTimer);if(prefetchTimer)window.clearTimeout(prefetchTimer);revealObserver?.disconnect()})
</script>

<template>
  <div class="mobile-tools"><button @click="catalogOpen=!catalogOpen" :aria-expanded="catalogOpen">☰ 知识目录</button><span>{{article.category}}</span></div>
  <button v-if="catalogOpen||outlineOpen" class="catalog-mask" aria-label="关闭弹层" @click="closeLayers"/>
  <div class="layout">
    <aside class="catalog" :class="{mobileOpen:catalogOpen}">
      <div class="mobile-catalog-head"><b>知识目录</b><button aria-label="关闭知识目录" @click="catalogOpen=false">×</button></div>
      <div class="search catalog-search" :class="{focused:searchFocused}">⌕<input ref="searchInput" v-model="query" placeholder="搜索标题、描述和正文" @focus="focusSearch" @blur="deferSearchBlur" @keydown.enter="goFirstResult"><kbd>/</kbd></div>
      <div v-if="searchFocused&&!query&&searchHistory.length" class="search-history"><div><b>最近搜索</b><button @mousedown.prevent="clearHistory">清空</button></div><button v-for="term in searchHistory" :key="term" @mousedown.prevent="useHistory(term)">↗ {{term}}</button></div>
      <div class="catalog-title">Java 知识目录 · {{articles.length}} 篇</div>
      <template v-if="query">
        <div v-if="searchLoading" class="empty search-loading">正在加载搜索索引…</div>
        <template v-else><button v-for="result in searchResults" :key="`${result.item.categorySlug}/${result.item.slug}`" class="search-result" @click="go(articlePath(result.item))"><b v-html="highlightText(result.item.title)"/><small>{{result.item.category}} · {{result.item.minutes}} 分钟</small><p v-html="highlightText(result.snippet)"/></button><div v-if="!searchResults.length" class="empty">没有找到相关内容，试试更短的关键词</div></template>
      </template>
      <template v-else>
        <section v-for="category in categories" :key="category" class="group" :class="{open:expanded.has(category)}"><button class="group-head" :aria-expanded="expanded.has(category)" @click="toggleCategory(category)">{{category}}<span>{{articles.filter(a=>a.category===category).length}}　{{expanded.has(category)?'⌃':'⌄'}}</span></button><div class="group-list"><button v-for="item in articles.filter(a=>a.category===category)" :key="`${item.categorySlug}/${item.slug}`" class="topic" :class="{active:item.slug===article.slug&&item.categorySlug===article.categorySlug}" @click="go(articlePath(item))">{{item.title}}</button></div></section>
      </template>
    </aside>

    <main class="article">
      <div class="breadcrumb">八股文　/　{{article.category}}　/　<span>{{article.title}}</span></div>
      <h1>{{article.title}}</h1>
      <div class="meta"><span>最后编辑于 {{article.updated}}</span><span>阅读约 {{article.minutes}} 分钟</span><span>{{article.level}}</span></div>
      <div class="reading-line"><i :style="{width:`${readingProgress}%`}"/></div>
      <div v-if="articleLoading" class="article-loading" aria-live="polite"><i/><i/><i/><i/><span>正在加载文章正文…</span></div>
      <div v-else-if="articleError" class="article-error"><b>文章加载失败</b><span>{{articleError}}</span><button @click="router.go(0)">重新加载</button></div>
      <template v-else>
        <div class="article-body" v-html="html"/>
        <section v-if="related.length" class="related"><div class="section-kicker">继续学习</div><h2>同专题推荐</h2><div class="related-grid"><button v-for="card in related" :key="card.item.slug" @click="go(articlePath(card.item))" @mouseenter="prefetchArticle(card.item)"><small>{{card.label}} · {{card.item.minutes}} 分钟</small><b>{{card.item.title}}</b><span>{{card.item.description}}</span><i>开始阅读 →</i></button></div></section>
        <nav class="article-nav"><button v-if="previous" @click="go(articlePath(previous))" @mouseenter="prefetchArticle(previous)"><small>上一篇</small><b>← {{previous.title}}</b></button><span/><button v-if="next" class="next" @click="go(articlePath(next))" @mouseenter="prefetchArticle(next)"><small>下一篇</small><b>{{next.title}} →</b></button></nav>
      </template>
    </main>

    <aside class="outline"><strong>文章要点</strong><a v-for="item in outline" :key="item.id" :href="`#${item.id}`" :class="{active:activeHeading===item.id}" @click.prevent="scrollToSection(item.id)">{{item.title}}</a></aside>
  </div>

  <button class="mobile-outline-trigger" @click="outlineOpen=true">§ 文章要点</button>
  <section class="mobile-outline-sheet" :class="{open:outlineOpen}"><header><div><small>{{article.category}}</small><b>文章要点</b></div><button aria-label="关闭文章要点" @click="outlineOpen=false">×</button></header><div><a v-for="item in outline" :key="item.id" :class="{active:activeHeading===item.id}" @click="scrollToSection(item.id)">{{item.title}}</a></div></section>
  <button class="back-top" :class="{visible:showBackTop}" :style="{'--progress':`${readingProgress*3.6}deg`}" :aria-label="`阅读进度 ${readingProgress}%，回到顶部`" @click="backToTop"><span>↑</span><small>{{readingProgress}}%</small></button>
</template>
