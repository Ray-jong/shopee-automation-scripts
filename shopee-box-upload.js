// ==UserScript==
// @name         蝦皮裝箱單批次上傳 (v2.0 全自動點擊版)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  自動上傳 -> 自動按完成 -> 自動繼續 (無人值守)
// @author       OrgLife / Fixed by Gemini
// @match        https://sp.spx.shopee.tw/outbound-management/pack-drop-off-to/scan-to-new*
// @grant        none
// @icon         https://sp.spx.shopee.tw/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    // ========== 配置區 ==========
    const CONFIG = {
        MIN_DELAY: 500,   // 隨機延遲最小 (毫秒)
        MAX_DELAY: 1200,  // 隨機延遲最大 (毫秒)
        
        // ★★★ 設定每幾筆執行一次「完成」 ★★★
        BATCH_SIZE: 250, 

        // API 設定
        VALIDATE_API: 'https://dev.orglife.com.tw/Api/DB?Type=Token&App=ShopeeBoxUpload&Token=',
        STATS_API: 'https://dev.orglife.com.tw/Api/DB?Type=Shopee_Box_Upd',
        SCAN_API: 'https://sp.spx.shopee.tw/sp-api/point/sorting/box_to/transport/scan',
    };

    let uploadStats = { success: 0, fail: 0, total: 0 };

    async function init() {
        console.log('[裝箱單上傳] 初始化...');
        const token = getTokenFromUrl();
        if (!token) { alert('❌ 無 Token'); return; }
        // 簡易驗證
        try {
            const res = await fetch(CONFIG.VALIDATE_API + token);
            if((await res.text()).includes('Invalid')) { alert('❌ Token 無效'); return; }
        } catch {}
        
        injectUI();
    }

    function getTokenFromUrl() {
        return new URLSearchParams(window.location.search).get('token');
    }

    function injectUI() {
        const div = document.createElement('div');
        div.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; background: #e8f5e9; padding: 15px; z-index: 99999; border-bottom: 3px solid #28a745; box-shadow: 0 2px 5px rgba(0,0,0,0.2);`;
        div.innerHTML = `
            <div style="max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #2e7d32;">🤖 裝箱單全自動機器人 (v2.0)</h3>
                    <div style="font-size: 14px; color: #555;">
                        狀態: <span id="statusText" style="font-weight: bold; color: blue;">待機中</span>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <textarea id="inputBox" placeholder="請貼上所有單號 (支援數千筆，腳本會自動分批處理)" style="flex: 1; height: 100px; padding: 10px; border: 1px solid #aaa; border-radius: 5px;"></textarea>
                    <button id="runBtn" style="width: 120px; background: #2e7d32; color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 16px;">🚀 啟動</button>
                </div>

                <div style="background: #000; color: #0f0; padding: 10px; height: 150px; overflow-y: auto; font-family: monospace; font-size: 12px; border-radius: 5px;" id="consoleLog"></div>
            </div>
        `;
        document.body.prepend(div);
        document.body.style.paddingTop = div.offsetHeight + 'px';

        document.getElementById('runBtn').onclick = startAutomation;
    }

    function log(msg) {
        const box = document.getElementById('consoleLog');
        const time = new Date().toLocaleTimeString();
        box.innerHTML += `<div>[${time}] ${msg}</div>`;
        box.scrollTop = box.scrollHeight;
        document.getElementById('statusText').innerText = msg;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function randDelay() { return Math.floor(Math.random() * (CONFIG.MAX_DELAY - CONFIG.MIN_DELAY + 1)) + CONFIG.MIN_DELAY; }

    // ★★★ 模擬點擊「完成」按鈕的核心功能 ★★★
    function clickCompleteButton() {
        // 尋找網頁上所有按鈕，找到文字包含 "完成" 或 "Finish" 的那個
        const buttons = Array.from(document.querySelectorAll('button'));
        const targetBtn = buttons.find(b => b.innerText.includes('完成') || b.innerText.includes('Finish'));
        
        if (targetBtn) {
            log('🖱️ 正在點擊網頁上的【完成】按鈕...');
            targetBtn.click();
            return true;
        } else {
            log('⚠️ 找不到【完成】按鈕，可能已經清空或無需點擊。');
            return false;
        }
    }

    async function startAutomation() {
        const input = document.getElementById('inputBox');
        const lines = input.value.split('\n').map(x => x.trim()).filter(x => x);
        
        if (!lines.length) return alert('請輸入單號');
        if (!confirm(`準備上傳 ${lines.length} 筆資料，確認執行？`)) return;

        document.getElementById('runBtn').disabled = true;
        uploadStats = { success: 0, fail: 0, total: lines.length };

        log(`=== 任務開始：共 ${lines.length} 筆 (每 ${CONFIG.BATCH_SIZE} 筆自動重整) ===`);

        for (let i = 0; i < lines.length; i++) {
            // 分批檢查點
            if (i > 0 && i % CONFIG.BATCH_SIZE === 0) {
                log(`⏸️ 已達 ${i} 筆，執行自動清空程序...`);
                
                // 1. 點擊完成
                clickCompleteButton();
                
                // 2. 等待網頁反應 (給它 3 秒)
                await sleep(3000);
                
                log(`▶️ 清空完畢，繼續執行...`);
            }

            // 執行上傳
            const boxNo = lines[i];
            try {
                const res = await fetch(CONFIG.SCAN_API, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ to_number: boxNo })
                });
                const json = await res.json();
                
                if (json.retcode === 0) {
                    uploadStats.success++;
                    log(`✅ (${i+1}/${lines.length}) 成功: ${boxNo}`);
                } else {
                    uploadStats.fail++;
                    log(`❌ 失敗: ${boxNo} (${json.message})`);
                }
            } catch (err) {
                uploadStats.fail++;
                log(`❌ 錯誤: ${err.message}`);
            }

            // 隨機延遲
            if (i < lines.length - 1) await sleep(randDelay());
        }

        // 最後再按一次完成，確保乾淨
        log('🏁 所有資料上傳完畢，執行最後清空...');
        clickCompleteButton();
        
        log('🎉 任務大成功！');
        alert(`處理完成！\n成功: ${uploadStats.success}\n失敗: ${uploadStats.fail}`);
        document.getElementById('runBtn').disabled = false;

        // 回傳統計
        try {
            const fd = new FormData();
            fd.append('Token', getTokenFromUrl());
            fd.append('Qty', uploadStats.success);
            fd.append('Name', 'BoxUpload');
            fetch(CONFIG.STATS_API, { method: 'POST', body: fd });
        } catch {}
    }

    setTimeout(init, 1000);
})();
