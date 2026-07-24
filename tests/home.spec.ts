import{expect,test}from'@playwright/test'

test.beforeEach(async({page})=>{await page.goto('/')})

test('首页直接提供搜索、知识分类和高频内容',async({page})=>{
  await expect(page.getByRole('heading',{name:'Java 面试知识库'})).toBeVisible()
  await expect(page.locator('.home-category-grid a')).toHaveCount(10)
  await expect(page.locator('.home-article-list a')).toHaveCount(6)
  await expect(page.locator('.home-preview img')).toHaveJSProperty('complete',true)
  await expect(page.locator('.home-preview img')).not.toHaveJSProperty('naturalWidth',0)
})

test('首页首屏不加载全文搜索索引',async({page})=>{
  const requests:string[]=[]
  page.on('request',request=>requests.push(new URL(request.url()).pathname))
  await page.reload()
  await expect(page.locator('.home-search')).toBeVisible()
  expect(requests).not.toContain('/search-index.json')
})

test('首页轻量搜索可以进入对应文章',async({page})=>{
  await page.getByRole('textbox',{name:'搜索知识文章'}).fill('MVCC')
  const result=page.locator('.home-search-results a[href="/knowledge/mysql/transactions-mvcc"]')
  await expect(result).toBeVisible()
  await result.click()
  await expect(page).toHaveURL(/\/knowledge\/mysql\/transactions-mvcc$/)
  await expect(page.locator('.article-body')).toContainText('Read View')
})

test('首页可以直接进入随机刷题',async({page})=>{
  await page.locator('.home-actions a[href="/practice"]').click()
  await expect(page).toHaveURL(/\/practice\//)
  await expect(page.locator('.question-node.depth-0')).toBeVisible()
})

test('首页在手机和深色模式下保持清晰且无横向溢出',async({page},testInfo)=>{
  await page.getByRole('button',{name:'切换主题'}).click()
  const state=await page.evaluate(()=>{
    const root=document.querySelector('#app>div') as HTMLElement
    const search=document.querySelector('.home-search') as HTMLElement
    const preview=document.querySelector('.home-preview') as HTMLElement
    return{
      dark:root.classList.contains('dark'),
      text:getComputedStyle(root).color,
      searchBackground:getComputedStyle(search).backgroundColor,
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      previewWidth:preview.getBoundingClientRect().width,
      viewportWidth:document.documentElement.clientWidth
    }
  })
  expect(state.dark).toBeTruthy()
  expect(state.text).toBe('rgb(238, 241, 238)')
  expect(state.searchBackground).not.toBe('rgb(255, 255, 255)')
  expect(state.overflow).toBeLessThanOrEqual(0)
  expect(state.previewWidth).toBeLessThanOrEqual(state.viewportWidth)
  if(testInfo.project.name==='mobile'){
    await expect(page.locator('.mobile-route-nav')).toBeVisible()
    await expect(page.locator('.home-category-grid')).toBeVisible()
  }
})
