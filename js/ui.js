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
    const shares = parseInt(document.getElementById('trade-shares').value);
    const priceUnit = parseFloat(document.getElementById('trade-price-unit').value);
    const fee = parseFloat(document.getElementById('trade-fee').value) || 0;

    // 總成本 = (股數 * 單價) + 手續費
    const total_price = (Math.abs(shares) * priceUnit) + fee;

    const payload = {
        symbol: document.getElementById('stock-symbol').value.toUpperCase(),
        shares: shares,
        total_price: total_price, // 這裡存入的是包含手續費後的「最終總額」
        trade_date: document.getElementById('trade-date').value
    };

    if (!payload.symbol || !shares || !priceUnit) {
        alert("請填寫完整資訊");
        return;
    }

    const { error } = await _supabase.from('holdings').insert([payload]);
    if (error) alert("儲存失敗: " + error.message);
    else {
        closeModal();
        if (window.refreshData) window.refreshData();
        // 清空輸入框
        document.getElementById('display-total-cost').innerText = "$ 0";
        document.getElementById('display-unit-cost').innerText = "$ 0.00";
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
