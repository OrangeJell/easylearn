export const md=(...lines)=>lines.join('\n')
export const answer=(shortAnswer,answerMarkdown,options={})=>({shortAnswer,answerMarkdown,...options})
export const follow=(prompt,answerMarkdown,options={})=>({prompt,answerMarkdown,...options})
