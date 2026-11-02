// Opt-in, bounded, device-local measurements; never uploaded or attached to saves.
export function createPerformanceDiagnostics(enabled=false,{clock=()=>performance.now(),frameLimit=65536,sampleLimit=1200}={}){
    const rows=new Map(),starts=new Map(),events=[],hitches=[];let previous=null,observer;
    function event(name,detail=null,time=clock()){
        if(!enabled)return;
        events.push({name,time,detail});if(events.length>240)events.shift();
    }
    function record(name,value,time=clock()){
        if(!enabled||!Number.isFinite(value))return;
        if(value>8&&(name.startsWith('earth-')||name.startsWith('island-'))&&!name.startsWith('earth-worker-'))event(name,{duration:value},time);
        let row=rows.get(name);if(!row){row={values:[],cursor:0,count:0,total:0,max:0,over33:0,over50:0};rows.set(name,row);}
        const limit=name==='frame'?frameLimit:sampleLimit;
        if(row.values.length<limit)row.values.push(value);else{row.values[row.cursor]=value;row.cursor=(row.cursor+1)%limit;}
        row.count++;row.total+=value;row.max=Math.max(row.max,value);row.over33+=Number(value>33);row.over50+=Number(value>50);
        if((name==='frame'&&value>33)||name==='long-task'){
            hitches.push({name,time,duration:value,events:events.filter(e=>e.time>=time-value-100&&e.time<=time)});if(hitches.length>48)hitches.shift();
        }
    }
    if(enabled&&typeof PerformanceObserver!=='undefined')try{observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())record('long-task',entry.duration,entry.startTime+entry.duration);});observer.observe({type:'longtask'});}catch{}
    return {enabled,record,event,start(name){if(enabled){starts.set(name,clock());event(name+':start');}},end(name){if(starts.has(name)){record(name,clock()-starts.get(name));starts.delete(name);event(name+':end');}},frame(time,active){if(active&&previous!==null)record('frame',time-previous,clock());previous=active?time:null;},
        summary(){return Object.fromEntries([...rows].map(([name,row])=>{const sorted=[...row.values].sort((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)];return [name,{count:row.count,samples:sorted.length,mean:row.total/row.count,p95:q(.95),p99:q(.99),max:row.max,over33:row.over33,over50:row.over50}];}));},timeline(){return {events:[...events],hitches:[...hitches]};},reset(){rows.clear();starts.clear();events.length=0;hitches.length=0;previous=null;observer?.takeRecords();},dispose(){observer?.disconnect();}}
}
export const performanceDiagnostics=createPerformanceDiagnostics(typeof location!=='undefined'&&new URLSearchParams(location.search).get('profile')==='1');
if(performanceDiagnostics.enabled)globalThis.haqiPerformance=performanceDiagnostics;
