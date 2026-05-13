export interface SpinResult {
    seed: number;
    newBankroll: number;
    entities: string[]; 
    totalWin: number;
    isDeath: boolean;
}

let mockBankroll = 1000;

export function getServerSpin(bet: number): SpinResult {
    const roll = Math.random();
    let totalWin = 0;
    let isDeath = false;

// --- HIGHLY BALANCED PAYOUT TABLE (~96.0% EV RTP) ---
    if (roll < 0.59) {
        // 59% chance: Dead Spin (0x to 0.15x)
        totalWin = bet * (Math.random() * 0.15);
        isDeath = true;
    } else if (roll < 0.87) {
        // 28% chance: Small Return (0.15x to 1.5x)
        totalWin = bet * (0.15 + Math.random() * 1.35);
    } else if (roll < 0.97) {
        // 10% chance: Medium Win (1.5x to 4.0x) -> Boosted by 1% for higher RTP!
        totalWin = bet * (1.5 + Math.random() * 2.5);
    } else if (roll < 0.99) {
        // 2% chance: Big Win (4.0x to 10.0x)
        totalWin = bet * (4.0 + Math.random() * 6.0);
    } else if (roll < 0.998) {
        // 0.8% chance: Mega Win (10.0x to 30.0x)
        totalWin = bet * (10.0 + Math.random() * 20.0);
    } else {
        // 0.2% chance: Epic/Jackpot Win (30.0x to 80.0x)
        totalWin = bet * (30.0 + Math.random() * 50.0);
    }

    const entities: string[] = [];
    let remaining = totalWin;

    // Make chests slightly rarer since the map will be busy
    if (remaining >= bet * 25 && Math.random() > 0.8) {
        entities.push('chest');
        remaining -= (bet * 25);
    }

    // BREAK DOWN THE REST INTO TONS OF MONSTERS & COINS
    while (remaining >= bet * 0.009) { // 0.009 buffer for floating point dust
        if (remaining >= bet * 5.0 && Math.random() > 0.5) {
            entities.push('vampire');
            remaining -= (bet * 5.0);
        } else if (remaining >= bet * 0.5 && Math.random() > 0.4) {
            entities.push('skeleton');
            remaining -= (bet * 0.5);
        } else if (remaining >= bet * 0.1 && Math.random() > 0.2) {
            entities.push('slime');
            remaining -= (bet * 0.1);
        } else {
            // Fill all remaining cracks with coins!
            entities.push('coin');
            remaining -= (bet * 0.01);
        }
    }

    totalWin = Math.floor(totalWin * 100) / 100;
    mockBankroll = Math.floor((mockBankroll - bet + totalWin) * 100) / 100;

    return {
        seed: Math.random(), // In production, this would be a secure hash
        newBankroll: mockBankroll,
        entities: entities,
        totalWin: totalWin,
        isDeath: isDeath
    };
}