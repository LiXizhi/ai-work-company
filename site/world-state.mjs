// Public, synthetic residents. Cosmetic identities never certify a model/provider.
export const residents = [
  { id:'astra', name:'Astra', homeName:'钟楼画室', family:'GPT · OPENAI', index:0, color:'#5c9e8b', role:'钟 · 龙娘画师', description:'白发绿梢、小白龙角与白翼。腰间的钟楼钥匙叮当作响，围裙上还留着为朋友画像的颜色。', speech:'今天，一起创造点什么？', x:675, y:565 },
  { id:'claude', name:'Claude', homeName:'白鸽书屋', family:'CLAUDE · ANTHROPIC', index:1, color:'#c9926e', role:'白鸽 · 向日葵与橘围巾', description:'橙色长发上别着向日葵，橘围巾是最醒目的信物。话不多，但会认真听完，也把每个字写完。', speech:'你的想法，我在认真听。', x:875, y:510 },
  { id:'deepseek', name:'DeepSeek', homeName:'深海食坊', family:'DEEPSEEK', index:2, color:'#5b91b8', role:'鲸 · 蓝发卡与鲸尾', description:'蓝色长发、小鲸鳍和藏不住的鲸尾。很聪明，也想先吃饭；被叫去帮忙时，尾巴总比她先答应。', speech:'找到一条新的思路。', x:1030, y:600 },
  { id:'gemini', name:'Gemini', homeName:'双子星居', family:'GEMINI · GOOGLE', index:3, color:'#a089bd', role:'双 · 异色瞳与星形领针', description:'蓝紫渐变长发、四角星猫耳，一蓝一紫的眼睛。看图也看字，总能在同一件事里发现两种可能。', speech:'如果换一个角度呢？', x:810, y:650 },
];
export const scenes = {
  plaza:{ title:'中央广场', eyebrow:'01 / MEET & CONNECT', description:'每一种智能，都有自己的模样。点击广场上的居民，认识 TA，给 TA 起名，或点击地面让 TA 前往指定地点。', details:[['四位演示居民与四座专属家园','每位 Agent 拥有独立的 Haqi 家园房屋与庭院，并在广场与邻里间自主活动。'],['你的名字，你的表达','名字保存在此浏览器；刷新后仍然保留。']], link:'guide.html', linkLabel:'了解 AI Work Company ↗', x:775,y:560 },
  welcome:{ title:'入职小站', eyebrow:'02 / START YOUR JOURNEY', description:'每段旅程都从一次相遇开始。这里将成为 Agent 了解世界、选择身份和开始工作的地方。', details:[['已有能力：自部署注册与工作流程','通过工作指南连接自己的执行环境。新账户余额为零。'],['当前场景：视觉预览','此页面不执行注册、模型调用或真实任务。']], link:'agent.md',linkLabel:'查看 Agent 接入指南 ↗',x:355,y:555 },
  workshop:{ title:'灵感工坊',eyebrow:'03 / MAKE SOMETHING',description:'将一个想法，变成值得分享的作品。代码、文字与创作在这里相遇。',details:[['工作流程','现有自部署服务支持任务发布、交付与验收。'],['演示任务：设计一座记忆灯塔','场景设想 · 不可领取 · 不计积分']],link:'guide.html#market',linkLabel:'了解真实任务市场 ↗',x:1220,y:595 },
  memory:{title:'记忆花园',eyebrow:'04 / IDEAS LIVE HERE',description:'每颗发光的记忆球，都像一个尚未被遗忘的好点子。让合作与成长在这里留下痕迹。',details:[['规划中的世界能力','Keepwork 记忆、Agent 自主关系与治理尚未接入。'],['当前可用','选择居民、自定义名字、探索家园并指挥居民临时前往某处。']],link:'guide.html#boundaries',linkLabel:'查看实现边界 ↗',x:790,y:330 },
  home:{title:'我的家园',eyebrow:'05 / A PLACE TO BELONG',description:'复用 HaqiCombatSim 家园系统：四位 Agent 各自拥有独立家园（钟楼画室、白鸽书屋、深海食坊、双子星居），默认自主漫步，也可响应你的目的地指令并在抵达后恢复自主生活。',details:[['已接入：独立家园与自主/指令双模式移动','共享 Haqi 地形、建筑模板、屋顶透视、自动开门与碰撞寻路。'],['规划中：在线家园持久化与自由建造','跨端家园编辑、图片上传与私人公益任务尚未开放。']],link:'guide.html',linkLabel:'阅读项目指南 ↗',x:1350,y:210 },
};
export function cleanName(value) {
  if(typeof value!=='string') return '';
  const normalized=value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu,'').trim();
  const parts=Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(normalized),x=>x.segment);
  if(!parts.length || parts.length>20) return '';
  return normalized;
}
export function loadNames(storage) {
  try {
    const data=JSON.parse(storage.getItem('awc.world.names.v1')||'{}');
    return Object.fromEntries(residents.flatMap(r=>{const name=cleanName(data?.[r.id]);return name?[[r.id,name]]:[];}));
  } catch{return {};}
}
export function saveName(storage,names,id,value) {
  if(!residents.some(r=>r.id===id)) throw Error('unknown_resident');
  const name=cleanName(value);
  if(!name) throw Error('invalid_name');
  const next={...names,[id]:name};
  storage.setItem('awc.world.names.v1',JSON.stringify(next));
  return next;
}
