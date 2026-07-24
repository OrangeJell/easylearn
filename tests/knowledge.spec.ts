import{expect,test}from'@playwright/test'

test('异步加载文章正文并更新 SEO',async({page})=>{
  await page.goto('/knowledge/jvm/production-oom-troubleshooting')
  await expect(page.locator('.article-body')).toContainText('先看一个线上案例')
  await expect(page.locator('.article-body h2').first()).toHaveText('先说结论')
  await expect(page.locator('.learning-map')).toHaveCount(0)
  await expect(page).toHaveTitle(/线上遇到 OOM/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',/\/knowledge\/jvm\/production-oom-troubleshooting$/)
})

test('文章首屏只加载当前正文',async({page})=>{
  const articleRequests:string[]=[]
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/articles/'))articleRequests.push(path)})
  await page.goto('/knowledge/jvm/production-oom-troubleshooting')
  await expect(page.locator('.article-body')).toContainText('先看一个线上案例')
  await page.waitForTimeout(350)
  expect(articleRequests).toEqual(['/articles/jvm/production-oom-troubleshooting.html'])
})

test('全文搜索支持正文命中和关键词高亮',async({page})=>{
  await page.goto('/knowledge/mysql/transactions-mvcc')
  await page.keyboard.press('/')
  const search=page.getByPlaceholder('搜索标题、描述和正文')
  await expect(search).toBeFocused()
  await search.fill('Read View')
  const result=page.locator('.search-result').filter({hasText:'MVCC'})
  await expect(result).toHaveCount(1)
  await expect(result.locator('mark').first()).toHaveText('Read View')
})

test('目录和相关推荐切换文章后回到顶部',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop','桌面目录回归')
  await page.goto('/knowledge/java-basic/generics')
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
  await page.locator('.related-grid button').first().click()
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeLessThan(10)
  await page.evaluate(()=>window.scrollTo(0,900))
  await page.locator('.catalog .topic').filter({hasText:'String 为什么被 final 修饰且不可变？'}).click()
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeLessThan(10)
})

test('右侧大纲可定位章节',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop','桌面大纲回归')
  await page.goto('/knowledge/redis/distributed-lock')
  await expect(page.locator('.outline a')).toHaveCount(7)
  const target=page.locator('.outline a').nth(1)
  const href=await target.getAttribute('href')
  await target.click()
  await expect(page).toHaveURL(new RegExp(`${href}$`))
  await expect.poll(()=>page.locator(href!).evaluate(element=>element.getBoundingClientRect().top)).toBeLessThan(100)
})

test('文章图解可以渲染为流程节点',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop','桌面图解回归')
  await page.goto('/knowledge/architecture/flash-sale-system-design')
  await expect(page.locator('.article-body .flow-diagram')).toBeVisible()
  await expect(page.locator('.article-body .flow-node')).toHaveCount(11)
  await expect(page.locator('.article-body .flow-relations')).toBeVisible()
  await expect(page.locator('.article-body .flow-relations')).toContainText('库存不足')
})

test('手机端文章要点正常打开',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='mobile','仅在手机项目验证')
  await page.goto('/knowledge/kafka/message-loss-prevention')
  await page.getByRole('button',{name:'§ 文章要点'}).click()
  await expect(page.locator('.mobile-outline-sheet')).toHaveClass(/open/)
  await expect(page.locator('.mobile-outline-sheet a')).toHaveCount(7)
})

test('深色模式下文章、目录和手机弹层保持清晰',async({page},testInfo)=>{
  await page.goto('/knowledge/jvm/production-oom-troubleshooting')
  await page.getByRole('button',{name:'切换主题'}).click()
  await expect(page.locator('.article-body')).toContainText('先看一个线上案例')

  const state=await page.evaluate(()=>{
    const shell=document.querySelector('#app > div') as HTMLElement
    const title=document.querySelector('.article h1') as HTMLElement
    const paragraph=document.querySelector('.article-body p') as HTMLElement
    const catalog=document.querySelector('.catalog') as HTMLElement
    return{
      dark:shell.classList.contains('dark'),
      themeText:getComputedStyle(shell).color,
      titleColor:getComputedStyle(title).color,
      paragraphColor:getComputedStyle(paragraph).color,
      catalogBackground:getComputedStyle(catalog).backgroundColor,
      horizontalOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
    }
  })
  expect(state.dark).toBeTruthy()
  expect(state.titleColor).toBe(state.themeText)
  expect(state.paragraphColor).not.toBe('rgb(32, 36, 34)')
  expect(state.catalogBackground).not.toBe('rgba(255, 255, 255, 0.72)')
  expect(state.horizontalOverflow).toBeLessThanOrEqual(0)

  if(testInfo.project.name==='mobile'){
    await page.getByRole('button',{name:'☰ 知识目录'}).click()
    await expect(page.locator('.catalog.mobileOpen')).toBeVisible()
    await expect(page.locator('.catalog-mask')).toBeVisible()
    await page.getByRole('button',{name:'关闭知识目录'}).click()
    await page.getByRole('button',{name:'§ 文章要点'}).click()
    await expect(page.locator('.mobile-outline-sheet')).toHaveClass(/open/)
    const layers=await page.evaluate(()=>({
      sheet:Number(getComputedStyle(document.querySelector('.mobile-outline-sheet')!).zIndex),
      mask:Number(getComputedStyle(document.querySelector('.catalog-mask')!).zIndex)
    }))
    expect(layers.sheet).toBeGreaterThan(layers.mask)
  }
})
