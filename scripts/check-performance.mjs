import{readdirSync,readFileSync,statSync}from'node:fs'
import{join,resolve}from'node:path'
import{fileURLToPath}from'node:url'
import{gzipSync}from'node:zlib'

const project=resolve(fileURLToPath(new URL('..',import.meta.url)))
const assetsRoot=join(project,'dist/assets')
const scripts=readdirSync(assetsRoot).filter(file=>file.endsWith('.js'))
const find=prefix=>scripts.find(file=>file.startsWith(prefix))
const files={main:find('index-'),home:find('HomeView-'),knowledge:find('KnowledgeView-'),practice:find('PracticeView-')}
for(const[name,file]of Object.entries(files))if(!file)throw new Error(`缺少 ${name} 页面脚本`)

const sizes=Object.fromEntries(Object.entries(files).map(([name,file])=>{
  const path=join(assetsRoot,file),raw=statSync(path).size,gzip=gzipSync(readFileSync(path)).length
  return[name,{file,raw,gzip}]
}))
const limits={main:120_000,home:45_000,knowledge:110_000,practice:35_000}
for(const[name,limit]of Object.entries(limits))if(sizes[name].raw>limit)throw new Error(`${name} 首屏脚本超出预算: ${sizes[name].raw} > ${limit}`)
if(scripts.length>4)throw new Error(`客户端脚本块异常增多: ${scripts.length}`)

console.log(`性能预算通过：主包 ${sizes.main.raw} bytes（gzip ${sizes.main.gzip}），首页 ${sizes.home.raw} bytes（gzip ${sizes.home.gzip}），知识库 ${sizes.knowledge.raw} bytes（gzip ${sizes.knowledge.gzip}），刷题 ${sizes.practice.raw} bytes（gzip ${sizes.practice.gzip}）。`)
