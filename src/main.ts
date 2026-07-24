import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/catalog.css'
import './styles/article.css'
import './styles/motion.css'
import './styles/responsive.css'
import './styles/practice.css'
import './styles/home.css'
const initialArticle=document.querySelector<HTMLElement>('#app .prerender-shell .article-body')
const initialArticleRoute=location.pathname.match(/^\/knowledge\/([^/]+)\/([^/]+)\/?$/)
const initialArticleReference=initialArticleRoute?`${initialArticleRoute[1]}/${initialArticleRoute[2]}`:''
if(initialArticle&&initialArticleReference)window.__INITIAL_ARTICLE_CONTENT__={reference:initialArticleReference,html:initialArticle.innerHTML}
const router=createRouter({history:createWebHistory(),routes:[{path:'/',component:()=>import('./views/HomeView.vue')},{path:'/practice/:questionId?',component:()=>import('./views/PracticeView.vue')},{path:'/knowledge/:category/:slug',component:()=>import('./views/KnowledgeView.vue')},{path:'/:pathMatch(.*)*',redirect:'/'}],scrollBehavior(){return{top:0}}})
createApp(App).use(router).mount('#app')
