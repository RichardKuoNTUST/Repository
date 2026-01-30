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

// js/history.js 的 loadHistory 完整更新

/**
 * 核心功能：載入股票明細並計算總結看板
 */
async function loadHistory(symbol) {
    const tradeBody = document.getElementById('trade-history-list');
    const divBody = document.getElementById('dividend-history-list');
    const summaryPanel = document.getElementById('stock-summary-panel');

    // 1. 抓取即時市價 (建議 api.js 已實作快取)
    const priceInfo = await getLivePrice(symbol);
    const currentPrice = priceInfo ? priceInfo.price : null;

    // 2. 同時抓取交易紀錄與股利資料
    const [holdingsRes, dividendsRes] = await Promise.all([
        _supabase.from('holdings').select('*').eq('symbol', symbol).order('trade_date', { ascending: true }),
        _supabase.from('dividends').select('*').eq('symbol', symbol)
    ]);

    const trades = holdingsRes.data || [];
    const dividends = dividendsRes.data || [];

    // 3. 【核心計算區】FIFO 演算法
    let changePercent = 0;
    if (priceInfo && priceInfo.changePercent !== undefined && !isNaN(priceInfo.changePercent)) {
        changePercent = parseFloat(priceInfo.changePercent);
    }

    const changeColor = changePercent >= 0 ? 'text-red-500' : 'text-green-600';
    const changeIcon = changePercent >= 0 ? '▲' : '▼';
    const profitColor = totalNetProfit >= 0 ? 'text-red-500' : 'text-green-600';
    let totalShares = 0;
    let realizedProfit = 0;
    let buys = []; 

    trades.forEach(t => {
        const shares = parseFloat(t.shares);
        const totalPrice = parseFloat(t.total_price);
        
        if (shares > 0) {
            // 買入：記錄成本
            buys.push({ remaining: shares, pricePerShare: totalPrice / shares });
            totalShares += shares;
        } else if (shares < 0) {
            // 賣出：按 FIFO 扣除成本並計算已實現損益
            let sellQty = Math.abs(shares);
            const sellPricePerShare = totalPrice / sellQty;
            totalShares -= sellQty;

            while (sellQty > 0 && buys.length > 0) {
                let first = buys[0];
                if (first.remaining <= sellQty) {
                    realizedProfit += (sellPricePerShare - first.pricePerShare) * first.remaining;
                    sellQty -= first.remaining;
                    buys.shift();
                } else {
                    realizedProfit += (sellPricePerShare - first.pricePerShare) * sellQty;
                    first.remaining -= sellQty;
                    sellQty = 0;
                }
            }
        }
    });

    // 4. 計算面板數值
    const remainingCost = buys.reduce((sum, b) => sum + (b.pricePerShare * b.remaining), 0);
    const avgCost = totalShares > 0 ? (remainingCost / totalShares) : 0;
    const marketValue = currentPrice ? (totalShares * currentPrice) : 0;
    const unrealizedProfit = totalShares > 0 ? (marketValue - remainingCost) : 0;
    const totalDividends = dividends.reduce((sum, d) => sum + (parseFloat(d.amount) - parseFloat(d.fee || 0)), 0);
    const totalNetProfit = realizedProfit + unrealizedProfit + totalDividends;

    // 漲跌樣式處理
    const changePercent = priceInfo ? priceInfo.changePercent : 0;
    const changeColor = changePercent >= 0 ? 'text-red-500' : 'text-green-600';
    const changeIcon = changePercent >= 0 ? '▲' : '▼';
    const profitColor = totalNetProfit >= 0 ? 'text-red-500' : 'text-green-600';

    // 5. 【渲染總結面板】
    summaryPanel.innerHTML = `
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div class="text-xs font-bold text-gray-400 uppercase mb-1">目前股價 / 均價</div>
            <div class="flex items-baseline space-x-2">
                <span class="text-lg font-black text-slate-700">${currentPrice || '---'}</span>
                <span class="text-[10px] font-bold ${changeColor}">
                    ${currentPrice ? `${changeIcon}${Math.abs(changePercent).toFixed(2)}%` : ''}
                </span>
            </div>
            <div class="text-sm font-bold text-slate-400">Avg: $${avgCost.toFixed(2)}</div>
        </div>

        <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div class="text-xs font-bold text-gray-400 uppercase mb-1">目前持股 / 市值</div>
            <div class="text-lg font-black text-slate-700">${totalShares.toLocaleString()} 股</div>
            <div class="text-sm font-bold text-blue-600">$${Math.round(marketValue).toLocaleString()}</div>
        </div>

        <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div class="text-xs font-bold text-gray-400 uppercase mb-1">累計領取股利</div>
            <div class="text-lg font-black text-emerald-600">$${Math.round(totalDividends).toLocaleString()}</div>
            <div class="text-[10px] text-gray-400">已扣費用</div>
        </div>

        <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <div class="text-xs font-bold text-gray-400 uppercase mb-1">已實現損益</div>
            <div class="text-lg font-black ${realizedProfit >= 0 ? 'text-red-500' : 'text-green-600'}">$${Math.round(realizedProfit).toLocaleString()}</div>
            <div class="text-[10px] text-gray-400">離場獲利</div>
        </div>

        <div class="bg-white p-5 rounded-2xl shadow-sm border border-blue-100 bg-blue-50/30">
            <div class="text-xs font-bold text-blue-400 uppercase mb-1">總預估損益</div>
            <div class="text-xl font-black ${profitColor}">$${Math.round(totalNetProfit).toLocaleString()}</div>
            <div class="text-[10px] font-bold ${profitColor}">
                ${totalNetProfit >= 0 ? '▲' : '▼'} ${remainingCost > 0 ? (totalNetProfit/remainingCost*100).toFixed(2) : '0.00'}%
            </div>
        </div>
    `;

    // 6. 【渲染交易紀錄列表】(降序)
    const displayTrades = [...trades].reverse(); 
    tradeBody.innerHTML = displayTrades.map(t => {
        const absShares = Math.abs(t.shares);
        const unitPrice = absShares > 0 ? (t.total_price - (t.fee || 0)) / absShares : 0;
        let profitHTML = '<span class="text-gray-400">---</span>';
        
        if (currentPrice && t.shares > 0) {
            const p = (absShares * currentPrice) - t.total_price;
            const color = p >= 0 ? 'text-red-500' : 'text-green-600';
            profitHTML = `<div class="${color} font-bold">$${Math.round(p).toLocaleString()}</div>`;
        } else if (t.shares < 0) {
            profitHTML = '<span class="text-xs text-slate-300 italic bg-slate-100 px-2 py-0.5 rounded">已結算</span>';
        }

        return `
            <tr class="hover:bg-gray-50 border-b border-gray-50 transition">
                <td class="px-4 py-4 text-gray-400 text-xs">${t.trade_date}</td>
                <td class="px-4 py-4 font-bold ${t.shares > 0 ? 'text-red-500' : 'text-green-600'}">${t.shares > 0 ? '買入' : '賣出'}</td>
                <td class="px-4 py-4 text-slate-700">
                    <div class="font-medium">${absShares.toLocaleString()} 股</div>
                    <div class="text-[10px] text-gray-400">@${unitPrice.toFixed(2)}</div>
                </td>
                <td class="px-4 py-4">
                    <div class="font-bold text-slate-700">$${Math.round(t.total_price).toLocaleString()}</div>
                    <div class="text-[10px] text-gray-400">含費 $${t.fee || 0}</div>
                </td>
                <td class="px-4 py-4 text-right">${profitHTML}</td>
                <td class="px-4 py-4 text-right">
                    <button onclick='openEditModal("holdings", ${JSON.stringify(t)})' class="text-blue-500 font-bold text-xs border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">編輯</button>
                </td>
            </tr>`;
    }).join('');

    // 7. 【渲染股利列表】(降序)
    const displayDividends = [...dividends].reverse();
    divBody.innerHTML = displayDividends.map(d => `
        <tr class="hover:bg-gray-50 border-b border-gray-50 transition">
            <td class="px-4 py-4 text-gray-400 text-xs">${d.pay_date}</td>
            <td class="px-4 py-4 text-emerald-600 font-bold">$${parseFloat(d.amount).toLocaleString()}</td>
            <td class="px-4 py-4 text-gray-400 text-xs">$${d.fee || 0}</td>
            <td class="px-4 py-4 text-right">
                <button onclick='openEditModal("dividends", ${JSON.stringify(d)})' class="text-blue-500 font-bold text-xs border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">編輯</button>
            </td>
        </tr>`).join('');
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
