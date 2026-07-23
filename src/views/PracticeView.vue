<script setup lang="ts">
import{onBeforeUnmount,onMounted,ref,watch}from'vue'
import{useRoute,useRouter}from'vue-router'
import QuestionNode from'../components/QuestionNode.vue'
import{curatedQuestionById,mergePracticeIndex,type PracticeQuestion,type PracticeQuestionSummary}from'../data/practice'

type PracticeIndexPayload={version:string;questions:PracticeQuestionSummary[]}

const route=useRoute(),router=useRouter()
const questions=ref<PracticeQuestionSummary[]>([]),questionBag=ref<string[]>([]),currentQuestion=ref<PracticeQuestion>()
const switching=ref(false),loading=ref(true),loadError=ref('')
const questionCache=new Map<string,PracticeQuestion>()
let animationTimer:number|undefined,detailRequest=0

function shuffle(values:string[]){
  const output=[...values]
  for(let index=output.length-1;index>0;index--){const target=Math.floor(Math.random()*(index+1));[output[index],output[target]]=[output[target],output[index]]}
  return output
}
function refillBag(excludeId=''){
  questionBag.value=shuffle(questions.value.map(question=>question.id).filter(id=>id!==excludeId))
}
function takeNextSummary(){
  if(!questionBag.value.length)refillBag(currentQuestion.value?.id)
  let id=questionBag.value.shift()
  if(id===currentQuestion.value?.id)id=questionBag.value.shift()
  return questions.value.find(question=>question.id===id)
}
function summaryById(id:string){return questions.value.find(question=>question.id===id)}
async function fetchQuestion(summary:PracticeQuestionSummary){
  const curated=curatedQuestionById(summary.id)
  if(curated)return curated
  const cached=questionCache.get(summary.id)
  if(cached)return cached
  const response=await fetch(`/practice/questions/${encodeURIComponent(summary.id)}.json`)
  if(!response.ok)throw new Error('题目加载失败')
  const question=await response.json() as PracticeQuestion
  questionCache.set(summary.id,question)
  return question
}
function prefetchNext(){
  const next=summaryById(questionBag.value[0]||'')
  if(next&&!curatedQuestionById(next.id)&&!questionCache.has(next.id))void fetchQuestion(next).catch(()=>undefined)
}
async function selectQuestion(summary:PracticeQuestionSummary,updateAddress=true){
  const request=++detailRequest
  loading.value=true;loadError.value=''
  try{
    const question=await fetchQuestion(summary)
    if(request!==detailRequest)return
    currentQuestion.value=question
    questionBag.value=questionBag.value.filter(id=>id!==summary.id)
    document.title=`${question.prompt} | Java 知识库`
    if(updateAddress&&route.params.questionId!==question.id)await router.replace(`/practice/${question.id}`)
    prefetchNext()
  }catch(error){if(request===detailRequest)loadError.value=error instanceof Error?error.message:'题目加载失败'}
  finally{if(request===detailRequest)loading.value=false}
}
async function loadQuestionBank(){
  loading.value=true;loadError.value=''
  try{
    const response=await fetch('/practice/index.json')
    if(!response.ok)throw new Error('题库加载失败')
    const payload=await response.json() as PracticeIndexPayload
    questions.value=mergePracticeIndex(payload.questions)
    refillBag()
    const routeId=String(route.params.questionId||'')
    const target=summaryById(routeId)||takeNextSummary()
    if(!target)throw new Error('题库暂无可用题目')
    await selectQuestion(target,true)
  }catch(error){loadError.value=error instanceof Error?error.message:'题库加载失败';loading.value=false}
}
function changeQuestion(){
  if(loading.value||questions.value.length<2)return
  const next=takeNextSummary()
  if(!next)return
  switching.value=true
  if(animationTimer)window.clearTimeout(animationTimer)
  animationTimer=window.setTimeout(()=>switching.value=false,520)
  void selectQuestion(next,true)
  window.scrollTo({top:0,behavior:'smooth'})
}

watch(()=>String(route.params.questionId||''),id=>{
  if(!id||!questions.value.length||id===currentQuestion.value?.id)return
  const target=summaryById(id)
  if(target)void selectQuestion(target,false)
})
onMounted(()=>{document.title='高频面试题 | Java 知识库';void loadQuestionBank()})
onBeforeUnmount(()=>{if(animationTimer)window.clearTimeout(animationTimer)})
</script>

<template>
  <main class="practice-page" :data-question-bank-size="questions.length">
    <header class="practice-toolbar">
      <div class="practice-title"><small>JAVA INTERVIEW</small><h1>高频面试题</h1></div>
      <div class="practice-toolbar-actions">
        <button class="random-question" :class="{switching}" :disabled="loading||!!loadError" aria-label="随机换一题" @click="changeQuestion"><i>↻</i><span>随机换一题</span></button>
      </div>
    </header>

    <section v-if="loading" class="practice-loading" aria-live="polite"><i/><i/><i/><span>正在准备题目…</span></section>
    <section v-else-if="loadError" class="practice-load-error"><b>{{loadError}}</b><button @click="loadQuestionBank">重新加载</button></section>
    <Transition v-else name="question-swap" mode="out-in">
      <section v-if="currentQuestion" :key="currentQuestion.id" class="practice-workspace">
        <QuestionNode :question="currentQuestion"/>
      </section>
    </Transition>
  </main>
</template>
