/* BESA public-company website: first-party functionality.
 * No analytics, tracking, browser form storage or external scripts.
 */
(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const menu = document.querySelector('.menu-toggle');
  const nav = byId('primary-nav');

  function closeMenu() {
    if (!menu || !nav) return;
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Open navigation');
    nav.classList.remove('is-open');
  }

  if (menu && nav) {
    menu.addEventListener('click', () => {
      const opening = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', opening ? 'true' : 'false');
      menu.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
      nav.classList.toggle('is-open', opening);
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });
    document.addEventListener('click', event => {
      if (!nav.contains(event.target) && !menu.contains(event.target)) closeMenu();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 800) closeMenu();
    }, {passive: true});
  }

  const head = document.querySelector('.site-header');
  if (head) {
    const update = () => head.classList.toggle('is-stuck', window.scrollY > 6);
    window.addEventListener('scroll', update, {passive: true});
    update();
  }

  const settings = window.BESA_COMPANY_SITE || {};
  const headline = document.querySelector('.hero-description');
  if (headline && typeof settings.heroStatement === 'string' && settings.heroStatement.trim()) {
    headline.textContent = settings.heroStatement.trim().slice(0, 450);
  }

  let contacts = 0;
  if (typeof settings.contactEmail === 'string') {
    const email = settings.contactEmail.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const row = byId('contact-email-row'), link = byId('contact-email');
      if (row && link) {
        link.textContent = email;
        link.href = 'mailto:' + email + '?subject=' + encodeURIComponent('BESA Logistics enquiry');
        row.hidden = false;
        contacts++;
      }
    }
  }

  if (typeof settings.contactPhone === 'string') {
    const phone = settings.contactPhone.trim();
    const digits = phone.replace(/[\s().-]/g, '');
    if (/^\+?[\d]{8,17}$/.test(digits)) {
      const row = byId('contact-phone-row'), link = byId('contact-phone');
      if (row && link) {
        link.textContent = phone;
        link.href = 'tel:' + digits;
        row.hidden = false;
        contacts++;
      }
    }
  }

  if (typeof settings.contactWhatsapp === 'string') {
    const number = settings.contactWhatsapp.trim();
    const digits = number.replace(/[\s()+.-]/g, '');
    if (/^[1-9]\d{7,14}$/.test(digits)) {
      const row = byId('contact-whatsapp-row'), link = byId('contact-whatsapp');
      if (row && link) { link.textContent = number; link.href = 'https://wa.me/' + digits; row.hidden = false; contacts++; }
    }
  }
  if (contacts > 0 && byId('contact-placeholder')) byId('contact-placeholder').hidden = true;
  const year = byId('copyright-year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
