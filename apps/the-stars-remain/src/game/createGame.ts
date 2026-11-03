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
    onWebGLError: (message: string) => void;
}

export interface GameInstance {
    startJourney: () => void;
    activateMonolith: () => void;
    resetGame: () => void;
    resumeGame: () => void;
    pauseGame: () => void;
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

    // Nocturnal lighting: preserves dark silhouettes while revealing selected dune ridges
    const hemiLight = new THREE.HemisphereLight(0x2a3b60, 0x060911, 0.54);
    scene.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(0x7c9ad2, 0.66);
    moonLight.position.set(-65, 38, 42);
    scene.add(moonLight);

    // Subtle near-ground night-vision fill so the sand immediately ahead of the player is navigable
    // without brightening the distant desert or rocks
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
    const audio = new AmbientAudioEngine();
    const raycaster = new THREE.Raycaster();

    let phase: GamePhase = 'start';
    let isDisposed = false;
    let animFrameId = 0;
    let isDraggingLook = false;
    let dragMovedDistance = 0;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let runDistanceWalked = 0;
    let hintDismissReported = false;

    const setPhase = (nextPhase: GamePhase) => {
        if (phase === nextPhase) return;
        phase = nextPhase;
        callbacks.onPhaseChange(nextPhase);
    };

    const requestDesktopPointerLock = () => {
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (!isTouchDevice && renderer.domElement.requestPointerLock) {
            try {
                renderer.domElement.requestPointerLock();
            } catch {
                // Fallback drag look works automatically
            }
        }
    };

    const getDistanceToMonolith = (): number => {
        return Math.hypot(
            player.position.x - WORLD_CONFIG.MONOLITH_POS.x,
            player.position.z - WORLD_CONFIG.MONOLITH_POS.z
        );
    };

    const triggerMonolithEncounter = () => {
        if (phase === 'reflection' || phase === 'resetting' || phase === 'start' || phase === 'paused') {
            return;
        }
        const dist = getDistanceToMonolith();
        if (dist > WORLD_CONFIG.INTERACTION_DISTANCE + 0.9) {
            return;
        }

        player.clearInputs();
        if (document.pointerLockElement === renderer.domElement && document.exitPointerLock) {
            document.exitPointerLock();
        }

        monolith.triggerInteractionSurge();
        const selectedQuote = quoteBag.nextQuote();
        callbacks.onQuoteSelected(selectedQuote);
        audio.setReflectionMode(true);
        audio.playMonolithActivation();
        setPhase('reflection');
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Escape') {
            if (phase === 'exploring' || phase === 'approaching' || phase === 'nearMonolith') {
                player.clearInputs();
                setPhase('paused');
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
        const canLook =
            phase === 'exploring' ||
            phase === 'approaching' ||
            phase === 'nearMonolith' ||
            phase === 'reflection';

        if (!canLook) return;

        const lookWeight = phase === 'reflection' ? 0.35 : 1.0;
        if (document.pointerLockElement === renderer.domElement) {
            player.rotateLook(e.movementX * lookWeight, e.movementY * lookWeight, settings.sensitivity);
        } else if (isDraggingLook) {
            const dx = e.clientX - lastPointerX;
            const dy = e.clientY - lastPointerY;
            lastPointerX = e.clientX;
            lastPointerY = e.clientY;
            dragMovedDistance += Math.hypot(dx, dy);
            player.rotateLook(dx * lookWeight, dy * lookWeight, settings.sensitivity);
        }
    };

    const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        if (phase === 'start' || phase === 'paused' || phase === 'resetting') return;

        isDraggingLook = true;
        dragMovedDistance = 0;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
    };

    const onMouseUp = (e: MouseEvent) => {
        const wasClick = dragMovedDistance < 7;
        isDraggingLook = false;

        if (!wasClick || phase !== 'nearMonolith') return;

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
        }
    };

    const onPointerLockChange = () => {
        const locked = document.pointerLockElement === renderer.domElement;
        callbacks.onPointerLockChange(locked);
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
        if (document.hidden && (phase === 'exploring' || phase === 'approaching' || phase === 'nearMonolith')) {
            player.clearInputs();
        }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('resize', onResize);
    window.addEventListener('visibilitychange', onVisibilityChange);

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

        const canWalk =
            phase === 'exploring' || phase === 'approaching' || phase === 'nearMonolith';

        const moveResult = player.update(dt, canWalk, allColliders);

        // Position the subtle near-ground visibility light slightly ahead of the player
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
            audio.initFromUserGesture(settings.muted);
            runDistanceWalked = 0;
            hintDismissReported = false;
            player.resetToSpawn();
            starfield.reset(player.position);
            environment.reset(player.position);
            monolith.reset();
            setPhase('exploring');
            requestDesktopPointerLock();
        },

        activateMonolith() {
            triggerMonolithEncounter();
        },

        resetGame() {
            if (phase === 'resetting') return;
            setPhase('resetting');
            player.clearInputs();

            window.setTimeout(() => {
                if (isDisposed) return;
                runDistanceWalked = 0;
                hintDismissReported = false;
                player.resetToSpawn();
                starfield.reset(player.position);
                environment.reset(player.position);
                monolith.reset();
                audio.setReflectionMode(false);
                setPhase('exploring');
                requestDesktopPointerLock();
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
            requestDesktopPointerLock();
        },

        pauseGame() {
            if (phase === 'exploring' || phase === 'approaching' || phase === 'nearMonolith') {
                player.clearInputs();
                if (document.pointerLockElement === renderer.domElement && document.exitPointerLock) {
                    document.exitPointerLock();
                }
                setPhase('paused');
            }
        },

        updateSettings(newSettings) {
            const qualityChanged = newSettings.quality !== settings.quality;
            settings = { ...newSettings };
            player.reducedMotion = settings.reducedMotion;
            audio.setMuted(settings.muted);

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
            if (
                phase === 'exploring' ||
                phase === 'approaching' ||
                phase === 'nearMonolith' ||
                phase === 'reflection'
            ) {
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
            window.removeEventListener('mouseup', onMouseUp);
            renderer.domElement.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('pointerlockchange', onPointerLockChange);
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