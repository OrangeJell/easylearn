import{expect,test}from'@playwright/test'

type QuestionSummary={id:string;sourceRef:string;prompt:string;type:string;durationMinutes:number}
type QuestionIndex={version:string;questions:QuestionSummary[]}
type QuestionDetail={durationMinutes:number;shortAnswer:string;answer:string[];keyPoints:string[];followUps:Array<{durationMinutes:number;answer:string[]}>}

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
  expect(payload.questions.every(question=>question.durationMinutes===1)).toBeTruthy()
  expect(payload.questions.some(question=>question.prompt.includes('Elasticsearch 用在什么场景'))).toBeTruthy()
  expect(payload.questions.some(question=>question.prompt.includes('第三方服务')&&question.prompt.includes('大面积超时'))).toBeTruthy()

  const es=payload.questions.find(question=>question.sourceRef==='elasticsearch/inverted-index')!
  const detailResponse=await request.get(`/practice/questions/${es.id}.json`)
  expect(detailResponse.ok()).toBeTruthy()
  const detail=await detailResponse.json() as QuestionDetail
  expect(detail.shortAnswer.length).toBeGreaterThan(40)
  expect(detail.shortAnswer.length).toBeLessThanOrEqual(140)
  expect(detail.answer.length).toBeGreaterThanOrEqual(1)
  expect(detail.answer.length).toBeLessThanOrEqual(4)
  expect(detail.answer.join('').length).toBeLessThanOrEqual(320)
  expect(detail.followUps.length).toBeLessThanOrEqual(4)
  expect(detail.followUps.every(followUp=>followUp.durationMinutes===1&&followUp.answer.length>0)).toBeTruthy()
})

test('精简回答示例控制在一分钟内',async({request,page})=>{
  const response=await request.get('/practice/questions/article-java-basic-string-immutable.json')
  expect(response.ok()).toBeTruthy()
  const detail=await response.json() as{durationMinutes:number;prompt:string;shortAnswer:string;answer:string[];followUps:unknown[]}
  expect(detail.durationMinutes).toBe(1)
  expect(detail.prompt).toBe('为什么 String 要设计成不可变？在项目里有什么用？')
  expect(detail.answer).toHaveLength(4)
  expect(detail.answer.join('').length).toBeLessThan(260)
  expect(detail.followUps).toHaveLength(2)

  await page.goto('/practice/article-java-basic-string-immutable')
  const root=page.locator('.question-node.depth-0')
  await expect(root.locator('.question-meta')).toContainText('约 1 分钟')
  await root.locator(':scope > .question-actions .reveal-answer').click()
  await expect(root.locator(':scope > .question-reveal-content .answer-paragraph')).toHaveCount(4)
  await expect(root.locator(':scope > .question-reveal-content .answer-copy')).not.toHaveClass(/long/)
})

test('答案先给结论，再按内容自然分段并展示随机追问',async({page})=>{
  const root=page.locator('.question-node.depth-0')
  await expect(root.locator(':scope > .question-reveal-content')).toHaveCount(0)
  await root.locator(':scope > .question-actions .reveal-answer').click()
  await expect(root.locator(':scope > .question-reveal-content .answer-heading')).toContainText('约 1 分钟')
  await expect(root.locator(':scope > .question-reveal-content .quick-answer')).toBeVisible()
  const paragraphs=root.locator(':scope > .question-reveal-content .answer-paragraph')
  await expect.poll(()=>paragraphs.count()).toBeGreaterThanOrEqual(1)
  expect(await paragraphs.count()).toBeLessThanOrEqual(4)

  const followUps=root.locator(':scope > .question-reveal-content > .follow-up-list > .question-node')
  await expect.poll(()=>followUps.count()).toBeGreaterThanOrEqual(1)
  expect(await followUps.count()).toBeLessThanOrEqual(2)
  const followUp=followUps.nth(0)
  await followUp.locator(':scope > .question-actions .reveal-answer').click()
  await expect(followUp.locator(':scope > .question-reveal-content .spoken-answer')).toBeVisible()
})

test('深色模式文字清晰且顶部导航不遮挡内容',async({page},testInfo)=>{
  await page.getByRole('button',{name:'切换主题'}).click()
  const root=page.locator('.question-node.depth-0')
  await root.locator(':scope > .question-actions .reveal-answer').click()
  await expect(root.locator('.quick-answer')).toBeVisible()

  const state=await page.evaluate(()=>{
    const shell=document.querySelector('#app > div') as HTMLElement
    const title=document.querySelector('.question-head h1') as HTMLElement
    const answer=document.querySelector('.spoken-answer') as HTMLElement
    const action=document.querySelector('.random-question') as HTMLElement
    const header=document.querySelector('.top') as HTMLElement
    const mobileNav=document.querySelector('.mobile-route-nav') as HTMLElement
    const box=(element:HTMLElement)=>element.getBoundingClientRect()
    const navVisible=getComputedStyle(mobileNav).display!=='none'
    return{
      dark:shell.classList.contains('dark'),
      themeText:getComputedStyle(shell).color,
      titleColor:getComputedStyle(title).color,
      answerColor:getComputedStyle(answer).color,
      actionBackground:getComputedStyle(action).backgroundColor,
      horizontalOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      headerNavOverlap:navVisible&&box(header).bottom>box(mobileNav).top+1
    }
  })
  expect(state.dark).toBeTruthy()
  expect(state.titleColor).toBe(state.themeText)
  expect(state.answerColor).toBe(state.themeText)
  expect(state.actionBackground).not.toBe('rgb(238, 241, 238)')
  expect(state.horizontalOverflow).toBeLessThanOrEqual(0)
  if(testInfo.project.name==='mobile')expect(state.headerNavOverlap).toBeFalsy()
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
