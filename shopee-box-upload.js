// ==UserScript==
// @name         蝦皮裝箱單批次上傳 (v2.3 經典介面版)
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  還原經典介面 + 視窗可縮放 + 速度優化 + 嚴格授權
// @author       OrgLife / Fixed by Gemini
// @match        https://sp.spx.shopee.tw/*
// @grant        none
// @icon         https://sp.spx.shopee.tw/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    // ========== 配置區 (可自行調整速度) ==========
    const CONFIG = {
        // 1. 速度設定 (毫秒) - 已調快
        MIN_DELAY: 100,   // 最快 0.1 秒
        MAX_DELAY: 300,   // 最慢 0.3 秒
        
        // 2. 批次設定
        BATCH_SIZE: 250,  // 每 250 筆執行一次自動完成
        RESET_WAIT: 2000, // 按下完成後等待 2 秒 (網頁重整時間)

        // API 設定
        VALIDATE_API: 'https://dev.orglife.com.tw/Api/DB?Type=Token&App=ShopeeBoxUpload&Token=',
        STATS_API: 'https://dev.orglife.com.tw/Api/DB?Type=Shopee_Box_Upd',
        SCAN_API: 'https://sp.spx.shopee.tw/sp-api/point/sorting/box_to/transport/scan',
        
        // 目標頁面關鍵字
        TARGET_URL_KEYWORD: 'outbound-management'
    };

    // ========== 核心啟動邏輯 (嚴格驗證) ==========
    async function init() {
        if (!window.location.href.includes(CONFIG.TARGET_URL_KEYWORD)) return;

        console.log('[裝箱單上傳] 正在驗證授權...');

        let token = new URLSearchParams(window.location.search).get('token');
        let isFromUrl = false;

        if (token) {
            isFromUrl = true;
        } else {
            token = localStorage.getItem('shopee_upload_token');
        }

        if (!token) {
            console.warn('❌ 無授權 Token，拒絕啟動。');
            return;
        }

        const isValid = await checkLicense(token);

        if (!isValid) {
            alert('❌ 授權驗證失敗！\n\nToken 無效或已過期。');
            localStorage.removeItem('shopee_upload_token');
            return;
        }

        if (isFromUrl) {
            localStorage.setItem('shopee_upload_token', token);
        }

        // 啟動 UI 守護者
        startUIGuardian(token);
    }

    async function checkLicense(token) {
        try {
            const response = await fetch(CONFIG.VALIDATE_API + token);
            const text = await response.text();
            return !text.includes('Invalid');
        } catch (error) {
            alert('⚠️ 無法連線至授權伺服器');
            return false;
        }
    }

    // ========== UI 相關 (還原經典介面) ==========
    let uiInterval = null;
    let uploadStats = { success: 0, fail: 0, total: 0 };

    function startUIGuardian(token) {
        if (uiInterval) clearInterval(uiInterval);
        injectUI(token); // 立即執行一次

        uiInterval = setInterval(() => {
            const isCorrectPage = window.location.href.includes(CONFIG.TARGET_URL_KEYWORD);
            const uiExists = document.getElementById('shopee-upload-container');

            if (isCorrectPage && !uiExists) {
                injectUI(token);
            } else if (!isCorrectPage && uiExists) {
                uiExists.remove();
            }
        }, 1000);
    }

    function injectUI(token) {
        if (document.getElementById('shopee-upload-container')) return;

        const div = document.createElement('div');
        div.id = 'shopee-upload-container';
        
        // CSS 重點：還原 v1.4 風格，並加入 resize 屬性
        div.style.cssText = `
            position: fixed; 
            top: 10px; 
            right: 10px; 
            width: 600px; 
            min-width: 400px;
            min-height: 300px;
            background: #f8f9fa; 
            padding: 15px; 
            z-index: 99999; 
            border: 1px solid #ddd;
            border-radius: 5px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2); 
            font-family: "Microsoft JhengHei", sans-serif;
            resize: both; 
            overflow: auto; /* 允許內容隨視窗滾動 */
        `;

        // HTML 結構：模仿截圖 image_77a1b1.png
        div.innerHTML = `
            <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px; border-bottom: 2px solid #28a745; padding-bottom: 5px;">
                📦 裝箱單批次上傳 <span style="font-size: 12px; color: #666;">(v2.3 經典版)</span>
            </h3>

            <details style="margin-bottom: 10px; font-size: 12px; color: #666;">
                <summary style="cursor: pointer;">⚙️ 進階設定 (通常不需要修改)</summary>
                <div style="margin-top: 5px; padding: 5px; background: #e9ecef; border-radius: 3px;">
                     目前設定：每 ${CONFIG.BATCH_SIZE} 筆自動完成，延遲 ${CONFIG.MIN_DELAY}~${CONFIG.MAX_DELAY}ms
                </div>
            </details>
            
            <div style="display: flex; gap: 10px; height: calc(100% - 150px); min-height: 100px;">
                <textarea id="inputBox" 
                    placeholder="請輸入裝箱單號，每行一個&#10;例如：&#10;SPTO251125764617&#10;SPTO251184405078" 
                    style="flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 4px; resize: none; font-family: monospace;"></textarea>
                
                <div style="display: flex; flex-direction: column; gap: 8px; width: 120px;">
                    <button id="runBtn" style="padding: 10px; background: #28a745; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">🚀 開始上傳</button>
                    <button id="clearLogBtn" style="padding: 8px; background: #ffc107; color: black; border: none; border-radius: 4px; cursor: pointer;">🗑 清空日誌</button>
                    <button id="clearAllBtn" style="padding: 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">🔄 清空全部</button>
                    <div id="statusText" style="margin-top: auto; font-size: 12px; text-align: center; color: blue;">準備就緒</div>
                </div>
            </div>

            <div style="margin-top: 10px;">
                <strong style="font-size: 13px;">上傳日誌：</strong>
                <div id="consoleLog" style="background: #1e1e1e; color: #0f0; padding: 8px; height: 100px; overflow-y: auto; font-family: monospace; font-size: 12px; border-radius: 4px; margin-top: 5px;"></div>
            </div>
        `;
        document.body.appendChild(div);

        // 綁定按鈕事件
        document.getElementById('runBtn').onclick = () => startAutomation(token);
        document.getElementById('clearLogBtn').onclick = () => { document.getElementById('consoleLog').innerHTML = ''; };
        document.getElementById('clearAllBtn').onclick = () => {
            if(confirm('確定要清空全部內容嗎？')) {
                document.getElementById('inputBox').value = '';
                document.getElementById('consoleLog').innerHTML = '';
            }
        };
    }

    function log(msg) {
        const box = document.getElementById('consoleLog');
        if(!box) return;
        const time = new Date().toLocaleTimeString();
        box.innerHTML += `<div>[${time}] ${msg}</div>`;
        box.scrollTop = box.scrollHeight;
        
        const status = document.getElementById('statusText');
        if(status) status.innerText = "工作中...";
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function randDelay() { return Math.floor(Math.random() * (CONFIG.MAX_DELAY - CONFIG.MIN_DELAY + 1)) + CONFIG.MIN_DELAY; }
    function getToken() { return localStorage.getItem('shopee_upload_token'); }

    // 自動點擊完成按鈕
    function clickCompleteButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const targetBtn = buttons.find(b => 
            b.innerText.includes('完成') || 
            b.innerText.includes('Finish') || 
            b.classList.contains('shopee-button--danger')
        );
        if (targetBtn) {
            log('🖱️ 自動點擊【完成】...');
            targetBtn.click();
            return true;
        }
        return false;
    }

    // 主程式
    async function startAutomation(token) {
        const input = document.getElementById('inputBox');
        const lines = input.value.split('\n').map(x => x.trim()).filter(x => x);
        
        if (!lines.length) return alert('請輸入單號');
        
        const runBtn = document.getElementById('runBtn');
        runBtn.disabled = true;
        runBtn.style.opacity = "0.6";
        runBtn.innerText = "⏳ 上傳中";
        
        uploadStats = { success: 0, fail: 0, total: lines.length };
        log(`=== 開始任務：共 ${lines.length} 筆 ===`);

        for (let i = 0; i < lines.length; i++) {
            // 批次暫停邏輯
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

        log('🏁 任務結束，最後清空...');
        clickCompleteButton();
        
        alert(`處理完成！\n成功: ${uploadStats.success}\n失敗: ${uploadStats.fail}`);
        runBtn.disabled = false;
        runBtn.style.opacity = "1";
        runBtn.innerText = "🚀 開始上傳";
        document.getElementById('statusText').innerText = "準備就緒";

        // 回傳統計
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
