/* ============================================================
   Mar Vazquez Finanzas — Script compartido
   Reutilizable en todas las páginas (home, PLUS, VIDA, EDUCATIVO, Webinar).
   Cada bloque valida que sus elementos existan antes de inicializar.
   ============================================================ */

/* ===== CONFIG (reemplazar en producción) ===== */
const CONFIG = {
  whatsapp: '525561307667',
  calendlyUrl: '', // p.ej. 'https://calendly.com/marvazquez/asesoria'
  leadEndpoint: '' // p.ej. '/api/lead' — si vacío, solo simula el envío
};

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ===== Collage del hero: monedas / billetes / estrellas alrededor de la foto ===== */
(function(){
  const items=[['coin c1','$'],['coin c2','$'],['coin c3','$'],['bill b1','$'],['bill b2','$'],['star s1','✦'],['star s2','✦'],['star s3','✦'],['gem g1','◆']];
  document.querySelectorAll('.hero-photo').forEach(hp=>{
    items.forEach(([cls,txt])=>{
      const d=document.createElement('span');
      d.className='hd '+cls; d.textContent=txt; d.setAttribute('aria-hidden','true');
      hp.appendChild(d);
    });
  });
})();

/* ===== Header scroll + sticky CTA + volver arriba ===== */
(function(){
  const header = document.getElementById('header');
  const sticky = document.getElementById('sticky');
  const toTop  = document.getElementById('toTop');
  if(sticky || toTop) document.body.classList.add('has-sticky');
  function onScroll(){
    const y = window.scrollY;
    if(header) header.classList.toggle('scrolled', y > 40);
    if(sticky) sticky.classList.toggle('show', y > 600);
    if(toTop)  toTop.classList.toggle('show', y > 900);
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();
  if(toTop) toTop.addEventListener('click', ()=> window.scrollTo({top:0, behavior:'smooth'}));
})();

/* ===== Año dinámico ===== */
(function(){
  const yr = document.getElementById('year');
  if(yr) yr.textContent = new Date().getFullYear();
})();

/* ===== Reveal on scroll ===== */
(function(){
  const els = document.querySelectorAll('.reveal, .reveal-x, .reveal-scale');
  if(!els.length) return;
  if(reduce){ els.forEach(el=>el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} });
  },{threshold:.12, rootMargin:'0px 0px -8% 0px'});
  els.forEach(el=>io.observe(el));
})();

/* ===== Count-up ===== */
(function(){
  const els = document.querySelectorAll('[data-count]');
  if(!els.length) return;
  const fmt = n => n.toLocaleString('es-MX');
  function animate(el){
    const target = parseFloat(el.dataset.count||'0');
    const prefix = el.dataset.prefix||'';
    const suffix = el.dataset.suffix||'';
    if(reduce){ el.textContent = prefix+fmt(target)+suffix; return; }
    const dur = 1400, start = performance.now();
    function tick(now){
      const p = Math.min((now-start)/dur,1);
      const eased = 1-Math.pow(1-p,3);
      el.textContent = prefix+fmt(Math.round(target*eased))+suffix;
      if(p<1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ animate(e.target); obs.unobserve(e.target);} });
  },{threshold:.5});
  els.forEach(el=>obs.observe(el));
})();

/* ===== Calculadora de interés compuesto (solo si existe) ===== */
(function(){
  const rMonthly=document.getElementById('r-monthly');
  const rYears=document.getElementById('r-years');
  const rRate=document.getElementById('r-rate');
  if(!rMonthly || !rYears || !rRate) return;
  const vMonthly=document.getElementById('v-monthly');
  const vYears=document.getElementById('v-years');
  const vRate=document.getElementById('v-rate');
  const outTotal=document.getElementById('calc-total');
  const outInvested=document.getElementById('calc-invested');
  const outGains=document.getElementById('calc-gains');
  const money = n => '$'+Math.round(n).toLocaleString('es-MX');
  function calc(){
    const P=+rMonthly.value, years=+rYears.value, i=(+rRate.value/100)/12, n=years*12;
    const fv = i>0 ? P*((Math.pow(1+i,n)-1)/i) : P*n;
    const invested = P*n;
    if(vMonthly) vMonthly.textContent = money(P);
    if(vYears) vYears.textContent = years+' años';
    if(vRate) vRate.textContent = (+rRate.value)+'%';
    if(outTotal) outTotal.textContent = money(fv);
    if(outInvested) outInvested.textContent = money(invested);
    if(outGains) outGains.textContent = money(fv-invested);
  }
  [rMonthly,rYears,rRate].forEach(el=>el.addEventListener('input',calc));
  calc();
})();

/* ===== Preseleccionar interés desde botones ===== */
(function(){
  document.querySelectorAll('[data-interest]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const sel=document.getElementById('interest');
      if(sel){ const v=btn.dataset.interest; if([...sel.options].some(o=>o.value===v)) sel.value=v; }
    });
  });
})();

/* ===== Video VSL (placeholder → embed) ===== */
(function(){
  const frame=document.getElementById('vsl-video');
  if(!frame) return;
  function activate(){
    const embed=frame.dataset.embed;
    if(embed){
      frame.innerHTML='<iframe src="'+embed+'" title="Webinar Mar Vazquez" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:0;position:absolute;inset:0"></iframe>';
    }else{
      const form=document.getElementById('registro')||document.getElementById('contacto');
      if(form) form.scrollIntoView({behavior:reduce?'auto':'smooth'});
    }
  }
  frame.addEventListener('click',activate);
  frame.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); activate(); } });
})();

/* ===== Meta Pixel helper ===== */
function track(event, data){ if(typeof fbq==='function'){ fbq('track', event, data||{}); } }

/* ===== Validación + envío del formulario (solo si existe) ===== */
(function(){
  const form=document.getElementById('lead-form');
  if(!form) return;
  const okBox=document.getElementById('form-ok');

  function setError(id,show){
    const input=document.getElementById(id);
    const err=document.querySelector('.err[data-for="'+id+'"]');
    if(input) input.classList.toggle('invalid',show);
    if(err) err.classList.toggle('show',show);
  }
  const validators={
    name: v => v.trim().length>=2,
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
    phone: v => (v.replace(/\D/g,'').length===10)
  };
  ['name','email','phone'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.addEventListener('blur',()=>setError(id,!validators[id](el.value)));
    el.addEventListener('input',()=>{ if(el.classList.contains('invalid')) setError(id,!validators[id](el.value)); });
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(form.company && form.company.value) return; // honeypot

    let valid=true;
    ['name','email','phone'].forEach(id=>{
      const el=document.getElementById(id);
      if(!el) return;
      const ok=validators[id](el.value);
      setError(id,!ok);
      if(!ok) valid=false;
    });
    const consent=document.getElementById('consent');
    if(consent && !consent.checked){ setError('consent',true); consent.focus(); valid=false; }
    else { setError('consent',false); }
    if(!valid) return;

    const interestEl=document.getElementById('interest');
    const payload={
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.replace(/\D/g,''),
      interest: interestEl ? interestEl.value : (form.dataset.interest||'General'),
      source: form.dataset.source || 'landing-mar-vazquez',
      consent: consent ? consent.checked : true,
      ts: new Date().toISOString()
    };

    const btn=form.querySelector('button[type=submit]');
    const label=btn.textContent;
    btn.disabled=true; btn.textContent='Enviando...';

    // limpia mensaje de error de envío previo
    const prevErr=form.querySelector('.form-error'); if(prevErr) prevErr.remove();

    try{
      if(CONFIG.leadEndpoint){
        const res=await fetch(CONFIG.leadEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(!res.ok) throw new Error('HTTP '+res.status);
      }
      track('Lead',{content_name: payload.interest});
      form.style.display='none';
      if(okBox){
        okBox.classList.add('show');
        const cal=document.getElementById('calendly-link');
        if(cal){
          if(CONFIG.calendlyUrl){ cal.href=CONFIG.calendlyUrl; cal.target='_blank'; }
          else { cal.href='https://wa.me/'+CONFIG.whatsapp+'?text=Hola%20Mar%2C%20quiero%20agendar%20mi%20asesor%C3%ADa'; cal.target='_blank'; }
          cal.removeAttribute('onclick');
        }
        okBox.scrollIntoView({behavior:reduce?'auto':'smooth',block:'center'});
      }
    }catch(err){
      btn.disabled=false; btn.textContent=label;
      const box=document.createElement('div');
      box.className='form-error';
      box.setAttribute('role','alert');
      box.innerHTML='No se pudo enviar. Intenta de nuevo o escríbeme por <a href="https://wa.me/'+CONFIG.whatsapp+'" target="_blank" rel="noopener">WhatsApp</a>.';
      btn.insertAdjacentElement('afterend', box);
    }
  });
})();
