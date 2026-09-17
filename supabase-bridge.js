/* SKMedKART Customer - Supabase Catalogue Bridge
   TEST BRANCH ONLY

   Supabase:
   - Public product catalogue only

   Firebase:
   - Customer orders
   - Prescription
   - My Orders
   - Existing order → Admin flow

   Do NOT move order creation to Supabase in this test.
*/

import { createClient } from
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL =
  'https://uyobhzkcvfnrioppwkrv.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_5zmngPN80O2CPgtNhGNhEQ_elEQpz9E';

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let supabaseProducts = [];
let supabaseLoaded = false;


/* ---------- Helpers ---------- */

const esc = (value) =>
  String(value ?? '').replace(/[&<>'"]/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[m]));


function getCart() {
  try {
    return JSON.parse(
      localStorage.getItem('skm_v11_cart') || '[]'
    );
  } catch {
    return [];
  }
}


function saveCart(cart) {
  localStorage.setItem(
    'skm_v11_cart',
    JSON.stringify(cart)
  );

  if (typeof window.renderCart === 'function') {
    window.renderCart();
  }

  updateCartBar();
}


function updateCartBar() {
  const bar = document.getElementById('cartbar');
  const sum = document.getElementById('cartsum');

  if (!bar) return;

  const cart = getCart();

  if (!cart.length) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'block';

  const qty = cart.reduce(
    (total, item) =>
      total + Number(item.qty || 0),
    0
  );

  const amount = cart.reduce(
    (total, item) =>
      total +
      (Number(item.price) || 0) *
      Number(item.qty || 0),
    0
  );

  if (sum) {
    sum.textContent =
      qty + ' item(s) • ₹' + amount;
  }
}


/* ---------- Catalogue Rendering ---------- */

function getCurrentCategory() {
  const title =
    document.getElementById('catTitle')?.textContent || '';

  if (title.endsWith(' Catalogue')) {
    return title.slice(0, -10);
  }

  return 'All';
}


function getSearchText() {
  const a =
    document.getElementById('search')?.value || '';

  const b =
    document.getElementById('catSearch')?.value || '';

  return (a + ' ' + b)
    .toLowerCase()
    .trim();
}


function renderSupabaseProducts() {
  if (!supabaseLoaded) return;

  const category = getCurrentCategory();
  const search = getSearchText();

  const products =
    supabaseProducts.filter((product) => {

      if (product.active === false) {
        return false;
      }

      if (Number(product.stock || 0) <= 0) {
        return false;
      }

      if (
        category !== 'All' &&
        product.category !== category
      ) {
        return false;
      }

      if (search) {
        const text =
          [
            product.name,
            product.category
          ]
            .join(' ')
            .toLowerCase();

        if (!text.includes(search)) {
          return false;
        }
      }

      return true;
    });


  const html = products.map((product) => {

    const price =
      Number(product.price || 0) > 0
        ? '₹' + Number(product.price)
        : 'Price on confirmation';

    return `
      <div class="card product">

        <div class="pic">💊</div>

        <div class="info">

          <b>${esc(product.name)}</b>

          <div class="small">
            ${esc(product.category || '')}
          </div>

          <div class="price">
            ${price}
          </div>

          <div class="small">
            In stock: ${Number(product.stock || 0)}
          </div>

        </div>

        <button
          onclick="window.skmSupabaseAdd('${esc(product.id)}')">
          Add
        </button>

      </div>
    `;

  }).join('');


  const finalHtml =
    html ||
    '<div class="card small">' +
    'No products available in this category right now.' +
    '</div>';


  const homeBox =
    document.getElementById('products');

  const catalogueBox =
    document.getElementById('catalogueProducts');


  if (homeBox) {
    homeBox.innerHTML =
      category === 'All'
        ? finalHtml
        : '';
  }


  if (catalogueBox) {
    catalogueBox.innerHTML = finalHtml;
  }
}


/* ---------- Add to Cart ---------- */

window.skmSupabaseAdd = function (id) {

  const product =
    supabaseProducts.find(
      (item) =>
        String(item.id) === String(id)
    );

  if (!product) {
    alert('Product not available.');
    return;
  }

  const stock =
    Number(product.stock || 0);

  if (stock <= 0) {
    alert('This product is currently unavailable.');
    return;
  }


  const cart = getCart();

  const existing =
    cart.find(
      (item) =>
        String(item.id) === String(product.id)
    );


  if (existing) {

    if (Number(existing.qty || 0) >= stock) {
      alert(
        'Only ' +
        stock +
        ' available.'
      );
      return;
    }

    existing.qty =
      Number(existing.qty || 0) + 1;

  } else {

    cart.push({
      id: product.id,
      name: product.name,
      cat: product.category || '',
      price: Number(product.price || 0),
      rx: false,
      icon: '💊',
      qty: 1
    });

  }


  saveCart(cart);

  alert(
    product.name +
    ' added to cart.'
  );
};


/* ---------- Cart Quantity ---------- */

window.changeQty = function (index, direction) {

  const cart = getCart();

  if (!cart[index]) return;

  const item = cart[index];

  const product =
    supabaseProducts.find(
      (p) =>
        String(p.id) === String(item.id)
    );


  const maxStock =
    product
      ? Number(product.stock || 0)
      : Number(item.qty || 1);


  item.qty =
    Number(item.qty || 1) +
    Number(direction || 0);


  if (item.qty <= 0) {
    cart.splice(index, 1);
  } else {

    if (item.qty > maxStock) {
      item.qty = maxStock;

      alert(
        'Only ' +
        maxStock +
        ' available.'
      );
    }

  }


  saveCart(cart);
};


/* ---------- Load Supabase Catalogue ---------- */

async function loadSupabaseCatalogue() {

  try {

    const result =
      await supabase
        .from('public_catalog')
        .select(
          'id,name,category,price,mrp,stock,active,updated_at'
        )
        .eq('active', true)
        .gt('stock', 0)
        .order('name');


    if (result.error) {
      console.error(
        'Supabase catalogue error:',
        result.error
      );

      return;
    }


    supabaseProducts =
      Array.isArray(result.data)
        ? result.data
        : [];

    supabaseLoaded = true;

    renderSupabaseProducts();
    updateCartBar();


    console.log(
      'SKMedKART Supabase catalogue loaded:',
      supabaseProducts.length
    );

  } catch (error) {

    console.error(
      'Supabase catalogue failed:',
      error
    );

  }
}


/* ---------- Page Navigation ---------- */

const originalPage =
  window.page;


window.page = function (id) {

  if (typeof originalPage === 'function') {
    originalPage(id);
  }

  setTimeout(() => {

    if (
      id === 'home' ||
      id === 'catalogue'
    ) {
      renderSupabaseProducts();
    }

    if (id === 'cart') {
      updateCartBar();
    }

  }, 50);

};


/* ---------- Search / Firebase Race Protection ---------- */

/*
   Existing Customer app still loads Firebase products.
   This bridge continuously re-applies the Supabase catalogue
   during the test so Firebase's async product load cannot
   permanently replace the Supabase catalogue.
*/

let refreshCount = 0;

const refreshTimer =
  setInterval(() => {

    if (supabaseLoaded) {
      renderSupabaseProducts();
    }

    refreshCount++;

    if (refreshCount >= 20) {
      clearInterval(refreshTimer);
    }

  }, 500);


/* ---------- Start ---------- */

loadSupabaseCatalogue();

updateCartBar();
