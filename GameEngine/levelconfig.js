/**
 * Handles level configurations, including loading maps, players, and hazards.
 *
 * @author Peter Madin
 * @version 0.0.1
 * @date 02/7/25
 */
class LevelConfig {
    /**
     * Creates an instance of LevelConfig.
     * @param {object} gameEngine - The game engine instance.
     */
    constructor(gameEngine) {
        this.game = gameEngine;
        this.currentLevel = 1; // sets the current level
        this.TILE_SIZE = 25;
    }

    loadLevel(levelNumber) {
        this.currentLevel = levelNumber;

        const levelConfig = window.LEVEL_LOADER
            ? window.LEVEL_LOADER.getLevelEntities(levelNumber, this.game, this.TILE_SIZE)
            : null;
        if (!levelConfig) {
            console.error('LevelConfig.loadLevel: no JSON data for level', levelNumber,
                '— ensure the game is served over HTTP (not file://).');
            return false;
        }

        this.assemble(levelConfig);
        return true;
    }

    /**
     * Replaces everything in the world with the level described by `levelConfig` (the `{map, player, exitDoor,
     * hazards, tiles}` factories from LevelLoader.getLevelEntities). Split out of loadLevel so a level that isn't
     * one of the numbered floors, such as a draft being playtested in the level editor, can be built without
     * touching currentLevel, saved progress or best times.
     */
    assemble(levelConfig) {
        // Make sure any level completion UI is hidden first
        if (this.game.levelUI) {
            this.game.levelUI.hideLevelComplete();
            this.game.levelUI.resetUIState();
        }

        // clear existing entities and player reference
        this.game.entities = [];
        this.game.Player = null;

        // first create and add the map
        const map = levelConfig.map();
        map.loadMap(levelConfig.tiles);
        this.game.addEntity(map);

        // create and add the exit door
        const exitDoor = levelConfig.exitDoor();
        this.game.addEntity(exitDoor);

        // add any obstacles
        const obstacles = levelConfig.hazards();
        obstacles.forEach(obstacle => {
            this.game.addEntity(obstacle);
        });

        // create and add the player
        // player is created last so they are at the front of sprites
        const player = levelConfig.player();
        this.game.addEntity(player);

        // Start the camera on the player rather than easing over from the previous level
        if (this.game.snapCamera) this.game.snapCamera();

        // Reset timer
        if (this.game.timer) {
            this.game.timer.reset();
        }

        // Add "elevator ding" sound effect when level loads
        // this.playElevatorDing();
    }

    getCurrentLevel() {
        return this.currentLevel
    }

    loadNextLevel() {
        if (this.currentLevel < 17) {
            // Make sure any level completion UI is hidden before loading next level
            if (this.game.levelUI) {
                this.game.levelUI.hideLevelComplete();
            }

            // Increment the current level BEFORE loading it
            const nextLevel = this.currentLevel + 1;

            // Add a small delay to ensure UI is properly cleared
            setTimeout(() => {
                console.log(`Loading next level: ${nextLevel}`);

                // Update currentLevel before loading the level
                this.currentLevel = nextLevel;

                // Now load the updated level
                this.loadLevel(nextLevel);

                // Play a random game track for the new level
                if (window.AUDIO_MANAGER) {
                    window.AUDIO_MANAGER.playGameMusic();
                }
            }, 100);
        }
    }

    /**
     * Plays an elevator "ding" sound effect when changing levels
     */
    playElevatorDing() {
        // Create a temporary audio element for the ding sound
        const dingSound = new Audio('./sounds/sample-adinghere.mp3');

        // Set volume based on current audio manager settings
        if (window.AUDIO_MANAGER) {
            dingSound.volume = window.AUDIO_MANAGER.isMuted ? 0 : window.AUDIO_MANAGER.volume;
        } else {
            dingSound.volume = 0.5;
        }

        // Play the sound
        dingSound.play().catch(error => {
            console.error("Error playing elevator ding:", error);
        });
    }
}