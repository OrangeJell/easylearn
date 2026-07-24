export type PracticeQuestionType='project'|'incident'|'design'|'mechanism'
export type PracticeDiagram={kind:'flow'|'timeline';title:string;nodes:string[]}
export type PracticeQuestion={
  id:string
  sourceRef?:string
  category?:string
  difficulty?:string
  durationMinutes?:number
  type?:PracticeQuestionType
  weight?:number
  prompt:string
  shortAnswer?:string
  answer:string[]
  keyPoints:string[]
  relatedArticles:string[]
  diagram?:PracticeDiagram
  followUps?:PracticeQuestion[]
}
export type PracticeQuestionSummary=Pick<PracticeQuestion,'id'|'sourceRef'|'category'|'difficulty'|'durationMinutes'|'type'|'prompt'>
