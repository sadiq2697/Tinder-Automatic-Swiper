// describe/it/expect provided as globals by Vitest (globals: true).
const { createSwipeLoop, createSwipeMutex } = require('../logic-loop.js');

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

describe('SwipeLoop token discipline (double-count fix)', () => {
  it('counts exactly once per step for a single live loop', () => {
    const loop = createSwipeLoop();
    const token = loop.launch();
    loop.step(token);
    expect(loop.count).toBe(1);
  });

  it('does NOT double-count when a second loop is launched (stale loop bails)', () => {
    const loop = createSwipeLoop();

    // Loop A starts (e.g. startSwiper).
    const tokenA = loop.launch();

    // Loop B starts before A's step runs (e.g. a duplicate start, or a
    // resume path firing while A is mid-await). B is now the owner.
    const tokenB = loop.launch();

    // Both loops attempt to count the same swipe.
    const aCounted = loop.step(tokenA); // stale -> must bail
    const bCounted = loop.step(tokenB); // current -> counts

    expect(aCounted).toBe(false);
    expect(bCounted).toBe(true);
    expect(loop.count).toBe(1); // exactly one, not two
  });

  it('stays at one increment even with FOUR concurrent launches (4x case)', () => {
    const loop = createSwipeLoop();
    const tokens = [loop.launch(), loop.launch(), loop.launch(), loop.launch()];

    // All four stale/old loops plus the newest try to count one swipe.
    const counted = tokens.map((t) => loop.step(t));

    // Only the last (current) token counts.
    expect(counted.filter(Boolean).length).toBe(1);
    expect(loop.count).toBe(1);
  });

  it('a stale loop that re-checks after its await self-terminates', () => {
    const loop = createSwipeLoop();
    const tokenA = loop.launch();
    expect(loop.isCurrent(tokenA)).toBe(true);

    // A newer launch happens "during A's await".
    loop.launch();

    expect(loop.isCurrent(tokenA)).toBe(false); // A is now stale
    expect(loop.step(tokenA)).toBe(false); // and refuses to count
    expect(loop.count).toBe(0);
  });

  it('sequential swipes on the same live loop accumulate correctly', () => {
    const loop = createSwipeLoop();
    const token = loop.launch();
    loop.step(token);
    loop.step(token);
    loop.step(token);
    expect(loop.count).toBe(3);
  });
});

describe('SwipeMutex (prevents overlap from ANY trigger at 1s timing)', () => {
  it('runs a single swipe and counts it', async () => {
    const m = createSwipeMutex();
    const ran = await m.run(async () => { await tick(10); });
    expect(ran).toBe(true);
    expect(m.count).toBe(1);
  });

  it('DROPS a duplicate call fired while a swipe is still awaiting (the 1s bug)', async () => {
    const m = createSwipeMutex();
    // First swipe takes 50ms of async work.
    const first = m.run(async () => { await tick(50); });
    // A stray duplicate trigger fires 10ms later, while the first still holds
    // the lock (models a second timer at 1s timing with slow swipe work).
    await tick(10);
    const second = await m.run(async () => { await tick(50); });
    await first;
    expect(second).toBe(false); // duplicate dropped
    expect(m.count).toBe(1);    // counted ONCE, not twice
  });

  it('drops several concurrent duplicates, counting only one', async () => {
    const m = createSwipeMutex();
    const main = m.run(async () => { await tick(60); });
    await tick(5);
    const dups = await Promise.all([
      m.run(async () => { await tick(60); }),
      m.run(async () => { await tick(60); }),
      m.run(async () => { await tick(60); }),
    ]);
    await main;
    expect(dups).toEqual([false, false, false]);
    expect(m.count).toBe(1);
  });

  it('allows the next swipe only after the previous releases', async () => {
    const m = createSwipeMutex();
    await m.run(async () => { await tick(20); }); // first completes, releases
    const ran = await m.run(async () => { await tick(20); }); // now allowed
    expect(ran).toBe(true);
    expect(m.count).toBe(2);
  });
});
