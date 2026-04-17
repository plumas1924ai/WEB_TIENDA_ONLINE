// Configuración integrada para evitar problemas de importación en local
const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycbxUSSGHztdZV5BEJk-MjDIWJzMMsQ4Itr0r7pukn1knC6vNy2YGqHE3bMyX0NkH37_S/exec", 
    WHATSAPP_NUMBER: "51992719569",
    CURRENCY: "S/ ",
    STORE_NAME: "Plumas 1924",
    POLLING_INTERVAL: 60000 // Aumentado a 1 min para ahorrar recursos
};

let allProducts = [];
let pollingInterval = null;

// Helper para optimizar imágenes (Compresión y redimensión vía Proxy)
const optimizeImg = (url, width = 400) => {
    if (!url) return '';
    // Usamos el proxy gratuito de weserv.nl para convertir a WebP y redimensionar
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp&q=80`;
};

document.addEventListener('DOMContentLoaded', () => {
    const productGrid = document.getElementById('productGrid');
    const detailContainer = document.getElementById('detailContainer');

    // Intentar recuperar de cache inmediatamente para velocidad instantánea
    const cached = sessionStorage.getItem('plumas_cache');
    if (cached) {
        allProducts = JSON.parse(cached);
    }

    if (productGrid) {
        initIndexPage();
    } else if (detailContainer) {
        initDetailPage();
    }
});

/** -- API FETCHING -- **/
async function fetchProducts(force = false) {
    // Si tenemos cache y no es forzado, devolvemos cache
    if (!force && allProducts.length > 0) return allProducts;

    try {
        const response = await fetch(`${CONFIG.API_URL}?action=products`, {
            method: 'GET',
            mode: 'cors'
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        if (data && data.ok && Array.isArray(data.products)) {
            allProducts = data.products.map(p => ({
                ...p,
                id: p.Id,
                descripcion: p.descipcion || p.descripcion || '',
                // Guardamos la imagen original y la optimizada
                imagenOptimized: optimizeImg(p.imagen, 500),
                imagenThumb: optimizeImg(p.imagen, 300)
            }));
            
            // Guardar en cache de sesión
            sessionStorage.setItem('plumas_cache', JSON.stringify(allProducts));
            return allProducts;
        }
        return null;
    } catch (error) {
        console.error('Error fetch:', error);
        return allProducts.length > 0 ? allProducts : null;
    }
}

async function saveOrder(productId, productName, price) {
    try {
        // Usamos fetch con mode: 'no-cors' para Apps Script
        // Nota: Apps Script no devuelve respuesta con no-cors, pero el POST llega.
        await fetch(CONFIG.API_URL, {
            method: 'POST',
            mode: 'no-cors', 
            headers: {
                'Content-Type': 'text/plain', // Mantiene la solicitud "simple" para evitar preflight OPTIONS
            },
            body: JSON.stringify({ productId, productName, price })
        });
    } catch (error) {
        console.warn('Error saving order (expected if no-cors):', error);
    }
}

/** -- PÁGINA PRINCIPAL -- **/
async function initIndexPage() {
    const searchInput = document.getElementById('searchInput');
    const filterButtons = document.querySelectorAll('.filter-chip');
    const productGrid = document.getElementById('productGrid');

    let currentFilter = 'Todos';
    let currentSearch = '';

    const renderProducts = (productsToRender) => {
        const filtered = productsToRender.filter(p => {
            const matchesCategory = currentFilter === 'Todos' || p.categoria === currentFilter;
            const matchesSearch = p.nombre.toLowerCase().includes(currentSearch.toLowerCase()) || 
                                 p.descripcion.toLowerCase().includes(currentSearch.toLowerCase());
            return matchesCategory && matchesSearch;
        });

        if (filtered.length === 0) {
            productGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                    <p>No encontramos nada que coincida</p>
                </div>
            `;
            productGrid.style.gridTemplateColumns = '1fr';
            return;
        }

        productGrid.style.gridTemplateColumns = ''; 
        productGrid.innerHTML = filtered.map(p => {
            const hasStock = p.stock > 0;
            return `
                <a href="${hasStock ? `producto.html?id=${p.id}` : '#'}" class="card ${!hasStock ? 'out-of-stock' : ''}">
                    <div class="card-img skeleton">
                        <img src="${p.imagenThumb}" alt="${p.nombre}" loading="lazy" onload="this.parentElement.classList.remove('skeleton')">
                        ${!hasStock ? '<div class="stock-badge">Agotado</div>' : ''}
                    </div>
                    <div class="card-body">
                        <span class="card-tag">${p.categoria}</span>
                        <h3 class="card-title">${p.nombre}</h3>
                        <div class="card-price-row">
                            <span class="card-price">${CONFIG.CURRENCY}${Number(p.precio).toFixed(2)}</span>
                            <div class="card-btn-view">
                                <i class="fas fa-arrow-right"></i>
                            </div>
                        </div>
                    </div>
                </a>
            `;
        }).join('');
    };

    // Carga inicial (Usar cache si existe para carga instantánea)
    if (allProducts.length > 0) {
        renderProducts(allProducts);
    } else {
        productGrid.innerHTML = Array(6).fill(0).map(() => `
            <div class="card">
                <div class="card-img skeleton"></div>
                <div class="card-body">
                    <div class="skeleton" style="height:12px; width:40%; margin-bottom:8px;"></div>
                    <div class="skeleton" style="height:20px; width:80%; margin-bottom:12px;"></div>
                    <div class="skeleton" style="height:24px; width:30%;"></div>
                </div>
            </div>
        `).join('');
    }

    const products = await fetchProducts();
    if (products) renderProducts(products);
    else if (allProducts.length === 0) {
        productGrid.innerHTML = '<div class="empty-state"><p>Error al conectar con el servidor.</p></div>';
    }

    // Polling
    pollingInterval = setInterval(async () => {
        const updated = await fetchProducts();
        if (updated) renderProducts(updated);
    }, CONFIG.POLLING_INTERVAL);

    // Listeners
    searchInput?.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        renderProducts(allProducts);
    });

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.category;
            renderProducts(allProducts);
        });
    });
}

/** -- PÁGINA DE DETALLE -- **/
async function initDetailPage() {
    const detailContainer = document.getElementById('detailContainer');
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    detailContainer.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando producto...</p></div>';

    // Intentar buscar en memoria o hacer fetch si es necesario
    if (allProducts.length === 0) await fetchProducts();
    const product = allProducts.find(p => String(p.id) === String(productId));

    if (!product) {
        detailContainer.innerHTML = `<div class="empty-state"><h1>Producto no encontrado</h1><a href="index.html" class="btn-back">Volver al inicio</a></div>`;
        return;
    }

    const hasStock = product.stock > 0;

    // SEO
    document.title = `${product.nombre} | ${CONFIG.STORE_NAME}`;
    
    const whatsappMessage = encodeURIComponent(`Hola, estoy interesado en comprar: ${product.nombre} (ID: ${product.id}) - ${CONFIG.CURRENCY}${Number(product.precio).toFixed(2)}`);
    const whatsappUrl = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${whatsappMessage}`;

    detailContainer.innerHTML = `
        <div class="detail-media skeleton">
            <img src="${product.imagenOptimized}" alt="${product.nombre}" onload="this.parentElement.classList.remove('skeleton')">
        </div>
        <div class="detail-content">
            <span class="card-tag">${product.categoria}</span>
            <h1>${product.nombre}</h1>
            <div class="detail-price">${CONFIG.CURRENCY}${Number(product.precio).toFixed(2)}</div>
            <p class="detail-desc">${product.descripcion}</p>
            
            <div class="stock-status ${hasStock ? 'in-stock' : 'out-of-stock'}">
                ${hasStock ? `<i class="fas fa-check-circle"></i> Stock disponible: ${product.stock} unidades` : '<i class="fas fa-times-circle"></i> Agotado actualmente'}
            </div>

            <button id="buyBtn" class="btn-whatsapp" ${!hasStock ? 'disabled' : ''}>
                <i class="fab fa-whatsapp"></i> ${hasStock ? 'Comprar por WhatsApp' : 'Sin Stock'}
            </button>
        </div>
    `;

    if (hasStock) {
        document.getElementById('buyBtn').onclick = async () => {
            // Guardar en Google Sheets antes de ir a WhatsApp
            await saveOrder(product.id, product.nombre, product.precio);
            window.open(whatsappUrl, '_blank');
        };
    }
}
