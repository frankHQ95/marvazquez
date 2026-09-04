/* ============================================================
   Mar Vazquez Finanzas — Script compartido
   Reutilizable en todas las páginas (home, PLUS, VIDA, EDUCATIVO, Webinar).
   Cada bloque valida que sus elementos existan antes de inicializar.
   ============================================================ */

/* ===== CONFIG (reemplazar en producción) ===== */
const CONFIG = {
  whatsapp: '525561307667',
  calendlyUrl: '', // p.ej. 'https://calendly.com/marvazquez/asesoria'

  /* Destino de los leads. Hoy el único destino es el webhook de Make; desde
     ahí se mandan a Google Sheets. Supabase queda APAGADO por decisión del
     cliente (2026-09-03): el código sigue aquí para poder reactivarlo con un
     solo cambio, pero mientras `guardarEnSupabase` sea false no se escribe
     una sola fila. Un lead se da por capturado sólo si Make responde bien;
     si falla, el formulario muestra error en vez de un "gracias" falso. */
  guardarEnSupabase: false,
  leadsTabla: 'leads',
  makeWebhook: 'https://hook.us2.make.com/8avpyry2d1t24xjgweav2rnjpc3s11t6',
  graciasUrl: 'gracias.html',

  /* Aviso de actividad reciente. El número SIEMPRE sale de la base: es un
     conteo real de solicitudes, nunca una cifra escrita a mano. Si el RPC no
     existe o falla, el aviso simplemente no aparece. Ver README-avisos.md. */
  supabaseUrl: 'https://waojkmqvyorojgaymnee.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhb2prbXF2eW9yb2pnYXltbmVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDYyODMsImV4cCI6MjA5NDE4MjI4M30.HNwmN_fw5_5a2Mmimqlc1s0crCtO9YGX5K0s0ulZNoA',
  avisoRpc: 'leads_ultimos_7_dias',
  avisoMinimo: 3,      // debajo de esto no se muestra: no es prueba social
  avisoDelayMs: 12000  // aparece tras leer un rato, no al aterrizar
};

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ===== Videos de fondo (hero y secciones) =====
   Pesan MB, así que NUNCA se descargan durante la carga inicial: cada sección
   se ve completa sin ellos y el video sólo entra encima si sobra ancho de
   banda. Se saltan en reduced-motion, con Ahorro de datos activo y en
   conexiones 2G/3G. Cada uno declara su archivo en `data-bg-video`. */
(function(){
  const videos = document.querySelectorAll('[data-bg-video]');
  if(!videos.length || reduce) return;

  const con = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if(con){
    if(con.saveData) return;
    if(/(^|-)2g$|^3g$/.test(con.effectiveType || '')) return;
  }

  function cargar(v){
    if(v.src) return;
    v.src = v.dataset.bgVideo;
    v.addEventListener('canplay', () => v.classList.add('ready'), {once:true});
    const p = v.play();
    if(p && p.catch) p.catch(() => {}); /* autoplay bloqueado: se queda el fondo base */
  }

  /* Cada video se descarga cuando su sección se acerca a pantalla, no antes:
     el del hero entra enseguida, el de "Qué hago por ti" sólo si el visitante
     baja hasta ahí. Quien rebota en el hero nunca paga ese MB. */
  function observar(){
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach(e => {
        if(e.isIntersecting){ cargar(e.target); io.unobserve(e.target); }
      });
    },{rootMargin:'200px 0px'});
    videos.forEach(v => io.observe(v));
  }

  /* Después de load: primero el contenido que convierte, luego el adorno. */
  if(document.readyState === 'complete') observar();
  else window.addEventListener('load', observar, {once:true});
})();

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

    /* Fila para Supabase. Los nombres de columna son los de la tabla `leads`
       que ya alimenta plus.html — no inventar campos nuevos aquí. */
    const fila = {
      nombre:   payload.name,
      correo:   payload.email,
      whatsapp: '52' + payload.phone,
      fuente:   payload.source,
      estatus:  'nuevo',
      notas:    'Interés: ' + payload.interest
    };

    async function aSupabase(){
      const res = await fetch(CONFIG.supabaseUrl + '/rest/v1/' + CONFIG.leadsTabla, {
        method:'POST',
        headers:{
          'apikey': CONFIG.supabaseAnonKey,
          'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey,
          'Content-Type':'application/json',
          'Prefer':'return=minimal'
        },
        body: JSON.stringify([fila])
      });
      if(!res.ok) throw new Error('supabase HTTP ' + res.status);
    }

    async function aMake(){
      if(!CONFIG.makeWebhook) throw new Error('sin webhook');
      const res = await fetch(CONFIG.makeWebhook, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if(!res.ok) throw new Error('make HTTP ' + res.status);
    }

    try{
      /* allSettled, no all: si algún día vuelven a estar los dos destinos,
         que uno falle no debe tirar el lead que el otro sí guardó. Solo si
         TODOS fallan hay error real. */
      const destinos = [aMake()];
      if(CONFIG.guardarEnSupabase) destinos.push(aSupabase());
      const envios = await Promise.allSettled(destinos);
      if(!envios.some(r => r.status === 'fulfilled')){
        throw new Error(envios.map(r => r.reason && r.reason.message).join(' · '));
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

      /* Pequeña pausa para que el Pixel alcance a registrar el Lead antes de
         cambiar de página. El nombre viaja para personalizar el saludo. */
      if(CONFIG.graciasUrl){
        const primerNombre = encodeURIComponent(payload.name.split(' ')[0] || '');
        setTimeout(function(){
          window.location.href = CONFIG.graciasUrl + (primerNombre ? ('?nombre=' + primerNombre) : '');
        }, 700);
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

/* ===== Plazo de deducibilidad =====
   Las aportaciones a un PPR deben hacerse antes del 31 de diciembre para
   deducirse en la declaración de ese ejercicio. Se calcula al vuelo (nunca se
   escribe a mano) para que la cifra sea siempre cierta y nunca se quede vieja.
   La banda nace oculta: si el JS no corre, no se muestra un dato a medias. */
(function(){
  const bandas = document.querySelectorAll('[data-plazo]');
  if(!bandas.length) return;

  const hoy   = new Date();
  const anio  = hoy.getFullYear();
  const desde = Date.UTC(anio, hoy.getMonth(), hoy.getDate());
  const hasta = Date.UTC(anio, 11, 31);
  const dias  = Math.round((hasta - desde) / 86400000);
  if(dias < 0) return;

  const texto = dias === 0
    ? 'Hoy es el último día para que tus aportaciones cuenten en tu declaración de ' + anio + '.'
    : dias === 1
      ? 'Mañana vence el plazo para que tus aportaciones cuenten en tu declaración de ' + anio + '.'
      : 'Quedan <b>' + dias + ' días</b> para que tus aportaciones a un Plan Personal de Retiro cuenten en tu declaración de ' + anio + '.';

  bandas.forEach(function(b){
    const slot = b.querySelector('[data-plazo-texto]');
    if(slot) slot.innerHTML = texto;
    b.hidden = false;
  });
})();

/* ===== Aviso de actividad reciente (pop-up) =====
   Prueba social honesta: el número es un conteo real de solicitudes de los
   últimos 7 días, devuelto por un RPC de Supabase que expone SOLO un entero
   (ningún dato personal). Reglas de diseño:
     - Si el RPC no responde, o el conteo es bajo, el aviso no se muestra.
       Nunca hay un número de respaldo inventado.
     - Una sola vez por sesión y descartable.
     - Entra por abajo a la izquierda, para no tapar el botón de WhatsApp. */
(function(){
  /* Si los leads ya no entran a Supabase, este conteo deja de crecer y en
     unos días estaría afirmando algo falso. Mientras la escritura esté
     apagada, el aviso no se muestra: antes ningún aviso que un número
     inventado. Volverá solo cuando `guardarEnSupabase` vuelva a ser true. */
  if(!CONFIG.guardarEnSupabase) return;
  if(!CONFIG.supabaseUrl || !CONFIG.avisoRpc) return;
  if(sessionStorage.getItem('aviso-visto')) return;

  function pintar(n){
    const box = document.createElement('div');
    box.className = 'aviso';
    box.setAttribute('role','status');
    box.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>' +
      '<p><b>' + n + ' profesionistas</b> solicitaron su propuesta en los últimos 7 días.</p>' +
      '<button type="button" aria-label="Cerrar aviso">&times;</button>';

    box.querySelector('button').addEventListener('click', function(){
      box.classList.remove('show');
      setTimeout(function(){ box.remove(); }, 300);
    });

    document.body.appendChild(box);
    requestAnimationFrame(function(){ box.classList.add('show'); });
    sessionStorage.setItem('aviso-visto','1');
  }

  setTimeout(function(){
    fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/' + CONFIG.avisoRpc, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.supabaseAnonKey,
        'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey,
        'Content-Type': 'application/json'
      },
      body: '{}'
    })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(n){
      if(typeof n === 'number' && n >= CONFIG.avisoMinimo) pintar(n);
    })
    .catch(function(){ /* sin dato real, sin aviso */ });
  }, CONFIG.avisoDelayMs);
})();
