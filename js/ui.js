// js/ui.js

// 買賣彈窗
function openModal() {
    const modal = document.getElementById('addModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('trade-date').value = new Date().toISOString().split('T')[0];
}

function closeModal() {
    const modal = document.getElementById('addModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// js/ui.js (更新部分)

// 1. 即時計算單價與總額
function calculateUnitCost() {
    const shares = parseFloat(document.getElementById('trade-shares').value) || 0;
    const priceUnit = parseFloat(document.getElementById('trade-price-unit').value) || 0;
    const fee = parseFloat(document.getElementById('trade-fee').value) || 0;

    // 計算邏輯：(股數 * 單價) + 手續費
    const totalCost = (Math.abs(shares) * priceUnit) + fee;
    // 實際取得單價：總支出 / 股數
    const actualUnitCost = shares !== 0 ? (totalCost / Math.abs(shares)) : 0;

    // 顯示在畫面上
    document.getElementById('display-total-cost').innerText = `$ ${Math.round(totalCost).toLocaleString()}`;
    document.getElementById('display-unit-cost').innerText = `$ ${actualUnitCost.toFixed(2)}`;
}

// 2. 儲存時包含總成本
async function handleSave() {
    // 檢查元素是否存在，避免 null 報錯
    const elSymbol = document.getElementById('stock-symbol');
    const elShares = document.getElementById('trade-shares');
    const elPrice = document.getElementById('trade-price-unit');
    const elFee = document.getElementById('trade-fee');
    const elDate = document.getElementById('trade-date');

    if (!elSymbol || !elShares || !elPrice) {
        console.error("找不到輸入欄位！請檢查 HTML 中的 ID 是否正確。");
        return;
    }

    const shares = parseInt(elShares.value);
    const priceUnit = parseFloat(elPrice.value);
    const fee = parseFloat(elFee.value) || 0;
    const total_price = (Math.abs(shares) * priceUnit) + fee;

    const payload = {
        symbol: elSymbol.value.toUpperCase(),
        shares: shares,
        total_price: total_price,
        trade_date: elDate.value
    };

    const { error } = await _supabase.from('holdings').insert([payload]);
    if (error) {
        alert("儲зу失敗: " + error.message);
    } else {
        closeModal();
        if (window.refreshData) window.refreshData();
    }
}

// 股利彈窗
async function openDividendModal() {
    const modal = document.getElementById('dividendModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // 自動填充股票下拉選單
    const { data } = await _supabase.from('holdings').select('symbol');
    const uniqueSymbols = [...new Set(data.map(h => h.symbol))];
    const select = document.getElementById('div-stock-symbol');
    select.innerHTML = uniqueSymbols.map(s => `<option value="${s}">${s}</option>`).join('');
    
    document.getElementById('div-date').value = new Date().toISOString().split('T')[0];
}

function closeDividendModal() {
    const modal = document.getElementById('dividendModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}


async function handleSaveDividend() {
    const payload = {
        symbol: document.getElementById('div-stock-symbol').value,
        amount: parseFloat(document.getElementById('div-amount').value),
        fee: parseFloat(document.getElementById('div-fee').value),
        pay_date: document.getElementById('div-date').value
    };
    const { error } = await _supabase.from('dividends').insert([payload]);
    if (error) alert("儲存失敗: " + error.message);
    else {
        closeDividendModal();
        if (window.refreshData) window.refreshData();
    }
}
