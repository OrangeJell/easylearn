<script setup lang="ts">
import{computed,ref}from'vue'
import{articleByRef,articlePath,type ArticleLink}from'../article-links'
import type{PracticeQuestion}from'../data/practice'

const props=withDefaults(defineProps<{question:PracticeQuestion;depth?:number;index?:number}>(),{depth:0,index:0})
const answerVisible=ref(false)
const related=computed(()=>props.question.relatedArticles.map(articleByRef).filter((item):item is ArticleLink=>Boolean(item)))

const visibleFollowUps=computed(()=>props.question.followUps||[])
function toggleAnswer(){answerVisible.value=!answerVisible.value}
</script>

<template>
  <article class="question-node" :class="[`depth-${depth}`,{answered:answerVisible}]" :data-question-id="question.id">
    <header class="question-head">
      <div class="question-type">
        <span>{{depth===0?(question.category||'综合题'):`追问 ${String(index+1).padStart(2,'0')}`}}</span>
        <div v-if="depth===0" class="question-meta"><small>{{question.difficulty}}</small><small>约 {{question.durationMinutes||2}} 分钟</small></div>
      </div>
      <h1 v-if="depth===0">{{question.prompt}}</h1>
      <h2 v-else>{{question.prompt}}</h2>
    </header>

    <div class="question-actions">
      <button class="reveal-answer" :class="{open:answerVisible}" :aria-expanded="answerVisible" @click="toggleAnswer"><span>{{answerVisible?'收起答案':'查看答案'}}</span><i>{{answerVisible?'↑':'↓'}}</i></button>
    </div>

    <Transition name="answer-reveal">
      <div v-if="answerVisible" class="question-reveal-content">
        <section class="spoken-answer" :class="{compact:(question.durationMinutes||0)<=1}" aria-live="polite">
          <div class="answer-heading"><span>参考回答</span><small>约 {{question.durationMinutes||2}} 分钟 · 口语表达</small></div>
          <section v-if="question.shortAnswer" class="quick-answer"><small>我的判断</small><p>{{question.shortAnswer}}</p></section>
          <div v-if="question.answerHtml" class="practice-rich answer-rich" v-html="question.answerHtml"/>
          <div v-else class="answer-copy" :class="{long:(question.durationMinutes||0)>=3}">
            <div v-for="(paragraph,paragraphIndex) in question.answer" :key="paragraph" class="answer-paragraph">
              <span v-if="(question.durationMinutes||0)>=3">{{String(paragraphIndex+1).padStart(2,'0')}}</span>
              <p>{{paragraph}}</p>
            </div>
          </div>
          <div v-if="question.keyPoints.length" class="answer-points">
            <b>记住这几点</b>
            <ol><li v-for="point in question.keyPoints" :key="point">{{point}}</li></ol>
          </div>
        </section>

        <section v-if="question.diagram" class="question-diagram" :class="question.diagram.kind" :aria-label="question.diagram.title">
          <header><span>{{question.diagram.title}}</span><small>{{question.diagram.kind==='flow'?'从目标到落地':'从发现到恢复'}}</small></header>
          <div class="diagram-track"><template v-for="(node,nodeIndex) in question.diagram.nodes" :key="node"><div class="diagram-node"><i>{{String(nodeIndex+1).padStart(2,'0')}}</i><b>{{node}}</b></div><span v-if="nodeIndex<question.diagram.nodes.length-1">→</span></template></div>
        </section>

        <section v-if="visibleFollowUps.length" class="follow-up-list">
          <header><span>继续追问</span><small>{{visibleFollowUps.length}} 个问题</small></header>
          <QuestionNode v-for="(followUp,followIndex) in visibleFollowUps" :key="followUp.id" :question="followUp" :depth="depth+1" :index="followIndex"/>
        </section>

        <nav v-if="related.length" class="question-related" aria-label="相关知识点">
          <span>关联知识</span>
          <RouterLink v-for="item in related" :key="item.file" :to="articlePath(item)"><b>{{item.title}}</b><i>↗</i></RouterLink>
        </nav>

        <section v-if="depth===0&&(question.problemAnalysisHtml||question.problemAnalysis?.length||question.pitfallsHtml||question.pitfalls?.length)" class="answer-extensions" aria-label="答题补充">
          <details v-if="question.problemAnalysisHtml||question.problemAnalysis?.length" class="answer-extension analysis-extension">
            <summary><span><small>思路拆解</small><b>问题分析</b></span><i aria-hidden="true"/></summary>
            <div v-if="question.problemAnalysisHtml" class="practice-rich" v-html="question.problemAnalysisHtml"/>
            <div v-else><p v-for="paragraph in question.problemAnalysis" :key="paragraph">{{paragraph}}</p></div>
          </details>
          <details v-if="question.pitfallsHtml||question.pitfalls?.length" class="answer-extension pitfalls-extension">
            <summary><span><small>容易答偏</small><b>踩坑误区</b></span><i aria-hidden="true"/></summary>
            <div v-if="question.pitfallsHtml" class="practice-rich" v-html="question.pitfallsHtml"/>
            <div v-else><p v-for="paragraph in question.pitfalls" :key="paragraph">{{paragraph}}</p></div>
          </details>
        </section>
      </div>
    </Transition>
  </article>
</template>
