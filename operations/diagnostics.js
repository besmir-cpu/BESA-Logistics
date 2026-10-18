// Privacy-first diagnostics: timings stay in browser memory only.
// No personal names, spreadsheet data, file URLs, telemetry or error bodies
// are transmitted to an external service.
(()=>{
  'use strict';
  const recent=[];
  let failures=0,slowTasks=0,firstLoad=null,hoverStart=null;
  const limit=30;
  const record=(kind,ms)=>{
    if(!Number.isFinite(ms)||ms<0)return;
    recent.push({kind,ms:Math.round(ms),at:Date.now()});
    if(recent.length>limit)recent.shift();
    display();
  };
  function report(){
    const values=recent.filter(x=>x.kind==='navigation'||x.kind==='dashboard-data').map(x=>x.ms);
    const mean=values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;
    const last=values.length?values[values.length-1]:null;
    return {loadMs:firstLoad,meanMs:mean,lastMs:last,samples:values.length,
      slowTasks,errors:failures,diagnostics:'local only'};
  }
  function display(){
    const el=document.getElementById('besa-speed-button');
    if(!el)return;
    const data=report();
    el.textContent=data.lastMs!=null?'Speed '+(data.lastMs/1000).toFixed(1)+'s':'Speed info';
    el.title='Show local page timings and JavaScript error counts';
  }
  window.addEventListener('error',()=>{failures++;display();});
  window.addEventListener('unhandledrejection',()=>{failures++;display();});
  window.addEventListener('besa:load-metric',e=>{
    const d=e.detail||{};
    if(d.kind==='dashboard-data')record('dashboard-data',Number(d.durationMs));
  });
  if('PerformanceObserver'in window){
    try{
      const observer=new PerformanceObserver(list=>{
        for(const entry of list.getEntries())if(entry.duration>=50)slowTasks++;
        display();
      });
      observer.observe({type:'longtask',buffered:true});
    }catch{/* Unsupported devices will still show navigation timings. */}
  }
  document.addEventListener('pointerdown',e=>{
    if(e.target.closest('a[href^="#"]'))hoverStart=performance.now();
  },{capture:true,passive:true});
  window.addEventListener('hashchange',()=>{
    if(hoverStart!==null){
      const started=hoverStart;hoverStart=null;
      requestAnimationFrame(()=>record('navigation',performance.now()-started));
    }
  });
  function mount(){
    if(document.getElementById('besa-speed-button'))return;
    const button=document.createElement('button');
    button.id='besa-speed-button';button.type='button';button.className='besa-speed-button';
    button.setAttribute('aria-label','Show local website speed diagnostics');
    document.body.append(button);
    const dialog=document.createElement('dialog');dialog.id='besa-speed-dialog';
    dialog.className='besa-speed-dialog';
    const title=document.createElement('h2');title.textContent='Website performance';
    const summary=document.createElement('p');summary.id='besa-speed-summary';
    const details=document.createElement('p');details.id='besa-speed-details';
    const close=document.createElement('button');close.type='button';close.textContent='Close';
    close.addEventListener('click',()=>dialog.close());
    dialog.append(title,summary,details,close);document.body.append(dialog);
    button.addEventListener('click',()=>{
      const d=report();
      summary.textContent='Page ready: '+(d.loadMs===null?'measuring…':(d.loadMs/1000).toFixed(2)+' seconds')+
        ' · Recent navigation/data average: '+(d.meanMs===null?'n/a':(d.meanMs/1000).toFixed(2)+' seconds');
      details.textContent=d.samples+' recent samples · '+d.slowTasks+' long tasks · '+
        d.errors+' JavaScript errors on this page. No information is sent outside the browser.';
      dialog.showModal();
    });
    const nav=performance.getEntriesByType('navigation')[0];
    if(nav){
      const elapsed=nav.domContentLoadedEventEnd||nav.duration;
      if(elapsed>=0){firstLoad=Math.round(elapsed);record('page-load',elapsed);}
    }
    display();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  window.besaLocalDiagnostics=report;
})();
