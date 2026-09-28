/**
 * LevelLoader: loads level data from pre-fetched JSON and instantiates entities.
 *
 * Usage:
 *   1. main.js fetches all level JSON files during asset loading and calls
 *      LEVEL_LOADER.store(n, data) for each one.
 *   2. levelconfig.js calls LEVEL_LOADER.getLevelEntities(n, game, tileSize)
 *      instead of its own hardcoded getLevelEntities(), then passes cfg.tiles
 *      to map.loadMap() instead of the level number.
 */
class LevelLoader {
    constructor() {
        this.levels = {};
    }

    /**
     * Store parsed JSON data for a level.
     * @param {number} n - Level number (0–16).
     * @param {object} data - Parsed level JSON.
     */
    store(n, data) {
        this.levels[n] = data;
    }

    /**
     * Returns true if JSON data has been stored for this level.
     */
    has(n) {
        return n in this.levels;
    }

    /**
     * Returns level entity factories in the same shape as the old getLevelEntities().
     * Adds a `tiles` property containing the 2D tile array for drawMap.loadMap().
     *
     * @param {number} n
     * @param {object} game - The GameEngine instance.
     * @param {number} tileSize - TILE_SIZE (25).
     * @returns {{map, player, exitDoor, hazards, tiles}|null}
     */
    getLevelEntities(n, game, tileSize) {
        const d = this.levels[n];
        if (!d) return null;

        return {
            map:      () => new drawMap(tileSize, game),
            player:   () => new Player(game, d.player.x, d.player.y),
            exitDoor: () => new exitDoor(game, d.exitDoor.x, d.exitDoor.y, d.exitDoor.levers ?? 0),
            hazards:  () => d.entities.map(e => this.#instantiate(e, game)).filter(Boolean),
            tiles:    d.map.tiles,
        };
    }

    /**
     * Instantiate a single entity from its JSON descriptor.
     * @param {object} e - Entity descriptor from JSON.
     * @param {object} game - GameEngine instance.
     * @returns {object|null} Entity instance, or null if type is unknown.
     */
    #instantiate(e, game) {
        switch (e.type) {
            case 'Spike':
                return new Spike({
                    gameEngine: game,
                    x: e.x, y: e.y,
                    speed: e.speed,
                    moving: e.moving,
                    direction: e.direction ?? null,
                    tracking: e.tracking ?? false,
                    reverseTime: e.reverseTime ?? 0,
                });

            case 'ProjectileLauncher':
                return new ProjectileLauncher({
                    gameEngine: game,
                    x: e.x, y: e.y,
                    speed: e.speed,
                    moving: e.moving,
                    direction: e.direction ?? null,
                    reverseTime: e.reverseTime ?? 0,
                    atkspd: e.atkspd,
                    projspd: e.projspd,
                    shotdirec: e.shotdirec,
                });

            case 'GlowingLaser':
                return new GlowingLaser({
                    gameEngine: game,
                    x: e.x, y: e.y,
                    direction: e.direction,
                    flow: e.flow ?? undefined,
                    length: e.length ?? undefined,
                    color: e.color ?? undefined,
                    glowColor: e.glowColor ?? undefined,
                    width: e.width ?? undefined,
                    glowWidth: e.glowWidth ?? undefined,
                });

            case 'Laser':
                return new Laser({
                    gameEngine: game,
                    x: e.x, y: e.y,
                    speed: e.speed,
                    moving: e.moving,
                    direction: e.direction ?? null,
                    reverseTime: e.reverseTime ?? 0,
                    shotdirec: e.shotdirec,
                    length: e.length,
                });

            case 'BigBlock':
                return new BigBlock(game, e.x, e.y, e.x2, e.y2);

            case 'Platform': {
                // Level 16 random-speed platforms store speedMin/speedMax
                const speed = (e.speedMin !== undefined)
                    ? Math.floor(Math.random() * (e.speedMax - e.speedMin + 1)) + e.speedMin
                    : e.speed;
                return new Platform({
                    gameEngine: game,
                    x: e.x, y: e.y,
                    speed: speed,
                    moving: e.moving,
                    direction: e.direction ?? null,
                    reverseTime: e.reverseTime ?? 0,
                    size: e.size,
                });
            }

            case 'Lever':
                return new Lever({
                    gameEngine: game,
                    x: e.x, y: e.y,
                    speed: e.speed ?? 0,
                    moving: e.moving ?? false,
                    direction: e.direction ?? null,
                    reverseTime: e.reverseTime ?? 0,
                });

            case 'Hint':
                return new Hint({
                    gameEngine: game,
                    x: e.x, y: e.y,
                    w: e.w, h: e.h,
                    text: e.text ?? '',
                });

            default:
                console.warn('LevelLoader: unknown entity type', e.type);
                return null;
        }
    }
}

window.LEVEL_LOADER = new LevelLoader();
