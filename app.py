import streamlit as st
import yfinance as yf
import pandas as pd
from datetime import datetime

# 設定網頁標題與圖示
st.set_page_config(page_title="個人股票投資工具", page_icon="📈")

st.title("📈 個人股票投資工具")

# --- 側邊欄：即時大盤資訊 ---
st.sidebar.header("市場即時資訊")
def get_market_status(symbol, name):
    try:
        ticker = yf.Ticker(symbol)
        data = ticker.history(period="1d")
        if not data.empty:
            price = data['Close'].iloc[-1]
            prev_close = ticker.info.get('previousClose', price)
            change = price - prev_close
            st.sidebar.metric(name, f"{price:,.2f}", f"{change:+.2f}")
    except:
        st.sidebar.write(f"無法載入 {name} 資料")

get_market_status("^TWII", "加權指數")
get_market_status("^IXIC", "納斯達克")

# --- 第一部分：即時個股查詢 ---
st.header("🔍 即時個股查價")
target_stock = st.text_input("請輸入股票代號 (台股請加 .TW, 美股直接輸入)", "2330.TW")

if target_stock:
    try:
        stock = yf.Ticker(target_stock)
        # 抓取今天和昨天的資料來計算漲跌
        df = stock.history(period="2d")
        
        if len(df) >= 1:
            info = stock.info
            curr_price = df['Close'].iloc[-1]
            
            # 處理漲跌幅邏輯
            if len(df) > 1:
                prev_price = df['Close'].iloc[-2]
            else:
                prev_price = info.get('previousClose', curr_price)
                
            delta = curr_price - prev_price
            delta_pct = (delta / prev_price) * 100
            
            # 顯示資訊卡
            c1, c2, c3 = st.columns(3)
            c1.metric("目前股價", f"{curr_price:.2f}")
            c2.metric("今日漲跌", f"{delta:+.2f}", f"{delta_pct:+.2f}%")
            c3.write(f"**公司名稱:** \n{info.get('shortName', 'N/A')}")
            
            st.caption(f"最後更新時間: {df.index[-1].strftime('%Y-%m-%d %H:%M')}")
        else:
            st.warning("查無資料，請確認代號是否正確。")
    except Exception as e:
        st.error(f"查詢出錯: {e}")

st.divider()

# --- 第二部分：記錄買賣交易 ---
st.header("📝 新增買賣紀錄")
with st.form("trade_form", clear_on_submit=True):
    col1, col2 = st.columns(2)
    with col1:
        t_date = st.date_input("交易日期", datetime.now())
        t_symbol = st.text_input("股票代號", placeholder="例如: 2330.TW")
        t_type = st.selectbox("交易類型", ["買進", "賣出"])
    
    with col2:
        t_price = st.number_input("交易單價", min_value=0.0, format="%.2f")
        t_qty = st.number_input("股數", min_value=1, step=1)
        t_fee = st.number_input("手續費/稅金", min_value=0, step=1)

    # 計算總額
    total_cost = (t_price * t_qty) + t_fee if t_type == "買進" else (t_price * t_qty) - t_fee
    st.write(f"**預估成交總額：** {total_cost:,.0f}")
    
    submitted = st.form_submit_button("儲存紀錄至雲端 (測試中)")
    
    if submitted:
        if not t_symbol:
            st.error("請輸入股票代號")
        else:
            # 這裡之後會串接 SQL
            st.success(f"已暫存：{t_date} {t_type} {t_symbol} {t_qty}股")
            st.info("提示：目前尚未連接資料庫，重新整理網頁後資料將會消失。")

# --- 第三部分：資產概況預覽 (Demo) ---
st.divider()
st.header("📊 我的投資組合 (範例數據)")
# 這裡先用靜態資料模擬未來從 SQL 讀取的結果
mock_data = pd.DataFrame({
    "股票代號": ["2330.TW", "AAPL", "NVDA"],
    "持有股數": [1000, 50, 20],
    "平均成本": [600.0, 180.0, 450.0],
    "目前現價": [0.0, 0.0, 0.0] # 待填入
})

st.table(mock_data)
st.info("待連接 SQL 資料庫後，系統將自動計算資產變化曲線與總損益。")
