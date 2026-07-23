import{expect,test}from'@playwright/test'

type QuestionSummary={id:string;sourceRef:string;prompt:string;type:string}
type QuestionIndex={version:string;questions:QuestionSummary[]}

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{Math.random=()=>0})
  await page.goto('/practice')
})

test('题库包含一百道题且页面不展示题号和总数',async({page})=>{
  await expect(page.locator('.practice-page')).toHaveAttribute('data-question-bank-size','100')
  await expect(page.locator('.question-counter,.question-dots')).toHaveCount(0)
})

test('题库使用轻量索引和独立详情文件',async({request})=>{
  const response=await request.get('/practice/index.json')
  expect(response.ok()).toBeTruthy()
  const payload=await response.json() as QuestionIndex
  expect(payload.questions).toHaveLength(100)
  expect(payload.questions.some(question=>question.prompt.includes('Elasticsearch 用在什么场景'))).toBeTruthy()
  expect(payload.questions.some(question=>question.prompt.includes('第三方服务')&&question.prompt.includes('大面积超时'))).toBeTruthy()

  const es=payload.questions.find(question=>question.sourceRef==='elasticsearch/inverted-index')!
  const detailResponse=await request.get(`/practice/questions/${es.id}.json`)
  expect(detailResponse.ok()).toBeTruthy()
  const detail=await detailResponse.json() as{shortAnswer:string;answer:string[];followUps:unknown[]}
  expect(detail.shortAnswer.length).toBeGreaterThan(40)
  expect(detail.answer).toHaveLength(5)
  expect(detail.followUps.length).toBeGreaterThanOrEqual(2)
})

test('答案先给结论，再展示三分钟正文和随机追问',async({page})=>{
  const root=page.locator('.question-node.depth-0')
  await expect(root.locator(':scope > .question-reveal-content')).toHaveCount(0)
  await root.locator(':scope > .question-actions .reveal-answer').click()
  await expect(root.locator(':scope > .question-reveal-content .answer-heading')).toContainText('约 3 分钟')
  await expect(root.locator(':scope > .question-reveal-content .quick-answer')).toBeVisible()
  await expect(root.locator(':scope > .question-reveal-content .answer-paragraph')).toHaveCount(5)

  const followUps=root.locator(':scope > .question-reveal-content > .follow-up-list > .question-node')
  await expect.poll(()=>followUps.count()).toBeGreaterThanOrEqual(1)
  expect(await followUps.count()).toBeLessThanOrEqual(2)
  const followUp=followUps.nth(0)
  await followUp.locator(':scope > .question-actions .reveal-answer').click()
  await expect(followUp.locator(':scope > .question-reveal-content .spoken-answer')).toBeVisible()
})

test('随机题袋连续换题不会立即重复且答案重置',async({page})=>{
  const seen=new Set<string>()
  for(let index=0;index<4;index++){
    const current=page.locator('.question-node.depth-0')
    const id=await current.getAttribute('data-question-id')
    expect(id).toBeTruthy();expect(seen.has(id!)).toBeFalsy();seen.add(id!)
    if(index===0)await current.locator(':scope > .question-actions .reveal-answer').click()
    await page.getByRole('button',{name:'随机换一题'}).click()
    await expect(page.locator('.question-node.depth-0')).not.toHaveAttribute('data-question-id',id!)
    await expect(page.locator('.question-node.depth-0 > .question-reveal-content')).toHaveCount(0)
  }
})

test('单题地址可分享并在刷新后保持',async({page,request})=>{
  const payload=await(await request.get('/practice/index.json')).json() as QuestionIndex
  const target=payload.questions.find(question=>question.sourceRef==='elasticsearch/inverted-index')!
  await page.goto(`/practice/${target.id}`)
  await expect(page.getByRole('heading',{name:target.prompt})).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/practice/${target.id}$`))
  await page.reload()
  await expect(page.getByRole('heading',{name:target.prompt})).toBeVisible()
})

test('系统设计题展示方案主链路',async({page,request})=>{
  const payload=await(await request.get('/practice/index.json')).json() as QuestionIndex
  const target=payload.questions.find(question=>question.sourceRef==='architecture/flash-sale-system-design')!
  await page.goto(`/practice/${target.id}`)
  const root=page.locator('.question-node.depth-0')
  await root.locator(':scope > .question-actions .reveal-answer').click()
  await expect(root.locator('.question-diagram.flow')).toBeVisible()
  await expect(root.locator('.question-diagram .diagram-node')).toHaveCount(5)
})

test('关联知识跳转整篇文章',async({page})=>{
  const root=page.locator('.question-node.depth-0')
  await root.locator(':scope > .question-actions .reveal-answer').click()
  const links=root.locator(':scope > .question-reveal-content .question-related a')
  await expect.poll(()=>links.count()).toBeGreaterThan(0)
  expect(await links.nth(0).getAttribute('href')).toMatch(/^\/knowledge\//)
})
