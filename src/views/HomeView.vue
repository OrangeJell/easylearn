<script setup lang="ts">
import{computed,onMounted,ref}from'vue'
import{useRouter}from'vue-router'
import homeArticlesJson from'../generated/home-articles.json'

type HomeArticle={category:string;categorySlug:string;slug:string;title:string;description:string;minutes:number;level:string}
type CategoryInfo={name:string;note:string}

const router=useRouter(),query=ref(''),searchFocused=ref(false)
const articles=homeArticlesJson as HomeArticle[]
const categoryInfo:Record<string,CategoryInfo>={
  'java-basic':{name:'Java 基础',note:'语言特性与常见边界'},
  collections:{name:'Java 集合',note:'数据结构与并发容器'},
  concurrency:{name:'Java 多线程',note:'JMM、锁与线程池'},
  jvm:{name:'JVM',note:'内存、GC 与线上排查'},
  mysql:{name:'MySQL',note:'索引、事务与 SQL'},
  redis:{name:'Redis',note:'缓存、高可用与集群'},
  clickhouse:{name:'ClickHouse',note:'分析引擎与查询调优'},
  kafka:{name:'Kafka',note:'消息可靠性与消费模型'},
  elasticsearch:{name:'Elasticsearch',note:'检索、分片与性能'},
  architecture:{name:'系统设计',note:'高并发、分布式与容灾'}
}
const featuredRefs=['collections/hashmap','concurrency/thread-pool','mysql/transactions-mvcc','redis/cache-consistency','kafka/message-loss-prevention','architecture/flash-sale-system-design']
const articlePath=(article:HomeArticle)=>`/knowledge/${article.categorySlug}/${article.slug}`
const featured=featuredRefs.map(reference=>articles.find(article=>`${article.categorySlug}/${article.slug}`===reference)).filter((article):article is HomeArticle=>Boolean(article))
const categories=Object.entries(categoryInfo).map(([slug,info])=>{
  const items=articles.filter(article=>article.categorySlug===slug)
  return{slug,...info,count:items.length,path:items[0]?articlePath(items[0]):'/'}
})
const searchResults=computed(()=>{
  const keyword=query.value.trim().toLocaleLowerCase()
  if(!keyword)return[]
  return articles.filter(article=>`${article.title} ${article.description} ${article.category}`.toLocaleLowerCase().includes(keyword)).sort((a,b)=>Number(b.title.toLocaleLowerCase().startsWith(keyword))-Number(a.title.toLocaleLowerCase().startsWith(keyword))).slice(0,6)
})
const showResults=computed(()=>searchFocused.value&&Boolean(query.value.trim()))

function submitSearch(){if(searchResults.value[0])void router.push(articlePath(searchResults.value[0]))}
function chooseKeyword(keyword:string){query.value=keyword;searchFocused.value=true}
function updateHomeSeo(){
  const description='系统整理 Java、JVM、MySQL、Redis、Kafka 与架构高频面试知识，支持快速搜索、分类阅读和随机刷题。'
  document.title='Java 面试知识库 | 先理解，再讲清楚'
  let meta=document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if(!meta){meta=document.createElement('meta');meta.name='description';document.head.appendChild(meta)}
  meta.content=description
  let canonical=document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical)}
  canonical.href=`${location.origin}/`
}
onMounted(updateHomeSeo)
</script>

<template>
  <main class="home-page">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-intro">
        <small>JAVA LEARNING DESK</small>
        <h1 id="home-title">Java 面试知识库</h1>
        <p>把零散的面试知识整理成能快速讲清楚的回答。先看结论，再补原理、项目场景和容易踩的坑。</p>

        <div class="home-search-wrap">
          <form class="home-search" role="search" @submit.prevent="submitSearch">
            <span aria-hidden="true">⌕</span>
            <input v-model="query" aria-label="搜索知识文章" autocomplete="off" placeholder="搜一个问题，比如线程池、MVCC" @focus="searchFocused=true" @blur="searchFocused=false">
            <button v-if="query" type="button" aria-label="清空搜索" @mousedown.prevent @click="query=''">×</button>
            <button class="home-search-submit" type="submit">搜索</button>
          </form>
          <div v-if="showResults" class="home-search-results" aria-live="polite">
            <template v-if="searchResults.length">
              <RouterLink v-for="article in searchResults" :key="`${article.categorySlug}/${article.slug}`" :to="articlePath(article)" @mousedown.prevent>
                <span><small>{{article.category}} · {{article.minutes}} 分钟</small><b>{{article.title}}</b></span><i>↗</i>
              </RouterLink>
            </template>
            <p v-else>没找到这个关键词，换个更短的词试试。</p>
          </div>
        </div>

        <div class="home-keywords" aria-label="常用搜索">
          <span>常看：</span>
          <button v-for="keyword in ['HashMap','线程池','GC','分布式锁']" :key="keyword" @click="chooseKeyword(keyword)">{{keyword}}</button>
        </div>
        <div class="home-actions">
          <RouterLink class="primary" to="/knowledge/java-basic/string-immutable">从 Java 基础开始 <span>→</span></RouterLink>
          <RouterLink to="/practice"><span aria-hidden="true">↻</span> 随机刷一题</RouterLink>
        </div>
        <div class="home-stats" aria-label="内容数量"><span><b>{{articles.length}}</b> 篇知识</span><span><b>100</b> 道题</span><span><b>{{categories.length}}</b> 个方向</span></div>
      </div>

      <figure class="home-preview">
        <img src="/images/knowledge-workbench.jpg" width="1200" height="800" alt="知识文章真实阅读界面预览" fetchpriority="high">
        <figcaption><span>内容预览</span><b>结论、原理和实战放在同一条阅读线上</b></figcaption>
      </figure>
    </section>

    <section class="home-section home-catalog" aria-labelledby="catalog-title">
      <header class="home-section-head"><div><small>KNOWLEDGE MAP</small><h2 id="catalog-title">按方向找知识</h2></div><p>每个方向 10 篇，从常问问题开始看。</p></header>
      <nav class="home-category-grid" aria-label="知识分类">
        <RouterLink v-for="(category,index) in categories" :key="category.slug" :to="category.path">
          <i>{{String(index+1).padStart(2,'0')}}</i><span><b>{{category.name}}</b><small>{{category.note}}</small></span><em>{{category.count}}</em>
        </RouterLink>
      </nav>
    </section>

    <section class="home-section home-lower" aria-labelledby="featured-title">
      <div class="home-featured">
        <header class="home-section-head"><div><small>HIGH FREQUENCY</small><h2 id="featured-title">最近常考</h2></div><RouterLink to="/knowledge/java-basic/string-immutable">进入知识库 →</RouterLink></header>
        <div class="home-article-list">
          <RouterLink v-for="(article,index) in featured" :key="article.slug" :to="articlePath(article)">
            <i>{{String(index+1).padStart(2,'0')}}</i>
            <span><small>{{article.category}} · {{article.level}}</small><b>{{article.title}}</b><p>{{article.description}}</p></span>
            <em>{{article.minutes}} min</em>
          </RouterLink>
        </div>
      </div>

      <aside class="home-practice">
        <header><small>QUICK PRACTICE</small><span>约 1 分钟 / 题</span></header>
        <h2>换一种方式检验<br>自己是不是真懂了</h2>
        <div class="home-question-sample">
          <span>随机一问</span>
          <p>为什么线程池不建议直接用 Executors 创建？</p>
        </div>
        <p>先自己说一遍，再展开参考回答和追问。回答都按自然口语整理，不用背模板。</p>
        <RouterLink to="/practice"><span aria-hidden="true">↻</span> 开始随机刷题</RouterLink>
      </aside>
    </section>
  </main>
</template>
