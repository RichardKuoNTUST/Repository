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
    loadHistory(symbol);
});

// 全域變數存儲當前編輯狀態
let currentEditData = { table: '', id: '', symbol: '' };

/**
 * 核心功能：載入並計算明細資料
 */
async function loadHistory(symbol) {
    const tradeBody = document.getElementById('trade-history-list');
    const divBody = document.getElementById('dividend-history-list');

    // 1. 先抓取即時市價 (複用 api.js)
    // 確保你的 history.html 有引入 js/api.js 與 js/config.js
    const priceInfo = await getLivePrice(symbol);
    const currentPrice = priceInfo ? priceInfo.price : null;

    // 2. 抓取交易紀錄
    const { data: trades, error: tradeErr } = await _supabase
        .from('holdings')
        .select('*')
        .eq('symbol', symbol)
        .order('trade_date', { ascending: false });
    
    if (tradeErr) {
        console.error("抓取交易紀錄失敗:", tradeErr);
        tradeBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">資料讀取失敗</td></tr>`;
    } else if (trades) {
        tradeBody.innerHTML = trades.map(t => {
            const absShares = Math.abs(t.shares);
            // 計算該筆交易的單價 (排除手續費後)
            const unitPrice = absShares !== 0 ? (t.total_price - (t.fee || 0)) / absShares : 0;
            
            // --- 盈虧計算邏輯 ---
            let profitHTML = '<span class="text-gray-400">---</span>';
            
            if (currentPrice && t.shares > 0) { 
                // 買入筆數：計算目前未實現盈虧
                const currentMarketValue = absShares * currentPrice;
                const profit = currentMarketValue - t.total_price;
                const profitPercent = (profit / t.total_price * 100).toFixed(2);
                const color = profit >= 0 ? 'text-red-500' : 'text-green-600';
                
                profitHTML = `
                    <div class="${color} font-bold">$${Math.round(profit).toLocaleString()}</div>
                    <div class="${color} text-[10px] font-medium">${profit >= 0 ? '▲' : '▼'} ${Math.abs(profitPercent)}%</div>
                `;
            } else if (t.shares < 0) {
                // 賣出筆數
                profitHTML = '<span class="text-xs text-slate-400 italic bg-slate-100 px-2 py-0.5 rounded">已結算</span>';
            }

            return `
                <tr class="hover:bg-gray-50 border-b border-gray-50 transition">
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
                        <div class="text-[10px] text-gray-400">含費 $${t.fee || 0}</div>
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

    // 3. 抓取股利紀錄
    const { data: dividends, error: divErr } = await _supabase
        .from('dividends')
        .select('*')
        .eq('symbol', symbol)
        .order('pay_date', { ascending: false });
    
    if (divErr) {
        divBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">股利讀取失敗</td></tr>`;
    } else if (dividends) {
        divBody.innerHTML = dividends.map(d => `
            <tr class="hover:bg-gray-50 border-b border-gray-50">
                <td class="px-4 py-4 text-gray-500 text-xs">${d.pay_date}</td>
                <td class="px-4 py-4 text-emerald-600 font-bold">$${parseFloat(d.amount).toLocaleString()}</td>
                <td class="px-4 py-4 text-gray-400">$${d.fee || 0}</td>
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

// 彈窗邏輯與 CRUD 函式 (handleUpdate, handleDelete 等) 請保留在下方...

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
