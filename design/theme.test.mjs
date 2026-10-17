import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path,root),'utf8');

test('all current BESA public-facing pages load one shared design stylesheet', () => {
  for (const name of ['index.html','rota.html','payments.html','payment-tracker.html','onboard.html']) {
    const html=read(name);
    assert.equal((html.match(/besa-theme\.css\?v=horizon-1/g)||[]).length,1,name);
    assert.ok(html.includes('<meta name="viewport"'),name);
  }
});

test('the shared design CSS is structurally balanced and includes responsive styles', () => {
  const css=read('besa-theme.css');
  assert.ok(css.includes('@media(max-width:650px)'), 'mobile breakpoint missing');
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'), 'reduced motion missing');
  assert.ok(css.includes('.tracker-sheet') && css.includes('.xlsx-rota'));
  let braces=0,quotes=null,comment=false;
  for(let i=0;i<css.length;i++){
    const ch=css[i],next=css[i+1];
    if(comment){
      if(ch==='*'&&next==='/'){comment=false;i++;}
      continue;
    }
    if(quotes){
      if(ch==='\\'){i++;continue;}
      if(ch===quotes)quotes=null;
      continue;
    }
    if(ch==='/'&&next==='*'){comment=true;i++;continue;}
    if(ch==='"'||ch==="'"){quotes=ch;continue;}
    if(ch==='{')braces++;
    if(ch==='}'){
      braces--;
      assert.ok(braces>=0,'extra closing curly bracket');
    }
  }
  assert.equal(comment,false,'unfinished CSS comment');
  assert.equal(quotes,null,'unfinished CSS string');
  assert.equal(braces,0,'unbalanced CSS braces');
});

function luminance(hex){
  return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(x=>x<=0.04045?x/12.92:((x+.055)/1.055)**2.4)
    .reduce((acc,x,i)=>acc+x*[0.2126,0.7152,0.0722][i],0);
}
test('primary buttons and navigation have WCAG AA normal-text contrast', () => {
  const white=luminance('#ffffff');
  for(const hex of ['#515cde','#4259c7','#202c61','#4858d9','#3a49b7']){
    const ratio=(white+0.05)/(luminance(hex)+0.05);
    assert.ok(ratio>=4.5,hex+': '+ratio);
  }
});

test('design still leaves payment, routing and safety controls available', () => {
  const home=read('index.html'),rota=read('rota.html'),tracker=read('payment-tracker.html');
  assert.ok(home.includes('id="login-form"'));
  assert.ok(home.includes('href="payments.html"'));
  assert.ok(home.includes('href="payment-tracker.html"'));
  assert.ok(rota.includes('id="import-file"'));
  assert.ok(rota.includes('id="vans-tab-panel"'));
  assert.ok(tracker.includes('id="sheet-paste"'));
});
