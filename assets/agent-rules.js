(function(){
'use strict';
const CATALOG={
 'S6-EU':{description:'Schuko 六位，无 USB',moq:500,lead_days:40,custom_moq:1000,custom_lead_days:38,document_ref:'DOC-008 / S6-EU：文件索引，需质量复核',quotation:{product_en:'6-outlet Schuko power strip, no USB',currency:'USD',unit_price:'6.80',price_ref:'DEMO-PRICE-01 / S6-EU standard configuration',payment:'30% deposit, 70% before shipment (demo)',validity_days:14}},
 'S6-UC':{description:'Schuko 六位，带 USB-C',moq:null,lead_days:null,custom_moq:null,custom_lead_days:null,document_ref:null}
};
const P={
 product:/[^.!?。！？\n]{0,100}(?:Schuko|德标)[^.!?。！？\n]{0,100}/gi,
 quantity:/(?<![-\d.,])(\d{1,3}(?:[., ]\d{3})+|\d+)\s*(?:unidades|units|pcs|件)(?![a-z])/gi,
 lead_days:/(?<![-\d.,])(\d{1,3})\s*(?:días|dias|days|天)(?![a-z])/gi,
 document:/(?:declaración CE|CE declaration|CE document|\bCE\b|符合性声明)/gi,
 trade_term:/\bFOB\s+(?:Ningbo|宁波)/gi,
 custom_logo:/(?:logo personalizado|custom(?:ized)? logo|定制\s*logo|定制标识|印标)/gi
};
const labels={product:'产品配置',quantity:'数量',lead_days:'交期',document:'型号文件',trade_term:'交货条款',custom_logo:'定制标识'};
const value=(m,f)=>['quantity','lead_days'].includes(f)?Number(m[1].replace(/[^0-9]/g,'')):m[0].trim().toLowerCase();
function collect(sources,field){return sources.flatMap(s=>[...s.text.matchAll(P[field])].map(m=>({location:s.location,excerpt:s.original||m[0].trim(),value:value(m,field),text:m[0].trim(),source:s.source})));}
function sourcesFrom(body){
 const text=body.inquiry||'',docs=body.documents||[],sources=text.trim()?[{location:'邮件正文',text:text.trim()}]:[];
 for(const doc of docs)sources.push({location:doc.location,text:doc.text,original:doc.original});
 if(!sources.length)throw Error('请填写邮件或上传可读取的附件。');return sources;
}
function localReview(body){
 const sources=sourcesFrom(body),text=sources.map(s=>s.text).join('\n'),evidence=Object.fromEntries(Object.keys(P).map(f=>[f,collect(sources,f)])),selected={};
 for(const field of Object.keys(P)){const found=evidence[field],unique=new Set(found.map(x=>x.value));if(unique.size===1)selected[field]=found[0];}
 const product=selected.product?.text||'',six=/(?:\b6\s*(?:[- ]?)(?:tomas|outlets?|sockets?)\b|六位)/i.test(product);
 const no=/sin\s+usb|without\s+usb|no\s+usb|不带\s*USB|无\s*USB/i,hasNo=no.test(text),hasUsb=/\bUSB[ -]?C\b/i.test(text.replace(new RegExp(no.source,'gi'),''));
 const sku=six&&hasNo!==hasUsb?(hasUsb?'S6-UC':'S6-EU'):null,factory=CATALOG[sku]||{},custom=!!selected.custom_logo;
 const customUncertain=/\blogo\b|贴牌|定制|personaliz/i.test(text)&&(!custom||/(?:no|without|sin)\s+(?:(?:a|custom|customized)\s+)?logo|无需.{0,8}定制/i.test(text));
 const rows=[];
 const row=(name,state,desc,owner,field)=>{const matches=evidence[field]||[],distinct=new Set(matches.map(x=>x.value)),shown=selected[field]||distinct.size>1?matches:[];rows.push({name,state,factory_evidence:desc,owner,source:selected[field]?.text||null,sources:[...new Map(shown.map(s=>[s.location+'\n'+s.excerpt,{location:s.location,excerpt:s.excerpt}])).values()]});};
 row('产品型号',sku?'有依据':'待确认',factory.description||'未匹配到唯一的工厂型号','销售工程','product');
 for(const [field,name,key,unit,max] of [['quantity','起订量','moq','件',1000000],['lead_days','交期窗口','lead_days','天',730]]){const amount=selected[field]?.value,min=factory[(custom?'custom_':'')+key],conflict=new Set(evidence[field].map(x=>x.value)).size>1;if(customUncertain)row(name,'待确认','请先确认是否定制','销售工程',field);else if(conflict)row(name,'待确认','识别到不同数值，请确认以哪一项为准','外贸销售',field);else if(!amount||amount>max||!min)row(name,'待确认','缺少可核验的要求或工厂条件','生产计划',field);else row(name,amount>=min?'有依据':'条件冲突','工厂示例下限：'+min+' '+unit,'生产计划',field);}
 row('型号文件',selected.document&&factory.document_ref?'索引待复核':'待确认',factory.document_ref||'缺少当前型号文件依据','质量','document');
 const other=/\b(?:EXW|FCA|CPT|CIP|DAP|DPU|DDP|FAS|CFR|CIF)\b|\bFOB\b(?!\s+(?:Ningbo|宁波))/i.test(text);row('交货条款',selected.trade_term&&!other?'有依据':'待确认',other?'存在其他交货条款，请确认':'SOP-003：示例工厂支持 FOB Ningbo','外贸销售','trade_term');
 if(/packag|embalaj|label|payment|discount|warranty|包装|贴标|账期|质保/i.test(text))row('附加条款','待确认','包装、付款或质保条件需人工核对','外贸销售');
 const actions=rows.filter(r=>r.state!=='有依据').map(r=>({id:r.name,owner:r.owner,action:'复核'+r.name,blocks_quote:r.state!=='索引待复核'}));actions.push({id:'price',owner:'外贸销售',action:'复核价格、有效期和正式报价',blocks_quote:false});
 const blocked=actions.some(a=>a.blocks_quote),price=factory.quotation;let quote=null;
 if(!blocked&&!custom&&price){const quantity=selected.quantity.value;quote={number:'QG-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomUUID().slice(0,8).toUpperCase(),issued:new Date().toISOString().slice(0,10),sku,product:price.product_en,quantity,currency:price.currency,unit_price:price.unit_price,amount:(Math.round(Number(price.unit_price)*100)*quantity/100).toFixed(2),lead_days:selected.lead_days.value,trade_term:'FOB Ningbo',validity_days:price.validity_days,payment:price.payment,price_ref:price.price_ref};}
 const quote_reason=blocked?'先解决询价与工厂条件的阻塞项。':quote?'已按示例价目表生成，须由销售和质量复核。':'当前配置没有登记价格，请销售确认。';
 return {mode:'网页 Agent 核对',model:null,sku,checks:rows,actions,quote,quote_reason,decision:blocked?'先处理缺口，暂缓正式报价':'可准备报价，等人工复核',trace:[{step:'提取询盘',detail:'网页 Agent 规则提取'},{step:'核验原文',detail:'每项保留邮件、Excel 或 PDF 来源'},{step:'查询工厂资料',detail:sku||'型号待确认'},{step:'准备报价',detail:quote_reason}]};
}
function localChat(body){
 const messages=body.messages||[],sources=messages.map((text,i)=>({text,source:i+1}));if(!messages.length)throw Error('请先输入消息。');
 const facts=Object.keys(P).flatMap(f=>collect(sources,f).slice(0,3).map(x=>({source:x.source,quote:x.excerpt,label:labels[f]}))).slice(0,8),lead=[...new Set(collect(sources,'lead_days').map(x=>x.value))],quantities=[...new Set(collect(sources,'quantity').map(x=>x.value))];
 const questions=[...(lead.length>1?['哪一个交期有效：'+lead.join(' 天、')+' 天？']:lead.length?['交期从哪个节点起算？']:['请确认交期和起算点。']),...(quantities.length!==1?['请确认唯一的采购数量。']:[]),'请确认产品型号及适用文件。'];
 return {model:null,mode:'网页 Agent',summary:facts.length?'已从对话摘取关键原话。先确认买家最终要求，再拿工厂资料核对。':'目前没有识别到明确的询价字段。可以补充产品、数量和交期。',facts,questions,steps:[{owner:'外贸销售',action:'向买家确认冲突或缺失的要求，并保留确认记录。'},{owner:'生产计划',action:'按确认后的型号核对起订量、交期及文件。'},{owner:'外贸销售',action:'条件齐备后再准备报价草稿。'}]};
}
window.QuoteGuardAgent={review:localReview,chat:localChat};
})();
