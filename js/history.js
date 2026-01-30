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

async function loadHistory(symbol) {
    const tradeBody = document.getElementById('trade-history-list');
    const divBody = document.getElementById('dividend-history-list');

    // 1. 抓取交易紀錄
    const { data: trades } = await _supabase.from('holdings').select('*').eq('symbol', symbol).order('trade_date', { ascending: false });
    tradeBody.innerHTML = trades.map(t => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 text-gray-600">${t.trade_date}</td>
            <td class="px-4 py-3">
                <span class="${t.shares > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'} px-2 py-1 rounded text-xs font-bold">
                    ${t.shares > 0 ? '買入' : '賣出'}
                </span>
            </td>
            <td class="px-4 py-3 font-medium">${Math.abs(t.shares).toLocaleString()} 股</td>
            <td class="px-4 py-3">$${Math.round(t.total_price).toLocaleString()}</td>
            <td class="px-4 py-3 text-right">
                <button onclick="deleteRecord('holdings', '${t.id}', '${symbol}')" class="text-red-400 hover:text-red-600 ml-2">刪除</button>
            </td>
        </tr>
    `).join('');

    // 2. 抓取股利紀錄
    const { data: dividends } = await _supabase.from('dividends').select('*').eq('symbol', symbol).order('pay_date', { ascending: false });
    divBody.innerHTML = dividends.map(d => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 text-gray-600">${d.pay_date}</td>
            <td class="px-4 py-3 text-emerald-600 font-bold">$${parseFloat(d.amount).toLocaleString()}</td>
            <td class="px-4 py-3 text-gray-400">$${d.fee}</td>
            <td class="px-4 py-3 text-right">
                <button onclick="deleteRecord('dividends', '${d.id}', '${symbol}')" class="text-red-400 hover:text-red-600 ml-2">刪除</button>
            </td>
        </tr>
    `).join('');
}

// 刪除功能
async function deleteRecord(table, id, symbol) {
    if (!confirm('確定要刪除這筆紀錄嗎？此動作無法復原。')) return;

    const { error } = await _supabase.from(table).delete().eq('id', id);
    if (error) {
        alert("刪除失敗: " + error.message);
    } else {
        loadHistory(symbol); // 重新載入
    }
}
