const m=document.querySelector('.menu'),n=document.querySelector('.navlinks');if(m&&n){m.addEventListener('click',()=>{const o=n.classList.toggle('open');m.setAttribute('aria-expanded',String(o));m.setAttribute('aria-label',o?'Close navigation':'Open navigation');m.textContent=o?'×':'☰'});n.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{n.classList.remove('open');m.setAttribute('aria-expanded','false');m.setAttribute('aria-label','Open navigation');m.textContent='☰'}));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&n.classList.contains('open')){n.classList.remove('open');m.setAttribute('aria-expanded','false');m.setAttribute('aria-label','Open navigation');m.textContent='☰';m.focus()}})}document.querySelectorAll('[data-year]').forEach(e=>e.textContent=new Date().getFullYear());

const pagePath=window.location.pathname.replace(/\\/$/,'')||'/';
const crumbPages={
'/platform.html':{label:'Platform'},
'/solutions.html':{label:'Solutions'},
'/hotels-lodges.html':{parent:'Solutions',parentHref:'/solutions.html',label:'Hotels & lodges'},
'/apartments-rentals.html':{parent:'Solutions',parentHref:'/solutions.html',label:'Apartments & rentals'},
'/commercial-properties.html':{parent:'Solutions',parentHref:'/solutions.html',label:'Commercial properties'},
'/property-portfolios.html':{parent:'Solutions',parentHref:'/solutions.html',label:'Property portfolios'},
'/pricing.html':{label:'Pricing'},
'/about.html':{label:'About'},
'/contact.html':{label:'Contact'}
};
const crumb=crumbPages[pagePath],main=document.querySelector('main');
if(crumb&&main){
 const nav=document.createElement('nav');nav.className='breadcrumbs wrap';nav.setAttribute('aria-label','Breadcrumb');
 const home=document.createElement('a');home.href='/';home.textContent='Home';nav.append(home);
 if(crumb.parent){const sep=document.createElement('span');sep.className='breadcrumb-separator';sep.setAttribute('aria-hidden','true');sep.textContent='/';nav.append(sep);const parent=document.createElement('a');parent.href=crumb.parentHref;parent.textContent=crumb.parent;nav.append(parent);}
 const sep=document.createElement('span');sep.className='breadcrumb-separator';sep.setAttribute('aria-hidden','true');sep.textContent='/';nav.append(sep);
 const current=document.createElement('span');current.setAttribute('aria-current','page');current.textContent=crumb.label;nav.append(current);
 main.before(nav);
}