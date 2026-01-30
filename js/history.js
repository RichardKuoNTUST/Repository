// js/history.js

document.addEventListener('DOMContentLoaded', async () => {
    // 從 URL 取得股票代號
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

// 1. 載入列表並渲染 (修正 ReferenceError)
async function loadHistory(symbol) {
    const tradeBody = document.getElementById('trade-history-list');
    const divBody = document.getElementById('dividend-history-list');

    // --- 處理交易紀錄 ---
    const { data: trades, error: tradeErr } = await _supabase
        .from('holdings')
        .select('*')
        .eq('symbol', symbol)
        .order('trade_date', { ascending: false });
    
    if (trades) {
        tradeBody.innerHTML = trades.map(t => {
            // 關鍵修正：將 unitPrice 計算移到 map 內部，這裡才有 t 變數
            const absShares = Math.abs(t.shares);
            const unitPrice = absShares !== 0 ? (t.total_price - (t.fee || 0)) / absShares : 0;
            
            return `
                <tr class="hover:bg-gray-50 border-b border-gray-50">
                    <td class="px-4 py-3 text-gray-600">${t.trade_date}</td>
                    <td class="px-4 py-3">
                        <span class="${t.shares > 0 ? 'text-red-500 font-bold' : 'text-green-600 font-bold'}">
                            ${t.shares > 0 ? '買入' : '賣出'}
                        </span>
                    </td>
                    <td class="px-4 py-3 font-medium">
                        ${absShares.toLocaleString()} 股 
                        <span class="text-[10px] text-gray-400">(@${unitPrice.toFixed(2)})</span>
                    </td>
                    <td class="px-4 py-3">
                        <div class="font-bold text-slate-700">$${Math.round(t.total_price).toLocaleString()}</div>
                        <div class="text-[10px] text-gray-400 italic">含費 $${t.fee || 0}</div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button onclick='openEditModal("holdings", ${JSON.stringify(t)})' 
                                class="text-blue-500 hover:text-blue-700 font-bold text-xs border border-blue-200 px-2 py-1 rounded">
                            編輯
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // --- 處理股利紀錄 ---
    const { data: dividends, error: divErr } = await _supabase
        .from('dividends')
        .select('*')
        .eq('symbol', symbol)
        .order('pay_date', { ascending: false });
    
    if (dividends) {
        divBody.innerHTML = dividends.map(d => `
            <tr class="hover:bg-gray-50 border-b border-gray-50">
                <td class="px-4 py-3 text-gray-600">${d.pay_date}</td>
                <td class="px-4 py-3 text-emerald-600 font-bold">$${parseFloat(d.amount).toLocaleString()}</td>
                <td class="px-4 py-3 text-gray-400">$${d.fee || 0}</td>
                <td class="px-4 py-3 text-right">
                    <button onclick='openEditModal("dividends", ${JSON.stringify(d)})' 
                            class="text-blue-500 hover:text-blue-700 font-bold text-xs border border-blue-200 px-2 py-1 rounded">
                        編輯
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

// 2. 開啟編輯彈窗
function openEditModal(table, data) {
    currentEditData = { table, id: data.id, symbol: data.symbol };
    const body = document.getElementById('edit-modal-body');
    const modal = document.getElementById('editModal');
    
    if (table === 'holdings') {
        document.getElementById('edit-modal-title').innerText = "編輯買賣紀錄";
        body.innerHTML = `
            <div class="space-y-4">
                <div><label class="block text-xs font-bold text-gray-400 mb-1 uppercase">日期</label>
                <input type="date" id="edit-date" class="w-full border rounded-xl px-4 py-3 outline-none" value="${data.trade_date}"></div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-xs font-bold text-gray-400 mb-1">股數 (正買負賣)</label>
                    <input type="number" id="edit-shares" class="w-full border rounded-xl px-4 py-3 outline-none" value="${data.shares}"></div>
                    
                    <div><label class="block text-xs font-bold text-gray-400 mb-1">手續費</label>
                    <input type="number" id="edit-fee" class="w-full border rounded-xl px-4 py-3 outline-none" value="${data.fee || 0}"></div>
                </div>

                <div><label class="block text-xs font-bold text-gray-400 mb-1">總金額 (含費用)</label>
                <input type="number" id="edit-total" class="w-full border rounded-xl px-4 py-3 outline-none" value="${data.total_price}"></div>
            </div>
        `;
    } else {
        document.getElementById('edit-modal-title').innerText = "編輯股利紀錄";
        body.innerHTML = `
            <div class="space-y-4">
                <div><label class="block text-xs font-bold text-emerald-600 mb-1 uppercase">發放日期</label>
                <input type="date" id="edit-date" class="w-full border rounded-xl px-4 py-3 outline-none" value="${data.pay_date}"></div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-xs font-bold text-emerald-600 mb-1 uppercase">實領股利</label>
                    <input type="number" id="edit-amount" class="w-full border rounded-xl px-4 py-3 outline-none" value="${data.amount}"></div>
                    
                    <div><label class="block text-xs font-bold text-emerald-600 mb-1 uppercase">費用</label>
                    <input type="number" id="edit-fee" class="w-full border rounded-xl px-4 py-3 outline-none" value="${data.fee || 0}"></div>
                </div>
            </div>
        `;
    }

    // 重新連結按鈕點擊事件
    document.getElementById('btn-save').onclick = handleUpdate;
    document.getElementById('btn-delete').onclick = handleDelete;

    modal.classList.replace('hidden', 'flex');
}

function closeEditModal() {
    document.getElementById('editModal').classList.replace('flex', 'hidden');
}

// 3. 更新數據 (Save)
async function handleUpdate() {
    const { table, id, symbol } = currentEditData;
    let payload = {};

    try {
        if (table === 'holdings') {
            payload = {
                trade_date: document.getElementById('edit-date').value,
                shares: parseFloat(document.getElementById('edit-shares').value),
                fee: parseFloat(document.getElementById('edit-fee').value) || 0,
                total_price: parseFloat(document.getElementById('edit-total').value)
            };
        } else {
            payload = {
                pay_date: document.getElementById('edit-date').value,
                amount: parseFloat(document.getElementById('edit-amount').value),
                fee: parseFloat(document.getElementById('edit-fee').value) || 0
            };
        }

        const { error } = await _supabase.from(table).update(payload).eq('id', id);
        if (error) throw error;

        closeEditModal();
        loadHistory(symbol);
    } catch (err) {
        alert("更新失敗：" + err.message);
    }
}

// 4. 刪除數據 (Delete)
async function handleDelete() {
    const { table, id, symbol } = currentEditData;
    if (!confirm('確定要永久刪除此紀錄嗎？')) return;

    try {
        const { error } = await _supabase.from(table).delete().eq('id', id);
        if (error) throw error;

        closeEditModal();
        loadHistory(symbol);
    } catch (err) {
        alert("刪除失敗：" + err.message);
    }
}
