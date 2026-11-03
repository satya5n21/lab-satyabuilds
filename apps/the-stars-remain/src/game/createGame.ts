import * as THREE from 'three';
import { QuoteBag } from '../data/quotes';
import { AmbientAudioEngine } from './audioEngine';
import { createDesertEnvironment } from './createEnvironment';
import { createMonolith } from './createMonolith';
import { createStarfield } from './createStarfield';
import {
    GamePhase,
    GameSettings,
    QualityLevel,
    WORLD_CONFIG,
    WorldCollider
} from './gameTypes';
import { FirstPersonController } from './playerController';

export interface GameCallbacks {
    onPhaseChange: (phase: GamePhase) => void;
    onQuoteSelected: (quote: string) => void;
    onPlayerWalkedDistance: (totalDistanceWalked: number) => void;
    onPointerLockChange: (locked: boolean) => void;
    onMusicBlockedChange: (blocked: boolean) => void;
    onWebGLError: (message: string) => void;
}

export interface GameInstance {
    startJourney: () => void;
    activateMonolith: () => void;
    resetGame: () => void;
    resumeGame: () => void;
    pauseGame: () => void;
    requestPointerLock: () => void;
    retryMusicPlayback: () => void;
    updateSettings: (settings: GameSettings) => void;
    setJoystickInput: (x: number, y: number) => void;
    rotateCameraFromTouch: (dx: number, dy: number) => void;
    dispose: () => void;
}

export function createGame(
    container: HTMLElement,
    initialSettings: GameSettings,
    callbacks: GameCallbacks
): GameInstance {
    let renderer: THREE.WebGLRenderer;
    try {
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance'
        });
    } catch {
        callbacks.onWebGLError(
            'Unable to initialize WebGL in this browser. Please ensure hardware acceleration is enabled.'
        );
        return {
            startJourney: () => { },
            activateMonolith: () => { },
            resetGame: () => { },
            resumeGame: () => { },
            pauseGame: () => { },
            requestPointerLock: () => { },
            retryMusicPlayback: () => { },
            updateSettings: () => { },
            setJoystickInput: () => { },
            rotateCameraFromTouch: () => { },
            dispose: () => { }
        };
    }

    let settings: GameSettings = { ...initialSettings };
    const getTargetPixelRatio = (quality: QualityLevel) =>
        Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2.0 : 1.25);

    renderer.setPixelRatio(getTargetPixelRatio(settings.quality));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x02040a, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070d1b, 0.0038);

    const camera = new THREE.PerspectiveCamera(
        60,
        Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
        0.15,
        1200
    );

    const hemiLight = new THREE.HemisphereLight(0x2a3b60, 0x060911, 0.54);
    scene.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(0x7c9ad2, 0.66);
    moonLight.position.set(-65, 38, 42);
    scene.add(moonLight);

    const nearGroundLight = new THREE.PointLight(0x4b6596, 0.22, 12.5, 2.0);
    scene.add(nearGroundLight);

    const starfield = createStarfield(settings.quality);
    scene.add(starfield.group);

    const environment = createDesertEnvironment(settings.quality);
    scene.add(environment.group);

    const monolith = createMonolith();
    scene.add(monolith.group);

    const allColliders: WorldCollider[] = [
        ...environment.colliders,
        ...monolith.colliders
    ];

    const player = new FirstPersonController(camera);
    player.reducedMotion = settings.reducedMotion;

    const quoteBag = new QuoteBag();
    const audio = new AmbientAudioEngine(settings, callbacks.onMusicBlockedChange);
    const raycaster = new THREE.Raycaster();

    let phase: GamePhase = 'start';
    let isDisposed = false;
    let animFrameId = 0;

    // Pointer-lock and fallback drag state
    let isPointerLocked = false;
    let pointerLockSupported =
        typeof renderer.domElement.requestPointerLock === 'function';
    let isDraggingFallbackLook = false;
    let dragMovedDistance = 0;
    let lastPointerX = 0;
    let lastPointerY = 0;

    let runDistanceWalked = 0;
    let hintDismissReported = false;

    const isTouchDevice = (): boolean =>
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches;

    const isActiveExplorationPhase = (p: GamePhase = phase): boolean =>
        p === 'exploring' || p === 'approaching' || p === 'nearMonolith';

    const setPhase = (nextPhase: GamePhase) => {
        if (phase === nextPhase) return;
        phase = nextPhase;
        callbacks.onPhaseChange(nextPhase);
    };

    /**
     * Centralized, synchronous pointer-lock request on the Three.js gameplay canvas.
     * Must be invoked directly inside a user gesture handler (click / pointerup).
     */
    const requestGamePointerLock = () => {
        if (isDisposed || isTouchDevice()) return;
        const canvas = renderer.domElement;
        if (!canvas || typeof canvas.requestPointerLock !== 'function') {
            pointerLockSupported = false;
            return;
        }

        // Avoid duplicate requests if already locked to the gameplay canvas
        if (document.pointerLockElement === canvas) {
            isPointerLocked = true;
            isDraggingFallbackLook = false;
            callbacks.onPointerLockChange(true);
            return;
        }

        try {
            const maybePromise = canvas.requestPointerLock() as unknown;
            if (
                maybePromise &&
                typeof (maybePromise as Promise<void>).catch === 'function'
            ) {
                (maybePromise as Promise<void>).catch(() => {
                    isPointerLocked = document.pointerLockElement === canvas;
                    callbacks.onPointerLockChange(isPointerLocked);
                });
            }
        } catch {
            isPointerLocked = document.pointerLockElement === canvas;
            callbacks.onPointerLockChange(isPointerLocked);
        }
    };

    const getDistanceToMonolith = (): number => {
        return Math.hypot(
            player.position.x - WORLD_CONFIG.MONOLITH_POS.x,
            player.position.z - WORLD_CONFIG.MONOLITH_POS.z
        );
    };

    const triggerMonolithEncounter = () => {
        if (
            phase === 'reflection' ||
            phase === 'resetting' ||
            phase === 'start' ||
            phase === 'paused'
        ) {
            return;
        }
        const dist = getDistanceToMonolith();
        if (dist > WORLD_CONFIG.INTERACTION_DISTANCE + 0.9) {
            return;
        }

        player.clearInputs();
        isDraggingFallbackLook = false;
        if (
            document.pointerLockElement === renderer.domElement &&
            document.exitPointerLock
        ) {
            try {
                document.exitPointerLock();
            } catch {
                // Ignore exit errors
            }
        }

        monolith.triggerInteractionSurge();
        const selectedQuote = quoteBag.nextQuote();
        callbacks.onQuoteSelected(selectedQuote);
        audio.setReflectionMode(true);
        audio.playMonolithActivation();
        setPhase('reflection');
    };

    const isUIControlTarget = (target: EventTarget | null): boolean => {
        if (!(target instanceof Element)) return false;
        return Boolean(
            target.closest(
                '[data-ui-control="true"], button, input, select, textarea, a, [role="button"]'
            )
        );
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (phase !== 'start') {
            audio.resumeIfNeeded();
        }

        // Scenario A: When ESC is pressed while unlocked, release any held movement keys
        // without forcing the Settings modal open, keeping the gameplay canvas clickable.
        if (e.code === 'Escape') {
            if (isActiveExplorationPhase()) {
                player.clearInputs();
                isDraggingFallbackLook = false;
                if (
                    document.pointerLockElement === renderer.domElement &&
                    document.exitPointerLock
                ) {
                    try {
                        document.exitPointerLock();
                    } catch {
                        // Browser already handles ESC pointer lock release natively
                    }
                }
            } else if (phase === 'paused') {
                // Allow pressing ESC while Settings is open to close Settings
                const dist = getDistanceToMonolith();
                if (dist <= WORLD_CONFIG.INTERACTION_DISTANCE) {
                    setPhase('nearMonolith');
                } else if (dist <= WORLD_CONFIG.APPROACH_DISTANCE) {
                    setPhase('approaching');
                } else {
                    setPhase('exploring');
                }
            }
            return;
        }

        if ((e.code === 'KeyE' || e.code === 'Enter') && phase === 'nearMonolith') {
            e.preventDefault();
            triggerMonolithEncounter();
            return;
        }

        player.handleKeyDown(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
        player.handleKeyUp(e.code);
    };

    const onMouseMove = (e: MouseEvent) => {
        const canLook = isActiveExplorationPhase() || phase === 'reflection';
        if (!canLook) return;

        const lookWeight = phase === 'reflection' ? 0.35 : 1.0;

        // 1. Primary path: Browser pointer lock is active on our gameplay canvas
        if (document.pointerLockElement === renderer.domElement) {
            // Guard against occasional browser spikes on the frame pointer lock engages
            if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) {
                return;
            }
            player.rotateLook(
                e.movementX * lookWeight,
                e.movementY * lookWeight,
                settings.sensitivity
            );
            return;
        }

        // 2. Strictly restricted fallback: Only allow click-drag look during reflection
        // (when pointer lock is intentionally released) or if pointer lock is unsupported.
        if (
            isDraggingFallbackLook &&
            (phase === 'reflection' || !pointerLockSupported)
        ) {
            const dx = e.clientX - lastPointerX;
            const dy = e.clientY - lastPointerY;
            lastPointerX = e.clientX;
            lastPointerY = e.clientY;
            dragMovedDistance += Math.hypot(dx, dy);
            player.rotateLook(
                dx * lookWeight,
                dy * lookWeight,
                settings.sensitivity
            );
        }
    };

    const onCanvasMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        if (isUIControlTarget(e.target)) return;

        if (phase !== 'start') {
            audio.resumeIfNeeded();
        }
        if (!isActiveExplorationPhase() && phase !== 'reflection') return;

        dragMovedDistance = 0;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;

        // Only arm drag-look fallback if in reflection or if the browser lacks Pointer Lock support
        if (
            document.pointerLockElement !== renderer.domElement &&
            (phase === 'reflection' || !pointerLockSupported)
        ) {
            isDraggingFallbackLook = true;
        } else {
            isDraggingFallbackLook = false;
        }
    };

    /**
     * Scenario B: Clicking the gameplay canvas during active exploration
     * immediately and synchronously requests pointer lock on the Three.js canvas,
     * unless the click directly activated the 3D monolith in interaction range.
     */
    const onCanvasClick = (e: MouseEvent) => {
        if (e.button !== 0) return;
        if (isUIControlTarget(e.target)) return;

        const wasClick = dragMovedDistance < 7;
        isDraggingFallbackLook = false;

        if (!isActiveExplorationPhase()) return;

        audio.resumeIfNeeded();

        // Check if the player clicked directly on the 3D monolith while within interaction range
        if (wasClick && phase === 'nearMonolith') {
            const ndc = new THREE.Vector2(0, 0);
            if (document.pointerLockElement !== renderer.domElement) {
                const rect = renderer.domElement.getBoundingClientRect();
                ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            }

            raycaster.setFromCamera(ndc, camera);
            const hits = raycaster.intersectObjects(monolith.interactionMeshes, false);
            if (hits.length > 0) {
                triggerMonolithEncounter();
                return;
            }
        }

        // Restore pointer lock immediately on any ordinary gameplay canvas click
        if (document.pointerLockElement !== renderer.domElement) {
            requestGamePointerLock();
        }
    };

    const onWindowMouseUp = () => {
        isDraggingFallbackLook = false;
    };

    const handlePointerLockChange = () => {
        const locked = document.pointerLockElement === renderer.domElement;
        isPointerLocked = locked;
        isDraggingFallbackLook = false;

        if (!locked) {
            // Clear held movement keys when pointer lock is released (e.g. via ESC)
            // so the player doesn't keep walking while using the visible cursor.
            player.clearInputs();
        }

        callbacks.onPointerLockChange(locked);
    };

    const handlePointerLockError = () => {
        isPointerLocked = document.pointerLockElement === renderer.domElement;
        isDraggingFallbackLook = false;
        callbacks.onPointerLockChange(isPointerLocked);
    };

    const onResize = () => {
        if (isDisposed) return;
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(getTargetPixelRatio(settings.quality));
        renderer.setSize(w, h);
    };

    const onVisibilityChange = () => {
        audio.handleVisibilityChange(document.hidden);
        if (document.hidden && isActiveExplorationPhase()) {
            player.clearInputs();
            isDraggingFallbackLook = false;
        }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    renderer.domElement.addEventListener('mousedown', onCanvasMouseDown);
    renderer.domElement.addEventListener('click', onCanvasClick);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointerlockerror', handlePointerLockError);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);

    let lastTime = performance.now();
    let elapsedTime = 0;

    const animate = (now: number) => {
        if (isDisposed) return;
        animFrameId = requestAnimationFrame(animate);

        const rawDt = (now - lastTime) / 1000;
        lastTime = now;
        if (document.hidden) return;

        const dt = Math.min(rawDt, 0.1);
        elapsedTime += dt;

        audio.update(dt);

        const canWalk = isActiveExplorationPhase();
        const moveResult = player.update(dt, canWalk, allColliders);

        nearGroundLight.position.set(
            player.position.x - Math.sin(player.yaw) * 2.2,
            player.position.y - 0.35,
            player.position.z - Math.cos(player.yaw) * 2.2
        );

        if (moveResult.distanceMoved > 0.001 && canWalk) {
            runDistanceWalked += moveResult.distanceMoved;
            if (!hintDismissReported && runDistanceWalked >= 10.0) {
                hintDismissReported = true;
                callbacks.onPlayerWalkedDistance(runDistanceWalked);
            }
        }

        if (moveResult.stepTriggered && canWalk) {
            audio.playFootstep(moveResult.isLeftStep);
            environment.addFootprint(
                player.position.x,
                player.position.z,
                player.yaw,
                moveResult.isLeftStep
            );
        }

        const distToMonolith = getDistanceToMonolith();

        if (canWalk) {
            audio.updateProximity(distToMonolith);
            if (distToMonolith <= WORLD_CONFIG.INTERACTION_DISTANCE) {
                setPhase('nearMonolith');
            } else if (distToMonolith <= WORLD_CONFIG.APPROACH_DISTANCE) {
                setPhase('approaching');
            } else {
                setPhase('exploring');
            }
        }

        const currentPixelRatio = renderer.getPixelRatio();
        starfield.update(
            dt,
            elapsedTime,
            player.position,
            moveResult.resolvedDx,
            moveResult.resolvedDz,
            currentPixelRatio,
            canWalk
        );

        environment.update(
            dt,
            elapsedTime,
            player.position,
            phase === 'reflection',
            currentPixelRatio
        );

        monolith.update(
            dt,
            elapsedTime,
            distToMonolith,
            phase === 'reflection'
        );

        renderer.render(scene, camera);
    };

    animFrameId = requestAnimationFrame(animate);

    return {
        startJourney() {
            audio.initFromUserGesture(settings);
            runDistanceWalked = 0;
            hintDismissReported = false;
            player.resetToSpawn();
            starfield.reset(player.position);
            environment.reset(player.position);
            monolith.reset();
            setPhase('exploring');
            requestGamePointerLock();
        },

        activateMonolith() {
            triggerMonolithEncounter();
        },

        resetGame() {
            if (phase === 'resetting') return;
            setPhase('resetting');
            player.clearInputs();
            audio.setReflectionMode(false);
            audio.resumeIfNeeded();
            // Request pointer lock synchronously inside the REIMAGINE click gesture
            // so the browser does not reject it after the 420ms transition timeout.
            requestGamePointerLock();

            window.setTimeout(() => {
                if (isDisposed) return;
                runDistanceWalked = 0;
                hintDismissReported = false;
                player.resetToSpawn();
                starfield.reset(player.position);
                environment.reset(player.position);
                monolith.reset();
                setPhase('exploring');
            }, 420);
        },

        resumeGame() {
            if (phase !== 'paused') return;
            audio.resumeIfNeeded();
            const dist = getDistanceToMonolith();
            if (dist <= WORLD_CONFIG.INTERACTION_DISTANCE) {
                setPhase('nearMonolith');
            } else if (dist <= WORLD_CONFIG.APPROACH_DISTANCE) {
                setPhase('approaching');
            } else {
                setPhase('exploring');
            }
            requestGamePointerLock();
        },

        pauseGame() {
            if (isActiveExplorationPhase()) {
                player.clearInputs();
                isDraggingFallbackLook = false;
                if (
                    document.pointerLockElement === renderer.domElement &&
                    document.exitPointerLock
                ) {
                    try {
                        document.exitPointerLock();
                    } catch {
                        // Ignore exit errors
                    }
                }
                setPhase('paused');
            }
        },

        requestPointerLock() {
            if (isActiveExplorationPhase()) {
                audio.resumeIfNeeded();
                requestGamePointerLock();
            }
        },

        retryMusicPlayback() {
            audio.startOrResumeMusic();
        },

        updateSettings(newSettings) {
            const qualityChanged = newSettings.quality !== settings.quality;
            settings = { ...newSettings };
            player.reducedMotion = settings.reducedMotion;
            audio.updateSettings(settings);

            if (qualityChanged) {
                renderer.setPixelRatio(getTargetPixelRatio(settings.quality));
                starfield.setQuality(settings.quality);
                environment.setQuality(settings.quality);
            }
        },

        setJoystickInput(x, y) {
            player.setJoystick(x, y);
        },

        rotateCameraFromTouch(dx, dy) {
            if (isActiveExplorationPhase() || phase === 'reflection') {
                const weight = phase === 'reflection' ? 0.35 : 1.0;
                player.rotateLook(dx * weight, dy * weight, settings.sensitivity);
            }
        },

        dispose() {
            isDisposed = true;
            cancelAnimationFrame(animFrameId);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onWindowMouseUp);
            renderer.domElement.removeEventListener('mousedown', onCanvasMouseDown);
            renderer.domElement.removeEventListener('click', onCanvasClick);
            document.removeEventListener('pointerlockchange', handlePointerLockChange);
            document.removeEventListener('pointerlockerror', handlePointerLockError);
            window.removeEventListener('resize', onResize);
            document.removeEventListener('visibilitychange', onVisibilityChange);

            starfield.dispose();
            environment.dispose();
            monolith.dispose();
            audio.dispose();
            renderer.dispose();

            if (renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }
        }
    };
}