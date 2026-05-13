import { getServerSpin } from './server-logic';

export function runSimulation(iterations: number = 1000000, betAmount: number = 10) {
    let totalWagered = 0;
    let totalReturned = 0;
    
    // Multiplier Distribution Buckets
    const multipliers = {
        "0x (Total Miss)": 0,
        ">0x to <1x (Crumb/Loss)": 0,
        "1x to <2x (Small Win)": 0,
        "2x to <5x (Medium Win)": 0,
        "5x to <10x (Big Win)": 0,
        "10x to <50x (Mega Win)": 0,
        "50x+ (Epic/Jackpot)": 0,
    };

    // Tracking what actually spawned to ensure our "Flooding" works
    const entityCounts: Record<string, number> = {
        coin: 0,
        slime: 0,
        skeleton: 0,
        vampire: 0,
        chest: 0
    };

    console.log(`\n🎰 --- Starting Simulation: ${iterations.toLocaleString()} spins at $${betAmount} --- 🎰\n`);

    for (let i = 0; i < iterations; i++) {
        totalWagered += betAmount;
        
        const result = getServerSpin(betAmount);
        totalReturned += result.totalWin;

        // Calculate the multiplier (Total Win / Bet)
        const mult = result.totalWin / betAmount;

        // Categorize the multiplier
        if (mult === 0) multipliers["0x (Total Miss)"]++;
        else if (mult < 1) multipliers[">0x to <1x (Crumb/Loss)"]++;
        else if (mult < 2) multipliers["1x to <2x (Small Win)"]++;
        else if (mult < 5) multipliers["2x to <5x (Medium Win)"]++;
        else if (mult < 10) multipliers["5x to <10x (Big Win)"]++;
        else if (mult < 50) multipliers["10x to <50x (Mega Win)"]++;
        else multipliers["50x+ (Epic/Jackpot)"]++;

        // Count what was placed in the manifest
        result.entities.forEach((entity: string) => {
            if (entityCounts[entity] !== undefined) {
                entityCounts[entity]++;
            } else {
                entityCounts[entity] = 1; // Catch anything unexpected
            }
        });
    }

    const rtp = (totalReturned / totalWagered) * 100;

    console.log("📊 --- SIMULATION RESULTS ---");
    console.log(`Total Spins:    ${iterations.toLocaleString()}`);
    console.log(`Total Wagered:  $${totalWagered.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`Total Returned: $${totalReturned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`Actual RTP:     ${rtp.toFixed(2)}%\n`);
    
    console.log("📈 --- MULTIPLIER DISTRIBUTION ---");
    console.table(multipliers);

    console.log("\n👾 --- TOTAL ENTITIES GENERATED ---");
    console.table(entityCounts);
}

// Run 100,000 iterations at a $10 bet
runSimulation(1000000, 10);