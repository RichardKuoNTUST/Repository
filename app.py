import streamlit as st
import pandas as pd

st.title("我的個人股票投資工具")

# 模擬目前的交易紀錄欄位
st.subheader("新增交易紀錄")
with st.form("transaction_form"):
    col1, col2, col3 = st.columns(3)
    date = col1.date_input("日期")
    symbol = col2.text_input("股票代號 (如: 2330.TW)")
    price = col3.number_input("交易價格", min_value=0.0)
    
    col4, col5, col6 = st.columns(3)
    quantity = col4.number_input("股數", step=1)
    fee = col5.number_input("手續費", min_value=0)
    total = col6.write(f"總額計算: {(price * quantity) + fee}")
    
    submit = st.form_submit_button("儲存紀錄")

if submit:
    st.success(f"已收到 {symbol} 的交易紀錄（目前僅為測試，尚未連動資料庫）")
