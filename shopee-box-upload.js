// ==UserScript==
// @name         蝦皮裝箱單批次上傳
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  自動批次上傳裝箱單號到蝦皮後台
// @author       OrgLife
// @match        https://sp.spx.shopee.tw/outbound-management/pack-drop-off-to/scan-to-new*
// @grant        none
// @icon         https://sp.spx.shopee.tw/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    // ========== 配置區 ==========
    const CONFIG = {
        VALIDATE_API: 'https://dev.orglife.com.tw/Api/DB?Type=Token&App=ShopeeBoxUpload&Token=',
        STATS_API: 'https://dev.orglife.com.tw/Api/DB?Type=Shopee_Box_Upd',
        SCAN_API: 'https://sp.spx.shopee.tw/sp-api/point/sorting/box_to/transport/scan',
        DELAY_MS: 500,
    };

    // ========== 全域變數 ==========
    let uploadStats = {
        success: 0,
        fail: 0,
        total: 0
    };

    let pageParams = {
        dest_station_name: '',
        to_path: ''
    };

    // ========== 初始化 ==========
    async function init() {
        console.log('[裝箱單上傳] 初始化開始...');
        
        // 1. 檢查 Token
        const token = getTokenFromUrl();
        if (!token) {
            console.warn('[裝箱單上傳] 未找到 Token');
            alert('❌ 未提供授權 Token\n\n請從系統主頁點擊按鈕進入。');
            return;
        }

        // 2. 驗證 Token
        const isValid = await validateToken(token);
        if (!isValid) {
            console.warn('[裝箱單上傳] Token 驗證失敗');
            alert('❌ Token 驗證失敗\n\n請聯絡管理員。');
            return;
        }

        // 3. 嘗試從頁面取得參數
        extractPageParams();

        // 4. 注入UI
        injectUI();

        console.log('[裝箱單上傳] 初始化完成');
        console.log('[裝箱單上傳] 頁面參數:', pageParams);
    }

    // ========== 從頁面提取參數 ==========
    function extractPageParams() {
        try {
            // 嘗試從頁面的各種可能位置取得參數
            
            // 方法1: 從 localStorage
            const storedStation = localStorage.getItem('dest_station_name');
            const storedPath = localStorage.getItem('to_path');
            
            if (storedStation) pageParams.dest_station_name = storedStation;
            if (storedPath) pageParams.to_path = storedPath;
            
            // 方法2: 從頁面元素（如果有的話）
            const stationElement = document.querySelector('[data-station-name]');
            const pathElement = document.querySelector('[data-to-path]');
            
            if (stationElement) {
                pageParams.dest_station_name = stationElement.getAttribute('data-station-name');
            }
            if (pathElement) {
                pageParams.to_path = pathElement.getAttribute('data-to-path');
            }
            
            // 如果還是沒有，使用預設值
            if (!pageParams.dest_station_name) {
                pageParams.dest_station_name = 'SOC S';
            }
            if (!pageParams.to_path) {
                pageParams.to_path = '美廉社 仁武仁孝店 > SOC S';
            }
            
            console.log('[裝箱單上傳] 提取的頁面參數:', pageParams);
        } catch (error) {
            console.error('[裝箱單上傳] 提取參數失敗:', error);
            // 使用預設值
            pageParams.dest_station_name = 'SOC S';
            pageParams.to_path = '美廉社 仁武仁孝店 > SOC S';
        }
    }

    // ========== Token 處理 ==========
    function getTokenFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('token');
    }

    async function validateToken(token) {
        try {
            const response = await fetch(CONFIG.VALIDATE_API + token);
            const result = await response.text();
            return !result.includes('Invalid');
        } catch (error) {
            console.error('[裝箱單上傳] Token 驗證錯誤:', error);
            return false;
        }
    }

    // ========== UI 注入 ==========
    function injectUI() {
        const container = document.createElement('div');
        container.id = 'boxUploadContainer';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background: #f8f9fa;
            padding: 15px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 9999;
            border-bottom: 3px solid #28a745;
        `;

        container.innerHTML = `
            <div style="max-width: 1200px; margin: 0 auto;">
                <h3 style="margin: 0 0 15px 0; color: #28a745;">
                    📦 裝箱單批次上傳 <span style="font-size: 14px; color: #666;">(v1.4)</span>
                </h3>
                
                <!-- 參數設定區 -->
                <div style="background: #e7f3ff; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                    <details>
                        <summary style="cursor: pointer; font-weight: bold; color: #0066cc;">⚙️ 進階設定（通常不需要修改）</summary>
                        <div style="margin-top: 10px;">
                            <label style="display: block; margin-bottom: 5px;">
                                <strong>目的地站點：</strong>
                                <input type="text" id="destStation" value="${pageParams.dest_station_name}" 
                                       style="width: 100%; padding: 5px; margin-top: 3px;">
                            </label>
                            <label style="display: block; margin-top: 8px;">
                                <strong>路徑：</strong>
                                <input type="text" id="toPath" value="${pageParams.to_path}" 
                                       style="width: 100%; padding: 5px; margin-top: 3px;">
                            </label>
                            <small style="color: #666; display: block; margin-top: 5px;">
                                ℹ️ 這些參數已自動設定，除非上傳失敗，否則不需要修改
                            </small>
                        </div>
                    </details>
                </div>
                
                <div style="display: flex; gap: 10px; margin-bottom: 10px; align-items: flex-start;">
                    <div style="flex: 1;">
                        <textarea 
                            id="boxNumberInput" 
                            placeholder="請輸入裝箱單號，每行一個&#10;例如：&#10;SPTO251125764617&#10;SPTO251184405078&#10;SPTO251184405099"
                            style="width: 100%; height: 120px; padding: 10px; border: 2px solid #ddd; border-radius: 5px; font-family: monospace; font-size: 14px;"
                        ></textarea>
                        <small style="color: #666;">
                            共 <strong id="lineCount" style="color: #28a745;">0</strong> 筆
                        </small>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        <button id="startUploadBtn" style="
                            background: #28a745;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 16px;
                            font-weight: bold;
                        ">🚀 開始上傳</button>
                        
                        <button id="clearLogBtn" style="
                            background: #ffc107;
                            color: black;
                            border: none;
                            padding: 8px 20px;
                            border-radius: 5px;
                            cursor: pointer;
                        ">🗑️ 清空日誌</button>
                        
                        <button id="clearAllBtn" style="
                            background: #6c757d;
                            color: white;
                            border: none;
                            padding: 8px 20px;
                            border-radius: 5px;
                            cursor: pointer;
                        ">🔄 清空全部</button>
                    </div>
                </div>
                
                <!-- 進度條 -->
                <div id="progressContainer" style="display: none; margin-bottom: 10px;">
                    <div style="background: #e9ecef; border-radius: 5px; height: 30px; position: relative; overflow: hidden;">
                        <div id="progressBar" style="
                            background: linear-gradient(90deg, #28a745, #20c997);
                            height: 100%;
                            width: 0%;
                            transition: width 0.3s;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-weight: bold;
                        ">0%</div>
                    </div>
                    <small style="color: #666;">
                        已處理 <strong id="processedCount">0</strong> / <strong id="totalCount">0</strong> 筆
                        （成功: <strong id="successCount" style="color: #28a745;">0</strong> | 
                        失敗: <strong id="failCount" style="color: #dc3545;">0</strong>）
                    </small>
                </div>
                
                <!-- 日誌區 -->
                <div style="margin-top: 10px;">
                    <strong>上傳日誌：</strong>
                    <textarea 
                        id="logDisplay" 
                        readonly
                        style="width: 100%; height: 150px; padding: 10px; border: 2px solid #ddd; border-radius: 5px; font-family: monospace; font-size: 12px; background: #1e1e1e; color: #00ff00; resize: vertical;"
                    ></textarea>
                </div>
            </div>
        `;

        document.body.insertBefore(container, document.body.firstChild);
        document.body.style.paddingTop = container.offsetHeight + 'px';

        bindEvents();
    }

    // ========== 事件綁定 ==========
    function bindEvents() {
        const input = document.getElementById('boxNumberInput');
        const startBtn = document.getElementById('startUploadBtn');
        const clearLogBtn = document.getElementById('clearLogBtn');
        const clearAllBtn = document.getElementById('clearAllBtn');

        input.addEventListener('input', updateLineCount);
        startBtn.addEventListener('click', startUpload);
        clearLogBtn.addEventListener('click', () => {
            document.getElementById('logDisplay').value = '';
        });
        clearAllBtn.addEventListener('click', () => {
            if (confirm('確定要清空全部內容嗎？')) {
                input.value = '';
                document.getElementById('logDisplay').value = '';
                document.getElementById('progressContainer').style.display = 'none';
                updateLineCount();
            }
        });

        updateLineCount();
    }

    function updateLineCount() {
        const input = document.getElementById('boxNumberInput');
        const lines = input.value.split('\n').filter(line => line.trim() !== '');
        document.getElementById('lineCount').textContent = lines.length;
    }

    function addLog(message) {
        const logDisplay = document.getElementById('logDisplay');
        const timestamp = new Date().toLocaleTimeString();
        logDisplay.value += `[${timestamp}] ${message}\n`;
        logDisplay.scrollTop = logDisplay.scrollHeight;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========== 核心上傳邏輯 ==========
    async function startUpload() {
        const input = document.getElementById('boxNumberInput');
        const lines = input.value.split('\n')
            .map(line => line.trim())
            .filter(line => line !== '');

        if (lines.length === 0) {
            alert('請輸入至少一筆裝箱單號');
            return;
        }

        if (!confirm(`確定要上傳 ${lines.length} 筆裝箱單號嗎？`)) {
            return;
        }

        // 更新參數（使用者可能修改了）
        pageParams.dest_station_name = document.getElementById('destStation').value;
        pageParams.to_path = document.getElementById('toPath').value;

        // 重置統計
        uploadStats = { success: 0, fail: 0, total: lines.length };

        // 顯示進度條
        const progressContainer = document.getElementById('progressContainer');
        progressContainer.style.display = 'block';
        document.getElementById('totalCount').textContent = lines.length;

        // 停用按鈕
        const startBtn = document.getElementById('startUploadBtn');
        startBtn.disabled = true;
        startBtn.textContent = '⏳ 上傳中...';

        // 開始上傳
        addLog('='.repeat(50));
        addLog(`開始上傳 ${lines.length} 筆裝箱單號`);
        addLog(`目的地: ${pageParams.dest_station_name}`);
        addLog(`路徑: ${pageParams.to_path}`);
        addLog('='.repeat(50));

        for (let i = 0; i < lines.length; i++) {
            const boxNumber = lines[i];
            addLog(`[${i + 1}/${lines.length}] 正在處理: ${boxNumber}`);

            try {
                const result = await uploadSingle(boxNumber);
                
                if (result.success) {
                    uploadStats.success++;
                    addLog(`✅ 成功: ${boxNumber}`);
                } else {
                    uploadStats.fail++;
                    addLog(`❌ 失敗: ${boxNumber} - ${result.message}`);
                }
            } catch (error) {
                uploadStats.fail++;
                addLog(`❌ 錯誤: ${boxNumber} - ${error.message}`);
            }

            updateProgress(i + 1, lines.length);

            if (i < lines.length - 1) {
                await sleep(CONFIG.DELAY_MS);
            }
        }

        // 完成
        addLog('='.repeat(50));
        addLog(`上傳完成！成功: ${uploadStats.success} 筆 | 失敗: ${uploadStats.fail} 筆`);
        addLog('='.repeat(50));

        // 上傳統計
        await uploadStatistics();

        // 恢復按鈕
        startBtn.disabled = false;
        startBtn.textContent = '🚀 開始上傳';

        // 顯示結果
        if (uploadStats.fail === 0) {
            alert(`✅ 全部上傳成功！共 ${uploadStats.success} 筆`);
        } else {
            alert(`⚠️ 上傳完成\n成功：${uploadStats.success} 筆\n失敗：${uploadStats.fail} 筆\n\n請查看日誌了解詳情。`);
        }
    }

    async function uploadSingle(boxNumber) {
        try {
            const requestBody = {
                to_number: boxNumber,
                rfid: '',  // 根據你的成功案例，RFID 是空字串
                dest_station_name: pageParams.dest_station_name,
                to_path: pageParams.to_path,
                ctime: Math.floor(Date.now() / 1000),
                mtime: Math.floor(Date.now() / 1000)
            };
            
            const response = await fetch(CONFIG.SCAN_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                return { 
                    success: false, 
                    message: `HTTP ${response.status}`
                };
            }

            const result = await response.json();

            if (result.retcode === 0) {
                return { success: true };
            } else {
                return { 
                    success: false, 
                    message: result.message || '未知錯誤'
                };
            }
        } catch (error) {
            return { 
                success: false, 
                message: error.message
            };
        }
    }

    function updateProgress(current, total) {
        const percentage = Math.round((current / total) * 100);
        
        const progressBar = document.getElementById('progressBar');
        progressBar.style.width = percentage + '%';
        progressBar.textContent = percentage + '%';
        
        document.getElementById('processedCount').textContent = current;
        document.getElementById('successCount').textContent = uploadStats.success;
        document.getElementById('failCount').textContent = uploadStats.fail;

        if (current === total) {
            progressBar.style.background = '#28a745';
        }
    }

    async function uploadStatistics() {
        const token = getTokenFromUrl();
        if (!token) return;

        try {
            const formData = new FormData();
            formData.append('Token', token);
            formData.append('Qty', uploadStats.success);
            formData.append('Name', 'BoxUpload');

            await fetch(CONFIG.STATS_API, {
                method: 'POST',
                body: formData
            });

            addLog('📊 統計資料已上傳');
        } catch (error) {
            console.error('[裝箱單上傳] 統計上傳失敗:', error);
        }
    }

    // ========== 執行初始化 ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(init, 1000);
        });
    } else {
        setTimeout(init, 1000);
    }

})();
