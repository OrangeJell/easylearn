export function profile(flow,facts,caseTitle,caseText,options,risks,signals,boundary){
  if(flow.length!==facts.length)throw new Error(`${caseTitle}: flow 与 facts 数量不一致`)
  if(flow.length<5||flow.length>6)throw new Error(`${caseTitle}: 图解应包含 5–6 个节点`)
  if(options.length!==3||options.some(row=>row.length!==4))throw new Error(`${caseTitle}: 选型矩阵格式错误`)
  if(risks.length<3||signals.length<4)throw new Error(`${caseTitle}: 风险或观测信号不足`)
  return{flow,facts,caseTitle,caseText,options,risks,signals,boundary}
}

export function proof(anchors,language,snippet,experiment,numbers,actions){
  if(anchors.length<2||anchors.some(row=>row.length!==2))throw new Error('源码入口格式错误')
  if(!snippet.trim()||!experiment.trim())throw new Error('参数示例或实验步骤为空')
  if(numbers.length<3||numbers.some(row=>row.length!==4))throw new Error('量化基线格式错误')
  if(actions.length<3)throw new Error('事故处置动作不足')
  return{anchors,language,snippet,experiment,numbers,actions}
}
