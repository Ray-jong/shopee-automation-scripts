// ==UserScript==
// @name         蝦皮裝箱單批次上傳 (v2.1 穩定版)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  全自動點擊 + Token記憶 + 防消失機制
// @author       OrgLife / Fixed by Gemini
// @match        https://sp.spx.shopee.tw/*
// @grant        none
// @icon         https://sp.spx.shopee.tw/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    // ========== 配置區 ==========
    const CONFIG = {
        MIN_DELAY: 500,
        MAX_DELAY: 1200,
        BATCH_SIZE: 250, // 每幾筆執行一次「完成」

        // API 設定
        VALIDATE_API: 'https://dev.orglife.com.tw/Api/DB?Type=Token&App=ShopeeBoxUpload&Token=',
        STATS_API: 'https://dev.orglife.com.tw/Api/DB?Type=Shopee_Box_Upd',
        SCAN_API: 'https://sp.spx.shopee.tw/sp-api/point/sorting/box_to/transport/scan',
        
        // 介面顯示條件 (網址包含此關鍵字時才顯示UI)
        // 如果您的網址不同，請修改這裡，或留空字串 '' 代表全部顯示
        TARGET_URL_KEYWORD: 'outbound-management' 
    };

    let uploadStats = { success: 0, fail: 0, total: 0 };
    let uiInterval = null;

    async function init() {
        console.log('[裝箱單上傳] 腳本啟動中...');
        
        // 1. 處理 Token (優先讀網址，沒有則讀記憶)
        let token = new URLSearchParams(window.location.search).get('token');
        if (token) {
            localStorage.setItem('shopee_upload_token', token); // 記憶 Token
            console.log('Token 已更新並儲存');
        } else {
            token = localStorage.getItem('shopee_upload_token');
            if(token) console.log('使用已儲存的 Token');
        }

        if (!token) { 
            console.warn('無 Token，腳本待機中');
            return; // 沒有 Token 就不顯示 UI，避免干擾
        }

        // 2. 簡易驗證
        try {
            const res = await fetch(CONFIG.VALIDATE_API + token);
            if((await res.text()).includes('Invalid')) { 
                alert('❌ Token 無效或已過期，請重新從系統進入'); 
                localStorage.removeItem('shopee_upload_token');
                return; 
            }
        } catch {}
        
        // 3. 啟動 UI 守護者 (防止 SPA 切換頁面後 UI 消失)
        startUIGuardian();
    }

    function startUIGuardian() {
        // 每 1 秒檢查一次，如果 UI 不見了且網址正確，就重畫
        if (uiInterval) clearInterval(uiInterval);
        uiInterval = setInterval(() => {
            const isCorrectPage = window.location.href.includes(CONFIG.TARGET_URL_KEYWORD);
            const uiExists = document.getElementById('shopee-upload-container');

            if (isCorrectPage && !uiExists) {
                injectUI();
            } else if (!isCorrectPage && uiExists) {
                uiExists.remove(); // 離開目標頁面時隱藏
            }
        }, 1000);
    }

    function injectUI() {
        if (document.getElementById('shopee-upload-container')) return;

        const div = document.createElement('div');
        div.id = 'shopee-upload-container';
        div.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; background: #e8f5e9; padding: 10px; z-index: 99999; border-bottom: 3px solid #28a745; box-shadow: 0 2px 5px rgba(0,0,0,0.2); font-family: "Roboto", sans-serif;`;
        div.innerHTML = `
            <div style="max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #2e7d32; font-size: 16px;">🤖 裝箱單全自動機器人 (v2.1)</h3>
                    <div style="font-size: 12px; color: #555;">
                        <span id="statusText" style="font-weight: bold; color: blue;">準備就緒</span>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <textarea id="inputBox" placeholder="請貼上裝箱單號..." style="flex: 1; height: 80px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"></textarea>
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        <button id="runBtn" style="flex: 1; width: 100px; background: #2e7d32; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">🚀 啟動</button>
                        <button id="clearBtn" style="height: 30px; background: #757575; color: white; border: none; border-radius: 4px; cursor: pointer;">🗑️ 清空</button>
                    </div>
                </div>

                <div style="background: #222; color: #0f0; padding: 8px; height: 100px; overflow-y: auto; font-family: monospace; font-size: 11px; border-radius: 4px;" id="consoleLog"></div>
            </div>
        `;
        document.body.prepend(div);
        
        // 避免遮擋原本的內容
        document.body.style.paddingTop = (div.offsetHeight + 10) + 'px';

        document.getElementById('runBtn').onclick = startAutomation;
        document.getElementById('clearBtn').onclick = () => {
            document.getElementById('inputBox').value = '';
            document.getElementById('consoleLog').innerHTML = '';
        };
    }

    function log(msg) {
        const box = document.getElementById('consoleLog');
        if(!box) return;
        const time = new Date().toLocaleTimeString();
        box.innerHTML += `<div>[${time}] ${msg}</div>`;
        box.scrollTop = box.scrollHeight;
        const status = document.getElementById('statusText');
        if(status) status.innerText = msg;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function randDelay() { return Math.floor(Math.random() * (CONFIG.MAX_DELAY - CONFIG.MIN_DELAY + 1)) + CONFIG.MIN_DELAY; }
    function getToken() { return localStorage.getItem('shopee_upload_token'); }

    // ★★★ 模擬點擊「完成」按鈕 ★★★
    function clickCompleteButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        // 嘗試匹配多種可能的按鈕文字
        const targetBtn = buttons.find(b => 
            b.innerText.includes('完成') || 
            b.innerText.includes('Finish') || 
            b.innerText.includes('Complete') ||
            (b.classList.contains('shopee-button--danger')) // 紅色按鈕通常是這個 class
        );
        
        if (targetBtn) {
            log('🖱️ 自動點擊【完成】按鈕...');
            targetBtn.click();
            return true;
        } else {
            log('⚠️ 找不到【完成】按鈕 (可能已清空)');
            return false;
        }
    }

    async function startAutomation() {
        const input = document.getElementById('inputBox');
        const lines = input.value.split('\n').map(x => x.trim()).filter(x => x);
        
        if (!lines.length) return alert('請輸入單號');
        if (!confirm(`共 ${lines.length} 筆，確定開始？`)) return;

        const runBtn = document.getElementById('runBtn');
        runBtn.disabled = true;
        runBtn.style.background = '#999';
        
        uploadStats = { success: 0, fail: 0, total: lines.length };
        log(`=== 開始任務：共 ${lines.length} 筆 ===`);

        for (let i = 0; i < lines.length; i++) {
            // 分批處理邏輯
            if (i > 0 && i % CONFIG.BATCH_SIZE === 0) {
                log(`⏸️ 批次暫停：正在執行自動完成...`);
                clickCompleteButton();
                await sleep(3000); // 等待網頁刷新
                log(`▶️ 繼續執行下一批...`);
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
                    log(`✅ (${i+1}) 成功: ${boxNo}`);
                } else {
                    uploadStats.fail++;
                    log(`❌ 失敗: ${boxNo} (${json.message})`);
                }
            } catch (err) {
                uploadStats.fail++;
                log(`❌ 錯誤: ${err.message}`);
            }

            if (i < lines.length - 1) await sleep(randDelay());
        }

        log('🏁 任務結束，執行最後清空...');
        clickCompleteButton();
        
        alert(`處理完成！\n成功: ${uploadStats.success}\n失敗: ${uploadStats.fail}`);
        runBtn.disabled = false;
        runBtn.style.background = '#2e7d32';

        // 回傳統計
        try {
            const fd = new FormData();
            fd.append('Token', getToken());
            fd.append('Qty', uploadStats.success);
            fd.append('Name', 'BoxUpload');
            fetch(CONFIG.STATS_API, { method: 'POST', body: fd });
        } catch {}
    }

    // 延遲啟動確保頁面載入
    setTimeout(init, 1500);

})();
