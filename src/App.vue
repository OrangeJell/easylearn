<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue'
import{useRoute}from'vue-router'
const route=useRoute()
const dark=ref(false),scrolled=ref(false)
const onKnowledge=computed(()=>route.path.startsWith('/knowledge'))
function updateScrolled(){scrolled.value=scrollY>12}
onMounted(()=>{dark.value=localStorage.getItem('theme')==='dark';window.addEventListener('scroll',updateScrolled,{passive:true})})
onBeforeUnmount(()=>window.removeEventListener('scroll',updateScrolled))
function toggleTheme(){dark.value=!dark.value;localStorage.setItem('theme',dark.value?'dark':'light')}
</script>
<template><div :class="{dark}"><header class="top" :class="{scrolled}"><RouterLink class="brand" to="/"><span>J</span><b>Java 知识库</b></RouterLink><nav><RouterLink to="/knowledge/java-basic/string-immutable" :class="{active:onKnowledge}">Java 八股文</RouterLink><RouterLink to="/practice">刷题</RouterLink><a class="disabled">专题合集</a></nav><button class="theme" aria-label="切换主题" @click="toggleTheme">{{dark?'☀':'◐'}}</button></header><nav class="mobile-route-nav" aria-label="主要功能"><RouterLink to="/knowledge/java-basic/string-immutable" :class="{active:onKnowledge}">知识库</RouterLink><RouterLink to="/practice">刷题</RouterLink></nav><RouterView /></div></template>
