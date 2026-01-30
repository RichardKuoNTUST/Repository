// js/history.js

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const symbol = urlParams.get('symbol');

    if (!symbol) {
        alert("找不到股票代號");
        window.location.href = 'detail.html';
        return;
    }

    document.getElementById('stock-title').innerText = `股票明細: ${symbol}`;
    
    // 延遲一小段時間確保 defer 的腳本都加載完畢 (保險起見)
    setTimeout(() => {
        loadHistory(symbol);
    }, 100);
});

let currentEditData = { table: '', id: '', symbol: '' };

async function loadHistory(symbol) {
    const tradeBody = document.getElementById('trade-history-list');
    const divBody = document.getElementById('dividend-history-list');

    // 檢查 getLivePrice 是否存在
    let currentPrice = null;
    if (typeof getLivePrice === "function") {
        const priceInfo = await getLivePrice(symbol);
        currentPrice = priceInfo ? priceInfo.price : null;
    } else {
        console.error("錯誤：找不到 getLivePrice 函式，請檢查 api.js 是否正確引入。");
    }

    // 1. 抓取交易紀錄
    const { data: trades, error: tradeErr } = await _supabase
        .from('holdings')
        .select('*')
        .eq('symbol', symbol)
        .order('trade_date', { ascending: false });
    
    if (trades) {
        tradeBody.innerHTML = trades.map(t => {
            const absShares = Math.abs(t.shares);
            const unitPrice = absShares !== 0 ? (t.total_price - (t.fee || 0)) / absShares : 0;
            
            let profitHTML = '<span class="text-gray-400">---</span>';
            
            if (currentPrice && t.shares > 0) { 
                const currentMarketValue = absShares * currentPrice;
                const profit = currentMarketValue - t.total_price;
                const profitPercent = (profit / t.total_price * 100).toFixed(2);
                const color = profit >= 0 ? 'text-red-500' : 'text-green-600';
                
                profitHTML = `
                    <div class="${color} font-bold">$${Math.round(profit).toLocaleString()}</div>
                    <div class="${color} text-[10px] font-medium">${profit >= 0 ? '▲' : '▼'} ${Math.abs(profitPercent)}%</div>
                `;
            } else if (t.shares < 0) {
                profitHTML = '<span class="text-xs text-slate-400 italic bg-slate-100 px-2 py-0.5 rounded">已結算</span>';
            }

            return `
                <tr class="hover:bg-gray-50 border-b border-gray-100 transition">
                    <td class="px-4 py-4 text-gray-500 text-xs">${t.trade_date}</td>
                    <td class="px-4 py-4">
                        <span class="${t.shares > 0 ? 'text-red-500' : 'text-green-600'} font-bold">
                            ${t.shares > 0 ? '買入' : '賣出'}
                        </span>
                    </td>
                    <td class="px-4 py-4">
                        <div class="font-medium text-slate-700">${absShares.toLocaleString()} 股</div>
                        <div class="text-[10px] text-gray-400">@${unitPrice.toFixed(2)}</div>
                    </td>
                    <td class="px-4 py-4">
                        <div class="font-bold text-slate-700">$${Math.round(t.total_price).toLocaleString()}</div>
                        <div class="text-[10px] text-gray-400 italic">含費 $${t.fee || 0}</div>
                    </td>
                    <td class="px-4 py-4 text-right">
                        ${profitHTML}
                    </td>
                    <td class="px-4 py-4 text-right">
                        <button onclick='openEditModal("holdings", ${JSON.stringify(t)})' 
                                class="text-blue-500 hover:bg-blue-50 font-bold text-xs border border-blue-200 px-3 py-1.5 rounded-lg transition">
                            編輯
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 2. 抓取股利紀錄
    const { data: dividends } = await _supabase
        .from('dividends')
        .select('*')
        .eq('symbol', symbol)
        .order('pay_date', { ascending: false });
    
    if (dividends) {
        divBody.innerHTML = dividends.map(d => `
            <tr class="hover:bg-gray-50 border-b border-gray-50">
                <td class="px-4 py-4 text-gray-500 text-xs">${d.pay_date}</td>
                <td class="px-4 py-4 text-emerald-600 font-bold">$${parseFloat(d.amount).toLocaleString()}</td>
                <td class="px-4 py-4 text-gray-400 text-xs">$${d.fee || 0}</td>
                <td class="px-4 py-4 text-right">
                    <button onclick='openEditModal("dividends", ${JSON.stringify(d)})' 
                            class="text-blue-500 hover:bg-blue-50 font-bold text-xs border border-blue-200 px-3 py-1.5 rounded-lg transition">
                        編輯
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

// 彈窗與更新邏輯 (與先前提供的相同)
function openEditModal(table, data) {
    currentEditData = { table, id: data.id, symbol: data.symbol };
    const body = document.getElementById('edit-modal-body');
    const modal = document.getElementById('editModal');
    
    if (table === 'holdings') {
        document.getElementById('edit-modal-title').innerText = "編輯買賣紀錄";
        body.innerHTML = `
            <div class="space-y-4">
                <div><label class="block text-xs font-bold text-gray-400 mb-1">日期</label>
                <input type="date" id="edit-date" class="w-full border rounded-xl px-4 py-3" value="${data.trade_date}"></div>
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-xs font-bold text-gray-400 mb-1">股數</label>
                    <input type="number" id="edit-shares" class="w-full border rounded-xl px-4 py-3" value="${data.shares}"></div>
                    <div><label class="block text-xs font-bold text-gray-400 mb-1">手續費</label>
                    <input type="number" id="edit-fee" class="w-full border rounded-xl px-4 py-3" value="${data.fee || 0}"></div>
                </div>
                <div><label class="block text-xs font-bold text-gray-400 mb-1">總金額 (含費)</label>
                <input type="number" id="edit-total" class="w-full border rounded-xl px-4 py-3" value="${data.total_price}"></div>
            </div>
        `;
    } else {
        document.getElementById('edit-modal-title').innerText = "編輯股利紀錄";
        body.innerHTML = `
            <div class="space-y-4">
                <div><label class="block text-xs font-bold text-emerald-600 mb-1">發放日期</label>
                <input type="date" id="edit-date" class="w-full border rounded-xl px-4 py-3" value="${data.pay_date}"></div>
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-xs font-bold text-emerald-600 mb-1">實領股利</label>
                    <input type="number" id="edit-amount" class="w-full border rounded-xl px-4 py-3" value="${data.amount}"></div>
                    <div><label class="block text-xs font-bold text-emerald-600 mb-1">費用</label>
                    <input type="number" id="edit-fee" class="w-full border rounded-xl px-4 py-3" value="${data.fee || 0}"></div>
                </div>
            </div>
        `;
    }
    document.getElementById('btn-save').onclick = handleUpdate;
    document.getElementById('btn-delete').onclick = handleDelete;
    modal.classList.replace('hidden', 'flex');
}

function closeEditModal() {
    document.getElementById('editModal').classList.replace('flex', 'hidden');
}

async function handleUpdate() {
    const { table, id, symbol } = currentEditData;
    let payload = {};
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
    if (error) alert("更新失敗: " + error.message);
    else { closeEditModal(); loadHistory(symbol); }
}

async function handleDelete() {
    const { table, id, symbol } = currentEditData;
    if (!confirm('確定要永久刪除此紀錄嗎？')) return;
    const { error } = await _supabase.from(table).delete().eq('id', id);
    if (error) alert("刪除失敗: " + error.message);
    else { closeEditModal(); loadHistory(symbol); }
}
