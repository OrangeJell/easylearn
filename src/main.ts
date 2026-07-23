import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import KnowledgeView from './views/KnowledgeView.vue'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/catalog.css'
import './styles/article.css'
import './styles/motion.css'
import './styles/responsive.css'
import './styles/practice.css'
const router=createRouter({history:createWebHistory(),routes:[{path:'/',redirect:'/knowledge/java-basic/string-immutable'},{path:'/practice/:questionId?',component:()=>import('./views/PracticeView.vue')},{path:'/knowledge/:category/:slug',component:KnowledgeView},{path:'/:pathMatch(.*)*',redirect:'/knowledge/java-basic/string-immutable'}],scrollBehavior(){return{top:0}}})
createApp(App).use(router).mount('#app')
