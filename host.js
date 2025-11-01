// 等待 HTML 內容加載完成
document.addEventListener('DOMContentLoaded',
() => {

    // --- 1. 獲取所有 HTML 元素 ---
    // (這部分保持不變)
    const screens = {
        draw: document.getElementById('screen-draw'),
        loading: document.getElementById('screen-loading'),
        result: document.getElementById('screen-result'),
    };
    const drawButton = document.getElementById('draw-button');
    const drawButtonText = document.getElementById('draw-button-text');
    const loadingText = document.getElementById('loading-text');
    const promptText = document.querySelector('.prompt-text'); 
    
    const resultContent = document.getElementById('result-content');
    const choiceButtonsContainer = document.getElementById('choice-buttons');
    const controlButtonsContainer = document.getElementById('control-buttons');
    
    const btnContinue = document.getElementById('btn-continue');
    const btnReset = document.getElementById('btn-reset');
    const btnResetHome = document.getElementById('btn-reset-home');
    const chanceEmptyWarning = document.getElementById('chance-empty');
    const fateEmptyWarning = document.getElementById('fate-empty');

    // --- 【★ FB 修改 ★】 獲取 Firebase 資料庫參照 ---
    // ( 'database' 變數是我們在 host.html 中定義的 )
    const db = database; 
    const gameStateRef = db.ref('game/state');
    const triggerRef = db.ref('game/trigger');
    const determinedDeckRef = db.ref('game/determinedDeck');
    const deckStatusRef = db.ref('game/deckStatus');
    const cardResultRef = db.ref('game/cardResult'); // 用來給玩家端看結果

    // --- 2. 事件卡片數據 ---
    // (這部分保持不變)
    const formatEffect = (text) => {
        return text.replace(/(\+[\d\.]+\s*點)/g, '<span class="text-green">$1</span>')
                   .replace(/(-[\d\.]+\s*點)/g, '<span class="text-red">$1</span>')
                   .replace(/損失\s*(.*?)(?=\s*。|$|,)/g, '<span class="text-red">損失 $1</span>')
                   .replace(/(獲得|換取)\s*「(.*?)」/g, '$1「<span class="text-blue-bold">$2</span>」')
                   .replace(/(交出|支付)\s*「(.*?)」/g, '<span class="text-red">$1「<span class="text-blue-bold">$2</span>」</span>');
    };
    let cardData = {
        chance: [ /* ... (您所有的卡片資料)... */ ],
        fate: [ /* ... (您所有的卡片資料)... */ ]
    };
    // (卡片資料太長，我先折疊，請保留您原本的卡片資料)
    
    // --- 3. 牌庫狀態 ---
    let mainDecks = {};
    let discardPiles = {};
    // let isDrawing = false; // 【★ FB 修改 ★】 這個變數不再需要，由 Firebase 狀態取代
    let flashInterval; 
    // let determinedDeck = null; // 【★ FB 修改 ★】 這個變數也由 Firebase 狀態取代

    // --- 4. 核心功能 ---

    // 初始化/重置牌庫
    function resetDecks() {
        mainDecks.chance = JSON.parse(JSON.stringify(cardData.chance));
        mainDecks.fate = JSON.parse(JSON.stringify(cardData.fate));
        discardPiles.chance = [];
        discardPiles.fate = [];
        console.log("牌庫已重置");

        // 【★ FB 修改 ★】 重置 Firebase 上的狀態
        const updates = {};
        updates['/state'] = 'waiting_for_step1'; // 回到等待點擊狀態
        updates['/trigger'] = null; // 清空觸發器
        updates['/determinedDeck'] = null; // 清空已選定的牌庫
        updates['/cardResult'] = null; // 清空卡片結果
        updates['/deckStatus'] = { // 更新牌庫狀態
             chanceEmpty: false,
             fateEmpty: false
        };
        db.ref('game').update(updates);
    }

    // 切換畫面
    function switchScreen(screenName) {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        screens[screenName].classList.add('active');
    }

    // 開始待機閃動
    function startFlashing() {
        stopFlashing(); // 先停止舊的，防止重疊
        let isGreen = true;
        flashInterval = setInterval(() => {
            if (isGreen) {
                drawButtonText.textContent = '機會';
                drawButton.className = 'draw-button-container green';
            } else {
                drawButtonText.textContent = '命運';
                drawButton.className = 'draw-button-container red';
            }
            isGreen = !isGreen;
        }, 800); 
    }

    // 停止閃動
    function stopFlashing() {
        clearInterval(flashInterval);
    }

    // 執行抽牌動畫 (固定 1.5 秒)
    function playDrawAnimation() {
        stopFlashing();
        promptText.textContent = '(抽取中...)'; 

        // 【★ FB 修改 ★】 通知玩家端「正在抽」
        gameStateRef.set('animating_deck');

        let speed = 50; 
        let totalAnimationTime = 1500; 
        let isGreen = Math.random() < 0.5;
        let animationTimeout;

        function fastFlash() {
            if (isGreen) {
                drawButtonText.textContent = '機會';
                drawButton.className = 'draw-button-container green';
            } else {
                drawButtonText.textContent = '命運';
                drawButton.className = 'draw-button-container red';
            }
            isGreen = !isGreen; 
            animationTimeout = setTimeout(fastFlash, speed);
        }

        fastFlash();

        setTimeout(() => {
            clearTimeout(animationTimeout);

            const finalDeck = isGreen ? 'fate' : 'chance';
            const deckName = finalDeck === 'chance' ? '機會' : '命運';
            const colorClass = finalDeck === 'chance' ? 'green' : 'red';
            
            drawButtonText.textContent = deckName;
            drawButton.className = `draw-button-container ${colorClass}`;

            // 【★ FB 修改 ★】 將結果寫入 Firebase
            determinedDeckRef.set(finalDeck);
            gameStateRef.set('waiting_for_step2'); // 進入等待第2次點擊狀態

            promptText.innerHTML = `您抽中了 <span class="deck-name ${colorClass}">${deckName}</span>！<br>請再次點擊上方區域抽牌`;
            // isDrawing = false; // 已移除
            
        }, totalAnimationTime); 
    }

    // 強制選擇唯一剩下的牌庫
    function forceDeckChoice(deckType) {
        const deckName = deckType === 'chance' ? '機會' : '命運';
        const colorClass = deckType === 'chance' ? 'green' : 'red';
        
        drawButtonText.textContent = deckName;
        drawButton.className = `draw-button-container ${colorClass}`;
        
        // 【★ FB 修改 ★】 將結果寫入 Firebase
        determinedDeckRef.set(deckType);
        gameStateRef.set('waiting_for_step2'); // 進入等待第2次點擊狀態

        promptText.innerHTML = `您抽中了 <span class="deck-name ${colorClass}">${deckName}</span>！(這是唯一剩下的牌庫)<br>請再次點擊上方區域抽牌`;
        // isDrawing = false; // 已移除
    }

    // 顯示讀取畫面
    function showLoading(deckType) {
        const deckName = deckType === 'chance' ? '機會' : '命運';
        const colorClass = deckType === 'chance' ? 'green' : 'red';
        loadingText.innerHTML = `正在從 <span class="deck-name ${colorClass}">${deckName}</span> 牌庫抽取...`;
        switchScreen('loading');

        // 【★ FB 修改 ★】 通知玩家端「正在讀取卡片」
        gameStateRef.set('loading_card');

        setTimeout(() => {
            drawCard(deckType);
        }, 1500); 
    }

    // 抽卡並顯示結果
    function drawCard(deckType) {
        let deck = mainDecks[deckType];
        
        if (deck.length === 0) {
            alert(`「${deckType === 'chance' ? '機會' : '命運'}」牌庫已經抽完！請重置牌庫。`);
            goHome(); 
            return;
        }

        const cardIndex = Math.floor(Math.random() * deck.length);
        const card = deck.splice(cardIndex, 1)[0]; 
        discardPiles[deckType].push(card); 

        // 【★ FB 修改 ★】 更新Firebase上的牌庫狀態
        updateDeckStatus();

        displayCard(card, deckType);
    }

    // 顯示卡片內容
    function displayCard(card, deckType) {
        resultContent.innerHTML = '';
        choiceButtonsContainer.innerHTML = '';

        const deckName = deckType === 'chance' ? '機會' : '命運';
        const colorClass = deckType === 'chance' ? 'green' : 'red';
        let html = `
            <h3>你抽到了 (來自 <span class="deck-name ${colorClass}">${deckName}</span> 牌庫)：</h3>
            <h1 class="event-title">${card.title}</h1>
            <hr>
            <h4>情境：</h4>
            <p class="event-description">${card.description}</p>
        `;

        if (card.type === 'outcome') {
            const effectHtml = `<h2>${formatEffect(card.effect)}</h2>`;
            html += `
                <h4>效果：</h4>
                <div class="event-effect">${effectHtml}</div>
            `;
            controlButtonsContainer.style.display = 'flex';
            choiceButtonsContainer.style.display = 'none';

            // 【★ FB 修改 ★】 將結果寫入 Firebase
            cardResultRef.set({
                title: card.title,
                description: card.description,
                effect: effectHtml,
                type: 'outcome'
            });
            gameStateRef.set('showing_result'); // 通知玩家端「正在顯示結果」

        } else if (card.type === 'choice') {
            controlButtonsContainer.style.display = 'none';
            choiceButtonsContainer.style.display = 'flex';

            let choiceData = []; // 準備給 Firebase 的資料

            card.choices.forEach((choice, index) => {
                const choiceBtn = document.createElement('button');
                choiceBtn.className = 'btn btn-large btn-choice';
                choiceBtn.textContent = choice.text;
                choiceBtn.onclick = () => {
                    // 【★ FB 修改 ★】 玩家的選擇 *不是* 來自點擊
                    // 我們改成監聽 Firebase 上的 'choiceMade'
                    // 所以這個 onclick 應該是給主機 GM 點的
                    showChoiceResult(choice, card);
                };
                choiceButtonsContainer.appendChild(choiceBtn);
                
                choiceData.push({ text: choice.text, effect: choice.effect });
            });
            
            resultContent.innerHTML = html; // 先顯示情境

             // 【★ FB 修改 ★】 將「選項」寫入 Firebase
            cardResultRef.set({
                title: card.title,
                description: card.description,
                choices: choiceData,
                type: 'choice'
            });
            gameStateRef.set('waiting_for_choice'); // 通知玩家端「等待選擇」
        }
        
        if (card.type === 'outcome') {
             resultContent.innerHTML = html;
        }

        switchScreen('result');
    }

    // 顯示抉擇後的結果
    function showChoiceResult(choice, card) {
        const effectHtml = `<h2>${formatEffect(choice.effect)}</h2>`;
        resultContent.innerHTML = `
            <h3>你抽到了 (來自 ...牌庫)：</h3>
            <h1 class="event-title">${card.title}</h1>
            <hr>
            <h4>情境：</h4>
            <p class="event-description">${card.description}</p>
            <hr>
            <h4>你的決定：${choice.text}</h4>
            <div class="event-effect">${effectHtml}</div>
        `;
        choiceButtonsContainer.style.display = 'none';
        controlButtonsContainer.style.display = 'flex';

        // 【★ FB 修改 ★】
        cardResultRef.update({
            choiceMade: choice.text,
            effect: effectHtml
        });
        gameStateRef.set('showing_result'); // 通知玩家端「正在顯示結果」
    }

    // 回到主畫面
    function goHome() {
        switchScreen('draw');
        startFlashing();
        promptText.textContent = '(等待玩家抽牌...)'; // 【★ FB 修改 ★】 更改提示文字

        // 【★ FB 修改 ★】 更新狀態
        gameStateRef.set('waiting_for_step1');
        determinedDeckRef.set(null);
        cardResultRef.set(null); // 清除上一張卡片結果

        updateDeckStatus(); // 檢查牌庫並更新 FB 和畫面
    }
    
    // 【★ FB 修改 ★】 新增：更新牌庫狀態的函式
    function updateDeckStatus() {
        const chanceEmpty = mainDecks.chance.length === 0;
        const fateEmpty = mainDecks.fate.length === 0;

        chanceEmptyWarning.style.display = chanceEmpty ? 'block' : 'none';
        fateEmptyWarning.style.display = fateEmpty ? 'block' : 'none';

        // 同步到 Firebase
        deckStatusRef.set({
            chanceEmpty: chanceEmpty,
            fateEmpty: fateEmpty
        });
    }

    // 統一的重置函數
    function handleReset() {
        if (confirm('確定要重置所有牌庫嗎？（這會強制所有玩家回到首頁）')) {
            resetDecks();
            goHome();
        }
    }


    // --- 5. 綁定事件監聽 ---

    // 【★ FB 修改 ★】 移除本地點擊監聽
    // drawButton.addEventListener('click', () => { ... });
    // (↑↑↑ 舊的點擊邏輯已完全移除 ↑↑↑)


    // 【★ FB 修改 ★】 新增：監聽 Firebase 上的「觸發」
    let currentTrigger = null;
    triggerRef.on('value', (snapshot) => {
        const triggerValue = snapshot.val();
        
        // 這個 if 判斷是為了防止重觸發
        // (例如: 玩家點了 "step1"，主機處理中，玩家又點了 "step1")
        if (triggerValue && triggerValue !== currentTrigger) {
            currentTrigger = triggerValue; // 標記為已處理
            console.log("收到來自玩家的觸發:", triggerValue);

            // 使用 switch 來處理不同的觸發指令
            switch (triggerValue) {
                case 'trigger_step1': // 玩家按了第一下
                    handleDrawStep1();
                    break;
                case 'trigger_step2': // 玩家按了第二下
                    handleDrawStep2();
                    break;
                case 'trigger_choice_0': // 玩家選了選項 0
                case 'trigger_choice_1': // 玩家選了選項 1
                    const choiceIndex = parseInt(triggerValue.split('_')[2]);
                    handlePlayerChoice(choiceIndex);
                    break;
            }
        }
    });
    
    // 【★ FB 修改 ★】 新增：監聽重置按鈕
    // 這些是主機端 GM (遊戲主持人) 才能按的按鈕
    btnContinue.addEventListener('click', goHome);
    btnReset.addEventListener('click', handleReset);
    btnResetHome.addEventListener('click', handleReset);


    // --- 【★ FB 修改 ★】 新增：處理 Firebase 觸發的函式 ---

    // 處理第一階段抽牌 (決定牌庫)
    function handleDrawStep1() {
        // 從 Firebase 讀取當前狀態，防止重複觸發
        gameStateRef.once('value', (snapshot) => {
            if (snapshot.val() !== 'waiting_for_step1') {
                console.log("狀態錯誤，忽略 step1 觸發");
                return;
            }

            const chanceCards = mainDecks.chance.length;
            const fateCards = mainDecks.fate.length;

            if (chanceCards === 0 && fateCards === 0) {
                alert('所有牌庫都已抽完，請重置牌庫！');
                // 重置觸發器，讓玩家可以再次點擊 (雖然點了還是會跳 alert)
                triggerRef.set(`trigger_step1_ignored_${Date.now()}`); 
                currentTrigger = `trigger_step1_ignored_${Date.now()}`;
                return; 
            }

            // isDrawing = true; // 已移除

            if (chanceCards > 0 && fateCards > 0) {
                playDrawAnimation(); 
            } else if (chanceCards > 0 && fateCards === 0) {
                forceDeckChoice('chance');
            } else if (chanceCards === 0 && fateCards > 0) {
                forceDeckChoice('fate');
            }
        });
    }

    // 處理第二階段抽牌 (抽取卡片)
    function handleDrawStep2() {
        // 從 Firebase 讀取當前狀態
        gameStateRef.once('value', (snapshot) => {
            if (snapshot.val() !== 'waiting_for_step2') {
                console.log("狀態錯誤，忽略 step2 觸發");
                return;
            }

            // 讀取先前決定好的牌庫
            determinedDeckRef.once('value', (deckSnapshot) => {
                const deckType = deckSnapshot.val();
                if (deckType) {
                    // isDrawing = true; // 已移除
                    showLoading(deckType); 
                    determinedDeckRef.set(null); // 清除
                } else {
                    console.error("錯誤：沒有找到已決定的牌庫 (determinedDeck)");
                    goHome(); // 出錯了，回到首頁
                }
            });
        });
    }

    // 處理玩家做出的「抉擇」
    function handlePlayerChoice(choiceIndex) {
        console.log(`玩家選擇了選項 ${choiceIndex}`);
        gameStateRef.once('value', (stateSnap) => {
            if (stateSnap.val() !== 'waiting_for_choice') {
                console.log("狀態錯誤，忽略 choice 觸發");
                return;
            }

            // 從 Firebase 讀取當前的卡片資料，找到對應的選項
            cardResultRef.once('value', (cardSnap) => {
                const card = cardSnap.val();
                if (card && card.choices && card.choices[choiceIndex]) {
                    const playerChoice = card.choices[choiceIndex];
                    
                    // 為了 showChoiceResult 能正確顯示 title 和 description
                    // 我們需要一個假的 card 物件
                    const originalCardInfo = {
                        title: card.title,
                        description: card.description
                    };
                    
                    showChoiceResult(playerChoice, originalCardInfo);
                } else {
                    console.error("錯誤：在 Firebase 上找不到對應的卡片或選項");
                    goHome();
                }
            });
        });
    }


    // --- 6. 程式啟動 ---
    resetDecks(); // 第一次加載時，初始化牌庫 (這會自動呼叫 goHome)
    goHome();     // 顯示主畫面並開始閃動

});