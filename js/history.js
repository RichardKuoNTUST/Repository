// js/history.js

document.addEventListener('DOMContentLoaded', async () => {
    // 從 URL 取得股票代號，例如 history.html?symbol=2330
    const urlParams = new URLSearchParams(window.location.search);
    const symbol = urlParams.get('symbol');

    if (!symbol) {
        alert("找不到股票代號");
        window.location.href = 'detail.html';
        return;
    }

    document.getElementById('stock-title').innerText = `股票明細: ${symbol}`;
    loadHistory(symbol);
});

// 全域變數存儲當前編輯狀態
let currentEditData = { table: '', id: '', symbol: '' };

// 1. 修改載入列表的 HTML (將刪除按鈕改為編輯按鈕)
async function loadHistory(symbol) {
    const tradeBody = document.getElementById('trade-history-list');
    const divBody = document.getElementById('dividend-history-list');
    const unitPrice = (t.total_price - (t.fee || 0)) / Math.abs(t.shares);
    const { data: trades } = await _supabase.from('holdings').select('*').eq('symbol', symbol).order('trade_date', { ascending: false });
    tradeBody.innerHTML = trades.map(t => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 text-gray-600">${t.trade_date}</td>
            <td class="px-4 py-3">...</td>
            <td class="px-4 py-3 font-medium">${Math.abs(t.shares).toLocaleString()} 股 (@${unitPrice.toFixed(2)})</td>
            <td class="px-4 py-3">
                $${Math.round(t.total_price).toLocaleString()} 
                <span class="text-[10px] text-gray-400">(含費$${t.fee || 0})</span>
            </td>
        </tr>
    `).join('');

    const { data: dividends } = await _supabase.from('dividends').select('*').eq('symbol', symbol).order('pay_date', { ascending: false });
    divBody.innerHTML = dividends.map(d => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 text-gray-600">${d.pay_date}</td>
            <td class="px-4 py-3 text-emerald-600 font-bold">$${parseFloat(d.amount).toLocaleString()}</td>
            <td class="px-4 py-3 text-gray-400">$${d.fee}</td>
            <td class="px-4 py-3 text-right">
                <button onclick='openEditModal("dividends", ${JSON.stringify(d)})' class="text-blue-500 hover:underline font-bold">編輯</button>
            </td>
        </tr>
    `).join('');
}

// 2. 開啟彈窗邏輯
function openEditModal(table, data) {
    currentEditData = { table, id: data.id, symbol: data.symbol };
    const body = document.getElementById('edit-modal-body');
    const modal = document.getElementById('editModal');
    
    if (table === 'holdings') {
        document.getElementById('edit-modal-title').innerText = "編輯買賣紀錄";
        body.innerHTML = `
            <div><label class="block text-xs font-bold text-gray-400 mb-1">日期</label>
            <input type="date" id="edit-date" class="w-full border rounded-xl px-4 py-3" value="${data.trade_date}"></div>
            <div><label class="block text-xs font-bold text-gray-400 mb-1">股數 (賣出請填負數)</label>
            <input type="number" id="edit-shares" class="w-full border rounded-xl px-4 py-3" value="${data.shares}"></div>
            <div><label class="block text-xs font-bold text-gray-400 mb-1">總代價 (含手續費)</label>
            <input type="number" id="edit-total" class="w-full border rounded-xl px-4 py-3" value="${data.total_price}"></div>
        `;
    } else {
        document.getElementById('edit-modal-title').innerText = "編輯股利紀錄";
        body.innerHTML = `
            <div><label class="block text-xs font-bold text-gray-400 mb-1">日期</label>
            <input type="date" id="edit-date" class="w-full border rounded-xl px-4 py-3" value="${data.pay_date}"></div>
            <div><label class="block text-xs font-bold text-gray-400 mb-1">實領股利</label>
            <input type="number" id="edit-amount" class="w-full border rounded-xl px-4 py-3" value="${data.amount}"></div>
            <div><label class="block text-xs font-bold text-gray-400 mb-1">手續費/健保費</label>
            <input type="number" id="edit-fee" class="w-full border rounded-xl px-4 py-3" value="${data.fee}"></div>
        `;
    }

    // 綁定按鈕事件
    document.getElementById('btn-save').onclick = handleUpdate;
    document.getElementById('btn-delete').onclick = handleDelete;

    modal.classList.replace('hidden', 'flex');
}

function closeEditModal() {
    document.getElementById('editModal').classList.replace('flex', 'hidden');
}

// 3. 執行資料庫更新 (Save)
async function handleUpdate() {
    const { table, id, symbol } = currentEditData;
    let payload = {};

    if (table === 'holdings') {
        payload = {
            trade_date: document.getElementById('edit-date').value,
            shares: parseFloat(document.getElementById('edit-shares').value),
            total_price: parseFloat(document.getElementById('edit-total').value)
        };
    } else {
        payload = {
            pay_date: document.getElementById('edit-date').value,
            amount: parseFloat(document.getElementById('edit-amount').value),
            fee: parseFloat(document.getElementById('edit-fee').value)
        };
    }

    const { error } = await _supabase.from(table).update(payload).eq('id', id);
    if (error) alert("更新失敗: " + error.message);
    else {
        closeEditModal();
        loadHistory(symbol);
    }
}

// 4. 執行資料庫刪除 (Delete)
async function handleDelete() {
    const { table, id, symbol } = currentEditData;
    if (!confirm('確定要永久刪除此筆資料嗎？')) return;

    const { error } = await _supabase.from(table).delete().eq('id', id);
    if (error) alert("刪除失敗: " + error.message);
    else {
        closeEditModal();
        loadHistory(symbol);
    }
}
