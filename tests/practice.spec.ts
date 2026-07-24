import{expect,test}from'@playwright/test'

type QuestionSummary={id:string;sourceRef:string;prompt:string;type:string;durationMinutes:number}
type QuestionIndex={version:string;questions:QuestionSummary[]}
type QuestionDetail={durationMinutes:number;shortAnswer:string;answerHtml:string;keyPoints:string[];followUps:Array<{durationMinutes:number;answer:string[]}>}

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{Math.random=()=>0})
  await page.goto('/practice',{waitUntil:'domcontentloaded'})
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
  expect(payload.questions.every(question=>question.durationMinutes>=1&&question.durationMinutes<=2)).toBeTruthy()
  expect(payload.questions.some(question=>question.durationMinutes===1)).toBeTruthy()
  expect(payload.questions.some(question=>question.durationMinutes===2)).toBeTruthy()
  expect(payload.questions.every(question=>!('answerHtml'in question))).toBeTruthy()
  expect(payload.questions.some(question=>question.prompt.includes('Elasticsearch 用在什么场景'))).toBeTruthy()
  expect(payload.questions.some(question=>question.prompt.includes('第三方服务')&&question.prompt.includes('大面积超时'))).toBeTruthy()

  const es=payload.questions.find(question=>question.sourceRef==='elasticsearch/inverted-index')!
  const detailResponse=await request.get(`/practice/questions/${es.id}.json`)
  expect(detailResponse.ok()).toBeTruthy()
  const detail=await detailResponse.json() as QuestionDetail
  expect(detail.shortAnswer.length).toBeGreaterThan(40)
  expect(detail.shortAnswer.length).toBeLessThanOrEqual(140)
  expect(detail.answerHtml.length).toBeGreaterThan(300)
  expect(detail.answerHtml).toContain('<p>')
  expect(detail.followUps.length).toBeLessThanOrEqual(4)
  expect(detail.followUps.every(followUp=>followUp.durationMinutes===1&&followUp.answer.length>0)).toBeTruthy()
})

test('十个领域都提供独立维护的场景化回答',async({request})=>{
  const payload=await(await request.get('/practice/index.json')).json() as QuestionIndex
  const domains=['java-basic','collections','concurrency','jvm','mysql','redis','clickhouse','kafka','elasticsearch','architecture']
  const samples=domains.map(domain=>payload.questions.find(question=>question.sourceRef.startsWith(`${domain}/`))!)
  const details=await Promise.all(samples.map(async sample=>await(await request.get(`/practice/questions/${sample.id}.json`)).json() as QuestionDetail))
  expect(details.every(detail=>detail.answerHtml.length>300&&detail.shortAnswer.length>=28)).toBeTruthy()
  expect(new Set(details.map(detail=>detail.answerHtml.replace(/<[^>]+>/g,'').slice(0,80))).size).toBe(domains.length)
})

test('每道题使用独立富文本回答并保留自然口述',async({request,page})=>{
  const response=await request.get('/practice/questions/article-java-basic-string-immutable.json')
  expect(response.ok()).toBeTruthy()
  const detail=await response.json() as{durationMinutes:number;prompt:string;shortAnswer:string;answerHtml:string;followUps:unknown[]}
  expect(detail.durationMinutes).toBeGreaterThanOrEqual(1)
  expect(detail.durationMinutes).toBeLessThanOrEqual(2)
  expect(detail.prompt).toContain('为什么 String 设计成不可变')
  expect(detail.answerHtml).toContain('String 作为值传来传去时不会被别人悄悄改掉')
  expect(detail.answerHtml).toContain('<code>HashMap</code>')
  expect(detail.followUps).toHaveLength(2)

  await page.goto('/practice/article-java-basic-string-immutable')
  const root=page.locator('.question-node.depth-0')
  await expect(root.locator('.question-meta')).toContainText(`约 ${detail.durationMinutes} 分钟`)
  await root.locator(':scope > .question-actions .reveal-answer').click()
  await expect(root.locator(':scope > .question-reveal-content .answer-rich')).toBeVisible()
  await expect(root.locator(':scope > .question-reveal-content .answer-paragraph')).toHaveCount(0)
})

test('订单索引题使用场景化方案并可展开分析与误区',async({request,page})=>{
  const response=await request.get('/practice/questions/article-mysql-btree-index.json')
  expect(response.ok()).toBeTruthy()
  const detail=await response.json() as{answerHtml:string;problemAnalysisHtml:string;pitfallsHtml:string}
  expect(detail.answerHtml).toContain('idx_orders_tenant_user_time')
  expect(detail.answerHtml).toContain('游标')
  expect(detail.answerHtml).toContain('<strong>')
  expect(detail.answerHtml).toContain('<pre><code class="language-sql">')
  expect(detail.problemAnalysisHtml).toContain('<code>status</code>')
  expect(detail.pitfallsHtml).toContain('<li><strong>')

  await page.goto('/practice/article-mysql-btree-index')
  const root=page.locator('.question-node.depth-0')
  await root.locator(':scope > .question-actions .reveal-answer').click()
  const analysis=root.getByText('问题分析',{exact:true})
  const pitfalls=root.getByText('踩坑误区',{exact:true})
  await expect(root.locator('.answer-rich strong')).toHaveCount(2)
  await expect(root.getByText('千万级只是现象，访问路径才决定这个接口快不快。',{exact:true})).toBeVisible()
  await expect(root.locator('.answer-rich pre')).toHaveCount(2)
  await expect(root.locator('.answer-rich li')).toHaveCount(0)
  await expect(analysis).toBeVisible()
  await expect(pitfalls).toBeVisible()
  await expect(root.getByText('“上千万行”只是背景，不是根因。',{exact:false})).not.toBeVisible()
  await analysis.click()
  await expect(root.getByText('“上千万行”只是背景，不是根因。',{exact:false})).toBeVisible()
  await expect(root.locator('.analysis-extension code')).toHaveCount(7)
  await pitfalls.click()
  await expect(root.getByText('看到千万级就分库分表。',{exact:false})).toBeVisible()
  await expect(root.locator('.pitfalls-extension li')).toHaveCount(4)
})

test('答案先给判断，再按内容自然分段并完整展示人工追问树',async({page,request})=>{
  const root=page.locator('.question-node.depth-0')
  await expect(root.locator(':scope > .question-reveal-content')).toHaveCount(0)
  const questionId=await root.getAttribute('data-question-id')
  const detail=await(await request.get(`/practice/questions/${questionId}.json`)).json() as QuestionDetail
  await root.locator(':scope > .question-actions .reveal-answer').click()
  await expect(root.locator(':scope > .question-reveal-content .answer-heading')).toContainText('口语表达')
  await expect(root.locator(':scope > .question-reveal-content .quick-answer')).toContainText('我的判断')
  await expect(root.locator(':scope > .question-reveal-content .answer-rich')).toBeVisible()

  const followUps=root.locator(':scope > .question-reveal-content > .follow-up-list > .question-node')
  await expect(followUps).toHaveCount(detail.followUps.length)
  const followUp=followUps.nth(0)
  await followUp.locator(':scope > .question-actions .reveal-answer').click()
  await expect(followUp.locator(':scope > .question-reveal-content .answer-rich')).toBeVisible()
})

test('追问回答后可以继续展开下一层追问',async({page})=>{
  await page.goto('/practice/article-mysql-btree-index')
  const root=page.locator('.question-node.depth-0')
  await root.locator(':scope > .question-actions .reveal-answer').click()
  const firstFollowUp=root.locator(':scope > .question-reveal-content > .follow-up-list > .question-node').nth(0)
  await firstFollowUp.locator(':scope > .question-actions .reveal-answer').click()
  const nested=firstFollowUp.locator(':scope > .question-reveal-content > .follow-up-list > .question-node')
  await expect(nested).toHaveCount(1)
  await nested.locator(':scope > .question-actions .reveal-answer').click()
  await expect(nested.locator(':scope > .question-reveal-content .answer-rich')).toBeVisible()
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
