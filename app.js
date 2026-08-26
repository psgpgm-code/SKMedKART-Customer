import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, query, where, serverTimestamp, onSnapshot, doc, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const K='skm_v10_';
const cfg=window.SKMED_FIREBASE_CONFIG||{};
const configured=!!(cfg.projectId&&!String(cfg.projectId).startsWith('PASTE_'));
let db=null,storage=null,unsubOrders=null,unsubProducts=null,liveOrders=[],products=[],currentCat='All',deferredPrompt=null;
if(configured){const app=initializeApp(cfg);db=getFirestore(app);storage=getStorage(app)}

const seed=[
 {id:'demo_dolo650',name:'Dolo 650 Tablet',cat:'Human Medicines',price:30,rx:false,icon:'💊',stock:50,active:true},
 {id:'demo_pantop40',name:'Pantop 40 Tablet',cat:'Human Medicines',price:55,rx:true,icon:'💊',stock:30,active:true},
 {id:'demo_cetirizine',name:'Cetirizine 10 mg',cat:'Human Medicines',price:22,rx:false,icon:'💊',stock:40,active:true}
];

const get=(k,d)=>{
 try{return JSON.parse(localStorage.getItem(K+k)||JSON.stringify(d))}
 catch{return d}
};

const set=(k,v)=>localStorage.setItem(K+k,JSON.stringify(v));

const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({
 '&':'&amp;',
 '<':'&lt;',
 '>':'&gt;',
 "'":'&#39;',
 '"':'&quot;'
}[m]));

const ts=v=>v?.toDate?v.toDate().getTime():new Date(v||0).getTime();

const normCat=v=>{
 const s=String(v||'').trim().toLowerCase();
 if(['human medicines','human medicine','medicine','medicines'].includes(s))return 'Human Medicines';
 if(['veterinary','veterinary medicines','vet'].includes(s))return 'Veterinary';
 if(['cosmetics','cosmetic','beauty'].includes(s))return 'Cosmetics';
 if(['health','health & wellness','health and wellness'].includes(s))return 'Health';
 if(['baby care','baby'].includes(s))return 'Baby Care';
 if(['devices','medical devices','device'].includes(s))return 'Devices';
 return String(v||'').trim()
};

const normalizeProduct=(d,id)=>({
 id,
 name:d.name||d.productName||'Unnamed Product',
 cat:normCat(d.cat||d.category),
 price:Number(d.price??d.sellingPrice??0)||0,
 stock:Number(d.stock??d.quantity??0)||0,
 rx:!!(d.rx??d.prescriptionRequired),
 icon:d.icon||'💊',
 active:d.active!==false,
 ...d,
 id
});

function initLocalProducts(){
 let p=get('products',null);
 if(!Array.isArray(p)){
  p=seed;
  set('products',p)
 }
 products=p.filter(x=>x.active!==false)
}

function showNotice(msg,type='warning'){
 const n=document.getElementById('backendNotice');
 if(!n)return;
 if(!msg){
  n.classList.add('hidden');
  return
 }
 n.classList.remove('hidden');
 n.className='card '+type;
 n.innerHTML=msg
}

function initProductSync(){
 if(!configured){
  initLocalProducts();
  renderProducts();
  showNotice('<b>📱 Test mode</b><br><span class="small">Firebase is not configured.</span>');
  return
 }

 if(unsubProducts)unsubProducts();

 unsubProducts=onSnapshot(collection(db,'products'),s=>{
  products=s.docs.map(d=>normalizeProduct(d.data(),d.id)).filter(p=>p.active!==false);
  renderProducts();
  showNotice('');
 },e=>{
  products=[];
  renderProducts();
  showNotice('<b>⚠️ Products could not be loaded from Firebase.</b><br><span class="small">'+esc(e.message||'Check Firestore rules.')+'</span>');
  console.error(e);
 });
}

async function loadProducts(){
 if(configured)initProductSync();
 else initProductSync()
}

function getProduct(id){
 return products.find(p=>p.id===id)
}

window.page=id=>{
 document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
 const el=document.getElementById(id);
 if(!el)return;
 el.classList.add('active');

 if(id==='home'){
  currentCat='All';
  renderProducts()
 }

 if(id==='catalogue')renderProducts();
 if(id==='cart')renderCart();
 if(id==='orders')startOrders();
 if(id==='account')renderAccount();

 window.scrollTo(0,0)
};

window.filterCat=c=>{
 currentCat=normCat(c);
 document.getElementById('catTitle').textContent=currentCat+' Catalogue';
 page('catalogue')
};

window.renderProducts=()=>{
 const q=(
  (document.getElementById('search')?.value||'')+' '+
  (document.getElementById('catSearch')?.value||'')
 ).toLowerCase().trim();

 const arr=products.filter(p=>
  (currentCat==='All'||normCat(p.cat)===currentCat)&&
  (!q||[p.name,p.cat].join(' ').toLowerCase().includes(q))&&
  Number(p.stock||0)>0
 );

 const html=arr.map(p=>`
  <div class="card product">
   <div class="pic">${esc(p.icon||'💊')}</div>
   <div class="info">
    <b>${esc(p.name)}</b>
    <div class="small">${esc(normCat(p.cat))}</div>
    ${p.rx?'<span class="badge rx">Prescription required</span>':''}
    <div class="price">${Number(p.price)>0?'₹'+Number(p.price):'Price on confirmation'}</div>
    <div class="small">In stock: ${Number(p.stock||0)}</div>
   </div>
   <button onclick="addCart('${esc(p.id)}')">Add</button>
  </div>
 `).join('')||'<div class="card small">No products available in this category right now.</div>';

 const home=document.getElementById('products');
 const cat=document.getElementById('catalogueProducts');

 if(home)home.innerHTML=currentCat==='All'?html:'';
 if(cat)cat.innerHTML=html;
};

function cart(){
 return get('cart',[])
}

function saveCart(c){
 set('cart',c);
 updateCartBar()
}

window.addCart=id=>{
 const p=getProduct(id);

 if(!p||Number(p.stock||0)<=0){
  return alert('This product is currently unavailable.')
 }

 let c=cart();
 let x=c.find(z=>z.id===p.id);

 if(x){
  if(x.qty>=Number(p.stock)){
   return alert('Only '+p.stock+' available.')
  }
  x.qty++
 }else{
  c.push({
   id:p.id,
   name:p.name,
   cat:normCat(p.cat),
   price:Number(p.price)||0,
   rx:!!p.rx,
   icon:p.icon,
   qty:1
  })
 }

 saveCart(c);
 alert(p.name+' added to cart.');
};

window.renderCart=()=>{
 let c=cart();
 let box=document.getElementById('cartitems');

 box.innerHTML=c.map((x,i)=>`
  <div class="card row">
   <div>
    <b>${esc(x.name)}</b>
    <div class="small">₹${x.price||'On confirmation'} × ${x.qty}</div>
   </div>
   <div>
    <button class="secondary" onclick="changeQty(${i},-1)">−</button>
    <b>${x.qty}</b>
    <button class="secondary" onclick="changeQty(${i},1)">+</button>
    <button class="danger" onclick="removeCart(${i})">Remove</button>
   </div>
  </div>
 `).join('');

 document.getElementById('emptycart').style.display=c.length?'none':'block';
 document.getElementById('total').textContent=total(c)
};

window.changeQty=(i,d)=>{
 let c=cart();
 let p=getProduct(c[i].id);
 let max=Number(p?.stock||c[i].qty);

 c[i].qty=Math.min(max,c[i].qty+d);

 if(c[i].qty<1)c.splice(i,1);

 saveCart(c);
 renderCart()
};

window.removeCart=i=>{
 let c=cart();
 c.splice(i,1);
 saveCart(c);
 renderCart()
};

const total=c=>c.reduce((s,x)=>s+(Number(x.price)||0)*Number(x.qty||0),0);

function updateCartBar(){
 let c=cart();
 let b=document.getElementById('cartbar');

 if(!b)return;

 if(!c.length){
  b.style.display='none';
  return
 }

 b.style.display='block';

 document.getElementById('cartsum').textContent=
  c.reduce((s,x)=>s+x.qty,0)+' item(s) • ₹'+total(c)
}

window.customerLogin=()=>{
 let n=document.getElementById('loginName').value.trim();
 let p=document.getElementById('loginPhone').value.trim();

 if(!n||!/^[0-9]{10}$/.test(p)){
  return alert('Enter your name and valid 10-digit mobile number.')
 }

 set('user',{name:n,phone:p});
 page('home')
};

window.goToCheckout=()=>{
 if(!cart().length)return alert('Your cart is empty.');

 let u=get('user',null);

 if(!u){
  alert('Please Login / Register first.');
  page('login');
  return
 }

 document.getElementById('name').value=u.name||'';
 document.getElementById('phone').value=u.phone||'';

 page('checkout')
};

const withTimeout=(promise,ms,label)=>Promise.race([
 promise,
 new Promise((_,reject)=>
  setTimeout(
   ()=>reject(new Error(label+' timed out. Please check your internet/Firebase settings and try again.')),
   ms
  )
 )
]);

async function uploadRx(file,phone){
 if(!file)return null;

 if(!configured)return {
  name:file.name,
  url:null,
  local:true
 };

 if(!storage){
  throw new Error('Firebase Storage is not initialized.')
 }

 const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');

 const r=ref(
  storage,
  `prescriptions/${phone}/${Date.now()}_${safe}`
 );

 try{
  await uploadBytes(r,file);
  const url=await getDownloadURL(r);
  return {name:file.name,url}
 }catch(e){
  throw new Error(
   'Prescription upload failed: '+(e?.message||e)
  )
 }
}

async function createOnlineOrderAtomically(items,o){
 const orderRef=doc(collection(db,'orders'));

 await withTimeout(
  runTransaction(db,async tx=>{
   const productRefs=items.map(x=>({
    x,
    r:doc(db,'products',x.id)
   }));

   const snaps=[];

   for(const item of productRefs){
    snaps.push({
     item,
     snap:await tx.get(item.r)
    })
   }

   for(const {item,snap} of snaps){
    const x=item.x;

    if(!snap.exists()){
     throw new Error(x.name+' is unavailable.')
    }

    const p=normalizeProduct(snap.data(),snap.id);

    if(Number(p.stock)<Number(x.qty)){
     throw new Error('Insufficient stock for '+x.name)
    }
   }

   for(const {item,snap} of snaps){
    const x=item.x;
    const p=normalizeProduct(snap.data(),snap.id);

    tx.update(item.r,{
     stock:Number(p.stock)-Number(x.qty),
     updatedAt:serverTimestamp()
    });
   }

   tx.set(orderRef,o);
  }),
