import { Application, Assets, Container, Graphics, Text, Texture, Rectangle, AnimatedSprite, Sprite } from 'pixi.js';
import { getServerSpin, type SpinResult } from './server-logic';

// npm run dev

(async () => {
    // --- 1. PIXI INIT & ASSET LOADING ---
    const app = new Application();
    await app.init({ background: '#0a0a0a', resizeTo: window });
    document.body.appendChild(app.canvas);

    const dungeonSheetTexture = await Assets.load('/assets/animations/images/Dungeon_Tileset.png'); 
    const chestSheetTexture = await Assets.load('/assets/animations/Chest_Idle.png');
    const keySheetTexture = await Assets.load('/assets/animations/Key_Idle.png');
    const keyUiTexture = await Assets.load('/assets/animations/images/keys_1_1.png'); 
    const coinSheetTexture = await Assets.load('/assets/animations/Coin_Idle.png');
    
    const slimeSheetTexture = await Assets.load('/assets/animations/Monster_Slime_Idle-Sheet.png');
    const skeletonSheetTexture = await Assets.load('/assets/animations/enemies-skeleton1_idle.png');
    const vampireSheetTexture = await Assets.load('/assets/animations/enemies-vampire_idle.png');
    
    const heroIdleTex = await Assets.load('/assets/animations/Human_Soldier_Sword_Shield_Idle-Sheet.png');
    const heroWalkTex = await Assets.load('/assets/animations/Human_Soldier_Sword_Shield_Walk-Sheet.png');
    const heroAttack1Tex = await Assets.load('/assets/animations/Human_Soldier_Sword_Shield_Attack1-Sheet.png');
    const heroAttack2Tex = await Assets.load('/assets/animations/Human_Soldier_Sword_Shield_Attack2-Sheet.png');
    const heroDeathTex = await Assets.load('/assets/animations/Human_Soldier_Sword_Shield_Death-Sheet.png');
    
    const textures = [dungeonSheetTexture, chestSheetTexture, keySheetTexture, keyUiTexture, coinSheetTexture, slimeSheetTexture, skeletonSheetTexture, vampireSheetTexture, heroIdleTex, heroWalkTex, heroAttack1Tex, heroAttack2Tex, heroDeathTex];
    textures.forEach(t => t.source.scaleMode = 'nearest');
    
    function sliceFrames(texture: Texture) {
        const frames: Texture[] = [];
        const frameSize = texture.height; 
        const totalFrames = Math.floor(texture.width / frameSize);
        for (let i = 0; i < totalFrames; i++) {
            frames.push(new Texture({
                source: texture.source,
                frame: new Rectangle(i * frameSize, 0, frameSize, frameSize)
            }));
        }
        return frames;
    }
    
    const chestFrames = sliceFrames(chestSheetTexture); 
    const keyFrames = sliceFrames(keySheetTexture);
    const coinFrames = sliceFrames(coinSheetTexture);
    
    const slimeFrames = sliceFrames(slimeSheetTexture);
    const skeletonFrames = sliceFrames(skeletonSheetTexture);
    const vampireFrames = sliceFrames(vampireSheetTexture);
    
    const heroIdleFrames = sliceFrames(heroIdleTex);
    const heroWalkFrames = sliceFrames(heroWalkTex);
    const heroAttack1Frames = sliceFrames(heroAttack1Tex);
    const heroAttack2Frames = sliceFrames(heroAttack2Tex);
    const heroDeathFrames = sliceFrames(heroDeathTex);

    function getTile(col: number, row: number) {
        return new Texture({
            source: dungeonSheetTexture.source,
            frame: new Rectangle(col * 16, row * 16, 16, 16)
        });
    }

    const DUNGEON_TILES = {
        wallT: getTile(1, 0), 
        wallB: getTile(1, 4), 
        innerWall: getTile(1, 0), 
        floor: getTile(2, 2) 
    };

    // --- 2. GAME SETTINGS & MATH ---
    let currentSeed = Date.now(); 
    function seededRandom() {
        currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
        return currentSeed / 4294967296; 
    }

    const TOTAL_ROWS = 7;
    const TILE_SIZE = 75; 
    const CHAR_SCALE = 3.0; 
    const ITEM_SCALE = 3.6; 
    const UI_OFFSET = 240; 

    let gameState = 'IDLE';
    let isBossMode = false; 
    let keyCount = 0;       
    let currentExp = 0;
    let expToNextLevel = 100;
    let currentLevel = 1;
    let bankroll = 1000;
    let totalWin = 0;      
    const BET_LEVELS = [2, 5, 10, 20, 50, 100];
    let currentBetIndex = 2; 
    let currentBet = BET_LEVELS[currentBetIndex];

    let currentServerManifest: string[] = [];

    const ENEMY_DATA = [
        { id: 'slime', mult: 0.1, name: "Slime" },
        { id: 'skeleton', mult: 0.5, name: "Skeleton" },
        { id: 'vampire', mult: 5.0, name: "Vampire" }
    ];

    const ENEMY_FRAMES = {
        'slime': slimeFrames,
        'skeleton': skeletonFrames,
        'vampire': vampireFrames
    };

    const KEY_MULT = 2.5;
    const CHEST_MULT = 25.0;

    function getWeightedEnemy() {
        const strip = ['slime','slime','slime','slime','slime','skeleton','skeleton','skeleton','vampire'];
        const id = strip[Math.floor(seededRandom() * strip.length)];
        return ENEMY_DATA.find(e => e.id === id);
    }

    // --- 3. LAYER LAYOUT ---
    const uiLayer = new Container();
    app.stage.addChild(uiLayer);

    const worldLayer = new Container();
    app.stage.addChildAt(worldLayer, 0); 
    worldLayer.y = app.screen.height / 2 - (TILE_SIZE * TOTAL_ROWS) / 2;

    const dungeonLayer = new Container();
    worldLayer.addChild(dungeonLayer);
    
    const entityLayer = new Container();
    entityLayer.sortableChildren = true; 
    worldLayer.addChild(entityLayer);

    let cameraX = 0; 
    let shakeTimer = 0;
    let shakeMagnitude = 0;
    let hitPauseTimer = 0;

    // --- 4. POLISHED UI PANEL ---
    const panel = new Container();
    panel.addChild(new Graphics().rect(0, 0, UI_OFFSET, app.screen.height).fill(0x111111));
    uiLayer.addChild(panel);

    const titleText = new Text({ 
        text: 'DUNGEON RUNNER', 
        style: { fill: 0xffcc00, fontWeight: 'bold', fontSize: 22, dropShadow: { alpha: 0.5 } }
    });
    titleText.x = UI_OFFSET / 2; titleText.y = 25; titleText.anchor.set(0.5);
    panel.addChild(titleText);

    function createUIBox(y: number, height: number) {
        const box = new Graphics().roundRect(15, y, UI_OFFSET - 30, height, 8).fill(0x222222).stroke({ width: 2, color: 0x333333 });
        panel.addChild(box);
        return box;
    }

    createUIBox(60, 50);
    const bankText = new Text({ text: `BANK: ${bankroll}`, style: { fill: 0x00ff00, fontWeight: 'bold', fontSize: 18 }});
    bankText.x = UI_OFFSET / 2; bankText.y = 85; bankText.anchor.set(0.5);
    panel.addChild(bankText);

    createUIBox(120, 60);
    const betText = new Text({ text: `BET: ${currentBet}`, style: { fill: 0xffffff, fontWeight: 'bold', fontSize: 18 }});
    betText.x = UI_OFFSET / 2; betText.y = 150; betText.anchor.set(0.5);
    panel.addChild(betText);

    const minusBtn = new Container();
    minusBtn.addChild(new Graphics().roundRect(-15, -15, 30, 30, 5).fill(0x444444));
    const minusTxt = new Text({text: '-', style: {fill: 0xffffff, fontSize: 24, fontWeight: 'bold'}});
    minusTxt.anchor.set(0.5); minusBtn.addChild(minusTxt);
    minusBtn.x = 45; minusBtn.y = 150;
    minusBtn.eventMode = 'static'; minusBtn.cursor = 'pointer';
    panel.addChild(minusBtn);

    const plusBtn = new Container();
    plusBtn.addChild(new Graphics().roundRect(-15, -15, 30, 30, 5).fill(0x444444));
    const plusTxt = new Text({text: '+', style: {fill: 0xffffff, fontSize: 24, fontWeight: 'bold'}});
    plusTxt.anchor.set(0.5); plusBtn.addChild(plusTxt);
    plusBtn.x = UI_OFFSET - 45; plusBtn.y = 150;
    plusBtn.eventMode = 'static'; plusBtn.cursor = 'pointer';
    panel.addChild(plusBtn);

    createUIBox(190, 60);
    const invTitle = new Text({ text: 'BOSS METER', style: { fill: 0x888888, fontWeight: 'bold', fontSize: 10 }});
    invTitle.x = UI_OFFSET / 2; invTitle.y = 200; invTitle.anchor.set(0.5);
    panel.addChild(invTitle);

    const keyUiSprite = new Sprite(keyUiTexture);
    keyUiSprite.anchor.set(0.5);
    keyUiSprite.scale.set(2.0); 
    keyUiSprite.x = UI_OFFSET / 2 - 20; keyUiSprite.y = 230;
    panel.addChild(keyUiSprite);

    const keyText = new Text({ text: `${keyCount} / 3`, style: { fill: 0xffffff, fontWeight: 'bold', fontSize: 16 }});
    keyText.x = UI_OFFSET / 2 + 15; keyText.y = 230; keyText.anchor.set(0.5);
    panel.addChild(keyText);

    function updateKeyUI() {
        keyText.text = `${keyCount} / 3`;
        if (keyCount > 0) {
            keyUiSprite.tint = 0xFFFFFF; 
            keyUiSprite.alpha = 1.0;
        } else {
            keyUiSprite.tint = 0x555555; 
            keyUiSprite.alpha = 0.3;
        }
    }

    createUIBox(260, 75);
    const levelText = new Text({ text: `LVL 1`, style: { fill: 0xffcc00, fontWeight: 'bold', fontSize: 16 }});
    levelText.x = UI_OFFSET / 2; levelText.y = 280; levelText.anchor.set(0.5);
    panel.addChild(levelText);

    const expBg = new Graphics().roundRect(30, 300, UI_OFFSET - 60, 16, 8).fill(0x111111).stroke({width: 2, color: 0x444444});
    panel.addChild(expBg);
    const expFill = new Graphics();
    panel.addChild(expFill);
    const expText = new Text({ text: `0 / 100`, style: { fill: 0xffffff, fontSize: 10 }});
    expText.x = UI_OFFSET / 2; expText.y = 308; expText.anchor.set(0.5);
    panel.addChild(expText);

    function updateExpUI() {
        let pct = Math.min(1, currentExp / expToNextLevel);
        let barWidth = Math.max(10, (UI_OFFSET - 60) * pct); 
        expFill.clear().roundRect(30, 300, barWidth, 16, 8).fill(0x00ccff);
        levelText.text = `LVL ${currentLevel}`;
        expText.text = `${currentExp} / ${expToNextLevel}`;
    }
    
    function gainExp(amount: number) {
        currentExp += amount;
        if (currentExp >= expToNextLevel) {
            currentExp -= expToNextLevel;
            currentLevel++;
            expToNextLevel = Math.floor(expToNextLevel * 1.5); 
        }
        updateExpUI();
    }

    createUIBox(345, 260); 
    const payTitle = new Text({ text: 'PAYOUT MULTIPLIERS', style: { fill: 0x888888, fontWeight: 'bold', fontSize: 10 }});
    payTitle.x = UI_OFFSET / 2; payTitle.y = 355; payTitle.anchor.set(0.5);
    panel.addChild(payTitle);

    const enemyValueTexts: Text[] = [];
    ENEMY_DATA.forEach((data, index) => {
        const enemy = new AnimatedSprite(ENEMY_FRAMES[data.id as keyof typeof ENEMY_FRAMES]);
        enemy.animationSpeed = 0.15; enemy.play();
        enemy.scale.set(1.4); 
        enemy.anchor.set(0.5);
        enemy.x = 60; enemy.y = 390 + (index * 60); 
        
        const text = new Text({ text: '', style: { fill: 0xffcc00, fontSize: 16, fontWeight: 'bold' }});
        text.x = 100; text.y = enemy.y - 12;
        
        enemyValueTexts.push(text);
        panel.addChild(enemy, text);
    });

    function updateBetUI() {
        currentBet = BET_LEVELS[currentBetIndex];
        betText.text = `BET: ${currentBet}`;
        ENEMY_DATA.forEach((data, i) => {
            let multVal = data.mult * currentBet;
            enemyValueTexts[i].text = `= ${multVal < 1 ? multVal.toFixed(2) : Math.round(multVal)}`;
        });
    }

    updateBetUI(); 
    updateKeyUI();
    updateExpUI();

    minusBtn.on('pointerdown', () => { if (gameState === 'IDLE' && currentBetIndex > 0) { currentBetIndex--; updateBetUI(); } });
    plusBtn.on('pointerdown', () => { if (gameState === 'IDLE' && currentBetIndex < BET_LEVELS.length - 1) { currentBetIndex++; updateBetUI(); } });

    const buttonBg = new Graphics().roundRect(0, 0, 160, 60, 15).fill(0xffd700);
    const buttonText = new Text({ text: 'SPIN ROOM', style: { fill: 0x000000, fontWeight: '900', fontSize: 20 }});
    buttonText.x = 80 - buttonText.width / 2; buttonText.y = 30 - buttonText.height / 2;
    const button = new Container();
    button.addChild(buttonBg, buttonText);
    button.x = app.screen.width - 200; button.y = app.screen.height - 100;
    button.eventMode = 'static'; button.cursor = 'pointer';
    uiLayer.addChild(button);

    const winText = new Text({ 
        text: '', 
        style: { fill: 0x00ff00, fontSize: 40, fontWeight: 'bold', dropShadow: { blur: 5, distance: 2 } }
    });
    winText.x = app.screen.width / 2 + (UI_OFFSET / 2); winText.y = 60; winText.anchor.set(0.5);
    uiLayer.addChild(winText);

    // --- ADD THE SEED TEXT HERE ---
    const seedText = new Text({ 
            text: `SEED: ${currentSeed}`, 
            style: { fill: 0xffffff, fontSize: 12, fontFamily: 'monospace' } // Changed to white (0xffffff)
        });
        seedText.anchor.set(1, 1); 
        seedText.x = app.screen.width - 10; 
        seedText.y = app.screen.height - 10;
        uiLayer.addChild(seedText);

    // --- 5. DUNGEON / ARENA GENERATOR ---
    let dungeonMap: {[key: string]: boolean} = {}; 
    let enemies: any[] = [];
    let items: any[] = []; 
    let hero: any = null;
    let lastGeneratedCol = 0;
    let initialValidFloors: any[] = []; 
    
    let pathA = Math.floor(TOTAL_ROWS / 2); 
    let pathB: number | null = null; 
    let pathB_life = 0;
    
    let activeTiles: any[] = [];
    let droppingObjects: any[] = [];

    let walkingStep = 0;
    let currentPath: any[] = [];
    let currentTarget: any = null;

    function hardResetMap() {
        activeTiles.forEach(t => { if(t.sprite) t.sprite.destroy(); });
        enemies.forEach(e => { if(e.sprite) e.sprite.destroy(); });
        items.forEach(i => { if(i.sprite) i.sprite.destroy(); });
        if (hero && hero.sprite) hero.sprite.destroy();

        dungeonLayer.removeChildren();
        entityLayer.removeChildren();
        
        dungeonMap = {};
        enemies = [];
        items = [];
        droppingObjects = []; 
        activeTiles = [];
        hero = null; 

        lastGeneratedCol = 0;
        pathA = Math.floor(TOTAL_ROWS / 2); 
        pathB = null;
        pathB_life = 0;
        
        walkingStep = 0;
        currentPath = [];
        currentTarget = null;
    }

    function generateChunk(startCol: number, width: number, isInitial: boolean) {
        let validFloors: {c: number, r: number}[] = [];

        for (let c = startCol; c < startCol + width; c++) {
            for (let r = 0; r < TOTAL_ROWS; r++) { dungeonMap[`${c},${r}`] = true; }
        }

        for (let c = startCol; c < startCol + width; c++) {
            let dirA = Math.floor(seededRandom() * 3) - 1; 
            if (seededRandom() > 0.85) dirA *= 2; 
            
            let nextA = pathA + dirA;
            if (nextA < 1) nextA = 1;
            if (nextA > TOTAL_ROWS - 2) nextA = TOTAL_ROWS - 2;

            let minA = Math.min(pathA, nextA);
            let maxA = Math.max(pathA, nextA);
            for(let r = minA; r <= maxA; r++) dungeonMap[`${c},${r}`] = false;
            
            pathA = nextA;

            if (pathB === null) {
                if (seededRandom() < 0.20) {
                    pathB = pathA; 
                    pathB_life = Math.floor(seededRandom() * 5) + 3; 
                }
            } else {
                let dirB = Math.floor(seededRandom() * 3) - 1;
                if (seededRandom() > 0.85) dirB *= 2;
                
                let nextB = pathB + dirB;
                if (nextB < 1) nextB = 1;
                if (nextB > TOTAL_ROWS - 2) nextB = TOTAL_ROWS - 2;

                let minB = Math.min(pathB, nextB);
                let maxB = Math.max(pathB, nextB);
                for(let r = minB; r <= maxB; r++) dungeonMap[`${c},${r}`] = false;
                
                pathB = nextB;
                pathB_life--;

                if (pathB_life <= 0) {
                    let minRejoin = Math.min(pathB, pathA);
                    let maxRejoin = Math.max(pathB, pathA);
                    for(let r = minRejoin; r <= maxRejoin; r++) dungeonMap[`${c},${r}`] = false;
                    pathB = null; 
                }
            }
        }

        for (let c = startCol; c < startCol + width; c++) {
             for (let r = 1; r < TOTAL_ROWS - 1; r++) {
                  if (dungeonMap[`${c},${r}`] === false) validFloors.push({c, r});
             }
        }

        for (let c = startCol; c < startCol + width; c++) {
            for (let r = 0; r < TOTAL_ROWS; r++) {
                let tex: Texture;
                if (r === 0) tex = DUNGEON_TILES.wallT;
                else if (r === TOTAL_ROWS - 1) tex = DUNGEON_TILES.wallB;
                else if (dungeonMap[`${c},${r}`] === true) tex = DUNGEON_TILES.innerWall;
                else tex = DUNGEON_TILES.floor; 

                const tile = new Sprite(tex);
                tile.width = TILE_SIZE; tile.height = TILE_SIZE;
                tile.x = c * TILE_SIZE; 
                tile.y = -1000; 
                
                dungeonLayer.addChild(tile);
                activeTiles.push({ sprite: tile, c, r });

                droppingObjects.push({
                    sprite: tile, targetY: r * TILE_SIZE, yVel: 0,
                    delay: isInitial ? (c * 1.5) + (r * 1.5) : (c - startCol) * 1.5, 
                    settled: false
                });
            }
        }

        if (isInitial) {
            initialValidFloors = validFloors;
        } else {
            spawnEntitiesForChunk(width, validFloors);
        }

        lastGeneratedCol = startCol + width;
    }

    function generateBossArena(startCol: number, width: number) {
        for (let c = startCol; c < startCol + width; c++) {
            for (let r = 0; r < TOTAL_ROWS; r++) {
                let isWall = (r === 0 || r === TOTAL_ROWS - 1 || c === startCol || c === startCol + width - 1);
                dungeonMap[`${c},${r}`] = isWall;

                let tex = DUNGEON_TILES.floor;
                if (isWall) {
                    if (r === 0) tex = DUNGEON_TILES.wallT;
                    else if (r === TOTAL_ROWS - 1) tex = DUNGEON_TILES.wallB;
                    else tex = DUNGEON_TILES.innerWall;
                }

                const tile = new Sprite(tex);
                tile.width = TILE_SIZE; tile.height = TILE_SIZE;
                tile.x = c * TILE_SIZE;
                tile.y = -1000;

                dungeonLayer.addChild(tile);
                activeTiles.push({ sprite: tile, c, r });

                droppingObjects.push({
                    sprite: tile, targetY: r * TILE_SIZE, yVel: 0,
                    delay: (c * 1.0) + (r * 1.0), 
                    settled: false
                });
            }
        }
        lastGeneratedCol = startCol + width;
    }

    function spawnInitialEntities() {
        if (isBossMode) {
            hero = createCharacter('hero', 2, Math.floor(TOTAL_ROWS / 2), true);
            let bossData = ENEMY_DATA.find(e => e.id === 'vampire');
            let boss = createCharacter('enemy', 8, Math.floor(TOTAL_ROWS / 2), true, bossData);
            boss.sprite.scale.set(CHAR_SCALE * 4); 
            boss.sprite.tint = 0xFF5555; 
            boss.isBoss = true;
            enemies.push(boss);
            return;
        }

        if (initialValidFloors.length === 0) initialValidFloors.push({c: 1, r: Math.floor(TOTAL_ROWS / 2)});
        initialValidFloors.sort((a,b) => a.c - b.c);
        let hPos = initialValidFloors.shift()!;
        hero = createCharacter('hero', hPos.c, hPos.r, true);

        spawnEntitiesForChunk(15, initialValidFloors);
    }

    function spawnEntitiesForChunk(width: number, validFloors: any[]) {
        // --- THE FIX: Proper Fisher-Yates Shuffle instead of .sort() ---
        for (let i = validFloors.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom() * (i + 1));
            [validFloors[i], validFloors[j]] = [validFloors[j], validFloors[i]]; // Swap elements
        }
        // ----------------------------------------------------------------
        
        let spawnCount = 0;
        // Limit increased to 12 for flooding the map with coins!
        while (currentServerManifest.length > 0 && validFloors.length > 0 && spawnCount < 12) {
            let id = currentServerManifest.shift()!;
            let sPos = validFloors.pop()!;
            
            if (id === 'chest' || id === 'key' || id === 'coin') {
                items.push(createItem(id, sPos.c, sPos.r, false));
            } else if (id === 'killer') {
                let eData = getWeightedEnemy(); 
                let enemy = createCharacter('enemy', sPos.c, sPos.r, false, eData);
                enemy.isKiller = true; 
                enemies.push(enemy);
            } else {
                let eData = ENEMY_DATA.find(e => e.id === id);
                enemies.push(createCharacter('enemy', sPos.c, sPos.r, false, eData));
            }
            spawnCount++;
        }
    }

    function createCharacter(type: 'hero'|'enemy', c: number, r: number, isInitial: boolean, enemyData: any = null) {
        let frames = heroIdleFrames;
        
        if (type === 'enemy' && enemyData) {
            frames = ENEMY_FRAMES[enemyData.id as keyof typeof ENEMY_FRAMES];
        }

        const sprite = new AnimatedSprite(frames);
        sprite.animationSpeed = 0.15; sprite.play();
        sprite.scale.set(CHAR_SCALE); 
        sprite.anchor.set(0.5, 0.5); 
        
        if (type === 'enemy') {
            sprite.scale.x = -CHAR_SCALE; 
        }
        
        sprite.x = c * TILE_SIZE + (TILE_SIZE / 2);
        let finalY = r * TILE_SIZE + (TILE_SIZE / 2); 
        sprite.y = -1000; 
        sprite.zIndex = r; 
        entityLayer.addChild(sprite);

        droppingObjects.push({
            sprite: sprite, targetY: finalY, yVel: 0, 
            delay: isInitial ? (type === 'hero' ? 0 : 30 + Math.random() * 20) : Math.random() * 15, 
            settled: false
        });

        return { sprite, c, r, type, enemyData, isBoss: false, isKiller: false }; 
    }

    function createItem(type: 'chest'|'key'|'coin', c: number, r: number, isInitial: boolean) {
        let frames = type === 'chest' ? chestFrames : (type === 'key' ? keyFrames : coinFrames);
        const sprite = new AnimatedSprite(frames);
        
        sprite.animationSpeed = type === 'coin' ? 0.15 : 0.05; 
        sprite.play();
        sprite.scale.set(type === 'coin' ? 2.5 : ITEM_SCALE); 
        
        sprite.anchor.set(0.5, 0.5); 
        sprite.x = c * TILE_SIZE + (TILE_SIZE / 2);
        
        let finalY = r * TILE_SIZE + (TILE_SIZE / 2); 
        sprite.y = -1000; 
        sprite.zIndex = r - 0.1; 
        entityLayer.addChild(sprite);

        droppingObjects.push({ 
            sprite: sprite, targetY: finalY, yVel: 0, 
            delay: isInitial ? 30 + Math.random() * 20 : Math.random() * 15, 
            settled: false 
        });
        return { sprite, type, c, r };
    }

    function getPath(startC: number, startR: number, targetC: number, targetR: number) {
        let queue = [{ c: startC, r: startR, path: [] as {c:number, r:number}[] }];
        let visited = new Set([`${startC},${startR}`]);
        let maxDepth = 1000; 
        
        while(queue.length > 0 && maxDepth > 0) {
            maxDepth--;
            let curr = queue.shift()!;
            if(curr.c === targetC && curr.r === targetR) return curr.path;
            
            const neighbors = [[1,0], [-1,0], [0,1], [0,-1]];
            for(let [dc, dr] of neighbors) {
                let nc = curr.c + dc, nr = curr.r + dr;
                
                if(nr >= 1 && nr <= TOTAL_ROWS - 2 && dungeonMap[`${nc},${nr}`] === false) {
                    if(!visited.has(`${nc},${nr}`)) {
                        visited.add(`${nc},${nr}`);
                        queue.push({ c: nc, r: nr, path: [...curr.path, {c: nc, r: nr}] });
                    }
                }
            }
        }
        return null; 
    }

    // --- 7. GAME LOOP & COMBAT LOGIC ---
      button.on('pointerdown', async () => {
          if (gameState !== 'IDLE') return; // Only allow spins when fully idle
        
        if (bankroll < currentBet) {
            winText.text = "NOT ENOUGH COINS!"; winText.style.fill = 0xff0000;
            return;
        }

        const response = getServerSpin(currentBet);
        bankroll = response.newBankroll;
        
        currentServerManifest = [...response.entities]; 
        currentServerManifest.push('killer'); // Mandatory death ending
        currentSeed = response.seed; 

        seedText.text = `SEED: ${currentSeed}`;
        
        bankText.text = `BANK: ${bankroll}`;
        gameState = 'DROPPING_TILES'; 
        totalWin = 0; 
        winText.text = ''; winText.style.fill = 0x00ff00; 
        buttonBg.fill(0xaaaaaa);
        
        hardResetMap(); 
        
        cameraX = 0;
        worldLayer.x = UI_OFFSET;

        let initialCols = Math.ceil((app.screen.width - UI_OFFSET) / TILE_SIZE) + 5;
        generateChunk(0, initialCols, true); 
    });

    function startBossMode() {
        isBossMode = true;
        keyCount = 0;
        updateKeyUI();
        
        winText.text = "";
        winText.style.fill = 0x00ff00;

        hardResetMap();

        cameraX = 0;
        worldLayer.x = UI_OFFSET;

        generateBossArena(0, 11); 
        gameState = 'DROPPING_TILES';
    }

    function huntNextTarget() {
        if (!isBossMode && currentServerManifest.length === 0 && enemies.length === 0 && items.length === 0) { 
            endSpin(); 
            return; 
        }

        let validTargets: any[] = [];
        
        if (isBossMode) {
            let boss = enemies.find(e => e.isBoss);
            if (boss) validTargets.push({...boss, targetType: 'enemy'});
        } else {
            validTargets.push(...enemies.filter(e => e.c >= hero.c).map(e => ({...e, targetType: 'enemy'})));
            // Unrestricted item hunting
            items.filter(i => i.c >= hero.c).forEach(i => validTargets.push({...i, targetType: 'item'}));
        }

        let closestTarget = null;
        let shortestPath: any = null;
        let minLen = Infinity;

        validTargets.forEach(target => {
            let path = getPath(hero.c, hero.r, target.c, target.r);
            if(path && path.length > 0 && path.length < minLen) {
                minLen = path.length;
                closestTarget = target;
                shortestPath = path;
            }
        });

        if(!closestTarget) {
            let fallbackC = lastGeneratedCol - 1;
            let fallbackR = pathA; 
            let path = getPath(hero.c, hero.r, fallbackC, fallbackR) || [{c: fallbackC, r: fallbackR}];
            walkPath(path, { targetType: 'walk_only' });
            return;
        }

        walkPath(shortestPath, closestTarget);
    }

    function walkPath(path: any[], target: any) {
        currentPath = path;
        currentTarget = target;
        walkingStep = 0;
        gameState = 'WALKING';
        
        if (hero && hero.sprite.textures !== heroWalkFrames) {
            hero.sprite.textures = heroWalkFrames;
            hero.sprite.animationSpeed = 0.2;
            hero.sprite.loop = true;
            hero.sprite.play();
        }
    }

    function endSpin() {
        gameState = 'IDLE';
        buttonBg.fill(0xffd700);
        winText.style.fill = 0x00ff00; 
        if (totalWin > 0) { bankText.text = `BANK: ${bankroll}`; }
        
        if (hero && hero.sprite.textures !== heroIdleFrames && hero.sprite.textures !== heroDeathFrames) {
            hero.sprite.textures = heroIdleFrames;
            hero.sprite.loop = true;
            hero.sprite.play();
        }
    }

    // --- 8. TICKER ENGINE ---
    app.ticker.add((time) => {
        let dt = time.deltaTime;

        if (shakeTimer > 0) {
            shakeTimer -= dt;
            worldLayer.pivot.x = (Math.random() - 0.5) * shakeMagnitude;
            worldLayer.pivot.y = (Math.random() - 0.5) * shakeMagnitude;
        } else {
            worldLayer.pivot.x = 0;
            worldLayer.pivot.y = 0;
        }

        if (hitPauseTimer > 0) {
            hitPauseTimer -= dt;
            if (hero && hero.sprite && hero.sprite.playing) hero.sprite.stop();
            enemies.forEach(e => { if (e.sprite && e.sprite.playing) e.sprite.stop(); });
            return; 
        } else {
            if (hero && hero.sprite && !hero.sprite.playing && gameState !== 'DEAD' && gameState !== 'BOSS_TRANSITION') hero.sprite.play();
            enemies.forEach(e => { if (e.sprite && !e.sprite.playing) e.sprite.play(); });
        }

        for (let i = droppingObjects.length - 1; i >= 0; i--) {
            let obj = droppingObjects[i];
            if (!obj.sprite || obj.sprite.destroyed) { droppingObjects.splice(i, 1); continue; }

            if (obj.delay > 0) {
                obj.delay -= dt; 
            } else if (!obj.settled) {
                obj.yVel += 2.5 * dt; 
                obj.sprite.y += obj.yVel * dt;
                
                if (obj.sprite.y >= obj.targetY) {
                    obj.sprite.y = obj.targetY;
                    obj.bounce = (obj.bounce || 0) + 1;
                    if (obj.bounce > 2 || Math.abs(obj.yVel) < 4) {
                        obj.settled = true; 
                        droppingObjects.splice(i, 1); 
                    } else {
                        obj.yVel = -obj.yVel * 0.35; 
                    }
                }
            }
        }

        if (gameState === 'WALKING' || gameState === 'INTERACTING') {
            if (hero && hero.sprite && !hero.sprite.destroyed) {
                let targetCameraX = hero.sprite.x - (TILE_SIZE * 3); 
                if (targetCameraX > cameraX) {
                    cameraX += (targetCameraX - cameraX) * 0.1 * dt; 
                    worldLayer.x = -cameraX + UI_OFFSET; 
                }
                
                if (!isBossMode) {
                    let screenWidthCols = Math.ceil((app.screen.width - UI_OFFSET) / TILE_SIZE);
                    let rightmostVisibleCol = Math.ceil(cameraX / TILE_SIZE) + screenWidthCols;
                    if (lastGeneratedCol < rightmostVisibleCol + 5) {
                        generateChunk(lastGeneratedCol, 10, false); 
                    }
                }
            }

            if (!isBossMode) {
                let cullingX = cameraX - (TILE_SIZE * 4); 
                activeTiles = activeTiles.filter(t => {
                    if (t.sprite.x < cullingX) { t.sprite.destroy(); delete dungeonMap[`${t.c},${t.r}`]; return false; } return true;
                });
                enemies = enemies.filter(e => {
                    if (e.sprite.x < cullingX && e !== currentTarget) { e.sprite.destroy(); return false; } return true;
                });
                items = items.filter(i => {
                    if (i.sprite.x < cullingX && i !== currentTarget) { i.sprite.destroy(); return false; } return true;
                });
            }
        }

        if (gameState === 'DROPPING_TILES') {
            if (droppingObjects.length === 0) {
                spawnInitialEntities(); 
                gameState = 'DROPPING_ENTITIES';
            }
        } 
        else if (gameState === 'DROPPING_ENTITIES') {
            if (droppingObjects.length === 0) {
                gameState = 'IDLE_WAITING'; 
                setTimeout(huntNextTarget, 400); 
            }
        }
        else if (gameState === 'WALKING' && currentPath.length > 0) {
            let nextCell = currentPath[walkingStep];
            let targetX = nextCell.c * TILE_SIZE + (TILE_SIZE / 2);
            let targetY = nextCell.r * TILE_SIZE + (TILE_SIZE / 2);
            
            let dx = targetX - hero.sprite.x;
            let dy = targetY - hero.sprite.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist > 5) {
                hero.sprite.x += (dx / dist) * 4 * dt; 
                hero.sprite.y += (dy / dist) * 4 * dt;
                
                if(dx > 0) hero.sprite.scale.x = Math.abs(hero.sprite.scale.x);
                else if (dx < 0) hero.sprite.scale.x = -Math.abs(hero.sprite.scale.x);
                hero.sprite.zIndex = 1000; 

            } else {
                hero.c = nextCell.c;
                hero.r = nextCell.r;
                hero.sprite.zIndex = hero.r; 
                walkingStep++;

                if(walkingStep >= currentPath.length) {
                    gameState = 'INTERACTING'; 
                    
                    if (currentTarget.targetType === 'walk_only') {
                        hero.sprite.textures = heroIdleFrames;
                        hero.sprite.play();
                        setTimeout(huntNextTarget, 100);
                        return;
                    }

                    if (currentTarget.targetType === 'item') {
                        
                        // --- NEW FAST-TRACK FOR COINS ---
                        if (currentTarget.type === 'coin') {
                            totalWin = Math.round((totalWin + 0.01 * currentBet) * 100) / 100;
                            winText.text = `LOOT: $${totalWin.toFixed(2)}`;
                            
                            let actualItem = items.find(i => i.c === currentTarget.c && i.r === currentTarget.r);
                            if(actualItem) { actualItem.sprite.destroy(); items = items.filter(i => i !== actualItem); }
                            
                            huntNextTarget(); 
                            return;
                        }

                        hero.sprite.textures = heroIdleFrames;
                        hero.sprite.play();
                        shakeTimer = 10; shakeMagnitude = 8; 
                        
                        if (currentTarget.type === 'key') { 
                            keyCount++; 
                            updateKeyUI(); 
                            totalWin = Math.round((totalWin + KEY_MULT * currentBet) * 100) / 100;
                            
                            if (keyCount >= 3) {
                                gameState = 'BOSS_TRANSITION';
                                shakeTimer = 120; 
                                shakeMagnitude = 15; 
                                winText.text = "VAMPIRE LORD APPROACHING!";
                                winText.style.fill = 0xff0000; 
                                
                                let actualItem = items.find(i => i.c === currentTarget.c && i.r === currentTarget.r);
                                if(actualItem) { actualItem.sprite.destroy(); items = items.filter(i => i !== actualItem); }
                                
                                setTimeout(() => { startBossMode(); }, 2000);
                                return; 
                            }

                        } 
                        else if (currentTarget.type === 'chest') { 
                            totalWin = Math.round((totalWin + CHEST_MULT * currentBet) * 100) / 100;
                        }
                        
                        winText.text = `LOOT: $${totalWin.toFixed(2)}`;
                        
                        let actualItem = items.find(i => i.c === currentTarget.c && i.r === currentTarget.r);
                        if(actualItem) { actualItem.sprite.destroy(); items = items.filter(i => i !== actualItem); }
                        
                        setTimeout(huntNextTarget, 150);

                    } 
                    else if (isBossMode && currentTarget.isBoss) {
                        hero.sprite.textures = heroAttack2Frames;
                        hero.sprite.animationSpeed = 0.25;
                        hero.sprite.loop = false;
                        hero.sprite.gotoAndPlay(0);

                        setTimeout(() => {
                            gainExp(100); 
                            shakeTimer = 40; shakeMagnitude = 25; 
                            hitPauseTimer = 20; 

                            let actualBoss = enemies.find(e => e.isBoss);
                            if(actualBoss) { 
                                actualBoss.sprite.tint = 0xFFFFFF; 
                                actualBoss.sprite.scale.set(-CHAR_SCALE * 5, CHAR_SCALE * 5); 
                                
                                totalWin = Math.round((totalWin + 100.0 * currentBet) * 100) / 100; 
                                winText.text = `LORD SLAIN!\nMEGA LOOT: $${totalWin.toFixed(2)}`;
                                winText.style.fill = 0xffd700; 

                                setTimeout(() => {
                                    if(!actualBoss.sprite.destroyed) {
                                        actualBoss.sprite.destroy(); 
                                        enemies = enemies.filter(e => e !== actualBoss); 
                                    }
                                    setTimeout(() => {
                                        isBossMode = false;
                                        endSpin();
                                    }, 2000); 
                                }, 150);
                            }
                        }, 200); 

                    }
                    else {
                        if (currentTarget.isKiller) {
                            gameState = 'DEAD';
                            shakeTimer = 20; shakeMagnitude = 20; 
                            
                            hero.sprite.textures = heroDeathFrames;
                            hero.sprite.animationSpeed = 0.25; 
                            hero.sprite.loop = false;
                            hero.sprite.gotoAndPlay(0);
                            
                            if (totalWin > 0) {
                                winText.text = `RUN ENDED!\nTOTAL WIN: $${totalWin.toFixed(2)}`;
                                winText.style.fill = 0xffd700; 
                            } else {
                                winText.text = `DEFEATED!`;
                                winText.style.fill = 0xff0000; 
                            }
                            setTimeout(endSpin, 1000);

                        } 
                        else {
                            hero.sprite.textures = heroAttack2Frames;
                            hero.sprite.animationSpeed = 0.25;
                            hero.sprite.loop = false;
                            hero.sprite.gotoAndPlay(0);

                            setTimeout(() => {
                                let actualEnemy = enemies.find(e => e.c === currentTarget.c && e.r === currentTarget.r);
                                
                                // --- JUICE TWEAK: Less lag for small enemies ---
                                let isSlime = actualEnemy && actualEnemy.enemyData.id === 'slime';
                                gainExp(isSlime ? 2 : 10); 
                                shakeTimer = isSlime ? 5 : 15; 
                                shakeMagnitude = isSlime ? 4 : 12; 
                                hitPauseTimer = isSlime ? 1 : 8; 
                                // ------------------------------------------------

                                if(actualEnemy) { 
                                    actualEnemy.sprite.tint = 0xFFFFFF; 
                                    actualEnemy.sprite.scale.set(-CHAR_SCALE * 1.3, CHAR_SCALE * 1.3); 
                                    
                                    const enemyInfo = actualEnemy.enemyData;
                                    if (enemyInfo) {
                                        totalWin = Math.round((totalWin + enemyInfo.mult * currentBet) * 100) / 100;
                                    }
                                    winText.text = `LOOT: $${totalWin.toFixed(2)}`;

                                    setTimeout(() => {
                                        if(!actualEnemy.sprite.destroyed) {
                                            actualEnemy.sprite.destroy(); 
                                            enemies = enemies.filter(e => e !== actualEnemy); 
                                        }
                                        setTimeout(huntNextTarget, 150); 
                                    }, 100);
                                }
                            }, 200); 
                        }
                    }
                }
            }
        }
    });
})();