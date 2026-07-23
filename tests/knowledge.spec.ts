import{expect,test}from'@playwright/test'

test('异步加载文章正文并更新 SEO',async({page})=>{
  await page.goto('/knowledge/jvm/production-oom-troubleshooting')
  await expect(page.locator('.article-body')).toContainText('一个可用于面试的线上案例')
  await expect(page).toHaveTitle(/线上遇到 OOM/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',/\/knowledge\/jvm\/production-oom-troubleshooting$/)
})

test('全文搜索支持正文命中和关键词高亮',async({page})=>{
  await page.goto('/knowledge/mysql/transactions-mvcc')
  await page.keyboard.press('/')
  const search=page.getByPlaceholder('搜索标题、描述和正文')
  await expect(search).toBeFocused()
  await search.fill('Purge')
  const result=page.locator('.search-result').filter({hasText:'MVCC'})
  await expect(result).toHaveCount(1)
  await expect(result.locator('mark')).toHaveText('Purge')
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
  await page.locator('.outline a[href="#section-2"]').click()
  await expect(page).toHaveURL(/#section-2$/)
  await expect.poll(()=>page.locator('#section-2').evaluate(element=>element.getBoundingClientRect().top)).toBeLessThan(100)
})

test('文章图解可以渲染为流程节点',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop','桌面图解回归')
  await page.goto('/knowledge/architecture/flash-sale-system-design')
  await expect(page.locator('.article-body .flow-diagram')).toBeVisible()
  await expect(page.locator('.article-body .flow-node')).toHaveCount(11)
  await expect(page.locator('.article-body .flow-relations')).toBeVisible()
  await expect(page.locator('.article-body .flow-relations')).toContainText('库存不足')
})

test('手机端本页目录正常打开',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='mobile','仅在手机项目验证')
  await page.goto('/knowledge/kafka/message-loss-prevention')
  await page.getByRole('button',{name:'§ 本页目录'}).click()
  await expect(page.locator('.mobile-outline-sheet')).toHaveClass(/open/)
  await expect(page.locator('.mobile-outline-sheet a')).not.toHaveCount(0)
})
