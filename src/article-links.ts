import articleLinksJson from'./generated/article-links.json'

export type ArticleLink={categorySlug:string;slug:string;title:string;file:string}
const articleLinks=articleLinksJson as ArticleLink[]

export const articlePath=(article:ArticleLink)=>`/knowledge/${article.categorySlug}/${article.slug}`
export const articleByRef=(reference:string)=>articleLinks.find(article=>`${article.categorySlug}/${article.slug}`===reference)
