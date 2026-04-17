// Configuración integrada para evitar problemas de importación en local
const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbzf3V3axfMLC7kIdUNe0mzGGB0yQgo7tEmODsV1PSSLtiWBDVAKRdlCLZ7VV8deTXHu/exec", 
    WHATSAPP_NUMBER: "51992719569",
    CURRENCY: "S/ ",
    STORE_NAME: "DBStore",
    POLLING_INTERVAL: 30000 // Reducido a 30s para sincronización más rápida
};

let allProducts = [];
let cart = JSON.parse(localStorage.getItem('dbstore_cart')) || [];

// Helper para optimizar imágenes con Fallback robusto
const optimizeImg = (url, width = 600) => {
    if (!url) return 'https://placehold.co/600x600/f1f5f9/0f172a?text=Sin+Imagen';
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp&q=85`;
};

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    const productGrid = document.getElementById('productGrid');
    const detailContainer = document.getElementById('detailContainer');

    // Inicializar UI del Carrito
    updateCartUI();
    setupCartListeners();

    // Intentar recuperar de cache inmediatamente para velocidad
    const cached = sessionStorage.getItem('dbstore_cache');
    if (cached) {
        allProducts = JSON.parse(cached);
        if (productGrid) {
            renderProducts(allProducts);
            initIndexPage();
        }
        if (detailContainer) initDetailPage();
    }

    // Fetch fresco y configurar polling
    await fetchProducts(true);
    
    if (productGrid) initIndexPage();
    if (detailContainer) {
        setupTabs();
        initDetailPage();
    }

    // Polling para mantener stock actualizado
    setInterval(() => fetchProducts(true), CONFIG.POLLING_INTERVAL);
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById(target).classList.add('active');
        });
    });
}

/** -- API FETCHING -- **/
async function fetchProducts(force = false) {
    try {
        const response = await fetch(`${CONFIG.API_URL}?action=products`, {
            method: 'GET',
            mode: 'cors'
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        // Manejar tanto formato de objeto {products:[]} como array directo []
        const productsRaw = Array.isArray(data) ? data : (data.products || []);
        
        if (productsRaw.length > 0) {
            allProducts = productsRaw.map(p => ({
                ...p,
                id: p.id || p.Id,
                nombre: p.nombre || 'Producto Sin Nombre',
                categoria: p.categoria || 'General',
                descripcion: p.descripcion || p.descipcion || 'Sin descripción disponible.',
                imagenOriginal: p.imagen,
                imagenOptimized: optimizeImg(p.imagen, 800),
                imagenThumb: optimizeImg(p.imagen, 400),
                precio: parseFloat(p.precio) || 0,
                stock: parseInt(p.stock) || 0,
                caracteristicas: p.caracteristicas || '', 
                especificaciones: p.especificaciones || ''
            }));
            
            sessionStorage.setItem('dbstore_cache', JSON.stringify(allProducts));
            
            // Re-renderizar solo si estamos en la cuadrícula de productos
            if (document.getElementById('productGrid')) {
                const searchInput = document.getElementById('searchInput');
                if (!searchInput || !searchInput.value) {
                    renderProducts(allProducts);
                }
            }
            return allProducts;
        }
    } catch (error) {
        console.error('Error fetching products:', error);
    }
    return allProducts;
}

/** -- CARRITO LOGIC -- **/
function setupCartListeners() {
    const cartBtn = document.getElementById('cartBtn');
    const closeCart = document.getElementById('closeCart');
    const cartOverlay = document.getElementById('cartOverlay');
    const checkoutBtn = document.getElementById('checkoutBtn');

    cartBtn?.addEventListener('click', () => toggleCart(true));
    closeCart?.addEventListener('click', () => toggleCart(false));
    cartOverlay?.addEventListener('click', () => toggleCart(false));

    checkoutBtn?.addEventListener('click', async () => {
        if (cart.length === 0) return alert('Tu carrito está vacío');
        
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        
        try {
            await checkoutFlow();
        } catch (err) {
            console.error(err);
            alert('Hubo un error al procesar el pedido. Intente nuevamente.');
        } finally {
            checkoutBtn.disabled = false;
            checkoutBtn.innerHTML = '<i class="fab fa-whatsapp"></i> Finalizar Pedido';
        }
    });
}

async function checkoutFlow() {
    // 1. Registrar en Google Sheets antes de WhatsApp
    for (const item of cart) {
        await registerOrderInSheet(item);
    }
    
    // 2. Abrir WhatsApp
    checkoutWhatsApp();
    
    // 3. Limpiar carrito (opcional, mejor después de confirmar que se abrió WhatsApp)
    // cart = [];
    // saveCart();
    // updateCartUI();
    // toggleCart(false);
}

async function registerOrderInSheet(item) {
    try {
        const orderData = {
            productId: item.id,
            productName: item.nombre,
            price: item.precio,
            quantity: item.quantity,
            customerName: 'Cliente Web',
            customerPhone: ''
        };

        await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode: 'no-cors', // Importante para Google Apps Script POST
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });
        
        return true;
    } catch (error) {
        console.error('Error registrando pedido:', error);
        return false;
    }
}

function toggleCart(open) {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if (open) {
        drawer.classList.add('active');
        overlay.classList.add('active');
        renderCartItems();
    } else {
        drawer.classList.remove('active');
        overlay.classList.remove('active');
    }
}

function addToCart(productId, qty = 1) {
    const product = allProducts.find(p => String(p.id) === String(productId));
    if (!product) return;

    const existing = cart.find(item => String(item.id) === String(productId));
    if (existing) {
        if (existing.quantity + qty > product.stock) {
            alert(`Lo sentimos, solo quedan ${product.stock} unidades disponibles.`);
            return;
        }
        existing.quantity += qty;
    } else {
        cart.push({ ...product, quantity: qty });
    }

    saveCart();
    updateCartUI();
    toggleCart(true);
}

function removeFromCart(productId) {
    cart = cart.filter(item => String(item.id) !== String(productId));
    saveCart();
    updateCartUI();
    renderCartItems();
}

function updateQuantity(productId, delta) {
    const item = cart.find(item => String(item.id) === String(productId));
    if (!item) return;

    const product = allProducts.find(p => String(p.id) === String(productId));
    if (item.quantity + delta <= 0) {
        removeFromCart(productId);
    } else if (item.quantity + delta > (product ? product.stock : 99)) {
        alert('Stock máximo alcanzado');
    } else {
        item.quantity += delta;
        saveCart();
        updateCartUI();
        renderCartItems();
    }
}

function saveCart() {
    localStorage.setItem('dbstore_cart', JSON.stringify(cart));
}

function updateCartUI() {
    const count = cart.reduce((acc, item) => acc + item.quantity, 0);
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
        cartCount.innerText = count;
        cartCount.style.display = count > 0 ? 'flex' : 'none';
    }
}

function renderCartItems() {
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    
    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-basket"></i>
                <p>Tu carrito está vacío</p>
                <button onclick="toggleCart(false)" class="filter-chip" style="margin-top:1rem">Seguir Comprando</button>
            </div>
        `;
        cartTotal.innerText = `${CONFIG.CURRENCY}0.00`;
        return;
    }

    let total = 0;
    cartItems.innerHTML = cart.map(item => {
        total += item.precio * item.quantity;
        return `
            <div class="cart-item">
                <div class="cart-item-img">
                    <img src="${item.imagenThumb}" alt="${item.nombre}" onerror="this.src='${item.imagenOriginal}'">
                </div>
                <div class="cart-item-info">
                    <h4>${item.nombre}</h4>
                    <div class="cart-item-price">${CONFIG.CURRENCY}${item.precio.toFixed(2)}</div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
                        <span>${item.quantity}</span>
                        <button class="qty-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
                        <i class="fas fa-trash-alt" style="margin-left:auto; color:var(--error); cursor:pointer" onclick="removeFromCart('${item.id}')"></i>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    cartTotal.innerText = `${CONFIG.CURRENCY}${total.toFixed(2)}`;
}

function checkoutWhatsApp() {
    let message = `*Nuevo Pedido - ${CONFIG.STORE_NAME}*\n\n`;
    let total = 0;
    
    cart.forEach(item => {
        const subtotal = item.precio * item.quantity;
        message += `• ${item.nombre} (x${item.quantity}) - ${CONFIG.CURRENCY}${subtotal.toFixed(2)}\n`;
        total += subtotal;
    });
    
    message += `\n*TOTAL ESTIMADO: ${CONFIG.CURRENCY}${total.toFixed(2)}*\n\n`;
    message += `Por favor, confirmen la disponibilidad para coordinar el pago y envío.`;

    const whatsappUrl = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}

/** -- PÁGINA PRINCIPAL -- **/
function initIndexPage() {
    const searchInput = document.getElementById('searchInput');
    const filterButtons = document.querySelectorAll('.filter-chip');
    
    if (!searchInput) return;

    let currentFilter = 'Todos';
    let currentSearch = '';

    const render = () => {
        const filtered = allProducts.filter(p => {
            const matchesCategory = currentFilter === 'Todos' || (p.categoria && p.categoria.toLowerCase().includes(currentFilter.toLowerCase()));
            const matchesSearch = p.nombre.toLowerCase().includes(currentSearch.toLowerCase()) || 
                                 p.descripcion.toLowerCase().includes(currentSearch.toLowerCase());
            return matchesCategory && matchesSearch;
        });
        renderProducts(filtered);
    };

    searchInput.oninput = (e) => {
        currentSearch = e.target.value;
        render();
    };

    filterButtons.forEach(btn => {
        btn.onclick = () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.category;
            render();
        };
    });
}

function renderProducts(products) {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    if (products.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1"><h3>No se encontraron productos</h3></div>';
        return;
    }

    grid.innerHTML = products.map(p => {
        const hasStock = p.stock > 0;
        return `
            <div class="card fade-in">
                <a href="${hasStock ? `producto.html?id=${p.id}` : '#'}" class="card-img skeleton">
                    <img src="${p.imagenThumb}" alt="${p.nombre}" loading="lazy" 
                         onload="this.parentElement.classList.remove('skeleton')"
                         onerror="this.src='${p.imagenOriginal}'; this.parentElement.classList.remove('skeleton')">
                    ${!hasStock ? '<div class="stock-badge" style="position:absolute; top:1rem; right:1rem; background:var(--error); color:white; padding:0.5rem; border-radius:5px; font-weight:700">Agotado</div>' : ''}
                </a>
                <div class="card-body">
                    <span class="card-tag">${p.categoria}</span>
                    <h3 class="card-title">${p.nombre}</h3>
                    <div class="card-price-row">
                        <span class="card-price">${CONFIG.CURRENCY}${p.precio.toFixed(2)}</span>
                        <a href="producto.html?id=${p.id}" class="card-btn-view">
                            <i class="fas fa-eye"></i>
                        </a>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/** -- PÁGINA DE DETALLE -- **/
async function initDetailPage() {
    const detailContainer = document.getElementById('detailContainer');
    if (!detailContainer) return;

    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (!productId) return;

    // Intentar buscar en local primero
    let product = allProducts.find(p => String(p.id) === String(productId));

    // Si no está, pedir solo ese producto al servidor (más eficiente)
    if (!product) {
        try {
            const resp = await fetch(`${CONFIG.API_URL}?action=product&id=${productId}`);
            const data = await resp.json();
            if (data && !data.error) {
                product = {
                    ...data,
                    id: data.id || data.Id,
                    nombre: data.nombre || 'Producto Sin Nombre',
                    categoria: data.categoria || 'General',
                    descripcion: data.descripcion || data.descipcion || 'Sin descripción disponible.',
                    imagenOriginal: data.imagen,
                    imagenOptimized: optimizeImg(data.imagen, 800),
                    imagenThumb: optimizeImg(data.imagen, 400),
                    precio: parseFloat(data.precio) || 0,
                    stock: parseInt(data.stock) || 0,
                    caracteristicas: data.caracteristicas || '',
                    especificaciones: data.especificaciones || ''
                };
            }
        } catch (e) {
            console.error("Error fetching single product", e);
        }
    }

    if (!product) {
        detailContainer.innerHTML = `<div class="empty-state"><h1>Producto no encontrado</h1><a href="index.html" class="filter-chip">Volver al inicio</a></div>`;
        return;
    }

    const hasStock = product.stock > 0;
    document.title = `${product.nombre} | ${CONFIG.STORE_NAME}`;

    detailContainer.innerHTML = `
        <div class="detail-media skeleton">
            <img src="${product.imagenOptimized}" alt="${product.nombre}" 
                 onload="this.parentElement.classList.remove('skeleton')"
                 onerror="this.src='${product.imagenOriginal}'; this.parentElement.classList.remove('skeleton')">
        </div>
        <div class="detail-content fade-in">
            <span class="card-tag">${product.categoria}</span>
            <h1>${product.nombre}</h1>
            <div class="detail-price">
                <span>${CONFIG.CURRENCY}${product.precio.toFixed(2)}</span>
            </div>
            <p class="detail-desc">${product.descripcion}</p>
            
            <div class="stock-status ${hasStock ? 'in-stock' : 'out-of-stock'}">
                ${hasStock ? `<i class="fas fa-check-circle"></i> En Stock (${product.stock} disponibles)` : '<i class="fas fa-times-circle"></i> Agotado'}
            </div>

            <div class="action-row">
                <button id="addCartBtn" class="btn-add-cart" ${!hasStock ? 'disabled' : ''}>
                    <i class="fas fa-cart-plus"></i> Agregar al Carrito
                </button>
            </div>
            
            <button id="buyNowBtn" class="btn-whatsapp outline" ${!hasStock ? 'disabled' : ''}>
                 Consultar Disponibilidad Directa
            </button>
        </div>
    `;

    if (hasStock) {
        document.getElementById('addCartBtn').onclick = () => addToCart(product.id, 1);
        document.getElementById('buyNowBtn').onclick = () => {
            const msg = `Hola! Me interesa este producto: ${product.nombre} (S/ ${product.precio.toFixed(2)})`;
            window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
        };
    }

    renderFeatures(product.caracteristicas);
    renderSpecs(product.especificaciones);
}

function renderFeatures(featuresText) {
    const container = document.getElementById('featuresList');
    if (!container) return;

    if (!featuresText || featuresText.trim() === '') {
        container.innerHTML = `<div style="text-align:center; grid-column:1/-1; padding:3rem; color:var(--text-muted)">
            <p>Características detalladas próximamente.</p>
        </div>`;
        return;
    }

    const items = featuresText.split('||');
    container.innerHTML = items.map(item => {
        const part = item.split('|');
        const title = part[0] || 'Información';
        const desc = part[1] || '';
        
        const iconMap = {
            'calidad': 'fa-award', 'envio': 'fa-truck-fast', 'garantia': 'fa-shield-halved',
            'tech': 'fa-microchip', 'ergonomia': 'fa-chair', 'bateria': 'fa-battery-full'
        };
        const iconClass = iconMap[title.toLowerCase().trim()] || 'fa-circle-check';
        
        return `
            <div class="feature-item">
                <i class="fas ${iconClass}"></i>
                <h4>${title}</h4>
                <p>${desc}</p>
            </div>
        `;
    }).join('');
}

function renderSpecs(specsText) {
    const container = document.getElementById('specsTable');
    if (!container) return;

    if (!specsText || specsText.trim() === '') {
        container.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--text-muted)">
            <p>Especificaciones técnicas no disponibles para este artículo.</p>
        </div>`;
        return;
    }

    const rows = specsText.split('||');
    container.innerHTML = rows.map(row => {
        const part = row.split('|');
        return `
            <div class="specs-row">
                <span class="spec-label">${part[0] || '-'}</span>
                <span class="spec-value">${part[1] || '-'}</span>
            </div>
        `;
    }).join('');
}

