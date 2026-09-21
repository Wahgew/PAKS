// This game shell was happily modified from Googler Seth Ladd's "Bad Aliens" game and his Google IO talk in 2011

class GameEngine {
    constructor(options) {
        // What you will use to draw
        this.ctx = null;

        // Options and the Details
        this.options = options || {
            debugging: false,
        };

        // timer initialization
        this.timer = null;
        this.running = false;

        // display level ending ui
        this.levelUI = new LevelUI(this.ctx);

        // Everything that will be updated and drawn each frame
        this.entities = [];

        // Which part of the level the canvas shows (camera.js). The canvas is a fixed-size view of the level, not as big
        // as the level, so tiles and sprites stay the same size however large the level is.
        this.camera = new Camera();
        this.cameraManual = false;   // the level editor drives the camera itself while editing

        // Information on the input
        this.click = null;
        this.mouse = null;
        this.wheel = null;
        this.keys = {};

        // store player instance
        this.Player = null;
        this.entityCount = 0;
    }

    // use async to wait for the DB to initialize
    async init(ctx) {
        this.ctx = ctx;
        this.setViewSize(Camera.VIEW_W, Camera.VIEW_H);
        this.startInput();
        this.initDebugMode();
        this.timer = new Timer();

        // Initialize levelTimesManager first
        this.levelTimesManager = new LevelTimesManager();

        // Wait for the database to be ready
        await this.levelTimesManager.dbReady;
        console.log("Database is ready");

        // Now initialize LevelUI after DB is ready
        this.levelUI = new LevelUI(this);

        // Update the best time cache once everything is initialized
        await this.levelUI.updateBestTimeCache();
    }

    initDebugMode() {
        // Get debug checkbox
        this.debugBox = document.getElementById("debug");

        if (this.debugBox) {
            // Set initial state
            this.options.debugging = this.debugBox.checked;

            // Create debug menu
            const debugMenu = document.createElement("div");
            debugMenu.id = "debugMenu";

            // Position menu next to debug checkbox
            const checkboxRect = this.debugBox.getBoundingClientRect();
            debugMenu.style.position = "fixed";
            debugMenu.style.left = (checkboxRect.right + 10) + "px"; // 10px gap after checkbox
            debugMenu.style.top = checkboxRect.top + "px";

            // Rest of the styling
            debugMenu.style.backgroundColor = "white";
            debugMenu.style.padding = "10px";
            debugMenu.style.border = "1px solid #ccc";
            debugMenu.style.borderRadius = "4px";
            debugMenu.style.display = this.options.debugging ? "block" : "none";
            debugMenu.style.zIndex = "1000";

            // Create level selector
            const levelSelect = document.createElement("select");
            levelSelect.style.padding = "5px";
            levelSelect.style.marginLeft = "10px";

            // Add level options
            const levels = [
                { value: 0, label: "Floor 0 (Test)" },
                { value: 1, label: "Floor 1" },
                { value: 2, label: "Floor 2" },
                { value: 3, label: "Floor 3" },
                { value: 4, label: "Floor 4" },
                { value: 5, label: "Floor 5" },
                { value: 6, label: "Floor 6" },
                { value: 7, label: "Floor 7" },
                { value: 8, label: "Floor 8" },
                { value: 9, label: "Floor 9" },
                { value: 10, label: "Floor 10" },
                { value: 11, label: "Floor 11" },
                { value: 12, label: "Floor 12" },
                { value: 13, label: "Floor 13" },
                { value: 14, label: "Floor 14" },
                { value: 15, label: "Floor 15" },
                { value: 16, label: "Floor 16" }
            ];

            levels.forEach(level => {
                const option = document.createElement("option");
                option.value = level.value;
                option.text = level.label;
                levelSelect.appendChild(option);
            });

            // Add label
            const label = document.createElement("label");
            label.textContent = "Level: ";
            label.style.marginRight = "5px";

            // Create unlock all levels button
            const unlockButton = document.createElement("button");
            unlockButton.textContent = "Unlock All Levels";
            unlockButton.style.marginTop = "10px";
            unlockButton.style.padding = "5px";
            unlockButton.style.display = "block";
            unlockButton.style.width = "100%";
            unlockButton.style.backgroundColor = "#4CAF50";
            unlockButton.style.color = "white";
            unlockButton.style.border = "none";
            unlockButton.style.borderRadius = "4px";
            unlockButton.style.cursor = "pointer";
            
            // Add elements to debug menu
            debugMenu.appendChild(label);
            debugMenu.appendChild(levelSelect);
            debugMenu.appendChild(unlockButton);

            // Add to document
            document.body.appendChild(debugMenu);

            // Add event listeners
            this.debugBox.addEventListener("change", (e) => {
                this.options.debugging = e.target.checked;
                debugMenu.style.display = e.target.checked ? "block" : "none";
                console.log("Debug mode:", this.options.debugging);
                
                // When debug mode is enabled, automatically unlock all levels
                if (e.target.checked && window.LEVEL_PROGRESS) {
                    window.unlockAllLevels();
                    console.log("All levels unlocked via debug mode");
                }
            });

            levelSelect.addEventListener("change", (e) => {
                const level = parseInt(e.target.value);
                console.log("Loading level:", level);
                if (this.levelConfig) {
                    this.levelConfig.loadLevel(level);
                    this.levelConfig.currentLevel = level;
                    window.CURRENT_GAME_LEVEL = level;
                }
            });
            
            unlockButton.addEventListener("click", () => {
                if (window.LEVEL_PROGRESS) {
                    window.unlockAllLevels();
                    console.log("All levels unlocked via button");
                }
            });
            
            // Set initial value and display state
            levelSelect.value = this.levelConfig ? this.levelConfig.currentLevel : 1;
            debugMenu.style.display = this.options.debugging ? "block" : "none";
            
            // If debug mode is on at initialization, unlock all levels
            if (this.options.debugging && window.LEVEL_PROGRESS) {
                setTimeout(() => {
                    window.unlockAllLevels();
                    console.log("All levels unlocked on initialization");
                }, 1000); // Delay to ensure LEVEL_PROGRESS is initialized
            }
        }
    }

    start() {
        this.running = true;
        const gameLoop = () => {
            this.loop();
            if (this.running) {
                requestAnimFrame(gameLoop, this.ctx.canvas);
            }
        };
        gameLoop();
    }

    startInput() {
        // Move keyboard events to window instead of canvas
        window.addEventListener("keydown", event => {
            console.log("Key pressed:", event.key.toLowerCase());
            this.keys[event.key.toLowerCase()] = true;
        });

        window.addEventListener("keyup", event => {
            console.log("Key released:", event.key.toLowerCase());
            this.keys[event.key.toLowerCase()] = false;
        });

        // Mouse events remain on canvas. Positions are in canvas pixels (the canvas is scaled by CSS to fit the window)
        const getXandY = e => this.pointerToCanvas(e);

        this.ctx.canvas.addEventListener("mousemove", e => {
            this.mouse = getXandY(e);
            if (this.options.debugging) {
                console.log("MOUSE_MOVE", this.mouse);
            }
        });

        this.ctx.canvas.addEventListener("click", e => {
            if (this.options.debugging) {
                console.log("CLICK", getXandY(e));
            }
            this.click = getXandY(e);
        });

        this.ctx.canvas.addEventListener("wheel", e => {
            if (this.options.debugging) {
                console.log("WHEEL", getXandY(e), e.wheelDelta);
            }
            e.preventDefault(); // Prevent Scrolling
            this.wheel = e;
        });

        this.ctx.canvas.addEventListener("contextmenu", e => {
            if (this.options.debugging) {
                console.log("RIGHT_CLICK", getXandY(e));
            }
            e.preventDefault(); // Prevent Context Menu
            this.rightclick = getXandY(e);
        });

        // enter handler for level restart and complete
        window.addEventListener("keydown", event => {
            this.keys[event.key.toLowerCase()] = true;

            if (event.key.toLowerCase() === 'enter') {
                console.log("Enter key pressed, checking UI state");

                // Only handle UI navigation if a UI screen is showing
                if (this.levelUI) {
                    // Just call the same handler as buttons use
                    if (this.levelUI.isDisplayingDeath || this.levelUI.isDisplayingComplete) {
                        console.log("UI screen is showing, handling Enter key");
                        this.levelUI.handleButtonAction('continue');
                    }
                }
            }
        });
    }

    addEntity(entity) {
        if (this.options.debugging) {
            console.log("Adding entity #" + this.entityCount + ":", entity);
        }
        this.entityCount++;
        this.entities.push(entity);
    }

    /**
     * Give the canvas a fixed size (the view of the level) instead of the level's size. Assigning canvas.width also
     * resets the context, so image smoothing is set again here: the old code resized the canvas every frame, which
     * kept smoothing on, and the game is drawn that way (main.js turns it off once, which never lasted).
     */
    setViewSize(w, h) {
        const canvas = this.ctx.canvas;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        this.ctx.imageSmoothingEnabled = true;
        this.camera.setView(w, h);
        if (typeof window !== 'undefined' && window.fitGameCanvas) window.fitGameCanvas();
    }

    /** A mouse/pointer event's position in canvas pixels, correct at any CSS scale of the canvas. */
    pointerToCanvas(e) {
        const canvas = this.ctx.canvas;
        const r = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * canvas.width / (r.width || 1),
            y: (e.clientY - r.top) * canvas.height / (r.height || 1),
        };
    }

    /** A mouse/pointer event's position in the level (through the camera). */
    pointerToWorld(e) {
        const p = this.pointerToCanvas(e);
        return this.camera.screenToWorld(p.x, p.y);
    }

    // The level being shown, if any: its size in pixels and the player to follow
    cameraTarget() {
        const map = this.entities.find(entity => entity instanceof drawMap);
        const p = this.Player;
        if (!map || !map.map || !p) return null;
        return {cx: p.x + p.width / 2, cy: p.y + p.height / 2, mapW: map.pixelWidth, mapH: map.pixelHeight};
    }

    /** Ease the camera toward the player. */
    updateCamera() {
        if (this.cameraManual) return;
        const t = this.cameraTarget();
        if (t) this.camera.follow(t.cx, t.cy, t.mapW, t.mapH, this.clockTick || 0);
    }

    /** Put the camera on the player at once: for the moment a level is loaded. */
    snapCamera() {
        const t = this.cameraTarget();
        if (t) this.camera.snapTo(t.cx, t.cy, t.mapW, t.mapH);
    }

    draw() {
        if (!this.ctx) {
            console.error("No context found in GameEngine");
            return;
        }
    
        // Log canvas state before clearing
        /* console.log("Canvas state before clear:", {
            width: this.ctx.canvas.width,
            height: this.ctx.canvas.height,
            transform: this.ctx.getTransform()
        }); */
    
        // Black outside the level: a level smaller than the view is centred in it, and drawMap paints only its own area
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    
        // Reset any transformations
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    
        // World space: the map and everything in the level are drawn through the camera
        this.ctx.save();
        this.ctx.setTransform(...this.camera.transform());

        // Draw from front to back (map first, then entities)
        // Find and draw map first
        const mapEntity = this.entities.find(entity => entity instanceof drawMap);
        if (mapEntity) {
            this.ctx.save();
            mapEntity.draw(this.ctx);
            this.ctx.restore();
        }
    
        // Then draw all other entities
        this.entities.forEach(entity => {
            if (!(entity instanceof drawMap)) {
                if (this.options.debugging) {
                    const time = Date.now()
                    if (!this.lastDebugLogTime || time - this.lastDebugLogTime >= 3000) {
                        console.log("Drawing entity:", entity);
                        this.lastDebugLogTime = time;
                    }
                }
                this.ctx.save();
                entity.draw(this.ctx);
                this.ctx.restore();
            }
        });

        // Screen space again: the timer, the death/complete screens and debug text stay put whatever the camera does
        this.ctx.restore();
    
        // draw timer with elevator theme
        if (this.timer && !this.hideHud) {   // the level editor hides the floor-time panel while editing
            const displayTime = this.timer.getDisplayTime();
            const minutes = Math.floor(displayTime / 60);
            const seconds = Math.floor(displayTime % 60);
            const milliseconds = Math.floor((displayTime % 1) * 100);
    
            const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(2, '0')}`;
    
            // Draw elevator-style digital display for timer
            const displayWidth = 200;
            const displayHeight = 50;
            const padding = 10;
    
            // Position in top center
            const displayX = (this.ctx.canvas.width / 2) - (displayWidth / 2);
            const displayY = 20;
    
    
            // Draw panel background
            this.ctx.fillStyle = '#333';
            this.ctx.fillRect(displayX, displayY, displayWidth, displayHeight);
            this.ctx.strokeStyle = '#555';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(displayX, displayY, displayWidth, displayHeight);
    
            // Draw inner display
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(
                displayX + padding,
                displayY + padding,
                displayWidth - padding * 2,
                displayHeight - padding * 2
            );
    
            // Add text "FLOOR TIME"
            this.ctx.font = '12px monospace';
            this.ctx.fillStyle = '#ffcc00';
            this.ctx.textAlign = 'left';
            this.ctx.fillText('FLOOR TIME', displayX + padding + 5, displayY + padding + 15);
    
            // Draw time
            this.ctx.font = 'bold 18px monospace';
            this.ctx.fillStyle = '#33ff33'; // Digital green color
            this.ctx.textAlign = 'right';
            this.ctx.fillText(
                formattedTime,
                displayX + displayWidth - padding - 5,
                displayY + displayHeight - padding - 5
            );
    
            // Add small decorative LEDs
            this.ctx.fillStyle = '#3f3'; // Green LED
            this.ctx.beginPath();
            this.ctx.arc(displayX + displayWidth - 15, displayY + 10, 3, 0, Math.PI * 2);
            this.ctx.fill();
    
            // REMOVED: The problematic timer auto-start code that was here
        }
    
        this.levelUI.draw(this.ctx);
    
        // draws the x y pos following the cursor
        if (this.options.debugging && this.mouse) {
            this.ctx.font = "12px Arial";
            this.ctx.fillStyle = "red";
    
            // ADJUST THE PIXEL DISPLAY CURSOR
            let offsetX = 35; // Adjust to prevent overlap with cursor
            let offsetY = 50;
    
            const w = this.camera.screenToWorld(this.mouse.x, this.mouse.y);   // the level position under the cursor
            this.ctx.fillText(`(${Math.round(w.x)}, ${Math.round(w.y)})`, this.mouse.x + offsetX, this.mouse.y + offsetY);
        }
    }

    update() {
        // Store initial entity count
        // add safety checks to handle entity removal
        let entitiesCount = this.entities.length;

        // first pass: Update all valid entities
        for (let i = 0; i < entitiesCount; i++) {
            let entity = this.entities[i];

            // add null check to prevent "Cannot read properties of undefined"
            // handles cases where entities might have been removed
            if (entity && !entity.removeFromWorld) {
                entity.update();
            }
        }

        // second pass: Remove marked entities
        // backward iteration prevents skipping elements when removing items
        for (var i = this.entities.length - 1; i >= 0; --i) {
            // null check for safety
            if (this.entities[i] && this.entities[i].removeFromWorld) {
                this.entities.splice(i, 1);
            }
        }

        this.updateCamera();
    }

    loop() {
        this.clockTick = this.timer.tick();
        this.update();
        this.draw();
    }
}
// KV Le was here :)
