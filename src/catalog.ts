import articleManifest from './generated/articles.json'

export type Article={
  category:string
  categorySlug:string
  categoryOrder:number
  slug:string
  order:number
  title:string
  description:string
  updated:string
  minutes:number
  level:string
  file:string
  contentVersion:string
  headings:string[]
  prerequisites:string[]
  related:string[]
  next:string[]
}

export type SearchEntry={path:string;title:string;description:string;category:string;body:string}

export const articles=articleManifest as Article[]
export const categories=[...new Map(articles.map(article=>[article.category,{name:article.category,order:article.categoryOrder}])).values()].sort((a,b)=>a.order-b.order).map(item=>item.name)
export const articlePath=(article:Article)=>`/knowledge/${article.categorySlug}/${article.slug}`
export const articleByRef=(reference:string)=>articles.find(article=>`${article.categorySlug}/${article.slug}`===reference)

const contentCache=new Map<string,string>()
const contentRequests=new Map<string,Promise<string>>()
const initialContent=window.__INITIAL_ARTICLE_CONTENT__
if(initialContent){contentCache.set(initialContent.reference,initialContent.html);delete window.__INITIAL_ARTICLE_CONTENT__}

export async function loadArticleHtml(article:Article){
  const reference=`${article.categorySlug}/${article.slug}`
  const cached=contentCache.get(reference)
  if(cached)return cached
  const pending=contentRequests.get(reference)
  if(pending)return pending
  const request=fetch(`/articles/${article.categorySlug}/${article.slug}.html?v=${article.contentVersion}`).then(async response=>{
    if(!response.ok)throw new Error(`找不到文章正文: ${article.file}`)
    const html=await response.text();contentCache.set(reference,html);return html
  }).finally(()=>contentRequests.delete(reference))
  contentRequests.set(reference,request)
  return request
}

export function prefetchArticle(article?:Article){if(article&&!contentCache.has(`${article.categorySlug}/${article.slug}`))void loadArticleHtml(article)}
