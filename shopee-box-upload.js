// ==UserScript==
// @name         蝦皮裝箱單批次上傳 (v2.2 商業授權版)
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  全自動點擊 + 嚴格權限驗證 (Token Auth)
// @author       OrgLife / Fixed by Gemini
// @match        https://sp.spx.shopee.tw/*
// @grant        none
// @icon         https://sp.spx.shopee.tw/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    // ========== 配置區 ==========
    const CONFIG = {
        // 隨機延遲 (毫秒)
        MIN_DELAY: 500,
        MAX_DELAY: 1200,
        
        // 批次大小 (每幾筆執行一次自動完成)
        BATCH_SIZE: 250,

        // API 設定
        VALIDATE_API: 'https://dev.orglife.com.tw/Api/DB?Type=Token&App=ShopeeBoxUpload&Token=',
        STATS_API: 'https://dev.orglife.com.tw/Api/DB?Type=Shopee_Box_Upd',
        SCAN_API: 'https://sp.spx.shopee.tw/sp-api/point/sorting/box_to/transport/scan',
        
        // 目標頁面關鍵字 (只在這些頁面啟動，減少誤判)
        TARGET_URL_KEYWORD: 'outbound-management'
    };

    // ========== 核心啟動邏輯 (嚴格驗證) ==========
    async function init() {
        // 0. 檢查是否為目標頁面 (非目標頁面不執行，節省資源)
        if (!window.location.href.includes(CONFIG.TARGET_URL_KEYWORD)) return;

        console.log('[裝箱單上傳] 正在驗證授權...');

        // 1. 取得 Token (優先看網址，沒有才看記憶體)
        let token = new URLSearchParams(window.location.search).get('token');
        let isFromUrl = false;

        if (token) {
            isFromUrl = true;
        } else {
            token = localStorage.getItem('shopee_upload_token');
        }

        // 2. 如果完全沒有 Token -> 阻擋
        if (!token) {
            console.warn('❌ 無授權 Token，拒絕啟動。');
            // 不顯示 UI，直接結束
            return;
        }

        // 3. 連線驗證 Token 有效性 (這是最重要的一步)
        // 即使是記憶體裡的 Token，每次重整也要驗證，確保沒有被停權
        const isValid = await checkLicense(token);

        if (!isValid) {
            alert('❌ 授權驗證失敗！\n\n您的 Token 無效或已過期，請聯繫管理員重新取得授權。');
            localStorage.removeItem('shopee_upload_token'); // 清除無效 Token
            return; // ★★★ 驗證失敗，直接結束，不執行後續 UI 注入 ★★★
        }

        // 4. 驗證通過
        console.log('✅ 授權驗證成功');
        if (isFromUrl) {
            localStorage.setItem('shopee_upload_token', token); // 只有驗證通過才存起來
            // 為了美觀，可以選擇性把網址上的 token 參數洗掉 (可選)
            // window.history.replaceState({}, document.title, window.location.pathname);
        }

        // 5. 啟動 UI 守護者
        startUIGuardian(token);
    }

    // 驗證 Token 的函式
    async function checkLicense(token) {
        try {
            const response = await fetch(CONFIG.VALIDATE_API + token);
            const text = await response.text();
            // 如果回傳內容包含 "Invalid"，代表驗證失敗
            if (text.includes('Invalid')) {
                return false;
            }
            return true;
        } catch (error) {
            console.error('驗證伺服器連線失敗:', error);
            // 如果連不到驗證伺服器，這裡採取「嚴格模式」回傳 false (或是您想寬容一點也可以改 true)
            alert('⚠️ 無法連線至授權伺服器，請檢查網路。');
            return false;
        }
    }

    // ========== UI 與主程式 (驗證通過後才會執行) ==========
    let uiInterval = null;
    let uploadStats = { success: 0, fail: 0, total: 0 };

    function startUIGuardian(token) {
        // 每 1 秒檢查 UI 是否還在 (SPA 換頁防護)
        if (uiInterval) clearInterval(uiInterval);
        
        // 立即執行一次
        injectUI(token);

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
        div.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; background: #e8f5e9; padding: 10px; z-index: 99999; border-bottom: 3px solid #28a745; box-shadow: 0 2px 5px rgba(0,0,0,0.2); font-family: "Roboto", sans-serif;`;
        div.innerHTML = `
            <div style="max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #2e7d32; font-size: 16px;">🤖 裝箱單全自動機器人 (v2.2 授權版)</h3>
                    <div style="font-size: 12px; color: #555;">
                        <span id="statusText" style="font-weight: bold; color: blue;">已授權就緒</span>
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
        document.body.style.paddingTop = (div.offsetHeight + 10) + 'px';

        document.getElementById('runBtn').onclick = () => startAutomation(token);
        document.getElementById('clearBtn').onclick = () => {
            document.getElementById('inputBox').value = '';
            document.getElementById('consoleLog').innerHTML = '';
        };
    }

    // ... (以下為原本的 Log, Sleep, RandomDelay 函式，無變動) ...
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

    // ★★★ 自動點擊完成按鈕 ★★★
    function clickCompleteButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const targetBtn = buttons.find(b => 
            b.innerText.includes('完成') || 
            b.innerText.includes('Finish') || 
            b.innerText.includes('Complete') ||
            (b.classList.contains('shopee-button--danger'))
        );
        if (targetBtn) {
            log('🖱️ 自動點擊【完成】按鈕...');
            targetBtn.click();
            return true;
        }
        return false;
    }

    // ★★★ 主執行邏輯 ★★★
    async function startAutomation(token) {
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
            if (i > 0 && i % CONFIG.BATCH_SIZE === 0) {
                log(`⏸️ 批次暫停：正在執行自動完成...`);
                clickCompleteButton();
                await sleep(3000); 
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
            fd.append('Token', token); // 使用經過驗證的 Token
            fd.append('Qty', uploadStats.success);
            fd.append('Name', 'BoxUpload');
            fetch(CONFIG.STATS_API, { method: 'POST', body: fd });
        } catch {}
    }

    // 啟動腳本
    setTimeout(init, 1500);

})();
