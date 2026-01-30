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

// 1. 載入列表並渲染
async function loadHistory(symbol) {
    const tradeBody = document.getElementById('trade-history-list');
    const divBody = document.getElementById('dividend-history-list');

    // 抓取交易紀錄
    const { data: trades, error: tradeErr } = await _supabase.from('holdings').select('*').eq('symbol', symbol).order('trade_date', { ascending: false });
    
    if (trades) {
        tradeBody.innerHTML = trades.map(t => {
            // 在 map 內部計算每一筆的單價
            const unitPrice = (t.total_price - (t.fee || 0)) / Math.abs(t.shares);
            
            return `
                <tr class="hover:bg-gray-50 border-b border-gray-50">
                    <td class="px-4 py-3 text-gray-600">${t.trade_date}</td>
                    <td class="px-4 py-3">
                        <span class="${t.shares > 0 ? 'text-red-500' : 'text-green-600'} font-bold">
                            ${t.shares > 0 ? '買入' : '賣出'}
                        </span>
                    </td>
                    <td class="px-4 py-3 font-medium">
                        ${Math.abs(t.shares).toLocaleString()} 股 
                        <span class="text-xs text-gray-400">(@${unitPrice.toFixed(2)})</span>
                    </td>
                    <td class="px-4 py-3">
                        <div class="font-bold">$${Math.round(t.total_price).toLocaleString()}</div>
                        <div class="text-[10px] text-gray-400">含費 $${t.fee || 0}</div>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button onclick='openEditModal("holdings", ${JSON.stringify(t)})' class="text-blue-500 hover:underline font-bold text-xs">編輯</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 抓取股利紀錄
    const { data: dividends, error: divErr } = await _supabase.from('dividends').select('*').eq('symbol', symbol).order('pay_date', { ascending: false });
    
    if (dividends) {
        divBody.innerHTML = dividends.map(d => `
            <tr class="hover:bg-gray-50 border-b border-gray-50">
                <td class="px-4 py-3 text-gray-600">${d.pay_date}</td>
                <td class="px-4 py-3 text-emerald-600 font-bold">$${parseFloat(d.amount).toLocaleString()}</td>
                <td class="px-4 py-3 text-gray-400">$${d.fee}</td>
                <td class="px-4 py-3 text-right">
                    <button onclick='openEditModal("dividends", ${JSON.stringify(d)})' class="text-blue-500 hover:underline font-bold text-xs">編輯</button>
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
                <div><label class="block text-xs font-bold text-gray-400 mb-1">日期</label>
                <input type="date" id="edit-date" class="w-full border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" value="${data.trade_date}"></div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-xs font-bold text-gray-400 mb-1">股數 (買正賣負)</label>
                    <input type="number" id="edit-shares" class="w-full border rounded-xl px-4 py-3 outline-none" value="${data.shares}"></div>
                    
                    <div><label class="block text-xs font-bold text-gray-400 mb-1">手續費</label>
                    <input type="number" id="edit-fee" class="w-full border rounded-xl px-4 py-3 outline-none" value="${data.fee || 0}"></div>
                </div>

                <div><label class="block text-xs font-bold text-gray-400 mb-1">總成本 (含費)</label>
                <input type="number" id="edit-total" class="w-full border rounded-xl px-4 py-3 outline-none" value="${data.total_price}"></div>
            </div>
        `;
    } else {
        document.getElementById('edit-modal-title').innerText = "編輯股利紀錄";
        body.innerHTML = `
            <div class="space-y-4">
                <div><label class="block text-xs font-bold text-gray-400 mb-1">日期</label>
                <input type="date" id="edit-date" class="w-full border rounded-xl px-4 py-3" value="${data.pay_date}"></div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-xs font-bold text-gray-400 mb-1">實領股利</label>
                    <input type="number" id="edit-amount" class="w-full border rounded-xl px-4 py-3" value="${data.amount}"></div>
                    
                    <div><label class="block text-xs font-bold text-gray-400 mb-1">費用</label>
                    <input type="number" id="edit-fee" class="w-full border rounded-xl px-4 py-3" value="${data.fee}"></div>
                </div>
            </div>
        `;
    }

    // 重新綁定 Save 與 Delete 事件
    document.getElementById('btn-save').onclick = handleUpdate;
    document.getElementById('btn-delete').onclick = handleDelete;

    modal.classList.replace('hidden', 'flex');
}

function closeEditModal() {
    document.getElementById('editModal').classList.replace('flex', 'hidden');
}

// 3. 更新存檔 (Save)
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

// 4. 刪除紀錄 (Delete)
async function handleDelete() {
    const { table, id, symbol } = currentEditData;
    if (!confirm('警告：確定要永久刪除此筆紀錄嗎？')) return;

    try {
        const { error } = await _supabase.from(table).delete().eq('id', id);
        if (error) throw error;

        closeEditModal();
        loadHistory(symbol);
    } catch (err) {
        alert("刪除失敗：" + err.message);
    }
}
