// ==UserScript==
// @name         蝦皮裝箱單批次上傳 (v3.2 橫向單線程版)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  三欄式介面(左輸入/中日誌/右按鈕) + 極速單線程 + 嚴格授權
// @author       OrgLife / Fixed by Gemini
// @match        https://sp.spx.shopee.tw/*
// @grant        none
// @icon         https://sp.spx.shopee.tw/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    // ========== 配置區 (單線程極速設定) ==========
    const CONFIG = {
        // 隨機延遲 (毫秒) - 設定在安全範圍內的極速
        MIN_DELAY: 50,    
        MAX_DELAY: 150,   
        
        // 批次設定
        BATCH_SIZE: 250,  // 每 250 筆執行一次自動完成
        RESET_WAIT: 2000, // 按下完成後等待 2 秒

        // API 設定
        VALIDATE_API: 'https://dev.orglife.com.tw/Api/DB?Type=Token&App=ShopeeBoxUpload&Token=',
        STATS_API: 'https://dev.orglife.com.tw/Api/DB?Type=Shopee_Box_Upd',
        SCAN_API: 'https://sp.spx.shopee.tw/sp-api/point/sorting/box_to/transport/scan',
        TARGET_URL_KEYWORD: 'outbound-management'
    };

    // ========== 核心啟動邏輯 ==========
    async function init() {
        if (!window.location.href.includes(CONFIG.TARGET_URL_KEYWORD)) return;
        
        let token = new URLSearchParams(window.location.search).get('token');
        let isFromUrl = false;

        if (token) { isFromUrl = true; } 
        else { token = localStorage.getItem('shopee_upload_token'); }

        if (!token) return;

        // 驗證 Token
        const isValid = await checkLicense(token);
        if (!isValid) {
            alert('❌ 授權驗證失敗！Token 無效。');
            localStorage.removeItem('shopee_upload_token');
            return;
        }

        if (isFromUrl) localStorage.setItem('shopee_upload_token', token);
        
        // 啟動 UI 守護者
        startUIGuardian(token);
    }

    async function checkLicense(token) {
        try {
            const response = await fetch(CONFIG.VALIDATE_API + token);
            return !(await response.text()).includes('Invalid');
        } catch { return false; }
    }

    // ========== UI 介面 (橫向三欄佈局) ==========
    let uiInterval = null;
    let uploadStats = { success: 0, fail: 0, total: 0 };

    function startUIGuardian(token) {
        if (uiInterval) clearInterval(uiInterval);
        injectUI(token);
        uiInterval = setInterval(() => {
            const isCorrect = window.location.href.includes(CONFIG.TARGET_URL_KEYWORD);
            const exists = document.getElementById('shopee-upload-container');
            if (isCorrect && !exists) injectUI(token);
            else if (!isCorrect && exists) exists.remove();
        }, 1000);
    }

    function injectUI(token) {
        if (document.getElementById('shopee-upload-container')) return;

        const div = document.createElement('div');
        div.id = 'shopee-upload-container';
        div.style.cssText = `
            position: fixed; 
            top: 10px; 
            left: 50%; 
            transform: translateX(-50%);
            width: 800px; 
            height: 250px;
            min-width: 600px; 
            min-height: 200px;
            background: #f8f9fa; 
            padding: 10px; 
            z-index: 99999; 
            border: 1px solid #ccc;
            border-radius: 8px; 
            box-shadow: 0 5px 20px rgba(0,0,0,0.3); 
            font-family: "Microsoft JhengHei", sans-serif; 
            resize: both; 
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 2px solid #2e7d32; padding-bottom: 5px;">
                <h3 style="margin: 0; color: #2e7d32; font-size: 16px;">
                    📦 裝箱單極速上傳 <span style="font-size: 12px; color: #666;">(v3.2 橫向單線程版)</span>
                </h3>
                <div style="font-size: 12px; color: #555;">
                    狀態: <span id="statusText" style="font-weight: bold; color: blue;">待機</span>
                </div>
            </div>

            <div style="flex: 1; display: flex; gap: 10px; min-height: 0;">
                
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <div style="font-size: 12px; font-weight: bold; color: #333; margin-bottom: 4px;">📥 裝箱單號輸入</div>
                    <textarea id="inputBox" placeholder="請貼上單號..." style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; resize: none; font-family: monospace; font-size: 13px;"></textarea>
                </div>

                <div style="flex: 1; display: flex; flex-direction: column;">
                    <div style="font-size: 12px; font-weight: bold; color: #333; margin-bottom: 4px;">📝 上傳日誌</div>
                    <div id="consoleLog" style="flex: 1; background: #1e1e1e; color: #0f0; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 12px; overflow-y: auto; white-space: pre-wrap;"></div>
                </div>

                <div style="width: 100px; display: flex; flex-direction: column; gap: 6px; padding-top: 20px;">
                    <button id="runBtn" style="padding: 10px 0; background: #2e7d32; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">🚀 開始</button>
                    <button id="clearLogBtn" style="padding: 8px 0; background: #ffc107; color: black; border: none; border-radius: 4px; cursor: pointer;">🗑 清日誌</button>
                    <button id="clearAllBtn" style="padding: 8px 0; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">🔄 清全部</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);

        document.getElementById('runBtn').onclick = () => startSequentialUpload(token);
        document.getElementById('clearLogBtn').onclick = () => { document.getElementById('consoleLog').innerHTML = ''; };
        document.getElementById('clearAllBtn').onclick = () => {
            if(confirm('確定要清空全部？')) {
                document.getElementById('inputBox').value = '';
                document.getElementById('consoleLog').innerHTML = '';
            }
        };
    }

    function log(msg) {
        const box = document.getElementById('consoleLog');
        if(!box) return;
        const time = new Date().toLocaleTimeString('en-US', {hour12: false});
        box.innerHTML += `<div>[${time}] ${msg}</div>`;
        box.scrollTop = box.scrollHeight;
        document.getElementById('statusText').innerText = "工作中...";
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function randDelay() { return Math.floor(Math.random() * (CONFIG.MAX_DELAY - CONFIG.MIN_DELAY + 1)) + CONFIG.MIN_DELAY; }

    function clickCompleteButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const targetBtn = buttons.find(b => 
            b.innerText.includes('完成') || b.innerText.includes('Finish') || b.classList.contains('shopee-button--danger')
        );
        if (targetBtn) {
            log('🖱️ 自動點擊【完成】...');
            targetBtn.click();
            return true;
        }
        return false;
    }

    // ★★★ 單線程核心邏輯 ★★★
    async function startSequentialUpload(token) {
        const input = document.getElementById('inputBox');
        const lines = input.value.split('\n').map(x => x.trim()).filter(x => x);
        
        if (!lines.length) return alert('請輸入單號');
        
        const runBtn = document.getElementById('runBtn');
        runBtn.disabled = true;
        runBtn.innerText = "⏳...";
        
        uploadStats = { success: 0, fail: 0, total: lines.length };
        log(`=== 開始 (${lines.length}筆) ===`);

        for (let i = 0; i < lines.length; i++) {
            
            // 批次自動完成
            if (i > 0 && i % CONFIG.BATCH_SIZE === 0) {
                log(`⏸️ 批次暫停：執行自動完成...`);
                clickCompleteButton();
                await sleep(CONFIG.RESET_WAIT);
                log(`▶️ 繼續執行...`);
            }

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
                    log(`✅ ${boxNo}`);
                } else {
                    uploadStats.fail++;
                    log(`❌ ${boxNo} (${json.message})`);
                }
            } catch (err) {
                uploadStats.fail++;
                log(`❌ ${boxNo} (Err)`);
            }

            // 執行隨機延遲 (單線程模式下，這是控制速度的關鍵)
            if (i < lines.length - 1) await sleep(randDelay());
        }

        log('🏁 任務結束');
        clickCompleteButton();
        
        alert(`處理完成！\n成功: ${uploadStats.success}\n失敗: ${uploadStats.fail}`);
        runBtn.disabled = false;
        runBtn.innerText = "🚀 開始";
        document.getElementById('statusText').innerText = "完成";

        try {
            const fd = new FormData();
            fd.append('Token', token);
            fd.append('Qty', uploadStats.success);
            fd.append('Name', 'BoxUpload');
            fetch(CONFIG.STATS_API, { method: 'POST', body: fd });
        } catch {}
    }

    setTimeout(init, 1500);

})();
