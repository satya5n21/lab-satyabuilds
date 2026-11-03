import React, { useEffect, useRef, useState } from 'react';
import { Play, Settings, Volume2, VolumeX } from 'lucide-react';
import { createGame, GameInstance } from './game/createGame';
import { GamePhase, GameSettings, QualityLevel } from './game/gameTypes';
import './styles.css';

export function App() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const gameRef = useRef<GameInstance | null>(null);

    const [phase, setPhase] = useState<GamePhase>('start');
    const [isPointerLocked, setIsPointerLocked] = useState<boolean>(false);
    const [currentQuote, setCurrentQuote] = useState<string>('');
    const [quoteVisible, setQuoteVisible] = useState<boolean>(false);
    const [showReimagine, setShowReimagine] = useState<boolean>(false);
    const [showControlHint, setShowControlHint] = useState<boolean>(true);
    const [musicBlocked, setMusicBlocked] = useState<boolean>(false);
    const [webglError, setWebglError] = useState<string | null>(null);
    const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);

    const [settings, setSettings] = useState<GameSettings>({
        muted: false,
        musicMuted: false,
        musicVolume: 0.40,
        sensitivity: 1.0,
        quality: 'high',
        reducedMotion: false
    });

    const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const joystickTouchId = useRef<number | null>(null);
    const joystickCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const lookTouchId = useRef<number | null>(null);
    const lastLookPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    useEffect(() => {
        const touchCapable =
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0 ||
            window.matchMedia('(pointer: coarse)').matches;
        setIsTouchDevice(touchCapable);
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const instance = createGame(el, settings, {
            onPhaseChange: (nextPhase) => {
                setPhase(nextPhase);
            },
            onQuoteSelected: (quote) => {
                setCurrentQuote(quote);
            },
            onPlayerWalkedDistance: () => {
                setShowControlHint(false);
            },
            onPointerLockChange: (locked) => {
                setIsPointerLocked(locked);
            },
            onMusicBlockedChange: (blocked) => {
                setMusicBlocked(blocked);
            },
            onWebGLError: (msg) => {
                setWebglError(msg);
            }
        });

        gameRef.current = instance;

        return () => {
            instance.dispose();
            gameRef.current = null;
        };
    }, []);

    useEffect(() => {
        gameRef.current?.updateSettings(settings);
    }, [settings]);

    useEffect(() => {
        if (phase !== 'reflection') {
            setQuoteVisible(false);
            setShowReimagine(false);
            return;
        }

        const quoteTimer = window.setTimeout(() => {
            setQuoteVisible(true);
        }, 550);

        const buttonTimer = window.setTimeout(() => {
            setShowReimagine(true);
        }, 3200);

        return () => {
            window.clearTimeout(quoteTimer);
            window.clearTimeout(buttonTimer);
        };
    }, [phase]);

    useEffect(() => {
        if (phase !== 'exploring' || !showControlHint) return;
        const timer = window.setTimeout(() => {
            setShowControlHint(false);
        }, 6500);
        return () => window.clearTimeout(timer);
    }, [phase, showControlHint]);

    const stopUIEventPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };

    const handleStartJourney = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setShowControlHint(true);
        gameRef.current?.startJourney();
    };

    const handleTouchMonolith = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        gameRef.current?.activateMonolith();
    };

    const handleReimagine = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setShowReimagine(false);
        setQuoteVisible(false);
        gameRef.current?.resetGame();
    };

    const toggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setSettings((prev) => ({ ...prev, muted: !prev.muted }));
    };

    const toggleMusicMute = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setSettings((prev) => ({ ...prev, musicMuted: !prev.musicMuted }));
    };

    const toggleReducedMotion = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setSettings((prev) => ({ ...prev, reducedMotion: !prev.reducedMotion }));
    };

    const handleQualityChange = (
        e: React.MouseEvent<HTMLButtonElement>,
        q: QualityLevel
    ) => {
        e.stopPropagation();
        setSettings((prev) => ({ ...prev, quality: q }));
    };

    const handlePauseOrResumeToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (phase === 'paused') {
            gameRef.current?.resumeGame();
        } else {
            gameRef.current?.pauseGame();
        }
    };

    const handleResumeJourney = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        gameRef.current?.resumeGame();
    };

    const onJoystickPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        joystickTouchId.current = e.pointerId;
        joystickCenter.current = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
        updateJoystickFromPoint(e.clientX, e.clientY);
    };

    const onJoystickPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (joystickTouchId.current !== e.pointerId) return;
        e.stopPropagation();
        updateJoystickFromPoint(e.clientX, e.clientY);
    };

    const onJoystickPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (joystickTouchId.current !== e.pointerId) return;
        e.stopPropagation();
        joystickTouchId.current = null;
        setKnobOffset({ x: 0, y: 0 });
        gameRef.current?.setJoystickInput(0, 0);
    };

    const updateJoystickFromPoint = (clientX: number, clientY: number) => {
        const maxRadius = 42;
        const dx = clientX - joystickCenter.current.x;
        const dy = clientY - joystickCenter.current.y;
        const dist = Math.hypot(dx, dy);
        const clampedDist = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);

        const kx = Math.cos(angle) * clampedDist;
        const ky = Math.sin(angle) * clampedDist;

        setKnobOffset({ x: kx, y: ky });
        gameRef.current?.setJoystickInput(kx / maxRadius, ky / maxRadius);
    };

    const onLookPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        lookTouchId.current = e.pointerId;
        lastLookPos.current = { x: e.clientX, y: e.clientY };
    };

    const onLookPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (lookTouchId.current !== e.pointerId) return;
        e.stopPropagation();
        const dx = e.clientX - lastLookPos.current.x;
        const dy = e.clientY - lastLookPos.current.y;
        lastLookPos.current = { x: e.clientX, y: e.clientY };
        gameRef.current?.rotateCameraFromTouch(dx * 1.45, dy * 1.45);
    };

    const onLookPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (lookTouchId.current !== e.pointerId) return;
        e.stopPropagation();
        lookTouchId.current = null;
    };

    const isPlaying =
        phase === 'exploring' || phase === 'approaching' || phase === 'nearMonolith';

    return (
        <div className="game-shell">
            <div ref={containerRef} className="canvas-stage" />

            <div
                className={`reset-curtain ${phase === 'resetting' ? 'curtain-visible' : ''}`}
            />

            {webglError && (
                <div
                    className="overlay-screen"
                    data-ui-control="true"
                    onMouseDown={stopUIEventPropagation}
                    onClick={stopUIEventPropagation}
                >
                    <h1 className="title-heading">THE STARS REMAIN</h1>
                    <p className="title-subtitle">{webglError}</p>
                </div>
            )}

            {!webglError && phase === 'start' && (
                <div
                    className="overlay-screen"
                    data-ui-control="true"
                    onMouseDown={stopUIEventPropagation}
                    onClick={stopUIEventPropagation}
                >
                    <h1 className="title-heading">THE STARS REMAIN</h1>
                    <p className="title-subtitle">
                        A quiet journey beneath an endless sky.
                    </p>
                    <button
                        type="button"
                        className="primary-action-btn"
                        data-ui-control="true"
                        onClick={handleStartJourney}
                    >
                        BEGIN JOURNEY
                    </button>
                </div>
            )}

            {!webglError && phase !== 'start' && (
                <>
                    <div
                        className="hud-top-bar"
                        data-ui-control="true"
                        onMouseDown={stopUIEventPropagation}
                        onClick={stopUIEventPropagation}
                    >
                        {musicBlocked && !settings.muted && !settings.musicMuted && (
                            <button
                                type="button"
                                className="primary-action-btn"
                                data-ui-control="true"
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.7rem' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    gameRef.current?.retryMusicPlayback();
                                }}
                                title="Enable background music"
                            >
                                ENABLE MUSIC
                            </button>
                        )}
                        <button
                            type="button"
                            className="icon-btn"
                            data-ui-control="true"
                            onClick={toggleMute}
                            aria-label={settings.muted ? 'Unmute audio' : 'Mute audio'}
                            title={settings.muted ? 'Unmute audio' : 'Mute audio'}
                        >
                            {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>
                        {phase !== 'reflection' && (
                            <button
                                type="button"
                                className="icon-btn"
                                data-ui-control="true"
                                onClick={handlePauseOrResumeToggle}
                                aria-label={phase === 'paused' ? 'Resume game' : 'Pause and settings'}
                                title={phase === 'paused' ? 'Resume game' : 'Pause and settings'}
                            >
                                {phase === 'paused' ? <Play size={18} /> : <Settings size={18} />}
                            </button>
                        )}
                    </div>

                    {isPlaying && (
                        <div
                            className={`center-reticle ${phase === 'nearMonolith' ? 'reticle-active' : ''
                                }`}
                        />
                    )}

                    <div
                        className="hud-bottom-prompts"
                        style={{ pointerEvents: 'none' }}
                    >
                        {phase === 'nearMonolith' && (
                            <button
                                type="button"
                                className="touch-monolith-btn"
                                data-ui-control="true"
                                style={{ pointerEvents: 'auto' }}
                                onMouseDown={stopUIEventPropagation}
                                onClick={handleTouchMonolith}
                            >
                                {isTouchDevice ? 'TAP — TOUCH THE MONOLITH' : 'E — TOUCH THE MONOLITH'}
                            </button>
                        )}

                        {phase === 'approaching' && (
                            <div className="subtle-hint">Something ancient waits ahead.</div>
                        )}

                        {isPlaying && !isTouchDevice && !isPointerLocked && (
                            <div className="subtle-hint">Click to resume look</div>
                        )}

                        {phase === 'exploring' && showControlHint && (isTouchDevice || isPointerLocked) && (
                            <div className="control-hint-pills">
                                {isTouchDevice ? (
                                    <>
                                        <span>JOYSTICK — MOVE</span>
                                        <span>DRAG — LOOK</span>
                                    </>
                                ) : (
                                    <>
                                        <span>WASD — MOVE</span>
                                        <span>MOUSE — LOOK</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {isTouchDevice && isPlaying && (
                        <div className="mobile-controls-layer">
                            <div
                                className="virtual-joystick-zone"
                                data-ui-control="true"
                                onPointerDown={onJoystickPointerDown}
                                onPointerMove={onJoystickPointerMove}
                                onPointerUp={onJoystickPointerUp}
                                onPointerCancel={onJoystickPointerUp}
                            >
                                <div
                                    className="virtual-joystick-knob"
                                    style={{
                                        transform: `translate(calc(-50% + ${knobOffset.x}px), calc(-50% + ${knobOffset.y}px))`
                                    }}
                                />
                            </div>

                            <div
                                className="touch-look-zone"
                                data-ui-control="true"
                                onPointerDown={onLookPointerDown}
                                onPointerMove={onLookPointerMove}
                                onPointerUp={onLookPointerUp}
                                onPointerCancel={onLookPointerUp}
                            />
                        </div>
                    )}
                </>
            )}

            {!webglError && phase === 'reflection' && (
                <div
                    className="overlay-screen quote-overlay"
                    data-ui-control="true"
                    onMouseDown={stopUIEventPropagation}
                    onClick={stopUIEventPropagation}
                >
                    <div className="quote-card" data-ui-control="true">
                        {quoteVisible && (
                            <>
                                <div className="quote-header">THE STARS REMAIN</div>
                                <blockquote className="quote-body">“{currentQuote}”</blockquote>
                            </>
                        )}
                        <div className="reimagine-slot">
                            {showReimagine && (
                                <button
                                    type="button"
                                    className="primary-action-btn"
                                    data-ui-control="true"
                                    onClick={handleReimagine}
                                >
                                    REIMAGINE
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {!webglError && phase === 'paused' && (
                <div
                    className="overlay-screen"
                    data-ui-control="true"
                    onMouseDown={stopUIEventPropagation}
                    onClick={stopUIEventPropagation}
                >
                    <div className="settings-panel" data-ui-control="true">
                        <h2
                            className="title-heading"
                            style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}
                        >
                            PAUSED
                        </h2>

                        <div className="settings-row">
                            <div className="settings-inline">
                                <span>Ambient Sound</span>
                                <button
                                    type="button"
                                    className="primary-action-btn"
                                    data-ui-control="true"
                                    style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}
                                    onClick={toggleMute}
                                >
                                    {settings.muted ? 'MUTED' : 'ACTIVE'}
                                </button>
                            </div>
                        </div>

                        <div className="settings-row">
                            <div className="settings-inline">
                                <span>Background Music</span>
                                <button
                                    type="button"
                                    className="primary-action-btn"
                                    data-ui-control="true"
                                    style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}
                                    onClick={toggleMusicMute}
                                >
                                    {settings.musicMuted ? 'MUTED' : 'ACTIVE'}
                                </button>
                            </div>
                        </div>

                        <div className="settings-row">
                            <div className="settings-inline">
                                <span>Music Volume</span>
                                <span>{Math.round(settings.musicVolume * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                data-ui-control="true"
                                value={settings.musicVolume}
                                onChange={(e) =>
                                    setSettings((prev) => ({
                                        ...prev,
                                        musicVolume: parseFloat(e.target.value)
                                    }))
                                }
                            />
                        </div>

                        <div className="settings-row">
                            <div className="settings-inline">
                                <span>Reduced Camera Motion</span>
                                <button
                                    type="button"
                                    className="primary-action-btn"
                                    data-ui-control="true"
                                    style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}
                                    onClick={toggleReducedMotion}
                                >
                                    {settings.reducedMotion ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>

                        <div className="settings-row">
                            <div className="settings-inline">
                                <span>Look Sensitivity</span>
                                <span>{settings.sensitivity.toFixed(1)}x</span>
                            </div>
                            <input
                                type="range"
                                min="0.3"
                                max="2.2"
                                step="0.1"
                                data-ui-control="true"
                                value={settings.sensitivity}
                                onChange={(e) =>
                                    setSettings((prev) => ({
                                        ...prev,
                                        sensitivity: parseFloat(e.target.value)
                                    }))
                                }
                            />
                        </div>

                        <div className="settings-row">
                            <div className="settings-inline">
                                <span>Visual Quality</span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {(['low', 'high'] as QualityLevel[]).map((q) => (
                                        <button
                                            key={q}
                                            type="button"
                                            className="primary-action-btn"
                                            data-ui-control="true"
                                            style={{
                                                padding: '0.4rem 0.85rem',
                                                fontSize: '0.72rem',
                                                opacity: settings.quality === q ? 1 : 0.5
                                            }}
                                            onClick={(e) => handleQualityChange(e, q)}
                                        >
                                            {q.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                gap: '0.75rem',
                                marginTop: '0.75rem',
                                justifyContent: 'flex-end'
                            }}
                        >
                            <button
                                type="button"
                                className="primary-action-btn"
                                data-ui-control="true"
                                style={{ width: '100%' }}
                                onClick={handleResumeJourney}
                            >
                                RESUME JOURNEY
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;