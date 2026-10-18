// Warm same-origin office pages on user intent, before their click.
// This avoids re-downloading navigation destinations on supported browsers
// without preloading any private driver/finance API data.
(()=>{
  'use strict';
  const warmed=new Set();
  const eligible=new Set(['index.html','rota.html','payments.html','payment-tracker.html']);
  function warm(anchor){
    if(!anchor)return;
    let url;
    try{url=new URL(anchor.href,location.href);}catch{return;}
    const file=url.pathname.split('/').pop();
    if(url.origin!==location.origin||!eligible.has(file)||
       url.pathname===location.pathname||warmed.has(url.pathname))return;
    warmed.add(url.pathname);
    const link=document.createElement('link');
    link.rel='prefetch';link.as='document';link.href=url.origin+url.pathname;
    document.head.append(link);
  }
  document.addEventListener('pointerover',e=>warm(e.target.closest('a[href]')),{passive:true});
  document.addEventListener('focusin',e=>warm(e.target.closest('a[href]')));
  document.addEventListener('touchstart',e=>warm(e.target.closest('a[href]')),{passive:true});
})();
