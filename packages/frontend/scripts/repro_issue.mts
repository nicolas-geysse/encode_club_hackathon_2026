
// import fetch from 'node-fetch'; // Use native fetch


const BASE_URL = 'http://localhost:3006/api/retroplan';
const USER_ID = 'test-user-' + Date.now();

async function run() {
    console.log(`Test User ID: ${USER_ID}`);

    // 1. Add a 1-day Academic Event
    // Feb 11, 2026 is a Wednesday.
    const eventData = {
        action: 'add_academic_event',
        userId: USER_ID,
        type: 'exam_period',
        name: 'Test Exam',
        startDate: '2026-02-11',
        endDate: null, // Simulate REAL DB NULL
        capacityImpact: 0.2 // Severe impact
    };

    console.log('Adding event...');
    const addRes = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
    });
    console.log('Add Event Status:', addRes.status);
    const addJson = await addRes.json();
    console.log('Add Event Response:', JSON.stringify(addJson, null, 2));

    // 2. Generate Retroplan
    // Goal spanning Feb 2026.
    // Start: Feb 1, 2026. Deadline: Feb 28, 2026.
    const goalData = {
        action: 'generate_retroplan',
        userId: USER_ID,
        goalId: 'goal-1',
        goalAmount: 1000,
        deadline: '2026-02-28',
        goalStartDate: '2026-02-01' // Explicit start date
    };

    console.log('Generating retroplan...');
    const genRes = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData)
    });
    console.log('Generate Status:', genRes.status);
    const genJson = await genRes.json();

    if (genJson.retroplan) {
        console.log('Retroplan generated.');
        const milestones = genJson.retroplan.milestones;
        console.log(`Total Weeks: ${milestones.length}`);

        milestones.forEach((m: any, i: number) => {
            const cap = m.capacity;
            console.log(`\nWeek ${m.weekNumber} (${cap.weekStartDate}):`);
            console.log(`  Category: ${cap.capacityCategory}`);
            console.log(`  Score: ${cap.capacityScore}`);
            console.log(`  Events: ${cap.events.length}`);
            cap.events.forEach((e: any) => {
                console.log(`    - ${e.name} (${e.startDate} to ${e.endDate})`);
            });
        });
    } else {
        console.log('Failed to generate retroplan:', JSON.stringify(genJson, null, 2));
    }
}

run().catch(console.error);
