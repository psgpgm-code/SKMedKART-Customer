import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  collection,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  doc,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const K = 'skm_v10_';
const cfg = window.SKMED_FIREBASE_CONFIG || {};
const configured = !!(
  cfg.projectId &&
  !String(cfg.projectId).startsWith('PASTE_')
);

let db = null;
let storage = null;
let unsubOrders = null;
let unsubProducts = null;
let liveOrders = [];
let products = [];
let currentCat = 'All';
let deferredPrompt = null;

if (configured) {
  const app = initializeApp(cfg);
  db = getFirestore(app);
  storage = getStorage(app);
}

const seed = [
  {
    id: 'demo_dolo650',
    name: 'Dolo 650 Tablet',
    cat: 'Human Medicines',
    price: 30,
    rx: false,
    icon: '💊',
    stock: 50,
    active: true
  },
  {
    id: 'demo_pantop40',
    name: 'Pantop 40 Tablet',
    cat: 'Human Medicines',
    price: 55,
    rx: true,
    icon: '💊',
    stock: 30,
    active: true
  },
  {
    id: 'demo_cetirizine',
    name: 'Cetirizine 10 mg',
    cat: 'Human Medicines',
    price: 22,
    rx: false,
    icon: '💊',
    stock: 40,
    active: true
  }
];

const get = (k, d) => {
  try {
    return JSON.parse(
      localStorage.getItem(K + k) || JSON.stringify(d)
    );
  } catch {
    return d;
  }
};

const set = (k, v) =>
  localStorage.setItem(K + k, JSON.stringify(v));

const esc = s =>
  String(s ?? '').replace(
    /[&<>'"]/g,
    m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[m])
  );

const ts = v =>
  v?.toDate
    ? v.toDate().getTime()
    : new Date(v || 0).getTime();

const normCat = v => {
  const s = String(v || '')
    .trim()
    .toLowerCase();

  if (
    [
      'human medicines',
      'human medicine',
      'medicine',
      'medicines'
    ].includes(s)
  ) return 'Human Medicines';

  if (
    [
      'veterinary',
      'veterinary medicines',
      'vet'
    ].includes(s)
  ) return 'Veterinary';

  if (
    [
      'cosmetics',
      'cosmetic',
      'beauty'
    ].includes(s)
  ) return 'Cosmetics';

  if (
    [
      'health',
      'health & wellness',
      'health and wellness'
    ].includes(s)
  ) return 'Health';

  if (
    [
      'baby care',
      'baby'
    ].includes(s)
  ) return 'Baby Care';

  if (
    [
      'devices',
      'medical devices',
      'device'
    ].includes(s)
  ) return 'Devices';

  return String(v || '').trim();
};

const normalizeProduct = (d, id) => ({
  id,
  name: d.name || d.productName || 'Unnamed Product',
  cat: normCat(d.cat || d.category),
  price: Number(d.price ?? d.sellingPrice ?? 0) || 0,
  stock: Number(d.stock ?? d.quantity ?? 0) || 0,
  rx: !!(d.rx ?? d.prescriptionRequired),
  icon: d.icon || '💊',
  active: d.active !== false,
  ...d,
  id
});

function initLocalProducts() {
  let p = get('products', null);

  if (!Array.isArray(p)) {
    p = seed;
    set('products', p);
  }

  products = p.filter(x => x.active !== false);
}

function showNotice(msg, type = 'warning') {
  const n = document.getElementById('backendNotice');

  if (!n) return;

  if (!msg) {
    n.classList.add('hidden');
    return;
  }

  n.classList.remove('hidden');
  n.className = 'card ' + type;
  n.innerHTML = msg;
}

function initProductSync() {
  if (!configured) {
    initLocalProducts();
    renderProducts();

    showNotice(
      '<b>📱 Test mode</b><br><span class="small">Firebase is not configured.</span>'
    );

    return;
  }

  if (unsubProducts) {
    unsubProducts();
  }

  unsubProducts = onSnapshot(
    collection(db, 'products'),

    s => {
      products = s.docs
        .map(d => normalizeProduct(d.data(), d.id))
        .filter(p => p.active !== false);

      renderProducts();
      showNotice('');
    },

    e => {
      products = [];
      renderProducts();

      showNotice(
        '<b>⚠️ Products could not be loaded from Firebase.</b><br><span class="small">' +
        esc(e.message || 'Check Firestore rules.') +
        '</span>'
      );

      console.error(e);
    }
  );
}

async function loadProducts() {
  initProductSync();
}

function getProduct(id) {
  return products.find(p => p.id === id);
}


/* =========================
   PAGE NAVIGATION
========================= */

window.page = id => {
  document
    .querySelectorAll('.page')
    .forEach(x => x.classList.remove('active'));

  const el = document.getElementById(id);

  if (!el) return;

  el.classList.add('active');

  if (id === 'home') {
    currentCat = 'All';
    renderProducts();
  }

  if (id === 'catalogue') {
    renderProducts();
  }

  if (id === 'cart') {
    renderCart();
  }

  if (id === 'orders') {
    startOrders();
  }

  if (id === 'account') {
    renderAccount();
  }

  window.scrollTo(0, 0);
};

window.filterCat = c => {
  currentCat = normCat(c);

  const title = document.getElementById('catTitle');

  if (title) {
    title.textContent = currentCat + ' Catalogue';
  }

  page('catalogue');
};


/* =========================
   PRODUCTS
========================= */

window.renderProducts = () => {
  const q = (
    (
      document.getElementById('search')?.value ||
      ''
    ) +
    ' ' +
    (
      document.getElementById('catSearch')?.value ||
      ''
    )
  )
    .toLowerCase()
    .trim();

  const arr = products.filter(
    p =>
      (
        currentCat === 'All' ||
        normCat(p.cat) === currentCat
      ) &&
      (
        !q ||
        [p.name, p.cat]
          .join(' ')
          .toLowerCase()
          .includes(q)
      ) &&
      Number(p.stock || 0) > 0
  );

  const html =
    arr.map(p => `
      <div class="card product">
        <div class="pic">${esc(p.icon || '💊')}</div>

        <div class="info">
          <b>${esc(p.name)}</b>

          <div class="small">
            ${esc(normCat(p.cat))}
          </div>

          ${
            p.rx
              ? '<span class="badge rx">Prescription required</span>'
              : ''
          }

          <div class="price">
            ${
              Number(p.price) > 0
                ? '₹' + Number(p.price)
                : 'Price on confirmation'
            }
          </div>

          <div class="small">
            In stock: ${Number(p.stock || 0)}
          </div>
        </div>

        <button onclick="addCart('${esc(p.id)}')">
          Add
        </button>
      </div>
    `).join('') ||
    '<div class="card small">No products available in this category right now.</div>';

  const home = document.getElementById('products');
  const cat = document.getElementById('catalogueProducts');

  if (home) {
    home.innerHTML = currentCat === 'All' ? html : '';
  }

  if (cat) {
    cat.innerHTML = html;
  }
};


/* =========================
   CART
========================= */

function cart() {
  return get('cart', []);
}

function saveCart(c) {
  set('cart', c);
  updateCartBar();
}

window.addCart = id => {
  const p = getProduct(id);

  if (!p || Number(p.stock || 0) <= 0) {
    return alert('This product is currently unavailable.');
  }

  let c = cart();
  let x = c.find(z => z.id === p.id);

  if (x) {
    if (x.qty >= Number(p.stock)) {
      return alert('Only ' + p.stock + ' available.');
    }

    x.qty++;
  } else {
    c.push({
      id: p.id,
      name: p.name,
      cat: normCat(p.cat),
      price: Number(p.price) || 0,
      rx: !!p.rx,
      icon: p.icon,
      qty: 1
    });
  }

  saveCart(c);

  alert(p.name + ' added to cart.');
};

window.renderCart = () => {
  let c = cart();

  let box = document.getElementById('cartitems');

  if (!box) return;

  box.innerHTML = c.map((x, i) => `
    <div class="card row">
      <div>
        <b>${esc(x.name)}</b>

        <div class="small">
          ₹${x.price || 'On confirmation'} × ${x.qty}
        </div>
      </div>

      <div>
        <button
          class="secondary"
          onclick="changeQty(${i},-1)"
        >
          −
        </button>

        <b>${x.qty}</b>

        <button
          class="secondary"
          onclick="changeQty(${i},1)"
        >
          +
        </button>

        <button
          class="danger"
          onclick="removeCart(${i})"
        >
          Remove
        </button>
      </div>
    </div>
  `).join('');

  const empty = document.getElementById('emptycart');
  const totalBox = document.getElementById('total');

  if (empty) {
    empty.style.display = c.length ? 'none' : 'block';
  }

  if (totalBox) {
    totalBox.textContent = total(c);
  }
};

window.changeQty = (i, d) => {
  let c = cart();

  let p = getProduct(c[i].id);

  let max = Number(p?.stock || c[i].qty);

  c[i].qty = Math.min(max, c[i].qty + d);

  if (c[i].qty < 1) {
    c.splice(i, 1);
  }

  saveCart(c);
  renderCart();
};

window.removeCart = i => {
  let c = cart();

  c.splice(i, 1);

  saveCart(c);
  renderCart();
};

const total = c =>
  c.reduce(
    (s, x) =>
      s +
      (Number(x.price) || 0) *
      Number(x.qty || 0),
    0
  );

function updateCartBar() {
  let c = cart();

  let b = document.getElementById('cartbar');

  if (!b) return;

  if (!c.length) {
    b.style.display = 'none';
    return;
  }

  b.style.display = 'block';

  const cartsum = document.getElementById('cartsum');

  if (cartsum) {
    cartsum.textContent =
      c.reduce((s, x) => s + x.qty, 0) +
      ' item(s) • ₹' +
      total(c);
  }
}


/* =========================
   CUSTOMER LOGIN
========================= */

window.customerLogin = () => {
  let n = document
    .getElementById('loginName')
    .value
    .trim();

  let p = document
    .getElementById('loginPhone')
    .value
    .trim();

  if (
    !n ||
    !/^[0-9]{10}$/.test(p)
  ) {
    return alert(
      'Enter your name and valid 10-digit mobile number.'
    );
  }

  set('user', {
    name: n,
    phone: p
  });

  page('home');
};

window.goToCheckout = () => {
  if (!cart().length) {
    return alert('Your cart is empty.');
  }

  let u = get('user', null);

  if (!u) {
    alert('Please Login / Register first.');
    page('login');
    return;
  }

  document.getElementById('name').value =
    u.name || '';

  document.getElementById('phone').value =
    u.phone || '';

  page('checkout');
};


/* =========================
   TIMEOUT HELPER
========================= */

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,

    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              label +
              ' timed out. Please check your internet/Firebase settings and try again.'
            )
          ),
        ms
      )
    )
  ]);


/* =========================
   PRESCRIPTION UPLOAD
========================= */

async function uploadRx(file, phone) {
  if (!file) return null;

  if (!configured) {
    return {
      name: file.name,
      url: null,
      local: true
    };
  }

  if (!storage) {
    throw new Error(
      'Firebase Storage is not initialized.'
    );
  }

  const safe = file.name.replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  );

  const r = ref(
    storage,
    `prescriptions/${phone}/${Date.now()}_${safe}`
  );

  try {
    await uploadBytes(r, file);

    const url = await getDownloadURL(r);

    return {
      name: file.name,
      url
    };

  } catch (e) {
    throw new Error(
      'Prescription upload failed: ' +
      (e?.message || e)
    );
  }
}


/* =================================================
   FIRESTORE ORDER TRANSACTION - FIXED VERSION
   ALL READS FIRST → THEN ALL WRITES
================================================= */

async function createOnlineOrderAtomically(items, o) {

  const orderRef = doc(
    collection(db, 'orders')
  );

  await withTimeout(

    runTransaction(db, async tx => {

      /*
       * STEP 1
       * CREATE ALL PRODUCT REFERENCES
       */

      const productRows = items.map(item => ({
        item,
        productRef: doc(db, 'products', item.id)
      }));


      /*
       * STEP 2
       * READ EVERY PRODUCT FIRST.
       * NO WRITE IS EXECUTED HERE.
       */

      const readResults = await Promise.all(

        productRows.map(async row => {

          const productSnap =
            await tx.get(row.productRef);

          return {
            item: row.item,
            productRef: row.productRef,
            productSnap
          };

        })

      );


      /*
       * STEP 3
       * VALIDATE ALL PRODUCTS.
       * STILL NO WRITE HERE.
       */

      const updates = [];

      for (const row of readResults) {

        const x = row.item;
        const snap = row.productSnap;

        if (!snap.exists()) {
          throw new Error(
            x.name + ' is unavailable.'
          );
        }

        const p = normalizeProduct(
          snap.data(),
          snap.id
        );

        if (
          Number(p.stock) <
          Number(x.qty)
        ) {
          throw new Error(
            'Insufficient stock for ' +
            x.name
          );
        }

        updates.push({
          productRef: row.productRef,
          newStock:
            Number(p.stock) -
            Number(x.qty)
        });

      }


      /*
       * STEP 4
       * ALL READS ARE COMPLETELY FINISHED.
       * ONLY NOW START WRITING.
       */

      for (const update of updates) {

        tx.update(
          update.productRef,
          {
            stock: update.newStock,
            updatedAt: serverTimestamp()
          }
        );

      }


      /*
       * STEP 5
       * CREATE THE ORDER
       */

      tx.set(
        orderRef,
        o
      );

    }),

    30000,

    'Order submission'

  );

  return orderRef.id;
}


/* =========================
   PLACE ORDER
========================= */

window.placeOrder = async () => {

  const c = cart();

  const nameV = document
    .getElementById('name')
    .value
    .trim();

  const phoneV = document
    .getElementById('phone')
    .value
    .trim();

  const addressV = document
    .getElementById('address')
    .value
    .trim();

  const deliveryV =
    document.getElementById('delivery').value;

  const payV =
    document.getElementById('pay').value;


  if (!c.length) {
    return alert('Cart is empty.');
  }


  if (
    !nameV ||
    !/^[0-9]{10}$/.test(phoneV) ||
    (
      !addressV &&
      deliveryV === 'Home Delivery'
    )
  ) {
    return alert(
      'Please complete name, valid mobile number and delivery address.'
    );
  }


  const needsRx =
    c.some(x => x.rx);

  const file =
    document.getElementById('rxfile').files[0];


  if (
    needsRx &&
    !file
  ) {
    return alert(
      'Please upload the prescription for prescription-required medicine.'
    );
  }


  const active =
    document.activeElement;

  const btn =
    active?.tagName === 'BUTTON'
      ? active
      : document.querySelector(
          'button[onclick*="placeOrder"]'
        );

  const oldText =
    btn?.textContent ||
    'Place Order';


  try {

    if (btn) {
      btn.disabled = true;

      btn.textContent =
        needsRx
          ? 'Uploading Prescription...'
          : 'Placing Order...';
    }


    let rx = null;


    if (
      needsRx &&
      file
    ) {
      rx = {
        name: file.name,
        whatsapp: true
      };
    }


    if (btn) {
      btn.textContent =
        'Submitting Order...';
    }


    const status =
      needsRx
        ? 'Prescription Under Pharmacist Review'
        : 'Order Placed';


    const o = {

      orderNumber:
        'SKM' + Date.now(),

      customer: {
        name: nameV,
        phone: phoneV,
        address: addressV,
        delivery: deliveryV
      },

      payment: payV,

      paymentStatus:
        'Pending',

      items: c,

      total: total(c),

      status,

      needsRx,

      prescription: {
        ...(rx || {}),
        doctor:
          document
            .getElementById('doctor')
            .value
            .trim()
      },

      pharmacistNote: '',

      createdAt:
        configured
          ? serverTimestamp()
          : new Date().toISOString(),

      updatedAt:
        configured
          ? serverTimestamp()
          : new Date().toISOString(),

      timeline: [
        {
          status,
          note:
            'Order submitted by customer',
          at:
            new Date().toISOString()
        }
      ]
    };


    if (configured) {

      o.id =
        await createOnlineOrderAtomically(
          c,
          o
        );

    } else {

      const id =
        'LOCAL_' + Date.now();

      o.id = id;

      const arr =
        get('orders', []);

      arr.unshift(o);

      set('orders', arr);
    }


    set('cart', []);

    set('user', {
      name: nameV,
      phone: phoneV
    });

    updateCartBar();


    /*
     * PRESCRIPTION SHARE
     */

    if (
      needsRx &&
      file
    ) {

      const message =
        `Prescription for Order ${o.orderNumber}\n` +
        `Customer: ${nameV}\n` +
        `Phone: ${phoneV}\n\n` +
        `Please send the prescription image to Sri Krishna Medicals.`;

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({
          files: [file]
        })
      ) {

        try {

          await navigator.share({
            title:
              'Send Prescription',
            text:
              message,
            files:
              [file]
          });

        } catch (e) {}

      } else {

        window.open(
          'https://wa.me/918300363317?text=' +
          encodeURIComponent(message),
          '_blank'
        );

      }

    }


    alert(
      'Order placed successfully. Order ID: ' +
      o.orderNumber
    );

    page('orders');


  } catch (e) {

    console.error(
      'SKMedKART order error:',
      e
    );

    alert(
      'Order could not be submitted. ' +
      (
        e?.message ||
        'Please try again.'
      )
    );


  } finally {

    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }

  }

};


/* =========================
   CUSTOMER ORDERS
========================= */

function startOrders() {

  let u =
    get('user', null);

  if (!u) {
    renderOrders([]);
    return;
  }


  if (!configured) {

    renderOrders(

      get('orders', [])
        .filter(
          o =>
            o.customer?.phone ===
            u.phone
        )
        .sort(
          (a, b) =>
            ts(b.createdAt) -
            ts(a.createdAt)
        )

    );

    return;
  }


  if (unsubOrders) {
    unsubOrders();
  }


  unsubOrders = onSnapshot(

    query(
      collection(db, 'orders'),
      where(
        'customer.phone',
        '==',
        u.phone
      )
    ),

    s => {

      liveOrders =
        s.docs
          .map(
            d => ({
              id: d.id,
              ...d.data()
            })
          )
          .sort(
            (a, b) =>
              ts(b.createdAt) -
              ts(a.createdAt)
          );

      renderOrders(liveOrders);

    },

    e => {

      console.error(e);

      const box =
        document.getElementById(
          'ordersList'
        );

      if (box) {
        box.innerHTML =
          '<div class="card warning">' +
          'Unable to load orders: ' +
          esc(
            e.message ||
            'Check Firebase rules.'
          ) +
          '</div>';
      }

    }

  );

}

function renderOrders(arr) {

  let rank = [
    'Order Placed',
    'Prescription Under Pharmacist Review',
    'Confirmed',
    'Payment Pending',
    'Ready',
    'Out for Delivery',
    'Delivered'
  ];

  const box =
    document.getElementById(
      'ordersList'
    );

  if (!box) return;


  box.innerHTML =
    arr.map(o => `

      <div class="card">

        <b>
          ${esc(
            o.orderNumber ||
            o.id
          )}
        </b>

        <div class="status">
          <b>
            ${esc(o.status)}
          </b>
        </div>

        <div class="small">
          ${
            o.createdAt?.toDate
              ? o.createdAt
                  .toDate()
                  .toLocaleString()
              : esc(
                  o.createdAt ||
                  ''
                )
          }
        </div>

        <p>
          ${
            (o.items || [])
              .map(
                x =>
                  esc(x.name) +
                  ' × ' +
                  x.qty
              )
              .join(', ')
          }
        </p>

        <b>
          Total: ₹${o.total}
        </b>

        <p class="small">
          Payment:
          ${esc(o.payment)}
          •
          ${esc(o.paymentStatus)}
        </p>

        ${
          o.pharmacistNote
            ? `
              <div class="card note success">
                <b>Pharmacist message:</b>
                ${esc(o.pharmacistNote)}
              </div>
            `
            : ''
        }

        ${
          o.status ===
          'Payment Pending'
            ? `
              <button
                onclick="payOrder('${esc(o.id)}')"
              >
                Pay Now
              </button>
            `
            : ''
        }

        <div class="steps">

          ${
            rank.map(s => `

              <div class="${
                rank.indexOf(
                  o.status
                ) >=
                rank.indexOf(s)
                  ? 'done'
                  : ''
              }">

                ${
                  rank.indexOf(
                    o.status
                  ) >=
                  rank.indexOf(s)
                    ? '●'
                    : '○'
                }

                ${s}

              </div>

            `).join('')
          }

        </div>

        <button
          class="secondary"
          onclick="reorderById('${esc(o.id)}')"
        >
          Reorder
        </button>

      </div>

    `).join('') ||

    '<div class="card small">No orders yet.</div>';

}


window.payOrder = id => {

  const o =
    (
      configured
        ? liveOrders
        : get('orders', [])
    )
      .find(
        x => x.id === id
      );

  if (!o) return;

  const upi =
    window.SKMED_UPI_ID || '';

  if (!upi) {
    return alert(
      'Online payment is not configured by the pharmacy yet.'
    );
  }

  location.href =
    'upi://pay?' +
    'pa=' +
    encodeURIComponent(upi) +
    '&pn=' +
    encodeURIComponent(
      window.SKMED_UPI_NAME ||
      'Sri Krishna Medicals'
    ) +
    '&am=' +
    encodeURIComponent(o.total) +
    '&cu=INR' +
    '&tn=' +
    encodeURIComponent(
      o.orderNumber
    );

};


window.reorderById = id => {

  const o =
    (
      configured
        ? liveOrders
        : get('orders', [])
    )
      .find(
        x => x.id === id
      );

  if (!o) return;

  saveCart(

    (o.items || [])
      .map(
        x => ({
          ...x,
          qty:
            x.qty || 1
        })
      )

  );

  page('cart');

};


/* =========================
   ACCOUNT
========================= */

function renderAccount() {

  const u =
    get('user', null);

  const box =
    document.getElementById(
      'accountBox'
    );

  if (!box) return;

  box.innerHTML =
    u
      ? `
        <b>${esc(u.name)}</b>
        <br>
        <span class="small">
          ${esc(u.phone)}
        </span>
      `
      : `
        <button
          onclick="page('login')"
        >
          Login / Register
        </button>
      `;

}

window.logout = () => {
  localStorage.removeItem(
    K + 'user'
  );

  page('home');
};


/* =========================
   APP INSTALL
========================= */

window.addEventListener(
  'beforeinstallprompt',
  e => {

    e.preventDefault();

    deferredPrompt = e;

    const b =
      document.getElementById(
        'installBtn'
      );

    if (b) {
      b.classList.remove(
        'hidden'
      );
    }

  }
);


window.installApp = () => {

  if (deferredPrompt) {

    deferredPrompt.prompt();

    deferredPrompt.userChoice.then(
      () =>
        deferredPrompt = null
    );

  } else {

    alert(
      'Use Chrome ⋮ → Install app or Add to Home screen.'
    );

  }

};


/* =========================
   SERVICE WORKER
========================= */

if ('serviceWorker' in navigator) {

  window.addEventListener(
    'load',
    () =>
      navigator.serviceWorker.register(
        './service-worker.js'
      )
  );

}


/* =========================
   INITIAL LOAD
========================= */

loadProducts();
renderCart();
updateCartBar();
