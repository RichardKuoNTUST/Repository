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

// 儲存邏輯
async function handleSave() {
    const payload = {
        symbol: document.getElementById('stock-symbol').value.toUpperCase(),
        shares: parseInt(document.getElementById('trade-shares').value),
        total_price: parseFloat(document.getElementById('total-price').value),
        trade_date: document.getElementById('trade-date').value
    };
    const { error } = await _supabase.from('holdings').insert([payload]);
    if (error) alert("儲存失敗: " + error.message);
    else {
        closeModal();
        if (window.refreshData) window.refreshData(); // 呼叫 main.js 的重新整理
    }
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
