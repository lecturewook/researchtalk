(function(g){
  'use strict';
  async function summarize(state,code){
    if(!g.RESEARCH_CONFIG.aiEnabled)throw new Error('AI 요약은 아직 연결 전이에요. 날짜별 대화 보관과 파일 저장은 사용할 수 있어요.');
    if(!state?.messages.length)throw new Error('요약할 대화가 없어요.');
    if(state.messages.length>400||state.messages.reduce((n,m)=>n+m.text.length,0)>24000)throw new Error('한 번에 대화 400개, 총 24,000자까지 요약할 수 있어요.');
    if(!code)throw new Error('요약 연결 코드를 입력해 주세요.');
    const endpoint=new URL(g.RESEARCH_CONFIG.aiEndpoint,g.location.href);
    if(endpoint.origin!==g.location.origin)throw new Error('AI 연결 주소를 확인해 주세요.');
    const names=Object.fromEntries(state.members.map(m=>[m.id,m.name]));
    const control=new AbortController(),timer=g.setTimeout(()=>control.abort(),40000);
    try{
      const response=await g.fetch(endpoint.href,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+code},body:JSON.stringify({day:state.day,messages:state.messages.map(m=>({authorId:m.authorId,authorName:names[m.authorId],text:m.text,time:m.localTime}))}),signal:control.signal});
      let result;try{result=await response.json();}catch{throw new Error('AI 연결 설정을 확인해 주세요.');}
      if(!response.ok)throw new Error(result.error||'요약을 만들지 못했어요.');
      if(typeof result.summary!=='string'||!result.summary.trim()||result.summary.length>5000)throw new Error('요약 결과를 확인하지 못했어요.');
      return result.summary.trim();
    }catch(e){if(e.name==='AbortError')throw new Error('요약에 시간이 오래 걸려요. 다시 시도해 주세요.');throw e;}
    finally{g.clearTimeout(timer);}
  }
  g.RTSummary=Object.freeze({summarize});
})(window);
