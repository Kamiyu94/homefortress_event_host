document.addEventListener('DOMContentLoaded', () => {

    // --- 1. 獲取 HTML 元素 ---
    const actionButton = document.getElementById('player-action-button');
    const buttonText = document.getElementById('player-button-text');
    const statusText = document.getElementById('player-status-text');
    const choiceContainer = document.getElementById('player-choice-container');
    const chanceEmptyWarn = document.getElementById('player-chance-empty');
    const fateEmptyWarn = document.getElementById('player-fate-empty');

    // --- 2. 獲取 Firebase 參照 ---
    // ( 'database' 變數來自 player.html 中載入的 SDK )
    const db = database;
    const gameStateRef = db.ref('game/state');
    const triggerRef = db.ref('game/trigger');
    const deckStatusRef = db.ref('game/deckStatus');
    const cardResultRef = db.ref('game/cardResult');

    let currentState = null; // 用來儲存當前的狀態
    let isButtonDisabled = true; // 預設按鈕是禁用的

    // --- 3. 核心：監聽遊戲狀態 ---
    gameStateRef.on('value', (snapshot) => {
        const state = snapshot.val();
        if (!state) return; // 如果沒有狀態，就什麼都不做
        
        currentState = state; // 更新當前狀態
        choiceContainer.innerHTML = ''; // 清空選項
        choiceContainer.style.display = 'none';
        actionButton.style.display = 'flex'; // 預設顯示主按鈕

        console.log("主機狀態更新:", state);

        switch (state) {
            case 'waiting_for_step1':
                enableButton('抽牌庫', '(點擊上方按鈕決定牌庫)');
                break;
            
            case 'animating_deck':
                disableButton('抽取中...', '(主機正在決定牌庫...)');
                break;

            case 'waiting_for_step2':
                enableButton('抽卡片', '(點擊上方按鈕抽取事件)');
                break;

            case 'loading_card':
                disableButton('讀取中...', '(主機正在抽取事件卡...)');
                break;

            case 'waiting_for_choice':
                disableButton('請做決定', '(請在下方選擇一個選項)');
                actionButton.style.display = 'none'; // 隱藏主按鈕
                loadChoices(); // 載入選項
                break;

            case 'showing_result':
                disableButton('等待繼續', '(主機正在顯示結果...)' );
                break;
            
            default:
                disableButton('連線中...', '(正在與主機同步...)');
        }
    });

    // --- 4. 監聽牌庫狀態 ---
    deckStatusRef.on('value', (snapshot) => {
        const status = snapshot.val();
        if (status) {
            chanceEmptyWarn.style.display = status.chanceEmpty ? 'block' : 'none';
            fateEmptyWarn.style.display = status.fateEmpty ? 'block' : 'none';
        }
    });

    // --- 5. 綁定按鈕點擊事件 ---
    actionButton.addEventListener('click', () => {
        if (isButtonDisabled) return;

        console.log("點擊觸發:", currentState);
        
        // 根據當前狀態，發送不同的觸發指令
        let triggerValue = null;

        if (currentState === 'waiting_for_step1') {
            triggerValue = 'trigger_step1';
        } else if (currentState === 'waiting_for_step2') {
            triggerValue = 'trigger_step2';
        }

        if (triggerValue) {
            // 加上時間戳記確保每次寫入都是新值
            triggerRef.set(`${triggerValue}_${Date.now()}`);
        }
    });

    // --- 6. 輔助函式 ---

    function enableButton(text, status) {
        buttonText.textContent = text;
        statusText.textContent = status;
        actionButton.classList.remove('disabled');
        isButtonDisabled = false;
    }

    function disableButton(text, status) {
        buttonText.textContent = text;
        statusText.textContent = status;
        actionButton.classList.add('disabled');
        isButtonDisabled = true;
    }

    // 載入「抉擇」按鈕
    function loadChoices() {
        cardResultRef.once('value', (snapshot) => {
            const card = snapshot.val();
            if (card && card.choices && card.type === 'choice') {
                choiceContainer.style.display = 'flex';
                
                card.choices.forEach((choice, index) => {
                    const choiceBtn = document.createElement('button');
                    choiceBtn.className = 'btn btn-large btn-choice'; // 沿用 style.css 的樣式
                    choiceBtn.textContent = choice.text;
                    
                    choiceBtn.onclick = () => {
                        console.log(`選擇了選項 ${index}: ${choice.text}`);
                        // 發送帶有 index 的觸發指令
                        triggerRef.set(`trigger_choice_${index}_${Date.now()}`);
                        disableButton('已選擇', '等待主機確認...');
                    };
                    choiceContainer.appendChild(choiceBtn);
                });
            } else {
                // 萬一出錯，回到等待狀態
                gameStateRef.set('waiting_for_step1');
            }
        });
    }

});