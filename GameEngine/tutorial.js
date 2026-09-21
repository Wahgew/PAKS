/**
 * Tutorial: the pure rules around the tutorial level. No DOM or game dependencies, so it loads as a plain <script>
 * in the browser (global `Tutorial`) and via require() in Node for tests.
 *
 * The tutorial is not a numbered floor. Its level file is levels/tutorial.json, held by the LevelLoader under
 * Tutorial.LEVEL_KEY, so floor numbers, best times, saved progress and the Levels screen never see it. The only thing
 * remembered about it is one localStorage flag (not the IndexedDB save): whether the player has finished or skipped it.
 */
const Tutorial = (() => {
    const LEVEL_KEY = 'tutorial';
    const FILE = 'levels/tutorial.json';
    const STORAGE_KEY = 'paks.tutorialDone';

    // Storage can throw (private windows, blocked site data), so every access is guarded

    /** True if the player has finished or skipped the tutorial. False when nothing is stored. */
    function isDone(storage) {
        try { return storage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
    }

    /** Remember that the tutorial is done. Returns false if the browser refused to store it. */
    function markDone(storage) {
        try { storage.setItem(STORAGE_KEY, '1'); return true; } catch (e) { return false; }
    }

    /** Forget it, so the next Start begins with the tutorial again (Reset Progress does this). */
    function clear(storage) {
        try { storage.removeItem(STORAGE_KEY); return true; } catch (e) { return false; }
    }

    /**
     * Whether pressing Start should begin with the tutorial: only the first time. Someone who already finished a
     * floor before the tutorial existed is not sent back to it (they still have the button), and if the browser
     * can't remember that the tutorial was done, it is not forced on every Start.
     * `progress` is the saved level progress ({completedLevels: number[]}), or null if there is none.
     */
    function shouldAutoStart(storage, progress) {
        try { storage.getItem(STORAGE_KEY); } catch (e) { return false; }
        if (isDone(storage)) return false;
        const completed = progress && Array.isArray(progress.completedLevels) ? progress.completedLevels : [];
        return completed.length === 0;
    }

    return {LEVEL_KEY, FILE, STORAGE_KEY, isDone, markDone, clear, shouldAutoStart};
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Tutorial;
}
