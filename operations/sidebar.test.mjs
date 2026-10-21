import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const script=read('operations/sidebar.js');

function simulate(pathname,hash=''){
  const listeners={};
  class Node{
    constructor(tag){
      this.tag=tag;this.children=[];this.dataset={};this.attributes={};
      this.className='';this.textContent='';this.href='';
      this.classList={
        add:(name)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),name])].join(' ');},
        toggle:(name,force)=>{
          const values=this.className.split(' ').filter(Boolean);
          const present=values.includes(name);
          const apply=force===undefined?!present:force;
          this.className=apply?[...new Set([...values,name])].join(' '):values.filter(v=>v!==name).join(' ');
        },
        contains:name=>this.className.split(' ').includes(name)
      };
    }
    append(...nodes){this.children.push(...nodes);}
    prepend(...nodes){this.children.unshift(...nodes);}
    setAttribute(name,value){this.attributes[name]=value;}
    removeAttribute(name){delete this.attributes[name];}
    querySelectorAll(query){
      const found=[];
      const visit=node=>{
        if(query==='nav a[data-standalone-page]'&&node.tag==='a'&&node.dataset.standalonePage)found.push(node);
        for(const child of node.children)visit(child);
      };
      visit(this);
      return found;
    }
  }
  const body=new Node('body');
  const document={
    readyState:'loading',
    body,
    createElement:name=>new Node(name),
    createTextNode:value=>{const el=new Node('#text');el.textContent=value;return el;},
    querySelector:selector=>selector==='.besa-standalone-sidebar'
      ?body.children.find(n=>n.className.includes('besa-standalone-sidebar')):null,
    addEventListener:(name,fn)=>{listeners[name]=fn;}
  };
  const window={location:{pathname,hash},addEventListener:(name,fn)=>{listeners[name]=fn;}};
  vm.runInNewContext(script,{document,window});
  listeners.DOMContentLoaded();
  return {body,document,window,listeners,sidebar:body.children[0],
    links:body.children[0].querySelectorAll('nav a[data-standalone-page]')};
}
test('Rota has the same nine links as the dashboard sidebar',()=>{
  const {body,sidebar,links}=simulate('/BESA-Logistics/rota.html');
  assert.ok(body.classList.contains('besa-standalone-nav'));
  assert.ok(sidebar.className.includes('sidebar'));
  assert.equal(links.length,9);
  assert.ok(links.some(x=>x.href==='index.html#drivers'));
  assert.ok(links.some(x=>x.href==='index.html#vehicles'));
  assert.ok(links.some(x=>x.href==='payments.html'));
  assert.ok(links.some(x=>x.href==='payment-tracker.html'));
  const selected=links.filter(x=>x.attributes['aria-current']==='page');
  assert.deepEqual(selected.map(x=>x.dataset.standalonePage),['rota']);
});
test('Van Allocation tab stays highlighted when user changes hash',()=>{
  const {window,listeners,links}=simulate('/BESA-Logistics/rota.html');
  window.location.hash='#vans';
  listeners.hashchange();
  assert.deepEqual(links.filter(x=>x.attributes['aria-current']==='page')
    .map(x=>x.dataset.standalonePage),['vans']);
  window.location.hash='#rota';
  listeners.hashchange();
  assert.deepEqual(links.filter(x=>x.attributes['aria-current']==='page')
    .map(x=>x.dataset.standalonePage),['rota']);
});
test('Payments pages keep correct sidebar selected section',()=>{
  for(const [page,expected] of [['payments.html','payments'],['payment-tracker.html','tracker']]){
    const {links}=simulate('/BESA-Logistics/'+page);
    assert.deepEqual(links.filter(x=>x.attributes['aria-current']==='page')
      .map(x=>x.dataset.standalonePage),[expected]);
  }
});
test('every standalone office page includes sidebar resources',()=>{
  for(const name of ['rota.html','payments.html','payment-tracker.html']){
    const html=read(name);
    assert.ok(html.includes('operations/sidebar.css?v=2'),name+' CSS');
    assert.ok(html.includes('operations/sidebar.js?v=2'),name+' JS');
  }
  const css=read('operations/sidebar.css');
  assert.ok(css.includes('position:fixed!important'));
  assert.ok(css.includes('body.besa-standalone-nav{padding-left:244px'));
  assert.ok(css.includes('@media(max-width:750px)'));
});
