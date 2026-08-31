import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, setDoc, getDocs, query, where, serverTimestamp, onSnapshot, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const K='skm_v11_';
const BUILTIN_FIREBASE_CONFIG={apiKey:'AIzaSyBdvOUiTVoBJHPE418iZqNzYftiN9yjooA',authDomain:'skmedkart.firebaseapp.com',projectId:'skmedkart',storageBucket:'skmedkart.firebasestorage.app',messagingSenderId:'921893232974',appId:'1:921893232974:web:45813196e59052e9597e1f'};
// ORDER RECEIVE FIX: Always use the shared SKMedKART Firebase project.
// Do not allow a stale firebase-config.js on an old deployment to redirect orders elsewhere.
const cfg=BUILTIN_FIREBASE_CONFIG;
const configured=!!(cfg.projectId&&!String(cfg.projectId).startsWith('PASTE_'));
let db=null,storage=null,auth=null,unsubOrders=null,liveOrders=[];
if(configured){const app=initializeApp(cfg);db=getFirestore(app);storage=getStorage(app);auth=getAuth(app)}

const seed=[
 {id:'demo_dolo650',name:'Dolo 650 Tablet',cat:'Human Medicines',price:30,rx:false,icon:'💊',stock:50,active:true},
 {id:'demo_pantop40',name:'Pantop 40 Tablet',cat:'Human Medicines',price:55,rx:true,icon:'💊',stock:30,active:true},
 {id:'demo_cetirizine',name:'Cetirizine 10 mg',cat:'Human Medicines',price:22,rx:false,icon:'💊',stock:40,active:true},
 {id:'demo_vetcalcium',name:'Veterinary Calcium Supplement',cat:'Veterinary',price:180,rx:false,icon:'🐄',stock:25,active:true},
 {id:'demo_deworm',name:'Cattle Deworming Medicine',cat:'Veterinary',price:0,rx:true,icon:'🐾',stock:10,active:true},
 {id:'demo_tickcare',name:'Dog Tick & Flea Care',cat:'Veterinary',price:420,rx:false,icon:'🐕',stock:18,active:true},
 {id:'demo_facewash',name:'Face Wash',cat:'Cosmetics',price:199,rx:false,icon:'💄',stock:35,active:true},
 {id:'demo_sunscreen',name:'Sunscreen SPF 50',cat:'Cosmetics',price:349,rx:false,icon:'☀️',stock:22,active:true},
 {id:'demo_shampoo',name:'Shampoo',cat:'Cosmetics',price:220,rx:false,icon:'🧴',stock:25,active:true},
 {id:'demo_vitamin',name:'Multivitamin Supplement',cat:'Health',price:299,rx:false,icon:'🩺',stock:30,active:true},
 {id:'demo_diaper',name:'Baby Diapers',cat:'Baby Care',price:399,rx:false,icon:'👶',stock:20,active:true},
 {id:'demo_thermo',name:'Digital Thermometer',cat:'Devices',price:180,rx:false,icon:'🌡️',stock:12,active:true}
];
let products=[],currentCat='All',deferredPrompt=null;
const get=(k,d)=>{try{return JSON.parse(localStorage.getItem(K+k)||JSON.stringify(d))}catch{return d}};
const set=(k,v)=>localStorage.setItem(K+k,JSON.stringify(v));
const USER_KEY='skmedkart_customer_profile';
function getUser(){try{
  const raw=localStorage.getItem(USER_KEY)||localStorage.getItem('skmedkart_customer_profile_v2')||localStorage.getItem('skmedkart_customer_profile_v1')||localStorage.getItem('skmedkart_customer_profile_v0')||localStorage.getItem(K+'user')||localStorage.getItem('skm_v10_user')||localStorage.getItem('skm_v9_user');
  return raw?JSON.parse(raw):null;
}catch{return null}}
function saveUser(u){
  const clean={name:String(u?.name||'').trim(),phone:String(u?.phone||'').trim(),savedAt:new Date().toISOString()};
  localStorage.setItem(USER_KEY,JSON.stringify(clean));
  localStorage.setItem('skmedkart_customer_profile_v2',JSON.stringify(clean));
  set('user',clean);
}
function clearUser(){localStorage.removeItem(USER_KEY);localStorage.removeItem('skmedkart_customer_profile_v2');localStorage.removeItem(K+'user');}
async function ensureCustomerAuth(){
  if(!configured||!auth)return null;
  if(auth.currentUser)return auth.currentUser;
  try{const cred=await signInAnonymously(auth);return cred.user}catch(e){console.warn('Anonymous customer auth unavailable:',e?.code||e?.message);return null}
}
const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
function ts(v){return v?.toDate?v.toDate().getTime():new Date(v||0).getTime()}
function initLocalProducts(){let p=get('products',null);if(!Array.isArray(p)){p=seed;set('products',p)}products=p.filter(x=>x.active!==false)}
function showNotice(){const n=document.getElementById('backendNotice');if(!configured){n.classList.remove('hidden');n.innerHTML='<b>📱 Test mode on this phone</b><br><span class="small">Checkout and Admin Portal work for testing. For live customer orders, stock and notifications across different phones, Firebase must be configured once.</span>'}}
async function loadProducts(){
 if(!configured){initLocalProducts();renderProducts();return}
 try{const s=await getDocs(collection(db,'products'));products=s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.active!==false);renderProducts()}catch(e){products=[];renderProducts();console.error(e)}
}
function getProduct(id){return products.find(p=>p.id===id)}

window.page=id=>{document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));const el=document.getElementById(id);if(!el)return;el.classList.add('active');if(id==='home'){currentCat='All';renderProducts()}if(id==='catalogue')renderProducts();if(id==='cart')renderCart();if(id==='orders')startOrders();if(id==='account')renderAccount();window.scrollTo(0,0)};
window.filterCat=c=>{currentCat=c;document.getElementById('catTitle').textContent=c+' Catalogue';page('catalogue')};
window.renderProducts=()=>{
 const q=((document.getElementById('search')?.value||'')+' '+(document.getElementById('catSearch')?.value||'')).toLowerCase().trim();
 const arr=products.filter(p=>(currentCat==='All'||p.cat===currentCat)&&(!q||[p.name,p.cat].join(' ').toLowerCase().includes(q))&&Number(p.stock||0)>0);
 const html=arr.map(p=>`<div class="card product"><div class="pic">${esc(p.icon||'💊')}</div><div class="info"><b>${esc(p.name)}</b><div class="small">${esc(p.cat)}</div>${p.rx?'<span class="badge rx">Prescription required</span>':''}<div class="price">${Number(p.price)>0?'₹'+Number(p.price):'Price on confirmation'}</div><div class="small">In stock: ${Number(p.stock||0)}</div></div><button onclick="addCart('${esc(p.id)}')">Add</button></div>`).join('')||'<div class="card small">No products available in this category right now.</div>';
 document.getElementById('products').innerHTML=currentCat==='All'?html:'';
 document.getElementById('catalogueProducts').innerHTML=html;
};
function cart(){return get('cart',[])}
function saveCart(c){set('cart',c);updateCartBar()}
window.addCart=id=>{const p=getProduct(id);if(!p||Number(p.stock||0)<=0)return alert('This product is currently unavailable.');let c=cart(),x=c.find(z=>z.id===p.id);if(x){if(x.qty>=Number(p.stock))return alert('Only '+p.stock+' available.');x.qty++}else c.push({id:p.id,name:p.name,cat:p.cat,price:Number(p.price)||0,rx:!!p.rx,icon:p.icon,qty:1});saveCart(c);alert(p.name+' added to cart.');};
window.renderCart=()=>{let c=cart(),box=document.getElementById('cartitems');box.innerHTML=c.map((x,i)=>`<div class="card row"><div><b>${esc(x.name)}</b><div class="small">₹${x.price||'On confirmation'} × ${x.qty}</div></div><div><button class="secondary" onclick="changeQty(${i},-1)">−</button><b>${x.qty}</b><button class="secondary" onclick="changeQty(${i},1)">+</button><button class="danger" onclick="removeCart(${i})">Remove</button></div></div>`).join('');document.getElementById('emptycart').style.display=c.length?'none':'block';document.getElementById('total').textContent=total(c)};
window.changeQty=(i,d)=>{let c=cart(),p=getProduct(c[i].id);let max=Number(p?.stock||c[i].qty);c[i].qty=Math.min(max,c[i].qty+d);if(c[i].qty<1)c.splice(i,1);saveCart(c);renderCart()};
window.removeCart=i=>{let c=cart();c.splice(i,1);saveCart(c);renderCart()};
const total=c=>c.reduce((s,x)=>s+(Number(x.price)||0)*Number(x.qty||0),0);
function updateCartBar(){let c=cart(),b=document.getElementById('cartbar');if(!b)return;if(!c.length){b.style.display='none';return}b.style.display='block';document.getElementById('cartsum').textContent=c.reduce((s,x)=>s+x.qty,0)+' item(s) • ₹'+total(c)}

window.customerLogin=()=>{let n=document.getElementById('loginName').value.trim(),p=document.getElementById('loginPhone').value.trim();if(!n||!/^[0-9]{10}$/.test(p))return alert('Enter your name and valid 10-digit mobile number.');saveUser({name:n,phone:p});page('home');};
window.goToCheckout=()=>{if(!cart().length)return alert('Your cart is empty.');let u=getUser();if(!u){alert('Please Login / Register first.');page('login');return}document.getElementById('name').value=u.name||'';document.getElementById('phone').value=u.phone||'';page('checkout')};
async function uploadRx(file,phone){if(!file)return null;if(!configured)return {name:file.name,url:null,local:true};const r=ref(storage,`prescriptions/${phone}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`);await uploadBytes(r,file);return {name:file.name,url:await getDownloadURL(r)}}
async function createOrderAtomically(items, orderData){
  // CUSTOMER APP MUST ONLY CREATE THE ORDER.
  // Stock changes are handled by the Admin Portal. A customer-side
  // transaction that tries to read/update products can be rejected by
  // Firestore rules and would prevent the order from reaching Admin.
  if(!configured){
    const id='LOCAL_'+Date.now();
    orderData.id=id;
    const arr=get('orders',[]);
    arr.unshift(orderData);
    set('orders',arr);
    set('adminAlerts',[{type:'New order',orderId:id,message:'New customer order '+orderData.orderNumber,at:new Date().toISOString(),read:false},...get('adminAlerts',[])]);
    return id;
  }

  // Authenticate anonymously when Firebase allows it. This keeps the customer
  // session stable and satisfies rules that require request.auth for customer writes.
  await ensureCustomerAuth();
  const orderNumber=String(orderData.orderNumber||('SKM'+Date.now()));
  const orderRef=doc(db,'orders',orderNumber);
  await setDoc(orderRef,orderData,{merge:false});
  const verify=await getDoc(orderRef);
  if(!verify.exists()) throw new Error('Order was not confirmed in the shared Firebase orders collection.');
  return orderNumber;
}

window.placeOrder=async()=>{
 const c=cart(),nameV=document.getElementById('name').value.trim(),phoneV=document.getElementById('phone').value.trim(),addressV=document.getElementById('address').value.trim(),deliveryV=document.getElementById('delivery').value,payV=document.getElementById('pay').value;
 if(!c.length)return alert('Cart is empty.');
 if(!nameV||!/^[0-9]{10}$/.test(phoneV)||(!addressV&&deliveryV==='Home Delivery'))return alert('Please complete name, valid mobile number and delivery address.');
 const needsRx=c.some(x=>x.rx),file=document.getElementById('rxfile').files[0];
 if(needsRx&&!file)return alert('Please upload the prescription for prescription-required medicine.');
 const btn=document.querySelector('button[onclick*="placeOrder"]')||document.activeElement;
 const oldText=btn?.textContent||'Place Order';
 try{
  if(btn){btn.disabled=true;btn.textContent=needsRx?'Uploading Prescription...':'Placing Order...'}

  // IMPORTANT: Never block order creation on prescription Storage upload.
  // The Firestore order is created first so Admin receives it immediately.
  const status=needsRx?'Prescription Under Pharmacist Review':'Order Placed';
  const o={
    orderNumber:'SKM'+Date.now(),
    customer:{name:nameV,phone:phoneV,address:addressV,delivery:deliveryV},
    payment:payV,
    paymentStatus:'Pending',
    items:c,
    total:total(c),
    status,
    needsRx,
    prescription:{doctor:document.getElementById('doctor').value.trim(),uploadStatus:needsRx?'Pending':'Not required'},
    pharmacistNote:'',
    createdAt:configured?serverTimestamp():new Date().toISOString(),
    updatedAt:configured?serverTimestamp():new Date().toISOString(),
    timeline:[{status,note:'Order submitted by customer',at:new Date().toISOString()}]
  };

  const id=await createOrderAtomically(c,o);
  o.id=id;

  // Keep a local copy immediately. This makes My Orders reliable even if
  // a customer read query is temporarily blocked by Firestore rules/network.
  const localOrder={...o,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const localOrders=get('orders',[]).filter(x=>x.id!==id);
  localOrders.unshift(localOrder);
  set('orders',localOrders.slice(0,50));
  liveOrders=[localOrder,...liveOrders.filter(x=>x.id!==id)];

  // Prescription upload happens AFTER the order exists in Firestore.
  // If Storage rules/network fail, the order is still received by Admin.
  let rx=null,rxError='';
  if(needsRx){
    if(btn)btn.textContent='Uploading Prescription...';
    try{
      rx=await uploadRx(file,phoneV);
      if(configured&&rx?.url) await updateDoc(doc(db,'orders',id),{prescription:{...rx,doctor:document.getElementById('doctor').value.trim(),uploadStatus:'Uploaded'},updatedAt:serverTimestamp()});
      else if(configured) await updateDoc(doc(db,'orders',id),{prescription:{doctor:document.getElementById('doctor').value.trim(),uploadStatus:'Upload failed'},updatedAt:serverTimestamp()});
      o.prescription={...(rx||{}),doctor:document.getElementById('doctor').value.trim(),uploadStatus:rx?.url?'Uploaded':'Upload failed'};
    }catch(err){
      rxError=err?.message||'Prescription upload failed';
      console.error('Prescription upload error:',err);
      try{if(configured)await updateDoc(doc(db,'orders',id),{prescription:{doctor:document.getElementById('doctor').value.trim(),uploadStatus:'Upload failed',error:rxError},updatedAt:serverTimestamp()})}catch(updateErr){console.error('Prescription status update failed:',updateErr)}
    }
  }

  const orderItems=c.map(x=>`• ${x.name} × ${x.qty}`).join('\n');
  const prescriptionMessage=rx?.url?`\n\n📋 *Prescription Link:*\n${rx.url}`:'';
  const message=`🛒 *New SKMedKART Order*\n\n🆔 *Order ID:* ${o.orderNumber}\n\n👤 *Customer:* ${nameV}\n📱 *Mobile:* ${phoneV}\n🏠 *Address:* ${addressV||'Store Pickup'}\n🚚 *Delivery:* ${deliveryV}\n💳 *Payment:* ${payV}\n\n📦 *Order Items:*\n${orderItems}\n\n💰 *Total: ₹${total(c)}*${prescriptionMessage}`;

  set('cart',[]);
  saveUser({name:nameV,phone:phoneV});
  updateCartBar();

  // Direct WhatsApp URL only. No browser share sheet or Android share intent.
  const whatsappUrl='https://api.whatsapp.com/send?phone=918300363317&text='+encodeURIComponent(message);
  window.location.href=whatsappUrl;

 }catch(e){
  console.error('SKMedKART order error:',e);
  alert('Order could not be submitted: '+(e?.message||'Please try again.'));
 }finally{
  if(btn){btn.disabled=false;btn.textContent=oldText}
 }
};

function startOrders(){
 let u=getUser();
 if(!u){renderOrders([]);return}
 const local=get('orders',[]).filter(o=>o.customer?.phone===u.phone).sort((a,b)=>ts(b.createdAt)-ts(a.createdAt));
 liveOrders=local;
 renderOrders(local);
 if(!configured)return;
 // Customer order history must never disappear because a Firestore read rule
 // rejects a customer query. Local confirmed orders remain visible.
 ensureCustomerAuth().catch(()=>{});
 if(unsubOrders)unsubOrders();
 try{
   unsubOrders=onSnapshot(query(collection(db,'orders'),where('customer.phone','==',u.phone)),s=>{
     const remote=s.docs.map(d=>({id:d.id,...d.data()}));
     const remoteIds=new Set(remote.map(x=>x.id));
     const keepLocal=local.filter(x=>!remoteIds.has(x.id));
     liveOrders=[...remote,...keepLocal].sort((a,b)=>ts(b.createdAt)-ts(a.createdAt));
     renderOrders(liveOrders);
     set('orders',liveOrders.slice(0,50));
   },e=>{console.warn('Customer orders read unavailable; keeping local history:',e?.code||e?.message);renderOrders(liveOrders)});
 }catch(e){console.warn('Customer orders listener unavailable:',e)}
}

function renderOrders(arr){let rank=['Order Placed','Prescription Under Pharmacist Review','Confirmed','Payment Pending','Ready','Out for Delivery','Delivered'];document.getElementById('ordersList').innerHTML=arr.map(o=>`<div class="card"><b>${esc(o.orderNumber||o.id)}</b><div class="status"><b>${esc(o.status)}</b></div><div class="small">${o.createdAt?.toDate?o.createdAt.toDate().toLocaleString():esc(o.createdAt||'')}</div><p>${(o.items||[]).map(x=>esc(x.name)+' × '+x.qty).join(', ')}</p><b>Total: ₹${o.total}</b><p class="small">Payment: ${esc(o.payment)} • ${esc(o.paymentStatus)}</p>${o.pharmacistNote?'<div class="card note success"><b>Pharmacist message:</b> '+esc(o.pharmacistNote)+'</div>':''}${o.status==='Payment Pending'?`<button onclick="payOrder('${esc(o.id)}')">Pay Now</button>`:''}<div class="steps">${rank.map(s=>`<div class="${rank.indexOf(o.status)>=rank.indexOf(s)?'done':''}">${rank.indexOf(o.status)>=rank.indexOf(s)?'●':'○'} ${s}</div>`).join('')}</div><button class="secondary" onclick="reorderById('${esc(o.id)}')">Reorder</button></div>`).join('')||'<div class="card small">No orders yet.</div>'}
window.payOrder=id=>{const o=(configured?liveOrders:get('orders',[])).find(x=>x.id===id);if(!o)return;const upi=window.SKMED_UPI_ID||'';if(!upi)return alert('Online payment is not configured by the pharmacy yet.');location.href='upi://pay?pa='+encodeURIComponent(upi)+'&pn='+encodeURIComponent(window.SKMED_UPI_NAME||'Sri Krishna Medicals')+'&am='+encodeURIComponent(o.total)+'&cu=INR&tn='+encodeURIComponent(o.orderNumber)};
window.reorderById=id=>{const o=(configured?liveOrders:get('orders',[])).find(x=>x.id===id);if(!o)return;saveCart((o.items||[]).map(x=>({...x,qty:x.qty||1})));page('cart')};
function renderAccount(){const u=getUser();document.getElementById('accountBox').innerHTML=u?`<b>${esc(u.name)}</b><br><span class="small">${esc(u.phone)}</span>`:'<button onclick="page(\'login\')">Login / Register</button>'}
window.logout=()=>{clearUser();page('home')};
// Keep customer registration across refreshes and app updates.
// Older versions used a versioned localStorage key; migrate it once.
(function restoreCustomerProfile(){
  try{
    const u=getUser();
    if(u&&u.name&&u.phone) saveUser(u);
  }catch(e){console.warn('Customer profile restore:',e)}
})();

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;const b=document.getElementById('installBtn');if(b)b.classList.remove('hidden')});
window.installApp=()=>{if(deferredPrompt){deferredPrompt.prompt();deferredPrompt.userChoice.then(()=>deferredPrompt=null)}else alert('Use Chrome ⋮ → Install app or Add to Home screen.')};
if('serviceWorker' in navigator) window.addEventListener('load',()=>{ navigator.serviceWorker.register('./service-worker.js?v=12').catch(e=>console.warn('SKMedKART SW register:',e)); });
showNotice();loadProducts();renderCart();updateCartBar();
