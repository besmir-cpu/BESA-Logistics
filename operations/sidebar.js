/* Persistent BESA office navigation for standalone operational pages.
 * The main dashboard already owns its sidebar. This script adds the same
 * workspace links only to separate pages such as Rota and Payments.
 * No login, data or business calculations are changed.
 */
(() => {
  'use strict';
  const links = [
    {id:'overview',href:'index.html#dashboard',icon:'◫',label:'Overview'},
    {id:'vehicles',href:'index.html#vehicles',icon:'▱',label:'Vehicles'},
    {id:'drivers',href:'index.html#drivers',icon:'♙',label:'Drivers & Onboarding'},
    {id:'rota',href:'rota.html',icon:'▦',label:'Rota / Scheduling'},
    {id:'vans',href:'rota.html#vans',icon:'▤',label:'Van Allocation'},
    {id:'payments',href:'payments.html',icon:'£',label:'Payments'},
    {id:'tracker',href:'payment-tracker.html',icon:'▥',label:'Payment Tracker'},
    {id:'compliance',href:'index.html#compliance',icon:'◷',label:'Compliance'},
    {id:'activity',href:'index.html#activity',icon:'≡',label:'Activity'}
  ];
  function selectedPage() {
    const page = window.location.pathname.split('/').pop().toLowerCase();
    if (page === 'rota.html') return window.location.hash === '#vans' ? 'vans' : 'rota';
    if (page === 'payments.html') return 'payments';
    if (page === 'payment-tracker.html') return 'tracker';
    return '';
  }
  function updateSelected(sidebar) {
    const current = selectedPage();
    for (const link of sidebar.querySelectorAll('nav a[data-standalone-page]')) {
      const active = link.dataset.standalonePage === current;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }
  function mount() {
    if (!document.body || document.querySelector('.besa-standalone-sidebar')) return;
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar besa-standalone-sidebar';
    sidebar.setAttribute('aria-label', 'BESA workspace');
    const brand = document.createElement('a');
    brand.className = 'brand besa-standalone-brand';
    brand.href = 'index.html#dashboard';
    const mark = document.createElement('span');
    mark.className = 'brand-mark';
    mark.textContent = 'B';
    const title = document.createElement('span');
    title.textContent = 'Besa Logistics';
    const sub = document.createElement('small');
    sub.textContent = 'OPERATIONS';
    title.append(sub);
    brand.append(mark, title);
    const label = document.createElement('p');
    label.className = 'nav-label';
    label.textContent = 'WORKSPACE';
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Main navigation');
    for (const item of links) {
      const link = document.createElement('a');
      link.href = item.href;
      link.dataset.standalonePage = item.id;
      const symbol = document.createElement('span');
      symbol.textContent = item.icon;
      symbol.setAttribute('aria-hidden', 'true');
      link.append(symbol, document.createTextNode(item.label));
      nav.append(link);
    }
    const foot = document.createElement('div');
    foot.className = 'sidebar-bottom';
    const dot = document.createElement('span');
    dot.className = 'connection-dot';
    dot.setAttribute('aria-hidden', 'true');
    foot.append(dot, document.createTextNode('BESA operations'));
    const line = document.createElement('p');
    line.textContent = 'Built for the road ahead.';
    foot.append(line);
    sidebar.append(brand, label, nav, foot);
    document.body.prepend(sidebar);
    document.body.classList.add('besa-standalone-nav');
    updateSelected(sidebar);
    window.addEventListener('hashchange', () => updateSelected(sidebar));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
