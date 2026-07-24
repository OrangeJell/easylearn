import{existsSync,readdirSync,readFileSync,statSync}from'node:fs'
import{join,resolve}from'node:path'
import{fileURLToPath}from'node:url'

const project=resolve(fileURLToPath(new URL('..',import.meta.url)))
const dist=join(project,'dist')
function requireFile(path){if(!existsSync(path)||!statSync(path).isFile())throw new Error(`缺少部署文件: ${path.replace(`${project}/`,'')}`)}
function filesIn(path){return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesIn(join(path,entry.name)):[join(path,entry.name)])}

for(const file of['index.html','404.html','robots.txt','sitemap.xml','_headers','_redirects','googleb6aedc3c677b66bd.html','images/knowledge-workbench.jpg','practice/index.html','practice/index.json'])requireFile(join(dist,file))
const practiceIndex=JSON.parse(readFileSync(join(dist,'practice/index.json'),'utf8'))
const detailFiles=filesIn(join(dist,'practice/questions')).filter(file=>file.endsWith('.json'))
const routeFiles=filesIn(join(dist,'practice')).filter(file=>file.endsWith('/index.html')&&file!==join(dist,'practice/index.html'))
const articleContentFiles=filesIn(join(dist,'articles')).filter(file=>file.endsWith('.html'))
if(practiceIndex.questions.length!==100)throw new Error(`题库索引数量异常: ${practiceIndex.questions.length}`)
if(detailFiles.length!==100)throw new Error(`题目详情文件数量异常: ${detailFiles.length}`)
if(routeFiles.length!==100)throw new Error(`题目静态路由数量异常: ${routeFiles.length}`)
if(articleContentFiles.length!==100)throw new Error(`文章正文文件数量异常: ${articleContentFiles.length}`)

const sitemap=readFileSync(join(dist,'sitemap.xml'),'utf8')
const sitemapUrls=(sitemap.match(/<url>/g)||[]).length
if(sitemapUrls!==202)throw new Error(`站点地图地址数量异常: ${sitemapUrls}`)
if(/undefined|null<\/loc>/.test(sitemap))throw new Error('站点地图包含无效地址')
const redirects=readFileSync(join(dist,'_redirects'),'utf8').split('\n').filter(line=>line&&!line.startsWith('#'))
if(redirects.length!==201)throw new Error(`精确路由重写数量异常: ${redirects.length}`)
if(redirects.some(line=>line.split(/\s+/)[0].includes('*')))throw new Error('路由配置不能使用可能拦截 JSON 的通配重写')
const home=readFileSync(join(dist,'index.html'),'utf8')
if(!home.includes('rel="canonical"')||!home.includes('application/ld+json'))throw new Error('首页缺少 canonical 或结构化数据')
if(!home.includes('Java 面试知识库')||!home.includes('class="home-category-grid"')||!home.includes('class="home-article-list"'))throw new Error('首页缺少知识分类或高频文章首屏内容')
const applicationScripts=filesIn(join(dist,'assets')).filter(file=>file.endsWith('.js')).map(file=>readFileSync(file,'utf8')).join('\n')
if(!applicationScripts.includes('static.cloudflareinsights.com/beacon.min.js')||!applicationScripts.includes('3c66ba2c14a94429851a2b5fc0db3e2f'))throw new Error('生产脚本缺少 Cloudflare Web Analytics')
if(home.includes('static.cloudflareinsights.com/beacon.min.js'))throw new Error('Cloudflare Web Analytics 不应阻塞首页加载')
const hostedBuild=process.env.CF_PAGES==='1'||process.env.VERCEL==='1'||process.env.NETLIFY==='true'
if(hostedBuild&&[sitemap,home,readFileSync(join(dist,'robots.txt'),'utf8')].some(content=>content.includes('localhost')))throw new Error('线上 SEO 产物仍包含 localhost')
const emittedSourceFiles=filesIn(join(project,'src')).filter(file=>file.endsWith('.vue.js')||/(^|\/)src\/(main|catalog)\.js$/.test(file)||file.endsWith('/data/practice.js'))
if(emittedSourceFiles.length)throw new Error(`源码目录仍包含编译副本: ${emittedSourceFiles.join(', ')}`)
console.log(`部署检查通过：100 道题均有独立静态路由，sitemap ${sitemapUrls} 个地址，精确重写 ${redirects.length} 条。`)
