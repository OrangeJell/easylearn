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
  prerequisites:string[]
  related:string[]
  next:string[]
}

export type SearchEntry={path:string;title:string;description:string;category:string;body:string}

export const articles=articleManifest as Article[]
export const categories=[...new Map(articles.map(article=>[article.category,{name:article.category,order:article.categoryOrder}])).values()].sort((a,b)=>a.order-b.order).map(item=>item.name)
export const articlePath=(article:Article)=>`/knowledge/${article.categorySlug}/${article.slug}`
export const articleByRef=(reference:string)=>articles.find(article=>`${article.categorySlug}/${article.slug}`===reference)

const markdownLoaders=import.meta.glob('./content/**/*.md',{query:'?raw',import:'default'}) as Record<string,()=>Promise<string>>
const sourceCache=new Map<string,string>()

export async function loadArticleSource(article:Article){
  const cached=sourceCache.get(article.file)
  if(cached)return cached
  const loader=markdownLoaders[`./content/${article.file}.md`]
  if(!loader)throw new Error(`找不到文章正文: ${article.file}`)
  const raw=await loader()
  const source=raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n/,'')
  sourceCache.set(article.file,source)
  return source
}

export function prefetchArticle(article?:Article){if(article&&!sourceCache.has(article.file))void loadArticleSource(article)}
