import{readdirSync,readFileSync}from'node:fs'

const root=new URL('../src/content/',import.meta.url)
const files=readdirSync(root,{withFileTypes:true}).flatMap(category=>category.isDirectory()?readdirSync(new URL(`${category.name}/`,root)).filter(name=>name.endsWith('.md')).map(name=>`${category.name}/${name}`):[])
const requiredMeta=['title','category','categorySlug','categoryOrder','order','description','updated','minutes','level']
const errors=[]
const knownArticles=new Set(files.map(file=>file.replace(/\.md$/,'')))

for(const file of files){
  const source=readFileSync(new URL(file,root),'utf8')
  const front=source.match(/^---\n([\s\S]*?)\n---/i)?.[1]||''
  for(const key of requiredMeta)if(!new RegExp(`^${key}:\\s*.+$`,'m').test(front))errors.push(`${file}: 缺少 Front Matter ${key}`)
  if(!/^#\s+.+/m.test(source))errors.push(`${file}: 缺少文章主标题`)
  if(!/^##\s+(?:核心考点|面试考察点|面试要点)/m.test(source))errors.push(`${file}: 缺少核心考点`)
  if(!/^##\s+.*追问/m.test(source))errors.push(`${file}: 缺少高频追问`)
  if(Buffer.byteLength(source)<9000)errors.push(`${file}: 正文少于 9000 bytes，未达到深度文章标准`)
  if((source.match(/^##\s+/gm)||[]).length<10)errors.push(`${file}: 二级章节少于 10 个，内容结构过于简单`)
  const diagrams=[...source.matchAll(/```mermaid\n([\s\S]*?)```/g)]
  if(!diagrams.length)errors.push(`${file}: 缺少 Mermaid 机制图解`)
  for(const diagram of diagrams){
    const nodes=new Set([...diagram[1].matchAll(/\b([A-Za-z][\w]*)\s*(?:\[\(|\["|\{"|\(")/g)].map(match=>match[1]))
    if(nodes.size<4)errors.push(`${file}: Mermaid 图解节点少于 4 个`)
  }
  const withoutDiagrams=source.replace(/```mermaid[\s\S]*?```/g,'')
  if(!/^```\w*/m.test(withoutDiagrams)&&!/^\|.+\|$/m.test(source))errors.push(`${file}: 缺少代码示例或方案对比表`)
  const startMarkers=(source.match(/depth-standard:start/g)||[]).length,endMarkers=(source.match(/depth-standard:end/g)||[]).length
  if(startMarkers!==endMarkers||startMarkers>1)errors.push(`${file}: 深度内容标记不完整或重复`)
  for(const field of['prerequisites','related','next']){
    const raw=front.match(new RegExp(`^${field}:\\s*\\[([^\\]]*)]`,'m'))?.[1]
    if(!raw)continue
    for(const reference of raw.split(',').map(item=>item.trim().replace(/^['"]|['"]$/g,'')).filter(Boolean))if(!knownArticles.has(reference))errors.push(`${file}: ${field} 引用了不存在的文章 ${reference}`)
  }
}

if(errors.length){console.error(`\n内容规范检查失败（${errors.length} 项）：\n${errors.map(x=>`- ${x}`).join('\n')}\n`);process.exit(1)}
console.log(`内容规范检查通过：所有文章均包含元数据、深度章节、机制图解、实战证据和高频追问。`)
