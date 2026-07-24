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
  if(source.match(/^##\s+(.+)$/m)?.[1]!=='先说结论')errors.push(`${file}: 第一节必须先简短总结`)
  if(Buffer.byteLength(source)<1500)errors.push(`${file}: 正文过短，无法完整回答主题问题`)
  if(/<!-- depth-standard:(?:start|end) -->/.test(source))errors.push(`${file}: 仍包含统一深化模板`)
  if(/^##\s+(?:面试考察点|面试要点|核心考点清单|总结|小结)$/m.test(source))errors.push(`${file}: 仍包含重复的模板章节`)
  const diagrams=[...source.matchAll(/```mermaid\n([\s\S]*?)```/g)]
  for(const diagram of diagrams){
    const nodes=new Set([...diagram[1].matchAll(/\b([A-Za-z][\w]*)\s*(?:\[\(|\["|\{"|\(")/g)].map(match=>match[1]))
    if(nodes.size<4)errors.push(`${file}: Mermaid 图解节点少于 4 个`)
  }
  for(const field of['prerequisites','related','next']){
    const raw=front.match(new RegExp(`^${field}:\\s*\\[([^\\]]*)]`,'m'))?.[1]
    if(!raw)continue
    for(const reference of raw.split(',').map(item=>item.trim().replace(/^['"]|['"]$/g,'')).filter(Boolean))if(!knownArticles.has(reference))errors.push(`${file}: ${field} 引用了不存在的文章 ${reference}`)
  }
}

if(errors.length){console.error(`\n内容规范检查失败（${errors.length} 项）：\n${errors.map(x=>`- ${x}`).join('\n')}\n`);process.exit(1)}
console.log(`内容规范检查通过：所有文章均有简短开场、主题解答和完整元数据，图示按需使用。`)
