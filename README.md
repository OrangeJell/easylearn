# Java 知识库

Vue 3 + TypeScript + Vite 构建的 Markdown 技术知识库。

## 开发

```bash
npm install
npm run dev
```

开发命令会先扫描 `src/content`，生成：

- `src/generated/articles.json`：导航与 Front Matter 元数据。
- `public/search-index.json`：独立的全文搜索索引。

文章正文通过 Vite 动态导入，进入具体路由时才加载。

## 内容关联

Front Matter 支持以下可选字段，值为文章路由引用：

```yaml
prerequisites: [mysql/btree-index]
next: [mysql/transactions-mvcc]
related: [mysql/slow-sql-troubleshooting]
```

构建时会检查引用是否存在。正文中的 `mermaid` Flowchart 代码块会渲染成轻量流程图。

## 构建与 SEO

```bash
SITE_URL=https://your-domain.example npm run build
```

构建会生成：

- 每篇文章的静态 HTML。
- 刷题首页和 100 道题的独立静态 HTML，直接访问或刷新不会依赖 SPA 回退。
- Canonical、Open Graph 和 JSON-LD。
- `sitemap.xml` 和 `robots.txt`。
- 按文章拆分的 Markdown 资源。

也可以在 `.env.local` 中配置 `SITE_URL`。

线上构建会校验 `SITE_URL`。Cloudflare Pages、Vercel 或 Netlify 环境中未配置域名，或域名不是 HTTPS 地址时，构建会直接失败，避免发布包含 `localhost` 的 SEO 文件。

## 发布到 Cloudflare Pages

推荐使用 Node.js 20，构建命令和输出目录分别为：

```text
Build command: npm run build
Output directory: dist
Environment variable: SITE_URL=https://你的正式域名
```

仓库中的 `wrangler.toml`、`public/_headers` 会提供 Pages 输出目录、静态资源缓存和基础安全响应头。有效的知识文章和题目路由都会生成物理 `index.html`；构建还会生成逐条精确的 `_redirects`，把无斜杠地址重写到对应 HTML。这里没有使用 `/practice/*` 之类的宽泛规则，因此不会拦截题库 JSON。

首次部署后至少直接访问并刷新以下地址：

```text
/
/knowledge/architecture/flash-sale-system-design
/practice
/practice/article-architecture-flash-sale-system-design
/practice/index.json
/search-index.json
/sitemap.xml
```

发布前可以在本地执行完整校验：

```bash
SITE_URL=https://your-domain.example npm run build
npm run test:e2e
```

## 测试

```bash
npm run test:e2e
```

Playwright 使用本机 Chrome，覆盖正文异步加载、全文搜索、导航定位、图解和手机端目录。
# easylearn
